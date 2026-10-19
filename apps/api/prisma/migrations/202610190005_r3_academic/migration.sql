BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE ROLE educore_r3_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE educore_r3_command NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA educore_r3 AUTHORIZATION educore_r3_owner;
REVOKE ALL ON SCHEMA educore_r3 FROM PUBLIC;
GRANT USAGE ON SCHEMA public,educore_private TO educore_r3_owner;
GRANT EXECUTE ON FUNCTION educore_private.r1b_lock_tenant(uuid) TO educore_r3_owner;
GRANT SELECT ON public.r2_principal_bindings,public.auth_sessions,public.users,public.tenants,
 public.tenant_memberships,public.membership_roles,public.roles,public.role_permissions,public.permissions,public.access_scopes,
 public.parent_student_links,public.student_profiles,public.teacher_profiles,public.teacher_competencies,
 public.courses,public.levels,public.classes,public.class_teacher_assignments,public.enrollments,public.enrollment_transfers,
 public.policy_versions,public.idempotency_records,public.class_sessions,public.session_participants,
 public.attendance_records,public.attendance_finalizations,public.invoiced_participation_claims,public.invoice_lines TO educore_r3_owner;
GRANT UPDATE(id) ON public.users TO educore_r3_owner;
GRANT INSERT,UPDATE ON public.enrollments,public.enrollment_transfers,public.class_teacher_assignments TO educore_r3_owner;
GRANT INSERT ON public.audit_logs,public.idempotency_records TO educore_r3_owner;
GRANT USAGE ON SCHEMA educore_r3 TO educore_r3_command;

-- A01/A02: interval duplicates are forbidden, including closed historical
-- intervals. TRANSFERRED retains validity before effective_to.
ALTER TABLE public.enrollments ADD CONSTRAINT r3_enrollment_interval CHECK(effective_to IS NULL OR effective_to>effective_from);
ALTER TABLE public.enrollments ADD CONSTRAINT r3_enrollment_overlap EXCLUDE USING gist
 (tenant_id WITH =,student_id WITH =,class_id WITH =,tstzrange(effective_from,effective_to,'[)') WITH &&)
 WHERE(status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN'));
ALTER TABLE public.classes ADD CONSTRAINT r3_class_capacity CHECK(capacity>0);
ALTER TABLE public.class_teacher_assignments ADD CONSTRAINT r3_assignment_interval CHECK(valid_to IS NULL OR valid_to>valid_from);
ALTER TABLE public.enrollments ADD CONSTRAINT r3_no_self_enrollment CHECK(prior_enrollment_id IS DISTINCT FROM id);
ALTER TABLE public.enrollment_transfers ADD CONSTRAINT r3_transfer_state CHECK
 ((status='REQUESTED' AND target_enrollment_id IS NULL AND confirmed_by_membership_id IS NULL)
 OR (status='CONFIRMED' AND target_enrollment_id IS NOT NULL AND confirmed_by_membership_id IS NOT NULL));

CREATE FUNCTION educore_r3.principal(t uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE u uuid; m uuid;
BEGIN
 SELECT a.user_id INTO u FROM public.r2_principal_bindings b JOIN public.auth_sessions a ON a.id=b.auth_session_id WHERE b.database_role=session_user;
 IF u IS NULL THEN RAISE EXCEPTION 'UNVERIFIED_DATABASE_PRINCIPAL' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.users WHERE id=u FOR SHARE;
 PERFORM educore_private.r1b_lock_tenant(t);
 SELECT tm.id INTO m FROM public.r2_principal_bindings b JOIN public.auth_sessions a ON a.id=b.auth_session_id
 JOIN public.users us ON us.id=a.user_id AND us.status='ACTIVE'
 JOIN public.tenant_memberships tm ON tm.tenant_id=t AND tm.user_id=a.user_id AND tm.status='ACTIVE' AND tm.left_at IS NULL
 JOIN public.tenants tn ON tn.id=t AND tn.status='ACTIVE'
 WHERE b.database_role=session_user AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp() AND a.active_tenant_id=t;
 IF m IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_CURRENT' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

-- Shared R2/R3 principal binding is operator-only. No actor ID or session GUC
-- from a request is trusted. User -> Tenant, then a fresh authorization read.
CREATE FUNCTION educore_r3.authorize(t uuid,c uuid,s uuid,permission text,session_id uuid DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE; m uuid;
BEGIN
 SELECT x.* INTO a FROM public.r2_principal_bindings b JOIN public.auth_sessions x ON x.id=b.auth_session_id WHERE b.database_role=session_user;
 IF a.id IS NULL THEN RAISE EXCEPTION 'UNVERIFIED_DATABASE_PRINCIPAL' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.users WHERE id=a.user_id FOR SHARE;
 PERFORM educore_private.r1b_lock_tenant(t);
 SELECT x.* INTO a FROM public.r2_principal_bindings b JOIN public.auth_sessions x ON x.id=b.auth_session_id
 JOIN public.users u ON u.id=x.user_id AND u.status='ACTIVE'
 WHERE b.database_role=session_user AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp() AND x.active_tenant_id=t;
 IF a.id IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_CURRENT' USING ERRCODE='42501'; END IF;
 SELECT tm.id INTO m FROM public.tenant_memberships tm JOIN public.tenants tn ON tn.id=tm.tenant_id AND tn.status='ACTIVE'
 JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
 JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
 JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=r.id
 JOIN public.permissions p ON p.id=rp.permission_id AND p.code=permission
 JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
 WHERE tm.tenant_id=t AND tm.user_id=a.user_id AND tm.status='ACTIVE' AND tm.left_at IS NULL
 AND (sc.scope_kind='TENANT' OR (sc.scope_kind='CLASS' AND sc.class_id=c) OR (sc.scope_kind='STUDENT' AND sc.student_id=s))
 AND (
  (r.code NOT IN ('STUDENT','PARENT','TEACHER'))
  OR (r.code='STUDENT' AND permission IN ('schedule.read','absence.create','absence.read','attendance.read') AND EXISTS
   (SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t AND sp.id=s AND sp.membership_id=tm.id))
  OR (r.code='PARENT' AND permission IN ('schedule.read','absence.create','absence.read','attendance.read') AND EXISTS
   (SELECT FROM public.parent_student_links ps WHERE ps.tenant_id=t AND ps.student_id=s AND ps.parent_membership_id=tm.id AND ps.verified_at IS NOT NULL AND ps.revoked_at IS NULL))
  OR (r.code='TEACHER' AND permission IN ('schedule.read','attendance.read','attendance.mark','attendance.finalize','absence.read') AND EXISTS
   (SELECT FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id AND ca.class_id=c
    WHERE tp.tenant_id=t AND tp.membership_id=tm.id AND tp.status='ACTIVE'
    AND ((session_id IS NULL AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR clock_timestamp()<ca.valid_to))
     OR EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t AND cs.id=session_id AND cs.teacher_id=tp.id
       AND ca.valid_from<=cs.starts_at AND (ca.valid_to IS NULL OR cs.starts_at<ca.valid_to)))))
 ) ORDER BY tm.id LIMIT 1;
 IF m IS NULL THEN RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

CREATE FUNCTION educore_r3.replay(t uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE r public.idempotency_records%ROWTYPE;
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR COALESCE(length(btrim(body->>'key')),0) NOT BETWEEN 1 AND 200
 OR COALESCE(length(btrim(body->>'reason')),0)=0 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.idempotency_records WHERE tenant_id=t AND operation_type='R3:'||(body->>'operation') AND idempotency_key=body->>'key';
 IF r.id IS NOT NULL THEN
  IF r.request_hash<>encode(sha256(convert_to(body::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN r.result_snapshot;
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION educore_r3.finish(t uuid,m uuid,body jsonb,result jsonb,policy uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE correlation uuid:=COALESCE((result->>'correlationId')::uuid,gen_random_uuid());
BEGIN
 IF policy IS NULL THEN SELECT id INTO policy FROM public.policy_versions WHERE tenant_id=t AND effective_from<=clock_timestamp()
 AND (effective_to IS NULL OR clock_timestamp()<effective_to) ORDER BY effective_from DESC,id LIMIT 1; END IF;
 IF policy IS NULL THEN RAISE EXCEPTION 'CURRENT_POLICY_REQUIRED' USING ERRCODE='23514'; END IF;
 INSERT INTO public.audit_logs(id,tenant_id,actor_user_id,actor_membership_id,actor_kind,event_type,entity_type,entity_id,action,reason,after_json,policy_version_id,correlation_id)
 SELECT gen_random_uuid(),t,user_id,m,'USER','R3:'||(body->>'operation'),'R3',(result->>'id')::uuid,body->>'operation',body->>'reason',
 jsonb_build_object('command',body,'result',result),policy,correlation FROM public.tenant_memberships WHERE tenant_id=t AND id=m;
 result:=result||jsonb_build_object('policyVersionId',policy,'correlationId',correlation);
 INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
 VALUES(gen_random_uuid(),t,'R3:'||(body->>'operation'),body->>'key',encode(sha256(convert_to(body::text,'UTF8')),'hex'),'COMPLETED',result,clock_timestamp());
 RETURN result;
END $$;

-- A03/A04: aggregate capacity at every start boundary (no aggregate CHECK).
CREATE FUNCTION educore_r3.assert_capacity(t uuid,c uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE cap int;
BEGIN
 SELECT capacity INTO STRICT cap FROM public.classes WHERE tenant_id=t AND id=c;
 IF EXISTS(SELECT FROM public.enrollments x WHERE x.tenant_id=t AND x.class_id=c AND x.status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN')
 AND (SELECT count(*) FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=c AND e.status IN ('ACTIVE','TRANSFERRED','COMPLETED','WITHDRAWN')
 AND e.effective_from<=x.effective_from AND (e.effective_to IS NULL OR x.effective_from<e.effective_to))>cap)
 THEN RAISE EXCEPTION 'CLASS_CAPACITY_EXCEEDED' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION educore_r3.academic_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE t uuid; c uuid;
BEGIN
 t:=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END;
 PERFORM educore_private.r1b_lock_tenant(t);
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.tenant_id) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id) THEN RAISE EXCEPTION 'ACADEMIC_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='enrollments' THEN
 IF TG_OP='UPDATE' AND NEW.prior_enrollment_id IS DISTINCT FROM OLD.prior_enrollment_id THEN RAISE EXCEPTION 'ENROLLMENT_LINEAGE_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF EXISTS(SELECT FROM public.session_participants p JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=p.session_id
   WHERE p.tenant_id=t AND p.enrollment_id=OLD.id AND p.removed_at IS NULL
   AND (cs.starts_at<=clock_timestamp() OR EXISTS(SELECT FROM public.invoice_lines l WHERE l.tenant_id=t AND l.participant_id=p.id))
   AND (NEW.effective_from>cs.starts_at OR (NEW.effective_to IS NOT NULL AND NEW.effective_to<=cs.starts_at)))
  THEN RAISE EXCEPTION 'HISTORICAL_ENROLLMENT_INTERVAL_PROTECTED' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.student_id,NEW.class_id,NEW.prior_enrollment_id,NEW.effective_from)
 IS DISTINCT FROM ROW(OLD.student_id,OLD.class_id,OLD.prior_enrollment_id,OLD.effective_from) THEN
  IF EXISTS(SELECT FROM public.session_participants p JOIN public.class_sessions s ON s.tenant_id=t AND s.id=p.session_id
   WHERE p.tenant_id=t AND p.enrollment_id=OLD.id AND (s.starts_at<=clock_timestamp() OR EXISTS(SELECT FROM public.invoice_lines WHERE tenant_id=t AND participant_id=p.id)))
  THEN RAISE EXCEPTION 'ENROLLMENT_HISTORY_PROTECTED' USING ERRCODE='23514'; END IF;
 END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION educore_r3.capacity_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE c uuid;
BEGIN
 IF TG_TABLE_NAME='classes' THEN c:=NEW.id; ELSE c:=NEW.class_id; END IF;
 PERFORM educore_r3.assert_capacity(NEW.tenant_id,c);
 RETURN NULL;
END $$;
CREATE TRIGGER r3_enrollment_gate BEFORE INSERT OR UPDATE OR DELETE ON public.enrollments FOR EACH ROW EXECUTE FUNCTION educore_r3.academic_guard();
CREATE TRIGGER r3_class_gate BEFORE UPDATE ON public.classes FOR EACH ROW EXECUTE FUNCTION educore_r3.academic_guard();
CREATE CONSTRAINT TRIGGER r3_enrollment_capacity AFTER INSERT OR UPDATE ON public.enrollments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r3.capacity_guard();
CREATE CONSTRAINT TRIGGER r3_class_capacity_check AFTER UPDATE ON public.classes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r3.capacity_guard();

-- A09: transfer target must be the same student's new interval and lineage.
CREATE FUNCTION educore_r3.transfer_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE source public.enrollments%ROWTYPE; dest public.enrollments%ROWTYPE;
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END);
 IF TG_OP<>'INSERT' THEN
  IF TG_OP='DELETE' OR OLD.status='CONFIRMED' THEN RAISE EXCEPTION 'TRANSFER_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF (to_jsonb(NEW)-ARRAY['status','target_enrollment_id','confirmed_by_membership_id','updated_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','target_enrollment_id','confirmed_by_membership_id','updated_at'])
   THEN RAISE EXCEPTION 'TRANSFER_REQUEST_IMMUTABLE' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.status='CONFIRMED' THEN
  SELECT * INTO STRICT source FROM public.enrollments WHERE tenant_id=NEW.tenant_id AND id=NEW.source_enrollment_id;
  SELECT * INTO STRICT dest FROM public.enrollments WHERE tenant_id=NEW.tenant_id AND id=NEW.target_enrollment_id;
  IF source.student_id IS DISTINCT FROM dest.student_id OR dest.class_id IS DISTINCT FROM NEW.target_class_id OR dest.prior_enrollment_id IS DISTINCT FROM source.id
   OR dest.effective_from IS DISTINCT FROM NEW.effective_at OR source.effective_to IS DISTINCT FROM NEW.effective_at OR source.status<>'TRANSFERRED'
   THEN RAISE EXCEPTION 'TRANSFER_LINEAGE_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r3_transfer_history BEFORE INSERT OR UPDATE OR DELETE ON public.enrollment_transfers FOR EACH ROW EXECUTE FUNCTION educore_r3.transfer_guard();

-- Owner confirmed ACTIVE admission and explicit request -> confirmation. Other
-- status mutations and P1 suspension remain closed. Placement is a separate
-- internal contract; no new StudentProfile level or fixed grade threshold.
CREATE FUNCTION educore_r3.academic(t uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE op text:=body->>'operation'; m uuid; c uuid; e public.enrollments%ROWTYPE; replay jsonb; result jsonb; target uuid:=gen_random_uuid();
 transfer public.enrollment_transfers%ROWTYPE; student uuid; policy uuid; moment timestamptz; r record;
BEGIN
 PERFORM educore_r3.principal(t);
 c:=(body->>'classId')::uuid;
 IF op='TRANSFER_REQUEST' THEN
  SELECT * INTO e FROM public.enrollments WHERE tenant_id=t AND id=(body->>'enrollmentId')::uuid; c:=e.class_id;
 ELSIF op='TRANSFER_CONFIRM' THEN
  SELECT * INTO transfer FROM public.enrollment_transfers WHERE tenant_id=t AND id=(body->>'transferId')::uuid;
  SELECT * INTO e FROM public.enrollments WHERE tenant_id=t AND id=transfer.source_enrollment_id; c:=e.class_id;
 END IF;
 m:=educore_r3.authorize(t,c,NULL,CASE op WHEN 'ASSIGN_TEACHER' THEN 'class.assign_teacher' WHEN 'ENROLL' THEN 'enrollment.create' WHEN 'TRANSFER_REQUEST' THEN 'enrollment.transfer' WHEN 'TRANSFER_CONFIRM' THEN 'enrollment.transfer' ELSE '__DENY__' END);
 replay:=educore_r3.replay(t,body); IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF e.id IS NOT NULL THEN SELECT * INTO e FROM public.enrollments WHERE tenant_id=t AND id=e.id FOR UPDATE; END IF;
 IF transfer.id IS NOT NULL THEN SELECT * INTO transfer FROM public.enrollment_transfers WHERE tenant_id=t AND id=transfer.id FOR UPDATE; END IF;
 IF NOT EXISTS(SELECT FROM public.classes WHERE tenant_id=t AND id=c AND status IN ('ACTIVE','PLANNED')) THEN RAISE EXCEPTION 'CLASS_NOT_ACTIVE' USING ERRCODE='23514'; END IF;
 IF op='ASSIGN_TEACHER' THEN
  IF NOT EXISTS(SELECT FROM public.teacher_profiles WHERE tenant_id=t AND id=(body->>'teacherId')::uuid AND status='ACTIVE') THEN RAISE EXCEPTION 'TEACHER_NOT_ACTIVE' USING ERRCODE='23514'; END IF;
  IF (body->>'validFrom')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'ASSIGNMENT_MUST_BE_FUTURE' USING ERRCODE='23514'; END IF;
  -- Changing teacher for already scheduled sessions requires explicit reschedule;
  -- assigning a different teacher must not bypass existing session bookings.
  IF EXISTS(SELECT FROM public.class_sessions WHERE tenant_id=t AND class_id=c AND status IN ('CONFIRMED','DRAFT')
   AND starts_at>=(body->>'validFrom')::timestamptz AND ((body->>'validTo') IS NULL OR starts_at<(body->>'validTo')::timestamptz)
   AND teacher_id<>(body->>'teacherId')::uuid) THEN RAISE EXCEPTION 'RESCHEDULE_AFFECTED_SESSIONS_FIRST' USING ERRCODE='23514'; END IF;
  INSERT INTO public.class_teacher_assignments(id,tenant_id,class_id,teacher_id,role_kind,valid_from,valid_to,assigned_by_membership_id,updated_at)
  VALUES(target,t,c,(body->>'teacherId')::uuid,'PRIMARY',(body->>'validFrom')::timestamptz,(body->>'validTo')::timestamptz,m,clock_timestamp());
 ELSIF op='TRANSFER_REQUEST' THEN
  PERFORM educore_r3.authorize(t,(body->>'targetClassId')::uuid,e.student_id,'enrollment.transfer');
  IF e.id IS NULL OR e.status<>'ACTIVE' OR e.effective_to IS NOT NULL OR e.class_id=(body->>'targetClassId')::uuid
   OR (body->>'effectiveAt')::timestamptz<=clock_timestamp() THEN RAISE EXCEPTION 'INVALID_FUTURE_TRANSFER' USING ERRCODE='23514'; END IF;
  INSERT INTO public.enrollment_transfers(id,tenant_id,source_enrollment_id,target_class_id,effective_at,status,requested_by_membership_id,reason,operation_key,updated_at)
  VALUES(target,t,e.id,(body->>'targetClassId')::uuid,(body->>'effectiveAt')::timestamptz,'REQUESTED',m,body->>'reason',body->>'key',clock_timestamp());
 ELSIF op IN ('ENROLL','TRANSFER_CONFIRM') THEN
  IF op='TRANSFER_CONFIRM' THEN
   IF transfer.id IS NULL OR transfer.status<>'REQUESTED' OR e.status<>'ACTIVE' OR e.effective_to IS NOT NULL
   THEN RAISE EXCEPTION 'TRANSFER_NOT_PENDING_OR_SOURCE_CHANGED' USING ERRCODE='23514'; END IF;
   moment:=transfer.effective_at; student:=e.student_id; c:=transfer.target_class_id;
   PERFORM educore_r3.authorize(t,c,student,'enrollment.transfer');
   SELECT (result_snapshot->>'policyVersionId')::uuid INTO policy FROM public.idempotency_records
    WHERE tenant_id=t AND operation_type='R3:TRANSFER_REQUEST' AND idempotency_key=transfer.operation_key;
  ELSE moment:=(body->>'effectiveFrom')::timestamptz; student:=(body->>'studentId')::uuid; END IF;
  IF moment IS NULL OR moment<=clock_timestamp() OR NOT EXISTS(SELECT FROM public.student_profiles WHERE tenant_id=t AND id=student AND status='ACTIVE')
   OR NOT EXISTS(SELECT FROM public.classes WHERE tenant_id=t AND id=c AND status IN ('ACTIVE','PLANNED'))
   THEN RAISE EXCEPTION 'INVALID_ENROLLMENT_TARGET_OR_TIME' USING ERRCODE='23514'; END IF;
  PERFORM educore_r3.placement(t,student,c,body->'placement');
  IF op='TRANSFER_CONFIRM' THEN
   IF EXISTS(SELECT FROM public.session_participants p JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=p.session_id
    WHERE p.tenant_id=t AND p.enrollment_id=e.id AND cs.starts_at>=moment AND EXISTS(SELECT FROM public.invoiced_participation_claims WHERE tenant_id=t AND participant_id=p.id))
    THEN RAISE EXCEPTION 'ISSUED_TRANSFER_SOURCE_PROTECTED' USING ERRCODE='23514'; END IF;
   UPDATE public.enrollments SET status='TRANSFERRED',effective_to=moment,updated_at=clock_timestamp() WHERE id=e.id;
   FOR r IN SELECT id FROM public.class_sessions WHERE tenant_id=t AND class_id=e.class_id AND starts_at>=moment AND status IN ('DRAFT','CONFIRMED') ORDER BY starts_at,id LOOP
    PERFORM educore_r3.roster(t,r.id);
    IF EXISTS(SELECT FROM public.class_sessions WHERE id=r.id AND status='CONFIRMED') THEN PERFORM educore_r3.book(t,r.id); END IF;
   END LOOP;
  END IF;
  INSERT INTO public.enrollments(id,tenant_id,student_id,class_id,status,effective_from,prior_enrollment_id,created_by_membership_id,updated_at)
   VALUES(target,t,student,c,'ACTIVE',moment,CASE WHEN op='TRANSFER_CONFIRM' THEN e.id END,m,clock_timestamp());
  PERFORM educore_r3.assert_capacity(t,c);
  FOR r IN SELECT id,status FROM public.class_sessions WHERE tenant_id=t AND class_id=c AND starts_at>=moment AND status IN ('DRAFT','CONFIRMED') ORDER BY starts_at,id LOOP
   PERFORM educore_r3.roster(t,r.id); IF r.status='CONFIRMED' THEN PERFORM educore_r3.book(t,r.id); END IF;
  END LOOP;
  PERFORM educore_r3.assert_bookings(t);
  IF op='TRANSFER_CONFIRM' THEN UPDATE public.enrollment_transfers SET status='CONFIRMED',target_enrollment_id=target,confirmed_by_membership_id=m,updated_at=clock_timestamp() WHERE id=transfer.id; END IF;
 ELSE RAISE EXCEPTION 'BUSINESS_DECISION_REQUIRED' USING ERRCODE='23514'; END IF;
 result:=jsonb_build_object('id',target,'status',CASE WHEN op='TRANSFER_REQUEST' THEN 'REQUESTED' WHEN op='ENROLL' THEN 'ACTIVE' WHEN op='TRANSFER_CONFIRM' THEN 'CONFIRMED' ELSE 'ASSIGNED' END);
 RETURN educore_r3.finish(t,m,body,result,policy);
END $$;

DO $ownership$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure p FROM pg_proc WHERE pronamespace='educore_r3'::regnamespace LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r3_owner',f.p); END LOOP;
END $ownership$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r3 FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE educore_r3_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r3.academic(uuid,jsonb) TO educore_r3_command;
COMMIT;
