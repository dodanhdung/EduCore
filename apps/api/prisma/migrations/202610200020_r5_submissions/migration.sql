BEGIN;
-- O-08 A and O-09 A explicitly approved in the R5 task on 2026-10-20.
-- No physical cleanup/TTL is authorized.
ALTER TABLE public.grades ADD COLUMN cancelled_at timestamptz(6);
ALTER TABLE public.stored_files ADD COLUMN recipient_id uuid;
ALTER TABLE public.stored_files ADD CONSTRAINT r5_file_recipient_fk FOREIGN KEY(tenant_id,recipient_id) REFERENCES public.assignment_recipients(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public.submission_versions ADD COLUMN effective_deadline_at timestamptz(6);
ALTER TABLE public.submissions ADD CONSTRAINT r5_submission_state CHECK(status='SUBMITTED');
ALTER TABLE public.submission_versions ADD CONSTRAINT r5_version_scalar CHECK(version_no>0 AND status='SUBMITTED' AND (content_hash IS NULL OR content_hash ~ '^[0-9a-f]{64}$'));
ALTER TABLE public.submission_files ADD CONSTRAINT r5_file_slot CHECK(sort_order BETWEEN 0 AND 4);
CREATE UNIQUE INDEX r5_version_file_slot ON public.submission_files(tenant_id,submission_version_id,sort_order);
CREATE FUNCTION educore_r5.is_late(stamp timestamptz,deadline timestamptz) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF stamp IS NULL OR deadline IS NULL OR NOT isfinite(stamp) OR NOT isfinite(deadline) OR stamp>deadline+interval '168 hours' THEN RAISE EXCEPTION 'SUBMISSION_WINDOW_CLOSED' USING ERRCODE='23514'; END IF;
 RETURN stamp>deadline;
END $$;

CREATE FUNCTION educore_r5.recipient(t uuid,target uuid,p text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r3.principal(t); ar public.assignment_recipients%ROWTYPE; a public.assignments%ROWTYPE;
BEGIN
 SELECT * INTO ar FROM public.assignment_recipients WHERE tenant_id=t AND id=target;
 IF ar.id IS NULL THEN RAISE EXCEPTION 'RECIPIENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 SELECT * INTO a FROM public.assignments WHERE tenant_id=t AND id=ar.assignment_id FOR UPDATE;
 SELECT * INTO ar FROM public.assignment_recipients WHERE tenant_id=t AND id=target FOR UPDATE;
 PERFORM educore_r4.authorize(t,p,ar.class_id,ar.student_id);
 IF p IN ('submission.create','file.upload') AND (a.status<>'PUBLISHED' OR ar.revoked_at IS NOT NULL OR NOT EXISTS(SELECT FROM public.student_profiles WHERE tenant_id=t AND id=ar.student_id AND membership_id=m AND status='ACTIVE')) THEN RAISE EXCEPTION 'SUBMISSION_OWNER_OR_STATE_DENIED' USING ERRCODE='42501'; END IF;
 IF p IN ('submission.read','file.read','file.download') AND (a.status='DRAFT' OR ar.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'RESOURCE_UNAVAILABLE' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('membershipId',m,'assignmentId',a.id,'studentId',ar.student_id,'classId',ar.class_id,'deadlineAt',GREATEST(a.deadline_at,COALESCE(ar.deadline_override_at,a.deadline_at)));
END $$;
CREATE FUNCTION educore_r5.version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE sub public.submissions%ROWTYPE; ar public.assignment_recipients%ROWTYPE; a public.assignments%ROWTYPE; deadline timestamptz; stamp timestamptz; next_version int;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SUBMISSION_VERSION_IMMUTABLE' USING ERRCODE='23514'; END IF;
 PERFORM educore_private.r1b_lock_tenant(NEW.tenant_id);
 SELECT * INTO STRICT sub FROM public.submissions WHERE tenant_id=NEW.tenant_id AND id=NEW.submission_id FOR UPDATE;
 SELECT * INTO STRICT ar FROM public.assignment_recipients WHERE tenant_id=NEW.tenant_id AND id=sub.recipient_id;
 SELECT * INTO STRICT a FROM public.assignments WHERE tenant_id=NEW.tenant_id AND id=ar.assignment_id FOR UPDATE;
 IF a.status<>'PUBLISHED' OR ar.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'SUBMISSION_NOT_OPEN' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.grades g JOIN public.submission_versions v ON v.tenant_id=g.tenant_id AND v.id=g.submission_version_id WHERE v.tenant_id=NEW.tenant_id AND v.submission_id=sub.id AND g.cancelled_at IS NULL) THEN RAISE EXCEPTION 'RESUBMISSION_NOT_ALLOWED' USING ERRCODE='23514'; END IF;
 stamp:=clock_timestamp();deadline:=GREATEST(a.deadline_at,COALESCE(ar.deadline_override_at,a.deadline_at));
 PERFORM educore_r5.is_late(stamp,deadline);
 SELECT COALESCE(max(version_no),0)+1 INTO next_version FROM public.submission_versions WHERE tenant_id=NEW.tenant_id AND submission_id=sub.id;
 IF NEW.version_no<>next_version THEN RAISE EXCEPTION 'VERSION_SEQUENCE_INVALID' USING ERRCODE='23514'; END IF;
 NEW.submitted_at:=stamp;NEW.effective_deadline_at:=deadline;NEW.is_late:=stamp>deadline;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_version_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.submission_versions FOR EACH ROW EXECUTE FUNCTION educore_r5.version_guard();
CREATE FUNCTION educore_r5.current_version_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE sub public.submissions%ROWTYPE; latest uuid; sid uuid;
BEGIN
 IF TG_TABLE_NAME='submissions' THEN sid:=NEW.id; ELSE sid:=NEW.submission_id; END IF;
 SELECT * INTO sub FROM public.submissions WHERE tenant_id=NEW.tenant_id AND id=sid;
 SELECT id INTO latest FROM public.submission_versions WHERE tenant_id=NEW.tenant_id AND submission_id=sid ORDER BY version_no DESC LIMIT 1;
 IF latest IS NULL OR sub.current_version_id IS DISTINCT FROM latest THEN RAISE EXCEPTION 'CURRENT_VERSION_NOT_LATEST' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER r5_current_submission AFTER INSERT OR UPDATE ON public.submissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r5.current_version_guard();
CREATE CONSTRAINT TRIGGER r5_current_version AFTER INSERT ON public.submission_versions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r5.current_version_guard();
CREATE FUNCTION educore_r5.submission_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END);
 IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND (NEW.id,NEW.tenant_id,NEW.recipient_id,NEW.created_at) IS DISTINCT FROM (OLD.id,OLD.tenant_id,OLD.recipient_id,OLD.created_at)) THEN RAISE EXCEPTION 'SUBMISSION_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_submission_identity BEFORE INSERT OR UPDATE OR DELETE ON public.submissions FOR EACH ROW EXECUTE FUNCTION educore_r5.submission_guard();
CREATE FUNCTION educore_r5.attachment_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE v record; f public.stored_files%ROWTYPE; owner_membership uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'SUBMISSION_ATTACHMENTS_IMMUTABLE' USING ERRCODE='23514'; END IF;
 PERFORM educore_private.r1b_lock_tenant(NEW.tenant_id);
 SELECT sv.*,sv.xmin::text insertion_tx,sub.recipient_id INTO STRICT v FROM public.submission_versions sv JOIN public.submissions sub ON sub.tenant_id=sv.tenant_id AND sub.id=sv.submission_id WHERE sv.tenant_id=NEW.tenant_id AND sv.id=NEW.submission_version_id FOR UPDATE OF sub,sv;
 IF v.insertion_tx<>(txid_current()%4294967296)::text THEN RAISE EXCEPTION 'SUBMITTED_ATTACHMENT_LIST_SEALED' USING ERRCODE='23514'; END IF;
 SELECT * INTO f FROM public.stored_files WHERE tenant_id=NEW.tenant_id AND id=NEW.file_id FOR UPDATE;
 SELECT sp.membership_id INTO owner_membership FROM public.assignment_recipients ar JOIN public.student_profiles sp ON sp.tenant_id=ar.tenant_id AND sp.id=ar.student_id WHERE ar.tenant_id=NEW.tenant_id AND ar.id=v.recipient_id;
 IF f.id IS NULL OR f.storage_status<>'READY' OR f.recipient_id IS DISTINCT FROM v.recipient_id OR f.uploaded_by_membership_id IS DISTINCT FROM owner_membership THEN RAISE EXCEPTION 'FILE_NOT_READY_OR_OWNED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_attachment_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.submission_files FOR EACH ROW EXECUTE FUNCTION educore_r5.attachment_guard();

CREATE FUNCTION educore_r5.submit(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE ctx jsonb; m uuid; sub public.submissions%ROWTYPE; version uuid:=gen_random_uuid(); next_version int; prior jsonb; file_id uuid; ordinal int:=0; output_value jsonb; file_ids jsonb:=COALESCE(body->'fileIds','[]');
BEGIN
 ctx:=educore_r5.recipient(t,(body->>'recipientId')::uuid,'submission.create');m:=(ctx->>'membershipId')::uuid;
 prior:=educore_r5.replay(t,m,body);IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF jsonb_typeof(file_ids)<>'array' OR jsonb_array_length(file_ids)>5 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements(file_ids))<>jsonb_array_length(file_ids) OR (COALESCE(length(btrim(body->>'answerText')),0)=0 AND jsonb_array_length(file_ids)=0) OR length(body->>'answerText')>100000 THEN RAISE EXCEPTION 'INVALID_SUBMISSION_OR_FILE_COUNT' USING ERRCODE='22023'; END IF;
 SELECT * INTO sub FROM public.submissions WHERE tenant_id=t AND recipient_id=(body->>'recipientId')::uuid FOR UPDATE;
 IF sub.id IS NULL THEN
  INSERT INTO public.submissions(id,tenant_id,recipient_id,status,updated_at) VALUES(gen_random_uuid(),t,(body->>'recipientId')::uuid,'SUBMITTED',clock_timestamp()) RETURNING * INTO sub;
 END IF;
 SELECT COALESCE(max(version_no),0)+1 INTO next_version FROM public.submission_versions WHERE tenant_id=t AND submission_id=sub.id;
 INSERT INTO public.submission_versions(id,tenant_id,submission_id,version_no,submitted_at,answer_text,is_late,status,content_hash)
 VALUES(version,t,sub.id,next_version,clock_timestamp(),body->>'answerText',false,'SUBMITTED',educore_r4.digest(jsonb_build_object('answerText',body->>'answerText','fileIds',file_ids)::text));
 FOR file_id IN SELECT value::uuid FROM jsonb_array_elements_text(file_ids) LOOP
  INSERT INTO public.submission_files(id,tenant_id,submission_version_id,file_id,sort_order) VALUES(gen_random_uuid(),t,version,file_id,ordinal);ordinal:=ordinal+1;
 END LOOP;
 UPDATE public.submissions SET current_version_id=version,updated_at=clock_timestamp() WHERE tenant_id=t AND id=sub.id;
 SELECT jsonb_build_object('id',id,'submissionId',submission_id,'versionId',id,'versionNo',version_no,'submittedAt',submitted_at,'isLate',is_late,'status',status,'effectiveDeadlineAt',effective_deadline_at) INTO output_value FROM public.submission_versions WHERE tenant_id=t AND id=version;
 RETURN educore_r5.finish(t,m,body,output_value);
END $$;
CREATE FUNCTION educore_r5.history(t uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE ctx jsonb; items jsonb; sub public.submissions%ROWTYPE;
BEGIN
 ctx:=educore_r5.recipient(t,target,'submission.read');
 SELECT * INTO sub FROM public.submissions WHERE tenant_id=t AND recipient_id=target;
 SELECT COALESCE(jsonb_agg(to_jsonb(v)||jsonb_build_object('fileIds',(SELECT COALESCE(jsonb_agg(file_id ORDER BY sort_order),'[]') FROM public.submission_files WHERE tenant_id=t AND submission_version_id=v.id)) ORDER BY v.version_no),'[]') INTO items FROM public.submission_versions v WHERE v.tenant_id=t AND v.submission_id=sub.id;
 RETURN jsonb_build_object('submissionId',sub.id,'currentVersionId',sub.current_version_id,'status',sub.status,'versions',items);
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r5' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r5 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r5.submit(uuid,jsonb),educore_r5.history(uuid,uuid) TO educore_r4_api;
COMMIT;
