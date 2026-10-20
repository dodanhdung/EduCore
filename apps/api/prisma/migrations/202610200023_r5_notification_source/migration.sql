BEGIN;
-- R5 publication events notify the snapshotted Students. Older R4 event
-- contracts remain untouched. Read-time eligibility is always checked again.
DO $assignment_delivery$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.can_event(uuid,uuid,uuid,text)'::regprocedure);
 ddl:=replace(ddl,'IF e.event_type=''ADMIN_ALERT'' THEN', $source$
 IF e.event_type='ASSIGNMENT_PUBLISHED' AND e.event_key LIKE 'R5:ASSIGNMENT:%' THEN
  RETURN EXISTS(SELECT FROM public.assignments a JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.assignment_id=a.id AND ar.revoked_at IS NULL
   JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=ar.student_id AND sp.membership_id=m AND sp.status='ACTIVE'
   WHERE a.tenant_id=t AND a.id=e.aggregate_id AND a.status='PUBLISHED'
   AND educore_r4.has_permission(t,m,permission,ar.class_id,ar.student_id)
   AND educore_r4.has_permission(t,m,'assignment.read',ar.class_id,ar.student_id));
 END IF;
 IF e.event_type='ADMIN_ALERT' THEN
 $source$);
 EXECUTE ddl;
END $assignment_delivery$;
CREATE FUNCTION educore_r5.recipient_change(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t);ar public.assignment_recipients%ROWTYPE;a public.assignments%ROWTYPE;prior jsonb;deadline timestamptz;
BEGIN
 SELECT * INTO ar FROM public.assignment_recipients WHERE tenant_id=t AND id=(body->>'id')::uuid FOR UPDATE;
 IF ar.id IS NULL THEN RAISE EXCEPTION 'RECIPIENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO STRICT a FROM public.assignments WHERE tenant_id=t AND id=ar.assignment_id FOR UPDATE;
 PERFORM educore_r5.teacher(t,m,ar.class_id,'assignment.update',ar.student_id);
 prior:=educore_r5.replay(t,m,body);IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF a.status<>'PUBLISHED' OR ar.revoked_at IS NOT NULL OR (body->>'expectedRevision')::int IS DISTINCT FROM a.revision OR COALESCE(length(btrim(body->>'reason')),0)=0 THEN RAISE EXCEPTION 'RECIPIENT_STATE_OR_REVISION_INVALID' USING ERRCODE='23514'; END IF;
 IF body->>'operation'='REVOKE_RECIPIENT' THEN UPDATE public.assignment_recipients SET revoked_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=ar.id;
 ELSIF body->>'operation'='EXTEND_RECIPIENT' THEN
  deadline:=(body->>'deadlineAt')::timestamptz;
  IF deadline IS NULL OR NOT isfinite(deadline) OR deadline<=GREATEST(a.deadline_at,COALESCE(ar.deadline_override_at,a.deadline_at)) THEN RAISE EXCEPTION 'DEADLINE_MUST_EXTEND' USING ERRCODE='23514'; END IF;
  UPDATE public.assignment_recipients SET deadline_override_at=deadline,updated_at=clock_timestamp() WHERE id=ar.id;
 ELSE RAISE EXCEPTION 'UNKNOWN_RECIPIENT_COMMAND' USING ERRCODE='22023'; END IF;
 UPDATE public.assignments SET revision=revision+1,updated_at=clock_timestamp() WHERE id=a.id;
 RETURN educore_r5.finish(t,m,body,jsonb_build_object('id',ar.id,'assignmentId',a.id,'assignmentRevision',a.revision+1));
END $$;
ALTER FUNCTION educore_r5.recipient_change(uuid,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r5.recipient_change(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r5.recipient_change(uuid,jsonb) TO educore_r4_api;
COMMIT;
