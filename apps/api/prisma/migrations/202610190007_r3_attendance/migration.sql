BEGIN;
DO $$ BEGIN IF EXISTS(SELECT FROM public.attendance_corrections) THEN RAISE EXCEPTION 'R3_CORRECTION_HISTORY_ADOPTION_REQUIRES_REVIEW' USING ERRCODE='23514'; END IF; END $$;
ALTER TABLE public.absence_requests ADD COLUMN policy_version_id uuid,ADD COLUMN decision_reason text;
ALTER TABLE public.absence_requests ADD CONSTRAINT r3_absence_policy_fk FOREIGN KEY(tenant_id,policy_version_id) REFERENCES public.policy_versions(tenant_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.attendance_corrections ADD COLUMN old_revision int NOT NULL,ADD COLUMN new_revision int NOT NULL,ADD COLUMN previous_record_snapshot jsonb NOT NULL;
ALTER TABLE public.attendance_corrections ADD CONSTRAINT r3_correction_revision CHECK(old_revision>0 AND new_revision=old_revision+1 AND length(btrim(reason))>0);
ALTER TABLE public.attendance_corrections ADD CONSTRAINT r3_correction_snapshot CHECK(jsonb_typeof(previous_record_snapshot)='object'
 AND previous_record_snapshot->>'id'=attendance_id::text AND (previous_record_snapshot->>'revision')::int=old_revision);
CREATE UNIQUE INDEX r3_correction_revision_uq ON public.attendance_corrections(tenant_id,attendance_id,new_revision);
CREATE UNIQUE INDEX r3_one_active_absence ON public.absence_requests(tenant_id,participant_id) WHERE status IN ('REQUESTED','PENDING_APPROVAL','APPROVED');
GRANT SELECT,INSERT,UPDATE ON public.absence_requests,public.attendance_records,public.attendance_finalizations TO educore_r3_owner;
GRANT SELECT,INSERT ON public.attendance_corrections TO educore_r3_owner;

-- Exact boundary functions: production commands always supply DB time.
CREATE FUNCTION educore_r3.late_notice(submitted timestamptz,starts timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,educore_r3,pg_temp AS $$ SELECT submitted>starts-interval '24 hours' $$;
CREATE FUNCTION educore_r3.time_locked(stamp timestamptz,ends timestamptz) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,educore_r3,pg_temp AS $$ SELECT stamp>=ends+interval '48 hours' $$;
CREATE FUNCTION educore_r3.attendance_history() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,educore_r3,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='attendance_corrections' THEN RAISE EXCEPTION 'CORRECTION_APPEND_ONLY' USING ERRCODE='23514'; END IF;
 IF OLD.policy_version_id IS NOT NULL THEN
  IF TG_OP='DELETE' OR OLD.status IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'ABSENCE_DECISION_SEALED' USING ERRCODE='23514'; END IF;
  IF current_user<>'educore_r3_owner' OR (to_jsonb(NEW)-ARRAY['status','approved_by_membership_id','decided_at','decision_reason','updated_at'])
   IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','approved_by_membership_id','decided_at','decision_reason','updated_at'])
   THEN RAISE EXCEPTION 'ABSENCE_REQUEST_IMMUTABLE' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r3_correction_history BEFORE UPDATE OR DELETE ON public.attendance_corrections FOR EACH ROW EXECUTE FUNCTION educore_r3.attendance_history();
CREATE TRIGGER r3_absence_history BEFORE UPDATE OR DELETE ON public.absence_requests FOR EACH ROW EXECUTE FUNCTION educore_r3.attendance_history();

-- C07: once a historical session was finalized, an additional participant
-- cannot be slipped into the sealed roster by a competing writer.
CREATE FUNCTION educore_r3.finalized_roster_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
BEGIN
 PERFORM educore_private.r1b_lock_tenant(NEW.tenant_id);
 IF EXISTS(SELECT FROM public.class_sessions cs JOIN public.attendance_finalizations af ON af.tenant_id=NEW.tenant_id AND af.session_id=cs.id
  WHERE cs.tenant_id=NEW.tenant_id AND cs.id=NEW.session_id AND cs.starts_at<=clock_timestamp())
 THEN RAISE EXCEPTION 'FINALIZED_HISTORICAL_ROSTER_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r3_finalized_roster BEFORE INSERT ON public.session_participants FOR EACH ROW EXECUTE FUNCTION educore_r3.finalized_roster_guard();

CREATE FUNCTION educore_r3.attendance(t uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r3,pg_temp AS $$
DECLARE op text:=body->>'operation'; m uuid; prior jsonb; result jsonb; target uuid:=gen_random_uuid(); policy uuid;
 cs public.class_sessions%ROWTYPE; p public.session_participants%ROWTYPE; ar public.attendance_records%ROWTYPE;
 af public.attendance_finalizations%ROWTYPE; ab public.absence_requests%ROWTYPE; stamp timestamptz;
 requested public."AttendanceStatus"; teacher boolean; locked boolean;
BEGIN
 PERFORM educore_r3.principal(t);
 IF op IN ('LEAVE_SUBMIT','MARK') THEN SELECT * INTO p FROM public.session_participants WHERE tenant_id=t AND id=(body->>'participantId')::uuid;
 ELSIF op IN ('LEAVE_APPROVE','LEAVE_REJECT') THEN
  IF EXISTS(SELECT FROM public.invoiced_participation_claims WHERE tenant_id=t AND participant_id=p.id)
   THEN RAISE EXCEPTION 'ISSUED_LEAVE_SOURCE_REQUIRES_FINANCIAL_CORRECTION_PATH' USING ERRCODE='23514'; END IF;
  SELECT * INTO ab FROM public.absence_requests WHERE tenant_id=t AND id=(body->>'absenceId')::uuid;
  SELECT * INTO p FROM public.session_participants WHERE tenant_id=t AND id=ab.participant_id;
 ELSIF op='CORRECT' THEN
  SELECT * INTO ar FROM public.attendance_records WHERE tenant_id=t AND id=(body->>'attendanceId')::uuid;
  SELECT * INTO p FROM public.session_participants WHERE tenant_id=t AND id=ar.participant_id;
 END IF;
 SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=t AND id=COALESCE(p.session_id,(body->>'sessionId')::uuid);
 m:=educore_r3.authorize(t,cs.class_id,p.student_id,CASE op WHEN 'LEAVE_SUBMIT' THEN 'absence.create' WHEN 'LEAVE_APPROVE' THEN 'absence.approve'
 WHEN 'LEAVE_REJECT' THEN 'absence.approve' WHEN 'MARK' THEN 'attendance.mark' WHEN 'FINALIZE' THEN 'attendance.finalize' WHEN 'CORRECT' THEN 'attendance.correct' ELSE '__DENY__' END,cs.id);
 prior:=educore_r3.replay(t,body); IF prior IS NOT NULL THEN RETURN prior; END IF;
 -- Fresh state after authorization may have waited behind a source/IAM writer.
 SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=t AND id=cs.id FOR UPDATE;
 IF p.id IS NOT NULL THEN SELECT * INTO p FROM public.session_participants WHERE tenant_id=t AND id=p.id FOR UPDATE; END IF;
 IF ar.id IS NOT NULL THEN SELECT * INTO ar FROM public.attendance_records WHERE tenant_id=t AND id=ar.id FOR UPDATE; END IF;
 IF ab.id IS NOT NULL THEN SELECT * INTO ab FROM public.absence_requests WHERE tenant_id=t AND id=ab.id FOR UPDATE; END IF;
 stamp:=clock_timestamp(); policy:=cs.policy_version_id;
 IF cs.id IS NULL OR cs.status NOT IN ('CONFIRMED','COMPLETED') OR (p.id IS NOT NULL AND p.removed_at IS NOT NULL)
 THEN RAISE EXCEPTION 'ACTIVE_CONFIRMED_PARTICIPATION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF body?'sessionId' AND cs.id IS DISTINCT FROM (body->>'sessionId')::uuid THEN RAISE EXCEPTION 'WRONG_PARTICIPANT_SESSION' USING ERRCODE='23514'; END IF;
 SELECT * INTO af FROM public.attendance_finalizations WHERE tenant_id=t AND session_id=cs.id;
 IF op='LEAVE_SUBMIT' THEN
  IF stamp>=cs.starts_at THEN RAISE EXCEPTION 'LEAVE_SESSION_ALREADY_STARTED' USING ERRCODE='23514'; END IF;
  INSERT INTO public.absence_requests(id,tenant_id,participant_id,requester_membership_id,submitted_at,reason,is_late_notice,status,policy_version_id,updated_at)
  VALUES(target,t,p.id,m,stamp,body->>'reason',educore_r3.late_notice(stamp,cs.starts_at),'PENDING_APPROVAL',policy,stamp);
  result:=jsonb_build_object('id',target,'status','PENDING_APPROVAL');
 ELSIF op IN ('LEAVE_APPROVE','LEAVE_REJECT') THEN
  IF ab.status<>'PENDING_APPROVAL' OR ab.requester_membership_id=m THEN RAISE EXCEPTION 'ABSENCE_DECISION_NOT_ALLOWED' USING ERRCODE='42501'; END IF;
  IF op='LEAVE_APPROVE' AND ab.is_late_notice THEN PERFORM educore_r3.authorize(t,cs.class_id,p.student_id,'absence.approve_late',cs.id); END IF;
  UPDATE public.absence_requests SET status=CASE WHEN op='LEAVE_APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END,approved_by_membership_id=m,decided_at=stamp,decision_reason=body->>'reason',updated_at=stamp WHERE id=ab.id;
  result:=jsonb_build_object('id',ab.id,'status',CASE WHEN op='LEAVE_APPROVE' THEN 'APPROVED' ELSE 'REJECTED' END); policy:=ab.policy_version_id;
 ELSIF op IN ('MARK','FINALIZE','CORRECT') THEN
  IF stamp<cs.starts_at THEN RAISE EXCEPTION 'ATTENDANCE_SESSION_NOT_STARTED' USING ERRCODE='23514'; END IF;
  teacher:=EXISTS(SELECT FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id AND ca.class_id=cs.class_id
   WHERE tp.tenant_id=t AND tp.membership_id=m AND tp.id=cs.teacher_id AND tp.status='ACTIVE'
   AND ca.valid_from<=cs.starts_at AND (ca.valid_to IS NULL OR cs.starts_at<ca.valid_to));
  locked:=educore_r3.time_locked(stamp,cs.ends_at) OR EXISTS(SELECT FROM public.invoiced_participation_claims claim JOIN public.session_participants sp ON sp.tenant_id=t AND sp.id=claim.participant_id WHERE claim.tenant_id=t AND sp.session_id=cs.id);
  IF op<>'CORRECT' AND (NOT teacher OR locked) THEN
   -- Q05 permits scoped staff to resolve only an unconfirmed overdue source.
   IF af.id IS NOT NULL OR NOT educore_r3.time_locked(stamp,cs.ends_at) OR EXISTS(SELECT FROM public.invoice_lines WHERE tenant_id=t AND session_id=cs.id)
    OR NOT EXISTS(SELECT FROM public.membership_roles mr JOIN public.roles role ON role.tenant_id=t AND role.id=mr.role_id
     WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL AND role.code IN ('MANAGER','ACADEMIC_STAFF'))
   THEN RAISE EXCEPTION 'ASSIGNED_TEACHER_OR_OVERDUE_STAFF_REQUIRED' USING ERRCODE='42501'; END IF;
  END IF;
  IF op IN ('MARK','CORRECT') THEN
   IF op='MARK' THEN SELECT * INTO ar FROM public.attendance_records WHERE tenant_id=t AND participant_id=p.id FOR UPDATE; END IF;
   IF COALESCE(ar.revision,0) IS DISTINCT FROM (body->>'revision')::int THEN RAISE EXCEPTION 'ATTENDANCE_REVISION_CONFLICT' USING ERRCODE='23514'; END IF;
   requested:=(body->>'status')::public."AttendanceStatus";
   IF requested IS NULL THEN RAISE EXCEPTION 'ATTENDANCE_STATUS_REQUIRED' USING ERRCODE='23514'; END IF;
   IF requested='EXCUSED' AND NOT EXISTS(SELECT FROM public.absence_requests WHERE tenant_id=t AND participant_id=p.id AND status='APPROVED' AND approved_by_membership_id IS NOT NULL AND decided_at IS NOT NULL)
   THEN RAISE EXCEPTION 'APPROVED_LEAVE_REQUIRED' USING ERRCODE='23514'; END IF;
   -- Existing R1b protection includes draft lines. Never bypass frozen evidence.
   IF EXISTS(SELECT FROM public.invoice_lines WHERE tenant_id=t AND participant_id=p.id) THEN RAISE EXCEPTION 'BILLED_SOURCE_REQUIRES_FINANCIAL_CORRECTION_PATH' USING ERRCODE='23514'; END IF;
   IF ar.id IS NULL THEN
    IF op='CORRECT' THEN RAISE EXCEPTION 'CORRECTION_RECORD_REQUIRED' USING ERRCODE='23514'; END IF;
    INSERT INTO public.attendance_records(id,tenant_id,session_id,participant_id,attendance_status,recorded_by_membership_id,recorded_at,revision,updated_at)
    VALUES(target,t,cs.id,p.id,requested,m,stamp,1,stamp);
   ELSE
    INSERT INTO public.attendance_corrections(id,tenant_id,attendance_id,old_status,new_status,reason,requested_by_membership_id,approved_by_membership_id,corrected_at,old_revision,new_revision,previous_record_snapshot)
    VALUES(target,t,ar.id,ar.attendance_status,requested,body->>'reason',m,CASE WHEN op='CORRECT' THEN m END,stamp,ar.revision,ar.revision+1,to_jsonb(ar));
    UPDATE public.attendance_records SET attendance_status=requested,recorded_by_membership_id=m,recorded_at=stamp,revision=revision+1,updated_at=stamp WHERE id=ar.id;
    target:=ar.id;
   END IF;
   result:=jsonb_build_object('id',target,'revision',COALESCE(ar.revision,0)+1,'status',requested);
  ELSE
   IF af.id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_FINALIZED' USING ERRCODE='23514'; END IF;
   IF EXISTS(SELECT FROM public.session_participants sp LEFT JOIN public.attendance_records rec ON rec.tenant_id=t AND rec.participant_id=sp.id AND rec.session_id=cs.id
    WHERE sp.tenant_id=t AND sp.session_id=cs.id AND sp.removed_at IS NULL AND (rec.id IS NULL OR (rec.attendance_status='EXCUSED' AND NOT EXISTS
     (SELECT FROM public.absence_requests WHERE tenant_id=t AND participant_id=sp.id AND status='APPROVED' AND approved_by_membership_id IS NOT NULL AND decided_at IS NOT NULL))))
   THEN RAISE EXCEPTION 'ATTENDANCE_ROSTER_INCOMPLETE' USING ERRCODE='23514'; END IF;
   INSERT INTO public.attendance_finalizations(id,tenant_id,session_id,confirmed_by_membership_id,confirmed_at,locked_at,revision,updated_at)
   VALUES(target,t,cs.id,m,stamp,CASE WHEN locked THEN stamp END,1,stamp);
   UPDATE public.attendance_records rec SET finalization_id=target,updated_at=stamp FROM public.session_participants sp
    WHERE rec.tenant_id=t AND sp.tenant_id=t AND sp.id=rec.participant_id AND sp.session_id=cs.id AND sp.removed_at IS NULL;
   result:=jsonb_build_object('id',target,'status','FINALIZED');
  END IF;
 ELSE RAISE EXCEPTION 'UNSUPPORTED_R3_COMMAND' USING ERRCODE='22023'; END IF;
 RETURN educore_r3.finish(t,m,body,result,policy);
END $$;
DO $$ DECLARE f record; BEGIN FOR f IN SELECT oid::regprocedure p FROM pg_proc WHERE pronamespace='educore_r3'::regnamespace LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r3_owner',f.p); END LOOP; END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r3 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r3.attendance(uuid,jsonb) TO educore_r3_command;
COMMIT;
