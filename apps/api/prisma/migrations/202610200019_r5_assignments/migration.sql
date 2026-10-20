BEGIN;
-- R5 uses the existing R4 command principal and User -> Tenant protocol.
CREATE SCHEMA educore_r5 AUTHORIZATION educore_r4_owner;
REVOKE ALL ON SCHEMA educore_r5 FROM PUBLIC;
GRANT USAGE ON SCHEMA educore_r5 TO educore_r4_api;
GRANT INSERT,UPDATE ON public.assignments,public.assignment_recipients,public.submissions,
 public.submission_versions,public.grades,public.stored_files,public.submission_files TO educore_r4_owner;
GRANT INSERT ON public.outbox_events,public.idempotency_records TO educore_r4_owner;
ALTER TABLE public.assignment_recipients ADD COLUMN class_id uuid;
UPDATE public.assignment_recipients ar SET class_id=e.class_id FROM public.enrollments e WHERE e.tenant_id=ar.tenant_id AND e.id=ar.enrollment_id;
UPDATE public.assignment_recipients ar SET class_id=a.class_id FROM public.assignments a WHERE a.tenant_id=ar.tenant_id AND a.id=ar.assignment_id AND ar.class_id IS NULL;
ALTER TABLE public.assignment_recipients ADD CONSTRAINT r5_recipient_class_fk FOREIGN KEY(tenant_id,class_id) REFERENCES public.classes(tenant_id,id) ON UPDATE RESTRICT ON DELETE RESTRICT;
ALTER TABLE public.assignments ADD CONSTRAINT r5_assignment_scalar CHECK(priority BETWEEN 1 AND 5 AND revision>0 AND length(btrim(title))>0 AND length(btrim(description))>0 AND isfinite(deadline_at) AND ((status='DRAFT' AND published_at IS NULL) OR (status IN ('PUBLISHED','ARCHIVED') AND published_at IS NOT NULL)));

-- Activate only the R5 resource permissions in the established R4 predicate.
DO $learning_permissions$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.has_permission(uuid,uuid,text,uuid,uuid)'::regprocedure);
 ddl:=replace(ddl,$s$r.code='PARENT' AND p IN ($s$, $s$r.code='PARENT' AND p IN ('assignment.read','submission.read','grade.read_published','file.read','file.download',$s$);
 ddl:=replace(ddl,$s$r.code='STUDENT' AND p IN ($s$, $s$r.code='STUDENT' AND p IN ('assignment.read','submission.read','submission.create','file.read','file.upload','file.download','grade.read_published',$s$);
 ddl:=replace(ddl,$s$r.code='TEACHER' AND p IN ($s$, $s$r.code='TEACHER' AND p IN ('assignment.read','assignment.create','assignment.update','assignment.publish','submission.read','grade.write','grade.publish','grade.correct','grade.read_published','file.read','file.download',$s$);
 EXECUTE ddl;
END $learning_permissions$;

CREATE FUNCTION educore_r5.replay(t uuid,m uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE receipt public.idempotency_records%ROWTYPE; op text:='R5:'||m::text||':'||(body->>'operation');
BEGIN
 IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR COALESCE(length(btrim(body->>'key')),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t AND operation_type=op AND idempotency_key=body->>'key';
 IF receipt.id IS NOT NULL THEN
  IF receipt.request_hash<>educore_r4.digest(body::text) THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN receipt.result_snapshot;
 END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION educore_r5.finish(t uuid,m uuid,body jsonb,value jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE policy uuid:=educore_r4.policy(t); correlation uuid:=COALESCE(educore_r4.correlation(),gen_random_uuid());
BEGIN
 -- Deliberately exclude answers, feedback, filenames and document content.
 PERFORM educore_r4.audit(t,m,'R5:'||(body->>'operation'),(value->>'id')::uuid,body->>'reason',jsonb_build_object('result',value),policy,correlation);
 value:=value||jsonb_build_object('policyVersionId',policy,'correlationId',correlation);
 INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
 VALUES(gen_random_uuid(),t,'R5:'||m::text||':'||(body->>'operation'),body->>'key',educore_r4.digest(body::text),'COMPLETED',value,clock_timestamp());
 RETURN value;
END $$;
CREATE FUNCTION educore_r5.teacher(t uuid,m uuid,c uuid,p text,s uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE teacher uuid;
BEGIN
 PERFORM educore_r4.authorize(t,p,c,s);
 SELECT tp.id INTO teacher FROM public.teacher_profiles tp JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.teacher_id=tp.id AND ca.class_id=c
 WHERE tp.tenant_id=t AND tp.membership_id=m AND tp.status='ACTIVE' AND ca.valid_from<=clock_timestamp() AND (ca.valid_to IS NULL OR ca.valid_to>clock_timestamp());
 IF teacher IS NULL THEN RAISE EXCEPTION 'TEACHER_CLASS_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN teacher;
END $$;
CREATE FUNCTION educore_r5.recipient_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE a public.assignments%ROWTYPE; e public.enrollments%ROWTYPE;
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'RECIPIENT_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 SELECT * INTO STRICT a FROM public.assignments WHERE tenant_id=NEW.tenant_id AND id=NEW.assignment_id FOR UPDATE;
 IF TG_OP='UPDATE' AND a.status<>'DRAFT' AND (to_jsonb(NEW)-ARRAY['revoked_at','deadline_override_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revoked_at','deadline_override_at','updated_at']) THEN RAISE EXCEPTION 'RECIPIENT_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='INSERT' OR (TG_OP='UPDATE' AND a.status='DRAFT') THEN
  SELECT * INTO e FROM public.enrollments WHERE tenant_id=NEW.tenant_id AND id=NEW.enrollment_id AND student_id=NEW.student_id;
  IF e.id IS NULL OR e.class_id IS DISTINCT FROM NEW.class_id OR (a.class_id IS NOT NULL AND a.class_id<>NEW.class_id) THEN RAISE EXCEPTION 'RECIPIENT_ENROLLMENT_MISMATCH' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.deadline_override_at IS NOT NULL AND (NOT isfinite(NEW.deadline_override_at) OR NEW.deadline_override_at<a.deadline_at OR (TG_OP='UPDATE' AND NEW.deadline_override_at<OLD.deadline_override_at)) THEN RAISE EXCEPTION 'DEADLINE_CANNOT_SHRINK' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_recipient_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.assignment_recipients FOR EACH ROW EXECUTE FUNCTION educore_r5.recipient_guard();
CREATE FUNCTION educore_r5.assignment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ASSIGNMENT_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (NEW.tenant_id,NEW.id,NEW.created_by_teacher_id,NEW.class_id) IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.created_by_teacher_id,OLD.class_id) OR NEW.revision<>OLD.revision+1 OR OLD.status='ARCHIVED'
   OR (OLD.status='PUBLISHED' AND NEW.status NOT IN ('PUBLISHED','ARCHIVED')) OR (OLD.published_at IS NOT NULL AND NEW.published_at IS DISTINCT FROM OLD.published_at)
  THEN RAISE EXCEPTION 'ASSIGNMENT_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT FROM public.submissions sub JOIN public.assignment_recipients ar ON ar.tenant_id=sub.tenant_id AND ar.id=sub.recipient_id WHERE ar.tenant_id=OLD.tenant_id AND ar.assignment_id=OLD.id) AND
   ((NEW.title,NEW.description,NEW.priority) IS DISTINCT FROM (OLD.title,OLD.description,OLD.priority) OR NEW.deadline_at<OLD.deadline_at)
  THEN RAISE EXCEPTION 'SUBMITTED_ASSIGNMENT_REQUIREMENTS_LOCKED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_assignment_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.assignments FOR EACH ROW EXECUTE FUNCTION educore_r5.assignment_guard();

CREATE FUNCTION educore_r5.assignment(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE op text:=body->>'operation'; m uuid; teacher uuid; a public.assignments%ROWTYPE; c uuid; target uuid:=(body->>'id')::uuid;
 ids jsonb; student uuid; e public.enrollments%ROWTYPE; r record; prior jsonb; result jsonb; stamp timestamptz;
BEGIN
 m:=educore_r3.principal(t);
 IF op='CREATE' THEN c:=(body->>'classId')::uuid;
 ELSE SELECT * INTO a FROM public.assignments WHERE tenant_id=t AND id=target FOR UPDATE; IF a.id IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF; c:=a.class_id; END IF;
 ids:=COALESCE(body->'studentIds',body->'recipientStudentIds');
 IF c IS NOT NULL THEN teacher:=educore_r5.teacher(t,m,c,CASE op WHEN 'CREATE' THEN 'assignment.create' WHEN 'PUBLISH' THEN 'assignment.publish' ELSE 'assignment.update' END);
 ELSE
  SELECT id INTO teacher FROM public.teacher_profiles WHERE tenant_id=t AND membership_id=m AND status='ACTIVE';
  IF teacher IS NULL THEN RAISE EXCEPTION 'TEACHER_REQUIRED' USING ERRCODE='42501'; END IF;
 END IF;
 IF a.id IS NOT NULL AND a.created_by_teacher_id<>teacher THEN RAISE EXCEPTION 'ASSIGNMENT_AUTHOR_REQUIRED' USING ERRCODE='42501'; END IF;
 -- Recheck every saved recipient, including on idempotent replay.
 FOR r IN SELECT * FROM public.assignment_recipients WHERE tenant_id=t AND assignment_id=target LOOP
  PERFORM educore_r5.teacher(t,m,r.class_id,CASE op WHEN 'PUBLISH' THEN 'assignment.publish' ELSE 'assignment.update' END,r.student_id);
 END LOOP;
 prior:=educore_r5.replay(t,m,body); IF prior IS NOT NULL THEN RETURN prior; END IF;
 stamp:=clock_timestamp();
 IF op='CREATE' THEN
  target:=gen_random_uuid();
  INSERT INTO public.assignments(id,tenant_id,class_id,created_by_teacher_id,title,description,priority,deadline_at,status,revision,updated_at)
  VALUES(target,t,c,teacher,body->>'title',body->>'description',(body->>'priority')::smallint,(body->>'deadlineAt')::timestamptz,'DRAFT',1,stamp);
 ELSIF (body->>'expectedRevision')::int IS DISTINCT FROM a.revision THEN RAISE EXCEPTION 'STALE_ASSIGNMENT_REVISION' USING ERRCODE='40001';
 END IF;
 IF op='CREATE' OR (op='EDIT' AND ids IS NOT NULL) OR (op='PUBLISH' AND ids IS NOT NULL) THEN
  IF a.id IS NOT NULL AND a.status<>'DRAFT' THEN RAISE EXCEPTION 'RECIPIENT_SNAPSHOT_IMMUTABLE' USING ERRCODE='23514'; END IF;
  IF ids IS NULL THEN
   SELECT COALESCE(jsonb_agg(student_id),'[]') INTO ids FROM public.enrollments WHERE tenant_id=t AND class_id=c AND status='ACTIVE' AND effective_from<=stamp AND (effective_to IS NULL OR effective_to>stamp);
  END IF;
  IF jsonb_typeof(ids)<>'array' OR jsonb_array_length(ids)=0 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(ids))<>jsonb_array_length(ids) THEN RAISE EXCEPTION 'RECIPIENTS_REQUIRED_OR_DUPLICATE' USING ERRCODE='22023'; END IF;
  -- Draft selection is retained. Replacement can only add or retain identities;
  -- obsolete draft rows are revoked rather than physically deleted.
  UPDATE public.assignment_recipients SET revoked_at=stamp,updated_at=stamp WHERE tenant_id=t AND assignment_id=target;
  FOR student IN SELECT value::text::uuid FROM jsonb_array_elements_text(ids) LOOP
   SELECT en.* INTO e FROM public.enrollments en JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.class_id=en.class_id AND ca.teacher_id=teacher AND ca.valid_from<=stamp AND (ca.valid_to IS NULL OR ca.valid_to>stamp)
   JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=en.student_id AND sp.status='ACTIVE'
   WHERE en.tenant_id=t AND en.student_id=student AND (c IS NULL OR en.class_id=c) AND en.status='ACTIVE' AND en.effective_from<=stamp AND (en.effective_to IS NULL OR en.effective_to>stamp) ORDER BY en.id LIMIT 1;
   IF e.id IS NULL THEN RAISE EXCEPTION 'RECIPIENT_NOT_ENROLLED_IN_SCOPE' USING ERRCODE='23514'; END IF;
   IF c IS NULL AND (SELECT count(DISTINCT en.class_id) FROM public.enrollments en JOIN public.class_teacher_assignments ca ON ca.tenant_id=t AND ca.class_id=en.class_id AND ca.teacher_id=teacher AND ca.valid_from<=stamp AND (ca.valid_to IS NULL OR ca.valid_to>stamp) WHERE en.tenant_id=t AND en.student_id=student AND en.status='ACTIVE' AND en.effective_from<=stamp AND (en.effective_to IS NULL OR en.effective_to>stamp))>1 THEN RAISE EXCEPTION 'AMBIGUOUS_STUDENT_CLASS_SUPPLY_CLASS_ID' USING ERRCODE='22023'; END IF;
   PERFORM educore_r5.teacher(t,m,e.class_id,CASE WHEN op='PUBLISH' THEN 'assignment.publish' WHEN op='CREATE' THEN 'assignment.create' ELSE 'assignment.update' END,student);
   INSERT INTO public.assignment_recipients(id,tenant_id,assignment_id,student_id,enrollment_id,class_id,assigned_at,updated_at)
   VALUES(gen_random_uuid(),t,target,student,e.id,e.class_id,stamp,stamp)
   ON CONFLICT(tenant_id,assignment_id,student_id) DO UPDATE SET enrollment_id=EXCLUDED.enrollment_id,class_id=EXCLUDED.class_id,revoked_at=NULL,updated_at=stamp;
  END LOOP;
 END IF;
 IF op='PUBLISH' THEN
  IF a.status<>'DRAFT' THEN RAISE EXCEPTION 'ASSIGNMENT_ALREADY_PUBLISHED' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS(SELECT FROM public.assignment_recipients WHERE tenant_id=t AND assignment_id=target AND revoked_at IS NULL) THEN RAISE EXCEPTION 'RECIPIENTS_REQUIRED' USING ERRCODE='23514'; END IF;
  FOR r IN SELECT * FROM public.assignment_recipients WHERE tenant_id=t AND assignment_id=target AND revoked_at IS NULL LOOP
   PERFORM educore_r5.teacher(t,m,r.class_id,'assignment.publish',r.student_id);
   IF NOT EXISTS(SELECT FROM public.enrollments en JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=en.student_id AND sp.status='ACTIVE' WHERE en.tenant_id=t AND en.id=r.enrollment_id AND en.student_id=r.student_id AND en.class_id=r.class_id AND en.status='ACTIVE' AND en.effective_from<=stamp AND (en.effective_to IS NULL OR en.effective_to>stamp)) THEN RAISE EXCEPTION 'RECIPIENT_MEMBERSHIP_CHANGED' USING ERRCODE='23514'; END IF;
  END LOOP;
  UPDATE public.assignment_recipients SET assigned_at=stamp,updated_at=stamp WHERE tenant_id=t AND assignment_id=target;
  UPDATE public.assignments SET status='PUBLISHED',published_at=stamp,revision=revision+1,updated_at=stamp WHERE tenant_id=t AND id=target;
  INSERT INTO public.outbox_events(id,tenant_id,event_key,event_type,aggregate_type,aggregate_id,payload_json,occurred_at,status,attempt_count,available_at,correlation_id,updated_at)
  VALUES(gen_random_uuid(),t,'R5:ASSIGNMENT:'||target::text,'ASSIGNMENT_PUBLISHED','Assignment',target,jsonb_build_object('assignmentId',target),stamp,'NEW',0,stamp,COALESCE(educore_r4.correlation(),gen_random_uuid()),stamp);
 ELSIF op='EDIT' THEN
  IF a.status='ARCHIVED' THEN RAISE EXCEPTION 'ASSIGNMENT_ARCHIVED' USING ERRCODE='23514'; END IF;
  IF a.deadline_at IS DISTINCT FROM COALESCE((body->>'deadlineAt')::timestamptz,a.deadline_at) AND EXISTS(SELECT FROM public.submissions sub JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.id=sub.recipient_id WHERE sub.tenant_id=t AND ar.assignment_id=target) AND COALESCE(length(btrim(body->>'reason')),0)=0 THEN RAISE EXCEPTION 'EXTENSION_REASON_REQUIRED' USING ERRCODE='23514'; END IF;
  UPDATE public.assignments SET title=COALESCE(body->>'title',title),description=COALESCE(body->>'description',description),priority=COALESCE((body->>'priority')::smallint,priority),deadline_at=COALESCE((body->>'deadlineAt')::timestamptz,deadline_at),revision=revision+1,updated_at=stamp WHERE tenant_id=t AND id=target;
 ELSIF op='ARCHIVE' THEN
  IF a.status<>'PUBLISHED' OR COALESCE(length(btrim(body->>'reason')),0)=0 THEN RAISE EXCEPTION 'ARCHIVE_REASON_OR_STATE_INVALID' USING ERRCODE='23514'; END IF;
  UPDATE public.assignments SET status='ARCHIVED',revision=revision+1,updated_at=stamp WHERE tenant_id=t AND id=target;
 ELSIF op<>'CREATE' THEN RAISE EXCEPTION 'UNKNOWN_ASSIGNMENT_COMMAND' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('id',id,'revision',revision,'status',status) INTO result FROM public.assignments WHERE tenant_id=t AND id=target;
 RETURN educore_r5.finish(t,m,body,result);
END $$;

CREATE FUNCTION educore_r5.assignments(t uuid,q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); items jsonb; total int; page_no int:=COALESCE((q->>'page')::int,1); size int:=COALESCE((q->>'pageSize')::int,20);
BEGIN
 IF page_no<1 OR size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 WITH allowed AS (
  SELECT a.* FROM public.assignments a WHERE a.tenant_id=t AND (q->>'id' IS NULL OR a.id=(q->>'id')::uuid) AND (q->>'classId' IS NULL OR a.class_id=(q->>'classId')::uuid)
  AND (q->>'status' IS NULL OR a.status::text=q->>'status') AND (
   (EXISTS(SELECT FROM public.teacher_profiles tp WHERE tp.tenant_id=t AND tp.id=a.created_by_teacher_id AND tp.membership_id=m AND tp.status='ACTIVE') AND
    ((a.class_id IS NOT NULL AND educore_r4.has_permission(t,m,'assignment.read',a.class_id)) OR EXISTS(SELECT FROM public.assignment_recipients ar WHERE ar.tenant_id=t AND ar.assignment_id=a.id AND educore_r4.has_permission(t,m,'assignment.read',ar.class_id,ar.student_id))))
   OR (a.status<>'DRAFT' AND EXISTS(SELECT FROM public.assignment_recipients ar WHERE ar.tenant_id=t AND ar.assignment_id=a.id AND ar.revoked_at IS NULL AND (q->>'studentId' IS NULL OR ar.student_id=(q->>'studentId')::uuid) AND educore_r4.has_permission(t,m,'assignment.read',ar.class_id,ar.student_id)))))
 SELECT count(*)::int,COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM allowed ORDER BY created_at DESC,id LIMIT size OFFSET (page_no-1)*size) x),'[]') INTO total,items FROM allowed;
 IF q->>'id' IS NOT NULL AND total=0 THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;
CREATE FUNCTION educore_r5.recipients(t uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); a public.assignments%ROWTYPE; r record; items jsonb:='[]';
BEGIN
 SELECT * INTO a FROM public.assignments WHERE tenant_id=t AND id=target;
 IF a.id IS NULL THEN RAISE EXCEPTION 'ASSIGNMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 IF a.class_id IS NOT NULL THEN PERFORM educore_r5.teacher(t,m,a.class_id,'assignment.read'); END IF;
 FOR r IN SELECT ar.*,sub.status submission_status,sub.current_version_id FROM public.assignment_recipients ar LEFT JOIN public.submissions sub ON sub.tenant_id=t AND sub.recipient_id=ar.id WHERE ar.tenant_id=t AND ar.assignment_id=target ORDER BY ar.id LOOP
  PERFORM educore_r5.teacher(t,m,r.class_id,'assignment.read',r.student_id); items:=items||to_jsonb(r);
 END LOOP;
 RETURN items;
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r5' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r5 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r5.assignment(uuid,jsonb),educore_r5.assignments(uuid,jsonb),educore_r5.recipients(uuid,uuid) TO educore_r4_api;
COMMIT;
