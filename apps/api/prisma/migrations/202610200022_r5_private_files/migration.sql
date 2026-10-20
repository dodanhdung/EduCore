BEGIN;
ALTER TABLE public.stored_files ADD CONSTRAINT r5_file_security CHECK(size_bytes BETWEEN 1 AND 10000000 AND sha256 ~ '^[0-9a-f]{64}$' AND
 private_storage_key ~ ('^'||tenant_id::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') AND
 length(original_filename) BETWEEN 1 AND 120 AND original_filename ~ '^[A-Za-z0-9_.-]+$' AND original_filename !~ '^\.' AND
 ((mime_type='application/pdf' AND lower(original_filename) ~ '\.pdf$') OR (mime_type='image/png' AND lower(original_filename) ~ '\.png$') OR
 (mime_type='image/jpeg' AND lower(original_filename) ~ '\.jpe?g$') OR (mime_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND lower(original_filename) ~ '\.docx$')));
CREATE UNIQUE INDEX r5_physical_file_key ON public.stored_files(private_storage_key);
CREATE FUNCTION educore_r5.file_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END);
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'FILE_RETENTION_DECISION_REQUIRED' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ((to_jsonb(NEW)-ARRAY['storage_status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['storage_status','updated_at']) OR OLD.storage_status<>'STAGING' OR NEW.storage_status NOT IN ('READY','ORPHANED')) THEN RAISE EXCEPTION 'FILE_METADATA_IMMUTABLE' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r5_file_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.stored_files FOR EACH ROW EXECUTE FUNCTION educore_r5.file_guard();
CREATE FUNCTION educore_r5.file_stage(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE ctx jsonb; m uuid; f public.stored_files%ROWTYPE;
BEGIN
 ctx:=educore_r5.recipient(t,(body->>'recipientId')::uuid,'file.upload');m:=(ctx->>'membershipId')::uuid;
 PERFORM educore_r5.is_late(clock_timestamp(),(ctx->>'deadlineAt')::timestamptz);
 INSERT INTO public.stored_files(id,tenant_id,uploaded_by_membership_id,recipient_id,private_storage_key,original_filename,mime_type,size_bytes,sha256,storage_status,updated_at)
 VALUES((body->>'id')::uuid,t,m,(body->>'recipientId')::uuid,body->>'privateStorageKey',body->>'originalFilename',body->>'mimeType',(body->>'sizeBytes')::bigint,body->>'sha256','STAGING',clock_timestamp()) RETURNING * INTO f;
 RETURN to_jsonb(f);
END $$;
CREATE FUNCTION educore_r5.file_ready(t uuid,target uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE f public.stored_files%ROWTYPE;ctx jsonb;
BEGIN
 PERFORM educore_r3.principal(t);
 SELECT * INTO f FROM public.stored_files WHERE tenant_id=t AND id=target FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ctx:=educore_r5.recipient(t,f.recipient_id,'file.upload');
 IF f.uploaded_by_membership_id<>(ctx->>'membershipId')::uuid OR f.storage_status NOT IN ('STAGING','READY') THEN RAISE EXCEPTION 'FILE_STATE_OR_OWNER_DENIED' USING ERRCODE='42501'; END IF;
 IF f.storage_status='STAGING' THEN
  UPDATE public.stored_files SET storage_status='READY',updated_at=clock_timestamp() WHERE id=f.id RETURNING * INTO f;
  PERFORM educore_r4.audit(t,(ctx->>'membershipId')::uuid,'R5:FILE_READY',f.id,NULL,jsonb_build_object('fileId',f.id));
 END IF;
 RETURN to_jsonb(f);
END $$;
CREATE FUNCTION educore_r5.file_info(t uuid,target uuid,p text,for_submit uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE f public.stored_files%ROWTYPE;ctx jsonb;linked boolean;
BEGIN
 PERFORM educore_r3.principal(t);
 IF p NOT IN ('file.read','file.download','file.upload') THEN RAISE EXCEPTION 'INVALID_FILE_OPERATION' USING ERRCODE='22023'; END IF;
 SELECT * INTO f FROM public.stored_files WHERE tenant_id=t AND id=target FOR UPDATE;
 IF f.id IS NULL THEN RAISE EXCEPTION 'FILE_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 ctx:=educore_r5.recipient(t,f.recipient_id,p);
 SELECT EXISTS(SELECT FROM public.submission_files sf JOIN public.submission_versions v ON v.tenant_id=t AND v.id=sf.submission_version_id JOIN public.submissions sub ON sub.tenant_id=t AND sub.id=v.submission_id WHERE sf.tenant_id=t AND sf.file_id=f.id AND sub.recipient_id=f.recipient_id) INTO linked;
 IF for_submit IS NOT NULL AND (f.recipient_id<>for_submit OR f.uploaded_by_membership_id<>(ctx->>'membershipId')::uuid OR f.storage_status<>'READY') THEN RAISE EXCEPTION 'FILE_NOT_READY_OR_OWNED' USING ERRCODE='23514'; END IF;
 IF p='file.download' AND (NOT linked OR f.storage_status<>'READY') THEN RAISE EXCEPTION 'FILE_NOT_ATTACHED_OR_READY' USING ERRCODE='42501'; END IF;
 IF NOT linked AND f.uploaded_by_membership_id<>(ctx->>'membershipId')::uuid THEN RAISE EXCEPTION 'FILE_UNLINKED_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN to_jsonb(f);
END $$;
CREATE FUNCTION educore_r5.file_inventory(t uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
BEGIN
 PERFORM educore_r4.authorize(t,'audit.read');
 RETURN (SELECT COALESCE(jsonb_agg(to_jsonb(f)),'[]') FROM public.stored_files f WHERE tenant_id=t);
END $$;
CREATE FUNCTION educore_r5.file_reconciliation_audit(t uuid,summary jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r5,pg_temp AS $$
DECLARE m uuid:=educore_r4.authorize(t,'audit.read');
BEGIN
 PERFORM educore_r4.audit(t,m,'R5:FILE_RECONCILIATION',t,'Non-destructive scan',jsonb_build_object('anomalyCount',(summary->>'anomalyCount')::int,'unreferencedObjects',(summary->>'unreferencedObjects')::int));
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r5' LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r5 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r5.file_stage(uuid,jsonb),educore_r5.file_ready(uuid,uuid),educore_r5.file_info(uuid,uuid,text,uuid),educore_r5.file_inventory(uuid),educore_r5.file_reconciliation_audit(uuid,jsonb) TO educore_r4_api;
COMMIT;
