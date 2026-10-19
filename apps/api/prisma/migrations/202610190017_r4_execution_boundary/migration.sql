BEGIN;
ALTER TABLE educore_r4.transaction_principals ADD COLUMN correlation_id uuid;
DO $reset_trace$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.bind(text)'::regprocedure);
 ddl:=replace(ddl,'token_hash=EXCLUDED.token_hash;', 'token_hash=EXCLUDED.token_hash,correlation_id=NULL;');EXECUTE ddl;
END $reset_trace$;
CREATE FUNCTION educore_r4.set_correlation(id uuid) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 IF educore_r4.session_id() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000'; END IF;
 UPDATE educore_r4.transaction_principals SET correlation_id=id WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
END $$;
CREATE FUNCTION educore_r4.correlation() RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT correlation_id FROM educore_r4.transaction_principals WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
 $$;
DO $fresh$ DECLARE f regprocedure; ddl text; BEGIN
 FOREACH f IN ARRAY ARRAY['educore_r4.select_tenant(uuid,text)'::regprocedure,'educore_r4.logout()'::regprocedure,'educore_r4.change_password(text,text)'::regprocedure] LOOP
  ddl:=pg_get_functiondef(f);
  ddl:=replace(ddl,'PERFORM 1 FROM public.users WHERE id=a.user_id FOR UPDATE;',
   'PERFORM 1 FROM public.users WHERE id=a.user_id FOR UPDATE; IF educore_r4.session_id() IS DISTINCT FROM a.id THEN RAISE EXCEPTION ''AUTH_REQUIRED'' USING ERRCODE=''28000''; END IF;');
  EXECUTE ddl;
 END LOOP;
END $fresh$;
-- Recheck the lease at the final deferred receipt constraint as well as at the
-- start/end of the effect subtransaction. Delayed constraints cannot commit
-- business effects after expiry. A failed COMMIT leaves the job reclaimable.
CREATE FUNCTION educore_r4.job_effect_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 IF NEW.operation_type='R4:JOB' AND NOT EXISTS(SELECT FROM educore_r4.worker_context c JOIN public.automation_jobs j ON j.id=c.job_id
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.fence=j.fencing_token AND c.lease_deadline>clock_timestamp()
 AND j.tenant_id=NEW.tenant_id AND j.operation_key=NEW.idempotency_key AND j.status IN ('COMPLETED','NEEDS_INFORMATION'))
 THEN RAISE EXCEPTION 'STALE_JOB_COMMIT' USING ERRCODE='40001'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER r4_job_commit_fence AFTER INSERT ON public.idempotency_records DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r4.job_effect_guard();
-- Bind audit correlation to the verified private transaction context. It is
-- metadata only and never grants authority. Worker context keeps its job trace.
DO $trace$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.audit_guard()'::regprocedure);
 ddl:=replace(ddl,'NEW.before_json:=', 'IF j.id IS NULL THEN NEW.correlation_id:=COALESCE(educore_r4.correlation(),NEW.correlation_id); END IF; NEW.before_json:='); EXECUTE ddl;
 ddl:=pg_get_functiondef('educore_r3.scheduling(uuid,jsonb)'::regprocedure);
 ddl:=replace(ddl,'correlation uuid:=gen_random_uuid()', 'correlation uuid:=COALESCE(educore_r4.correlation(),gen_random_uuid())'); EXECUTE ddl;
END $trace$;
-- Verify the approved snapshot on authenticated HTTP decisions/execution.
-- Legacy operator-bound R2 sessions retain their existing adoption contract.
DO $pinned_approval$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r2.execute(uuid,jsonb)'::regprocedure);
 ddl:=replace(ddl,'IF op IN (''APPROVE'',''EXECUTE_APPROVAL'') THEN',
  'IF op IN (''APPROVE'',''EXECUTE_APPROVAL'') THEN IF educore_r4.session_id() IS NOT NULL THEN PERFORM educore_r4.policy(t,ap.policy_version_id); END IF;');
 EXECUTE ddl;
END $pinned_approval$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r4'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r4 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.set_correlation(uuid) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.correlation() TO educore_r3_owner;
GRANT EXECUTE ON FUNCTION educore_r4.policy(uuid,uuid) TO educore_r2_owner;
COMMIT;
