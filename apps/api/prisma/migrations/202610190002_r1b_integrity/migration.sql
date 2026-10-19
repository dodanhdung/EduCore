-- R1b only. Run with a reviewed migration role, never an application login.
-- Existing time-based data needs an independently reviewed adoption migration;
-- this migration deliberately refuses to invent historical timezone evidence.
BEGIN;

ALTER TABLE public.tenants ADD COLUMN timezone_frozen_at timestamptz(6);

DO $preflight$
BEGIN
  IF EXISTS (SELECT FROM public.schedule_series)
     OR EXISTS (SELECT FROM public.class_sessions)
     OR EXISTS (SELECT FROM public.billing_periods)
     OR EXISTS (SELECT FROM public.billing_runs) THEN
    RAISE EXCEPTION 'R1B_LEGACY_ADOPTION_REQUIRED: inventory and approve historical timezone evidence before upgrade'
      USING ERRCODE = '23514', CONSTRAINT = 'r1b_legacy_adoption_required';
  END IF;
  IF EXISTS (SELECT FROM public.tenants t WHERE NOT EXISTS
      (SELECT FROM pg_catalog.pg_timezone_names z WHERE z.name = t.timezone)) THEN
    RAISE EXCEPTION 'Invalid existing tenant timezone' USING ERRCODE = '23514';
  END IF;
  -- Never adopt a pre-existing cluster role with unknown members/ownership.
  IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'educore_r1b_guard_owner') THEN
    RAISE EXCEPTION 'R1b role already exists: inventory role ownership/membership before migration';
  END IF;
END
$preflight$;

CREATE ROLE educore_r1b_guard_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE SCHEMA educore_private AUTHORIZATION educore_r1b_guard_owner;
REVOKE ALL ON SCHEMA educore_private FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO educore_r1b_guard_owner;
GRANT SELECT ON public.tenants, public.schedule_series, public.class_sessions,
  public.billing_periods, public.billing_runs, public.invoices, public.invoice_lines,
  public.invoiced_participation_claims, public.classes, public.enrollments,
  public.session_participants, public.attendance_records, public.attendance_finalizations
  TO educore_r1b_guard_owner;
GRANT UPDATE (timezone_frozen_at, updated_at) ON public.tenants TO educore_r1b_guard_owner;

ALTER TABLE public.billing_periods ADD CONSTRAINT bp_month_shape_ck CHECK (
  isfinite(month_start) AND isfinite(month_end)
  AND EXTRACT(DAY FROM month_start) = 1
  AND month_end = (month_start + INTERVAL '1 month')::date
);

-- SQL-F01: caller must enter before descendant row locks. Trigger re-entry is
-- defense in depth, not permission to bypass User-before-Tenant ordering.
CREATE FUNCTION educore_private.r1b_lock_tenant(p_tenant uuid)
RETURNS public.tenants LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'R1b entry requires READ COMMITTED' USING ERRCODE = '25000';
  END IF;
  SELECT * INTO t FROM public.tenants WHERE id = p_tenant FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tenant does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN t;
END
$fn$;

CREATE FUNCTION educore_private.r1b_freeze_tenant(p_tenant uuid)
RETURNS public.tenants LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE;
BEGIN
  t := educore_private.r1b_lock_tenant(p_tenant);
  IF t.timezone_frozen_at IS NULL THEN
    UPDATE public.tenants SET timezone_frozen_at = clock_timestamp(), updated_at = clock_timestamp()
      WHERE id = p_tenant RETURNING * INTO t;
  END IF;
  RETURN t;
END
$fn$;

-- INVOKER is intentional: current_user must identify the actual helper owner.
CREATE FUNCTION educore_private.r1b_tenant_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.timezone_frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'Frozen tenant cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'r1b_tenant_frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'Named tenant timezone required' USING ERRCODE = '23514', CONSTRAINT = 'r1b_timezone_name';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.timezone_frozen_at IS NOT NULL THEN
      RAISE EXCEPTION 'Freeze marker must be initialized by first source' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Tenant identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF OLD.timezone_frozen_at IS NOT NULL AND
       ROW(NEW.timezone, NEW.timezone_frozen_at) IS DISTINCT FROM ROW(OLD.timezone, OLD.timezone_frozen_at) THEN
      RAISE EXCEPTION 'Tenant timezone freeze is permanent' USING ERRCODE = '23514', CONSTRAINT = 'r1b_tenant_frozen';
    END IF;
    IF OLD.timezone_frozen_at IS NULL AND NEW.timezone_frozen_at IS NOT NULL AND
       (current_user <> 'educore_r1b_guard_owner' OR NEW.timezone IS DISTINCT FROM OLD.timezone) THEN
      RAISE EXCEPTION 'Only private freeze helper can initialize marker' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION educore_private.r1b_calendar_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE; used boolean; protected boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN t := educore_private.r1b_freeze_tenant(NEW.tenant_id);
  ELSE t := educore_private.r1b_lock_tenant(OLD.tenant_id);
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.tenant_id) IS DISTINCT FROM ROW(OLD.id, OLD.tenant_id) THEN
    RAISE EXCEPTION 'Calendar identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'schedule_series' THEN
    IF TG_OP <> 'DELETE' AND NEW.timezone IS DISTINCT FROM t.timezone THEN
      RAISE EXCEPTION 'Series timezone must match frozen tenant' USING ERRCODE = '23514', CONSTRAINT = 'r1b_series_timezone';
    END IF;
    IF TG_OP <> 'INSERT' AND EXISTS
      (SELECT FROM public.class_sessions WHERE tenant_id = OLD.tenant_id AND series_id = OLD.id) THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Series has historical sessions' USING ERRCODE = '23514';
      ELSIF NEW.class_id IS DISTINCT FROM OLD.class_id THEN
        RAISE EXCEPTION 'Used series class is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      used := EXISTS (SELECT FROM public.invoice_lines WHERE tenant_id = OLD.tenant_id AND session_id = OLD.id);
      protected := OLD.starts_at <= clock_timestamp() OR used;
      IF TG_OP = 'DELETE' THEN
        IF protected OR EXISTS (SELECT FROM public.attendance_finalizations
              WHERE tenant_id = OLD.tenant_id AND session_id = OLD.id) THEN
          RAISE EXCEPTION 'Historical session cannot be deleted' USING ERRCODE = '23514', CONSTRAINT = 'r1b_source_history';
        END IF;
        RETURN OLD;
      END IF;
      IF protected AND
         ROW(NEW.starts_at, NEW.ends_at, NEW.class_id, NEW.series_id, NEW.teacher_id,
             NEW.room_id, NEW.delivery_mode, NEW.policy_version_id, NEW.status = 'CANCELLED')
         IS DISTINCT FROM
         ROW(OLD.starts_at, OLD.ends_at, OLD.class_id, OLD.series_id, OLD.teacher_id,
             OLD.room_id, OLD.delivery_mode, OLD.policy_version_id, OLD.status = 'CANCELLED') THEN
        RAISE EXCEPTION 'Session source is historical; use reviewed correction' USING ERRCODE = '23514', CONSTRAINT = 'r1b_source_history';
      END IF;
      IF ROW(NEW.class_id, NEW.series_id) IS DISTINCT FROM ROW(OLD.class_id, OLD.series_id)
         AND (protected OR EXISTS (SELECT FROM public.session_participants
              WHERE tenant_id = OLD.tenant_id AND session_id = OLD.id)
           OR EXISTS (SELECT FROM public.attendance_finalizations WHERE tenant_id = OLD.tenant_id AND session_id = OLD.id)) THEN
        RAISE EXCEPTION 'Used session lineage is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION educore_private.r1b_billing_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE; frozen boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN t := educore_private.r1b_freeze_tenant(NEW.tenant_id);
  ELSE t := educore_private.r1b_lock_tenant(OLD.tenant_id);
  END IF;
  IF TG_TABLE_NAME = 'invoiced_participation_claims' THEN
    RAISE EXCEPTION 'Participation claims are permanent' USING ERRCODE = '23514', CONSTRAINT = 'r1b_claim_permanent';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.id, NEW.tenant_id) IS DISTINCT FROM ROW(OLD.id, OLD.tenant_id) THEN
      RAISE EXCEPTION 'Billing identity is immutable' USING ERRCODE = '23514';
    END IF;
    IF TG_TABLE_NAME = 'billing_periods' THEN
      IF ROW(NEW.month_start, NEW.month_end) IS DISTINCT FROM ROW(OLD.month_start, OLD.month_end) THEN
        RAISE EXCEPTION 'Billing period bounds are immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_period_identity';
      END IF;
    ELSIF TG_TABLE_NAME = 'billing_runs' THEN
      IF ROW(NEW.student_id, NEW.period_id, NEW.operation_key) IS DISTINCT FROM ROW(OLD.student_id, OLD.period_id, OLD.operation_key) THEN
        RAISE EXCEPTION 'Billing run owner/period/key is immutable' USING ERRCODE = '23514';
      END IF;
      IF EXISTS (SELECT FROM public.invoices WHERE tenant_id = OLD.tenant_id AND billing_run_id = OLD.id)
         AND ROW(NEW.policy_version_id, NEW.input_snapshot_hash, NEW.created_at)
           IS DISTINCT FROM ROW(OLD.policy_version_id, OLD.input_snapshot_hash, OLD.created_at) THEN
        RAISE EXCEPTION 'Used run input evidence is immutable' USING ERRCODE = '23514';
      END IF;
    ELSIF TG_TABLE_NAME = 'invoices' THEN
      IF ROW(NEW.billing_run_id, NEW.student_id, NEW.period_id) IS DISTINCT FROM ROW(OLD.billing_run_id, OLD.student_id, OLD.period_id) THEN
        RAISE EXCEPTION 'Invoice monthly owner is immutable' USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  IF TG_TABLE_NAME = 'invoices' AND TG_OP <> 'INSERT' THEN
    frozen := OLD.status <> 'DRAFT' OR OLD.issued_at IS NOT NULL OR OLD.invoice_number IS NOT NULL
      OR EXISTS (SELECT FROM public.invoice_lines l JOIN public.invoiced_participation_claims c
           ON c.tenant_id = l.tenant_id AND c.invoice_line_id = l.id
           WHERE l.tenant_id = OLD.tenant_id AND l.invoice_id = OLD.id);
    IF frozen AND (TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'updated_at')) THEN
      RAISE EXCEPTION 'Issued invoice basis is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_issued_history';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION educore_private.r1b_line_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE; i public.invoices%ROWTYPE; bp public.billing_periods%ROWTYPE;
  sp public.session_participants%ROWTYPE; s public.class_sessions%ROWTYPE;
  ar public.attendance_records%ROWTYPE; af public.attendance_finalizations%ROWTYPE;
  course uuid; evidence jsonb; d date; owner_tenant uuid; owner_invoice uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN owner_tenant := NEW.tenant_id; owner_invoice := NEW.invoice_id;
  ELSE owner_tenant := OLD.tenant_id; owner_invoice := OLD.invoice_id; END IF;
  t := educore_private.r1b_lock_tenant(owner_tenant);
  SELECT * INTO i FROM public.invoices WHERE tenant_id = owner_tenant AND id = owner_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing invoice' USING ERRCODE = '23503'; END IF;
  IF i.status <> 'DRAFT' OR i.issued_at IS NOT NULL OR i.invoice_number IS NOT NULL
     OR EXISTS (SELECT FROM public.invoice_lines l JOIN public.invoiced_participation_claims c
         ON c.tenant_id = l.tenant_id AND c.invoice_line_id = l.id
         WHERE l.tenant_id = owner_tenant AND l.invoice_id = owner_invoice) THEN
    RAISE EXCEPTION 'Issued invoice lines are immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_issued_history';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - ARRAY['updated_at','reason_code']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','reason_code']) THEN
      RAISE EXCEPTION 'Line source/financial evidence is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_line_history';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO sp FROM public.session_participants WHERE tenant_id = NEW.tenant_id AND id = NEW.participant_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing participant' USING ERRCODE = '23503'; END IF;
  SELECT * INTO s FROM public.class_sessions WHERE tenant_id = sp.tenant_id AND id = sp.session_id;
  SELECT * INTO bp FROM public.billing_periods WHERE tenant_id = i.tenant_id AND id = i.period_id;
  IF t.timezone_frozen_at IS NULL THEN RAISE EXCEPTION 'Unfrozen billing source' USING ERRCODE = '23514'; END IF;
  d := (s.starts_at AT TIME ZONE t.timezone)::date;
  IF d IS NULL OR NOT (bp.month_start <= d AND d < bp.month_end) THEN
    RAISE EXCEPTION 'Session local start is outside invoice billing period'
      USING ERRCODE = '23514', CONSTRAINT = 'r1b_line_period';
  END IF;
  IF jsonb_typeof(NEW.source_snapshot_json) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Line snapshot must be a JSON object' USING ERRCODE = '23514';
  END IF;
  SELECT course_id INTO course FROM public.classes WHERE tenant_id = s.tenant_id AND id = s.class_id;
  IF NEW.attendance_id IS NOT NULL THEN
    SELECT * INTO ar FROM public.attendance_records
      WHERE tenant_id = NEW.tenant_id AND participant_id = NEW.participant_id AND id = NEW.attendance_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Attendance source mismatch' USING ERRCODE = '23503'; END IF;
    IF ar.finalization_id IS NOT NULL THEN
      SELECT * INTO af FROM public.attendance_finalizations
        WHERE tenant_id = ar.tenant_id AND session_id = ar.session_id AND id = ar.finalization_id;
    END IF;
  END IF;
  evidence := jsonb_build_object(
    'schemaVersion', 1, 'attributionRuleVersion', 'O12_LOCAL_SESSION_START_V1',
    'tenantId', sp.tenant_id, 'studentId', sp.student_id, 'invoiceId', i.id, 'periodId', bp.id,
    'participantId', sp.id, 'sessionId', s.id, 'classId', s.class_id, 'courseId', course,
    'enrollmentId', sp.enrollment_id, 'participantKind', sp.participant_kind,
    'timezone', t.timezone, 'timezoneFrozenAt', t.timezone_frozen_at,
    'localSessionDate', d, 'billingMonth', bp.month_start,
    'startsAtUtc', to_char(s.starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'endsAtUtc', to_char(s.ends_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'isCancelled', s.status = 'CANCELLED', 'sessionRevision', s.revision,
    'attendanceId', ar.id, 'attendanceStatus', ar.attendance_status, 'attendanceRevision', ar.revision,
    'finalizationId', af.id, 'confirmedAt', af.confirmed_at, 'confirmedByMembershipId', af.confirmed_by_membership_id,
    'capturedAt', clock_timestamp());
  -- Preserve other input namespaces, replace this namespace entirely with DB facts.
  NEW.source_snapshot_json := NEW.source_snapshot_json || jsonb_build_object('r1bAttribution', evidence);
  -- Do NOT repair NEW.student_id/session_id: existing composite FKs reject them.
  RETURN NEW;
END
$fn$;

CREATE FUNCTION educore_private.r1b_lineage_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE; s public.class_sessions%ROWTYPE; e public.enrollments%ROWTYPE;
  used boolean; changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN t := educore_private.r1b_lock_tenant(NEW.tenant_id);
  ELSE t := educore_private.r1b_lock_tenant(OLD.tenant_id); END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.tenant_id) IS DISTINCT FROM ROW(OLD.id, OLD.tenant_id) THEN
    RAISE EXCEPTION 'Source identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'classes' THEN
    used := EXISTS (SELECT FROM public.class_sessions WHERE tenant_id = OLD.tenant_id AND class_id = OLD.id)
      OR EXISTS (SELECT FROM public.schedule_series WHERE tenant_id = OLD.tenant_id AND class_id = OLD.id);
    IF used THEN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Used class cannot be deleted' USING ERRCODE = '23514';
      ELSIF NEW.course_id IS DISTINCT FROM OLD.course_id THEN
        RAISE EXCEPTION 'Original course lineage is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_class_lineage';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'enrollments' THEN
    used := EXISTS (SELECT FROM public.session_participants WHERE tenant_id = OLD.tenant_id AND enrollment_id = OLD.id);
    IF used THEN
      IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Referenced enrollment cannot be deleted' USING ERRCODE = '23514';
      ELSIF ROW(NEW.student_id, NEW.class_id) IS DISTINCT FROM ROW(OLD.student_id, OLD.class_id) THEN
        RAISE EXCEPTION 'Original enrollment lineage is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_enrollment_lineage';
      END IF;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN
      SELECT * INTO s FROM public.class_sessions WHERE tenant_id = OLD.tenant_id AND id = OLD.session_id;
      used := s.starts_at <= clock_timestamp()
        OR EXISTS (SELECT FROM public.attendance_records WHERE tenant_id = OLD.tenant_id AND participant_id = OLD.id)
        OR EXISTS (SELECT FROM public.invoice_lines WHERE tenant_id = OLD.tenant_id AND participant_id = OLD.id)
        OR EXISTS (SELECT FROM public.invoiced_participation_claims WHERE tenant_id = OLD.tenant_id AND participant_id = OLD.id);
      IF used THEN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Historical participant cannot be deleted' USING ERRCODE = '23514';
        ELSIF ROW(NEW.session_id, NEW.student_id, NEW.enrollment_id, NEW.participant_kind, NEW.added_at, NEW.removed_at, NEW.created_at)
          IS DISTINCT FROM ROW(OLD.session_id, OLD.student_id, OLD.enrollment_id, OLD.participant_kind, OLD.added_at, OLD.removed_at, OLD.created_at) THEN
          RAISE EXCEPTION 'Historical participant source is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_participant_history';
        END IF;
      END IF;
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.enrollment_id IS NOT NULL THEN
      SELECT * INTO s FROM public.class_sessions WHERE tenant_id = NEW.tenant_id AND id = NEW.session_id;
      SELECT * INTO e FROM public.enrollments WHERE tenant_id = NEW.tenant_id AND id = NEW.enrollment_id;
      IF e.id IS NOT NULL AND s.id IS NOT NULL AND e.class_id IS DISTINCT FROM s.class_id THEN
        RAISE EXCEPTION 'Enrollment class differs from original session class'
          USING ERRCODE = '23514', CONSTRAINT = 'r1b_participant_enrollment_class';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

CREATE FUNCTION educore_private.r1b_attendance_guard()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = pg_catalog, educore_private, pg_temp AS $fn$
DECLARE t public.tenants%ROWTYPE; used boolean; source_tenant uuid; source_session uuid; source_participant uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN source_tenant := NEW.tenant_id; source_session := NEW.session_id;
  ELSE source_tenant := OLD.tenant_id; source_session := OLD.session_id; END IF;
  t := educore_private.r1b_lock_tenant(source_tenant);
  IF TG_OP = 'UPDATE' AND ROW(NEW.id, NEW.tenant_id) IS DISTINCT FROM ROW(OLD.id, OLD.tenant_id) THEN
    RAISE EXCEPTION 'Attendance identity is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'attendance_records' THEN
    IF TG_OP = 'INSERT' THEN source_participant := NEW.participant_id;
    ELSE source_participant := OLD.participant_id; END IF;
    used := EXISTS (SELECT FROM public.invoice_lines WHERE tenant_id = source_tenant AND participant_id = source_participant);
    -- Protect BOTH sides of an attempted UPDATE reconnect, even if OLD was unused.
    IF TG_OP = 'UPDATE' THEN
      used := used OR EXISTS (SELECT FROM public.invoice_lines WHERE tenant_id = NEW.tenant_id AND participant_id = NEW.participant_id);
    END IF;
    IF used THEN
      IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Billed attendance source is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_attendance_history';
      ELSIF (to_jsonb(NEW) - ARRAY['updated_at','revision']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','revision']) THEN
        RAISE EXCEPTION 'Billed attendance evidence is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_attendance_history';
      END IF;
    END IF;
  ELSE
    used := EXISTS (SELECT FROM public.invoice_lines WHERE tenant_id = source_tenant AND session_id = source_session);
    IF TG_OP = 'UPDATE' THEN
      used := used OR EXISTS (SELECT FROM public.invoice_lines WHERE tenant_id = NEW.tenant_id AND session_id = NEW.session_id);
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.locked_at IS NOT NULL AND NEW.locked_at IS DISTINCT FROM OLD.locked_at THEN
      RAISE EXCEPTION 'Attendance lock cannot be cleared/rewritten' USING ERRCODE = '23514';
    END IF;
    IF used THEN
      IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Billed finalization source is immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_finalization_history';
      ELSIF (to_jsonb(NEW) - ARRAY['updated_at','revision','locked_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['updated_at','revision','locked_at']) THEN
        RAISE EXCEPTION 'Billed confirmation facts are immutable' USING ERRCODE = '23514', CONSTRAINT = 'r1b_finalization_history';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END
$fn$;

ALTER FUNCTION educore_private.r1b_lock_tenant(uuid) OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_freeze_tenant(uuid) OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_tenant_guard() OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_calendar_guard() OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_billing_guard() OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_line_guard() OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_lineage_guard() OWNER TO educore_r1b_guard_owner;
ALTER FUNCTION educore_private.r1b_attendance_guard() OWNER TO educore_r1b_guard_owner;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_private FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE educore_r1b_guard_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TRIGGER r1b_tenant_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.tenants FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_tenant_guard();
CREATE TRIGGER r1b_series_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.schedule_series FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_calendar_guard();
CREATE TRIGGER r1b_session_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.class_sessions FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_calendar_guard();
CREATE TRIGGER r1b_period_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.billing_periods FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_billing_guard();
CREATE TRIGGER r1b_run_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.billing_runs FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_billing_guard();
CREATE TRIGGER r1b_invoice_guard_trg BEFORE UPDATE OR DELETE ON public.invoices FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_billing_guard();
CREATE TRIGGER r1b_claim_guard_trg BEFORE UPDATE OR DELETE ON public.invoiced_participation_claims FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_billing_guard();
CREATE TRIGGER r1b_line_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_line_guard();
CREATE TRIGGER r1b_class_guard_trg BEFORE UPDATE OR DELETE ON public.classes FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_lineage_guard();
CREATE TRIGGER r1b_enrollment_guard_trg BEFORE UPDATE OR DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_lineage_guard();
CREATE TRIGGER r1b_participant_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.session_participants FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_lineage_guard();
CREATE TRIGGER r1b_record_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_attendance_guard();
CREATE TRIGGER r1b_finalization_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.attendance_finalizations FOR EACH ROW EXECUTE FUNCTION educore_private.r1b_attendance_guard();

COMMIT;
