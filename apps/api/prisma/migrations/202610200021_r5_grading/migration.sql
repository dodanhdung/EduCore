BEGIN;
-- Unbounded numeric plus pre-cast input validation: PostgreSQL must never round
-- 8.55 to a permitted Decimal(3,1) value before checking precision.
ALTER TABLE public.grades ALTER COLUMN score TYPE numeric USING score::numeric;
ALTER TABLE public.grades ADD CONSTRAINT r5_score CHECK(score BETWEEN 0 AND 10 AND scale(score)<=1);
ALTER TABLE public.grades ADD CONSTRAINT r5_grade_state CHECK(revision_no>0 AND ((status='DRAFT' AND published_at IS NULL) OR (status='PUBLISHED' AND published_at IS NOT NULL AND published_at>=graded_at AND cancelled_at IS NULL)));
CREATE UNIQUE INDEX r5_one_live_draft ON public.grades(tenant_id,submission_version_id) WHERE status='DRAFT' AND cancelled_at IS NULL;
DO $correct_permission$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.seed(uuid)'::regprocedure);
 ddl:=replace(ddl,$s$'grade.write','grade.publish','grade.read_published'$s$,$s$'grade.write','grade.publish','grade.correct','grade.read_published'$s$);EXECUTE ddl;
 INSERT INTO public.role_permissions(id,tenant_id,role_id,permission_id)
 SELECT gen_random_uuid(),r.tenant_id,r.id,p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.code='TEACHER' AND r.is_system_seeded AND p.code='grade.correct' ON CONFLICT DO NOTHING;
 ddl:=pg_get_functiondef('educore_r3.published_grade_evidence(uuid,uuid,uuid)'::regprocedure);
 ddl:=replace(ddl,'cl.id=a.class_id','cl.id=COALESCE(a.class_id,ar.class_id)');EXECUTE ddl;
END $correct_permission$;
CREATE FUNCTION educore_r5.grade_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE sub public.submissions%ROWTYPE; next_revision int;
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END);
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (OLD.status='PUBLISHED' OR OLD.cancelled_at IS NOT NULL)) THEN RAISE EXCEPTION 'GRADE_HISTORY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 SELECT s.* INTO STRICT sub FROM public.submissions s JOIN public.submission_versions v ON v.tenant_id=s.tenant_id AND v.submission_id=s.id WHERE v.tenant_id=NEW.tenant_id AND v.id=NEW.submission_version_id FOR UPDATE OF s;
 IF sub.current_version_id IS DISTINCT FROM NEW.submission_version_id THEN RAISE EXCEPTION 'GRADE_VERSION_NOT_CURRENT' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' THEN
  IF (to_jsonb(NEW)-ARRAY['status','published_at','cancelled_at','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','published_at','cancelled_at','updated_at']) OR (NEW.status='PUBLISHED' AND NEW.cancelled_at IS NOT NULL) OR (NEW.status='DRAFT' AND NEW.cancelled_at IS NULL) THEN RAISE EXCEPTION 'GRADE_TRANSITION_INVALID' USING ERRCODE='23514'; END IF;
 ELSE
  SELECT COALESCE(max(revision_no),0)+1 INTO next_revision FROM public.grades WHERE tenant_id=NEW.tenant_id AND submission_version_id=NEW.submission_version_id;
  IF NEW.revision_no<>next_revision THEN RAISE EXCEPTION 'GRADE_REVISION_STALE' USING ERRCODE='40001'; END IF;
  IF EXISTS(SELECT FROM public.grades WHERE tenant_id=NEW.tenant_id AND submission_version_id=NEW.submission_version_id AND status='PUBLISHED') AND COALESCE(length(btrim(NEW.reason_for_revision)),0)=0 THEN RAISE EXCEPTION 'GRADE_REVISION_REASON_REQUIRED' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_grade_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.grades FOR EACH ROW EXECUTE FUNCTION educore_r5.grade_guard();
CREATE FUNCTION educore_r5.grade(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE op text:=body->>'operation'; m uuid:=educore_r3.principal(t); teacher uuid; v public.submission_versions%ROWTYPE; sub public.submissions%ROWTYPE; ar public.assignment_recipients%ROWTYPE; g public.grades%ROWTYPE;
 prior jsonb; target uuid:=(body->>'versionId')::uuid; max_revision int; next_id uuid:=gen_random_uuid(); output_value jsonb;
BEGIN
 IF op='CORRECT' THEN
  SELECT * INTO g FROM public.grades WHERE tenant_id=t AND id=(body->>'gradeId')::uuid AND status='PUBLISHED';target:=g.submission_version_id;
 END IF;
 SELECT * INTO v FROM public.submission_versions WHERE tenant_id=t AND id=target;
 IF v.id IS NULL THEN RAISE EXCEPTION 'SUBMISSION_VERSION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO STRICT sub FROM public.submissions WHERE tenant_id=t AND id=v.submission_id FOR UPDATE;
 SELECT * INTO STRICT ar FROM public.assignment_recipients WHERE tenant_id=t AND id=sub.recipient_id;
 teacher:=educore_r5.teacher(t,m,ar.class_id,CASE op WHEN 'PUBLISH_GRADE' THEN 'grade.publish' WHEN 'CORRECT' THEN 'grade.correct' ELSE 'grade.write' END,ar.student_id);
 prior:=educore_r5.replay(t,m,body);IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF sub.current_version_id<>v.id OR ar.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'GRADE_VERSION_NOT_CURRENT' USING ERRCODE='23514'; END IF;
 SELECT COALESCE(max(revision_no),0) INTO max_revision FROM public.grades WHERE tenant_id=t AND submission_version_id=v.id;
 IF op IN ('SAVE_DRAFT','CORRECT') THEN
  IF jsonb_typeof(body->'score') IS DISTINCT FROM 'string' OR (body->>'score') !~ '^(10(\.0)?|[0-9](\.[0-9])?)$' OR length(body->>'feedback')>20000 THEN RAISE EXCEPTION 'INVALID_SCORE_OR_FEEDBACK' USING ERRCODE='22023'; END IF;
  IF op='SAVE_DRAFT' AND EXISTS(SELECT FROM public.grades WHERE tenant_id=t AND submission_version_id=v.id AND status='PUBLISHED') THEN RAISE EXCEPTION 'USE_GRADE_REVISION_COMMAND' USING ERRCODE='23514'; END IF;
  IF op='CORRECT' THEN
   IF g.id IS NULL OR g.revision_no IS DISTINCT FROM (SELECT max(revision_no) FROM public.grades WHERE tenant_id=t AND submission_version_id=v.id AND status='PUBLISHED') OR COALESCE(length(btrim(body->>'reason')),0)=0 THEN RAISE EXCEPTION 'LATEST_PUBLISHED_GRADE_AND_REASON_REQUIRED' USING ERRCODE='23514'; END IF;
  END IF;
  IF COALESCE((body->>'expectedRevision')::int,0)<>max_revision THEN RAISE EXCEPTION 'GRADE_REVISION_STALE' USING ERRCODE='40001'; END IF;
  UPDATE public.grades SET cancelled_at=clock_timestamp(),updated_at=clock_timestamp() WHERE tenant_id=t AND submission_version_id=v.id AND status='DRAFT' AND cancelled_at IS NULL;
  INSERT INTO public.grades(id,tenant_id,submission_version_id,revision_no,score,feedback,graded_by_teacher_id,graded_at,status,reason_for_revision,updated_at)
  VALUES(next_id,t,v.id,max_revision+1,(body->>'score')::numeric,body->>'feedback',teacher,clock_timestamp(),'DRAFT',body->>'reason',clock_timestamp());
 ELSIF op IN ('PUBLISH_GRADE','CANCEL_DRAFT') THEN
  SELECT * INTO g FROM public.grades WHERE tenant_id=t AND submission_version_id=v.id AND revision_no=(body->>'revision')::int AND status='DRAFT' AND cancelled_at IS NULL FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'GRADE_DRAFT_NOT_CURRENT' USING ERRCODE='40001'; END IF;
  next_id:=g.id;
  IF op='PUBLISH_GRADE' THEN UPDATE public.grades SET status='PUBLISHED',published_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=g.id;
  ELSE UPDATE public.grades SET cancelled_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=g.id; END IF;
 ELSE RAISE EXCEPTION 'UNKNOWN_GRADE_COMMAND' USING ERRCODE='22023'; END IF;
 SELECT jsonb_build_object('id',id,'versionId',submission_version_id,'revision',revision_no,'status',status,'cancelledAt',cancelled_at) INTO output_value FROM public.grades WHERE tenant_id=t AND id=next_id;
 RETURN educore_r5.finish(t,m,body,output_value);
END $$;
CREATE FUNCTION educore_r5.draft(t uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); ar public.assignment_recipients%ROWTYPE; output_value jsonb;
BEGIN
 SELECT r.* INTO ar FROM public.submission_versions v JOIN public.submissions s ON s.tenant_id=t AND s.id=v.submission_id JOIN public.assignment_recipients r ON r.tenant_id=t AND r.id=s.recipient_id WHERE v.tenant_id=t AND v.id=target;
 IF ar.id IS NULL THEN RAISE EXCEPTION 'VERSION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 PERFORM educore_r5.teacher(t,m,ar.class_id,'grade.write',ar.student_id);
 SELECT to_jsonb(g)||jsonb_build_object('score',score::text) INTO output_value FROM public.grades g WHERE tenant_id=t AND submission_version_id=target AND status='DRAFT' AND cancelled_at IS NULL;
 RETURN output_value;
END $$;
CREATE FUNCTION educore_r5.published_grades(t uuid,student uuid,q jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); output_value jsonb; total int; page_no int:=COALESCE((q->>'page')::int,1);size int:=COALESCE((q->>'pageSize')::int,20);
BEGIN
 IF page_no<1 OR size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 IF NOT educore_r4.has_permission(t,m,'grade.read_published',NULL,student) AND NOT EXISTS(SELECT FROM public.assignment_recipients ar WHERE ar.tenant_id=t AND ar.student_id=student AND educore_r4.has_permission(t,m,'grade.read_published',ar.class_id,student)) THEN RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 WITH allowed AS (
 SELECT g.id,g.submission_version_id,g.revision_no,g.score::text score,g.feedback,g.graded_at,g.published_at,ar.student_id,co.subject_id,a.id assignment_id
 FROM public.grades g JOIN public.submission_versions v ON v.tenant_id=t AND v.id=g.submission_version_id
 JOIN public.submissions sub ON sub.tenant_id=t AND sub.id=v.submission_id JOIN public.assignment_recipients ar ON ar.tenant_id=t AND ar.id=sub.recipient_id
 JOIN public.assignments a ON a.tenant_id=t AND a.id=ar.assignment_id JOIN public.classes cl ON cl.tenant_id=t AND cl.id=COALESCE(ar.class_id,a.class_id) JOIN public.courses co ON co.tenant_id=t AND co.id=cl.course_id
 WHERE g.tenant_id=t AND ar.student_id=student AND g.status='PUBLISHED' AND g.published_at IS NOT NULL AND educore_r4.has_permission(t,m,'grade.read_published',ar.class_id,student)
 AND (q->>'subjectId' IS NULL OR co.subject_id=(q->>'subjectId')::uuid)
 AND NOT EXISTS(SELECT FROM public.grades newer WHERE newer.tenant_id=t AND newer.submission_version_id=v.id AND newer.status='PUBLISHED' AND newer.revision_no>g.revision_no))
 SELECT count(*)::int,COALESCE((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM allowed ORDER BY published_at DESC,id LIMIT size OFFSET (page_no-1)*size) x),'[]') INTO total,output_value FROM allowed;
 RETURN jsonb_build_object('items',output_value,'total',total,'page',page_no,'pageSize',size,'asOf',clock_timestamp());
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r5' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r5 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r5.grade(uuid,jsonb),educore_r5.draft(uuid,uuid),educore_r5.published_grades(uuid,uuid,jsonb) TO educore_r4_api;
COMMIT;
