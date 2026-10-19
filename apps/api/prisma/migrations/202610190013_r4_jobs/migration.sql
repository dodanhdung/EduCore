BEGIN;
DO $preflight$ BEGIN IF EXISTS(SELECT FROM public.automation_jobs) THEN RAISE EXCEPTION 'R4_JOB_ADOPTION_REQUIRES_REVIEW'; END IF; END $preflight$;
ALTER TABLE public.automation_jobs ADD COLUMN fencing_token bigint NOT NULL DEFAULT 0,
 ADD COLUMN request_hash text NOT NULL, ADD COLUMN actor_session_id uuid REFERENCES public.auth_sessions(id) ON DELETE RESTRICT,
 ADD COLUMN lease_started_at timestamptz(6);
ALTER TABLE public.automation_jobs ADD CONSTRAINT r4_attempt_limit CHECK(attempt_count BETWEEN 0 AND 4);
ALTER TABLE public.automation_jobs ADD CONSTRAINT r4_lease_shape CHECK
 ((status='RUNNING' AND lease_owner IS NOT NULL AND lease_until IS NOT NULL AND lease_started_at IS NOT NULL) OR
 (status<>'RUNNING' AND lease_owner IS NULL AND lease_until IS NULL AND lease_started_at IS NULL));
ALTER TABLE public.automation_jobs ADD CONSTRAINT r4_job_allowlist CHECK(job_kind IN ('SCHEDULE_CHECK','BILLING_GENERATE'));
GRANT SELECT,INSERT,UPDATE ON public.automation_jobs,public.outbox_events,public.notifications TO educore_r4_owner;
GRANT INSERT ON public.job_attempts,public.idempotency_records TO educore_r4_owner;
CREATE TABLE educore_r4.worker_context(backend_pid integer PRIMARY KEY,transaction_id bigint NOT NULL,job_id uuid NOT NULL,fence bigint NOT NULL,lease_deadline timestamptz NOT NULL);
ALTER TABLE educore_r4.worker_context OWNER TO educore_r4_owner;
CREATE FUNCTION educore_r4.worker_session() RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT j.actor_session_id FROM educore_r4.worker_context c JOIN public.automation_jobs j ON j.id=c.job_id
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.fence=j.fencing_token
 AND j.lease_owner=session_user AND j.status='RUNNING' AND j.lease_until>clock_timestamp()
 $$;
CREATE OR REPLACE FUNCTION educore_r4.gateway_sessions() RETURNS SETOF public.r2_principal_bindings LANGUAGE sql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT session_user::text,COALESCE(educore_r4.worker_session(),educore_r4.session_id()) WHERE COALESCE(educore_r4.worker_session(),educore_r4.session_id()) IS NOT NULL
 UNION ALL SELECT b.* FROM public.r2_principal_bindings b WHERE b.database_role=session_user
 AND NOT pg_has_role(session_user,'educore_r4_api','MEMBER') AND NOT pg_has_role(session_user,'educore_r4_worker','MEMBER')
 $$;
CREATE FUNCTION educore_r4.worker_policy(t uuid) RETURNS uuid LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT educore_r4.policy(t,j.policy_version_id) FROM educore_r4.worker_context c JOIN public.automation_jobs j ON j.id=c.job_id AND j.tenant_id=t
 WHERE c.backend_pid=pg_backend_pid() AND c.transaction_id=txid_current() AND c.fence=j.fencing_token AND j.lease_owner=session_user AND j.lease_until>clock_timestamp() AND j.status='RUNNING'
 $$;
GRANT EXECUTE ON FUNCTION educore_r4.worker_policy(uuid) TO educore_r2_owner;
GRANT EXECUTE ON FUNCTION educore_r2.execute(uuid,jsonb) TO educore_r4_owner;
-- Pin the existing generation coordinator during worker execution. HTTP
-- generation still chooses its current policy; no client-supplied policy ID.
DO $pin$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r2.generate(uuid,uuid,jsonb,text)'::regprocedure);
 ddl:=replace(ddl,'IF pol IS NULL THEN','pol:=COALESCE(educore_r4.worker_policy(t),pol); IF pol IS NULL THEN'); EXECUTE ddl;
END $pin$;

CREATE FUNCTION educore_r4.job_permission(t uuid,m uuid,kind text,payload jsonb) RETURNS boolean LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 SELECT CASE kind WHEN 'BILLING_GENERATE' THEN educore_r4.has_permission(t,m,'billing.generate_draft',NULL,(payload->>'studentId')::uuid)
 WHEN 'SCHEDULE_CHECK' THEN EXISTS(SELECT FROM public.class_sessions cs WHERE cs.tenant_id=t AND cs.id=(payload->>'sessionId')::uuid AND educore_r4.has_permission(t,m,'schedule.preview',cs.class_id,NULL)) ELSE false END
 $$;
CREATE FUNCTION educore_r4.enqueue(t uuid,kind text,payload jsonb,key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; j public.automation_jobs%ROWTYPE; hash text; pol uuid;
BEGIN
 m:=educore_r3.principal(t);
 IF NOT educore_r4.job_permission(t,m,kind,payload) THEN RAISE EXCEPTION 'JOB_OPERATION_DENIED' USING ERRCODE='42501'; END IF;
 IF COALESCE(length(btrim(key)),0) NOT BETWEEN 1 AND 200 OR jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_JOB' USING ERRCODE='22023'; END IF;
 hash:=educore_r4.digest(jsonb_build_object('kind',kind,'payload',payload)::text);
 SELECT * INTO j FROM public.automation_jobs WHERE tenant_id=t AND operation_key=key;
 IF j.id IS NOT NULL THEN
  IF j.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('id',j.id,'status',j.status);
 END IF;
 pol:=educore_r4.policy(t);
 INSERT INTO public.automation_jobs(id,tenant_id,job_kind,operation_key,idempotency_key,policy_version_id,actor_membership_id,actor_session_id,correlation_id,status,attempt_count,next_attempt_at,payload_json,request_hash,updated_at)
 VALUES(gen_random_uuid(),t,kind,key,key,pol,m,educore_r4.session_id(),gen_random_uuid(),'READY',0,clock_timestamp(),payload,hash,clock_timestamp()) RETURNING * INTO j;
 PERFORM educore_r4.audit(t,m,'JOB_ENQUEUED',j.id,'Authorized P0 job',jsonb_build_object('jobKind',kind),pol,j.correlation_id);
 RETURN jsonb_build_object('id',j.id,'status',j.status);
END $$;
CREATE FUNCTION educore_r4.job_alert(j public.automation_jobs) RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
 INSERT INTO public.outbox_events(id,tenant_id,event_key,event_type,aggregate_type,aggregate_id,payload_json,occurred_at,status,attempt_count,available_at,correlation_id,updated_at)
 VALUES(gen_random_uuid(),j.tenant_id,'JOB:'||j.id||':'||j.fencing_token||':'||j.status,'ADMIN_ALERT','AutomationJob',j.id,jsonb_build_object('jobId',j.id,'status',j.status),clock_timestamp(),'NEW',0,clock_timestamp(),j.correlation_id,clock_timestamp()) ON CONFLICT DO NOTHING
 $$;
CREATE FUNCTION educore_r4.claim_job() RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE candidate record; j public.automation_jobs%ROWTYPE; u uuid;
BEGIN
 FOR candidate IN SELECT id,tenant_id,actor_membership_id FROM public.automation_jobs WHERE (status='READY' AND next_attempt_at<=clock_timestamp()) OR (status='RUNNING' AND lease_until<=clock_timestamp()) ORDER BY next_attempt_at,id LIMIT 32 LOOP
  SELECT user_id INTO u FROM public.tenant_memberships WHERE tenant_id=candidate.tenant_id AND id=candidate.actor_membership_id;
  PERFORM 1 FROM public.users WHERE id=u FOR SHARE;
  PERFORM 1 FROM public.tenants WHERE id=candidate.tenant_id FOR NO KEY UPDATE SKIP LOCKED;
  IF NOT FOUND THEN CONTINUE; END IF;
  SELECT * INTO j FROM public.automation_jobs WHERE id=candidate.id AND ((status='READY' AND next_attempt_at<=clock_timestamp()) OR (status='RUNNING' AND lease_until<=clock_timestamp())) FOR UPDATE SKIP LOCKED;
  IF j.id IS NULL THEN CONTINUE; END IF;
  IF j.status='RUNNING' THEN
   INSERT INTO public.job_attempts(id,tenant_id,job_id,attempt_no,started_at,finished_at,outcome,error_code)
   VALUES(gen_random_uuid(),j.tenant_id,j.id,j.attempt_count,j.lease_started_at,clock_timestamp(),'LEASE_EXPIRED','LEASE_EXPIRED');
  END IF;
  IF j.attempt_count>=4 THEN
   UPDATE public.automation_jobs SET status='FAILED',last_error_code='ATTEMPTS_EXHAUSTED',lease_owner=NULL,lease_until=NULL,lease_started_at=NULL,updated_at=clock_timestamp() WHERE id=j.id RETURNING * INTO j;
   PERFORM educore_r4.job_alert(j); CONTINUE;
  END IF;
  UPDATE public.automation_jobs SET status='RUNNING',attempt_count=attempt_count+1,fencing_token=fencing_token+1,lease_owner=session_user,lease_until=clock_timestamp()+interval '30 seconds',lease_started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('id',j.id,'tenantId',j.tenant_id,'fence',j.fencing_token::text,'leaseUntil',j.lease_until);
 END LOOP;
 RETURN NULL;
END $$;
CREATE FUNCTION educore_r4.perform_job(id uuid,fence bigint) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
#variable_conflict use_variable
DECLARE j public.automation_jobs%ROWTYPE; u uuid; value jsonb; code text; outcome text:='COMPLETED'; cs public.class_sessions%ROWTYPE; conflicts int; started timestamptz;
BEGIN
 SELECT * INTO j FROM public.automation_jobs WHERE automation_jobs.id=perform_job.id;
 IF j.id IS NULL THEN RAISE EXCEPTION 'STALE_JOB_LEASE' USING ERRCODE='40001'; END IF;
 SELECT user_id INTO u FROM public.tenant_memberships WHERE tenant_id=j.tenant_id AND tenant_memberships.id=j.actor_membership_id;
 PERFORM 1 FROM public.users WHERE users.id=u FOR SHARE;
 PERFORM educore_private.r1b_lock_tenant(j.tenant_id);
 SELECT * INTO j FROM public.automation_jobs WHERE automation_jobs.id=perform_job.id FOR UPDATE;
 IF j.status<>'RUNNING' OR j.lease_owner<>session_user OR j.fencing_token<>fence OR j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'STALE_JOB_LEASE' USING ERRCODE='40001'; END IF;
 started:=j.lease_started_at;
 INSERT INTO educore_r4.worker_context VALUES(pg_backend_pid(),txid_current(),j.id,fence,j.lease_until)
 ON CONFLICT(backend_pid) DO UPDATE SET transaction_id=EXCLUDED.transaction_id,job_id=EXCLUDED.job_id,fence=EXCLUDED.fence,lease_deadline=EXCLUDED.lease_deadline;
 BEGIN
  IF NOT educore_r4.job_permission(j.tenant_id,j.actor_membership_id,j.job_kind,j.payload_json)
   OR NOT EXISTS(SELECT FROM public.auth_sessions WHERE auth_sessions.id=j.actor_session_id AND revoked_at IS NULL AND expires_at>clock_timestamp())
   THEN RAISE EXCEPTION 'JOB_PERMISSION_REVOKED' USING ERRCODE='42501'; END IF;
  PERFORM educore_r4.policy(j.tenant_id,j.policy_version_id);
  IF j.job_kind='BILLING_GENERATE' THEN
   value:=educore_r2.execute(j.tenant_id,j.payload_json||jsonb_build_object('operation','GENERATE','key','JOB:'||j.id,'reason','Authorized draft generation'));
   IF value->>'status'='NEEDS_INFORMATION' THEN outcome:='NEEDS_INFORMATION'; END IF;
  ELSIF j.job_kind='SCHEDULE_CHECK' THEN
   SELECT * INTO cs FROM public.class_sessions WHERE tenant_id=j.tenant_id AND class_sessions.id=(j.payload_json->>'sessionId')::uuid;
   IF cs.id IS NULL THEN RAISE EXCEPTION 'MISSING_SESSION' USING ERRCODE='P0002'; END IF;
   SELECT count(*)::int INTO conflicts FROM public.resource_bookings b JOIN public.schedulable_resources r ON r.tenant_id=j.tenant_id AND r.id=b.resource_id
   WHERE b.tenant_id=j.tenant_id AND b.status='ACTIVE' AND b.session_id<>cs.id AND b.starts_at<cs.ends_at AND b.ends_at>cs.starts_at
   AND (r.teacher_id=cs.teacher_id OR r.room_id=cs.room_id OR r.student_id IN(SELECT student_id FROM public.session_participants WHERE tenant_id=j.tenant_id AND session_id=cs.id AND removed_at IS NULL));
   SELECT conflicts+count(*)::int INTO conflicts FROM public.resource_unavailability busy JOIN public.schedulable_resources r ON r.tenant_id=j.tenant_id AND r.id=busy.resource_id
   WHERE busy.tenant_id=j.tenant_id AND busy.status='CONFIRMED' AND busy.starts_at<cs.ends_at AND busy.ends_at>cs.starts_at
   AND (r.teacher_id=cs.teacher_id OR r.room_id=cs.room_id OR r.student_id IN(SELECT student_id FROM public.session_participants WHERE tenant_id=j.tenant_id AND session_id=cs.id AND removed_at IS NULL));
   value:=jsonb_build_object('sessionId',cs.id,'conflicts',conflicts,'advisory',true,'policyVersionId',j.policy_version_id);
  END IF;
  IF j.lease_until<=clock_timestamp() THEN RAISE EXCEPTION 'LEASE_EXPIRED_DURING_EFFECT' USING ERRCODE='40001'; END IF;
  INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
  VALUES(gen_random_uuid(),j.tenant_id,'R4:JOB',j.operation_key,j.request_hash,'COMPLETED',value,clock_timestamp());
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS code=RETURNED_SQLSTATE;
  value:=NULL;
  outcome:=CASE WHEN code IN ('40001','40P01','55P03','57014') AND j.attempt_count<4 THEN 'READY' WHEN code='P0002' THEN 'NEEDS_INFORMATION' ELSE 'FAILED' END;
 END;
 UPDATE public.automation_jobs SET status=outcome::public."AutomationJobStatus",result_json=value,last_error_code=code,
 next_attempt_at=CASE WHEN outcome='READY' THEN clock_timestamp()+CASE j.attempt_count WHEN 1 THEN interval '1 minute' WHEN 2 THEN interval '5 minutes' ELSE interval '15 minutes' END ELSE next_attempt_at END,
 lease_owner=NULL,lease_until=NULL,lease_started_at=NULL,updated_at=clock_timestamp() WHERE automation_jobs.id=j.id RETURNING * INTO j;
 INSERT INTO public.job_attempts(id,tenant_id,job_id,attempt_no,started_at,finished_at,outcome,error_code)
 VALUES(gen_random_uuid(),j.tenant_id,j.id,j.attempt_count,started,clock_timestamp(),outcome,code);
 INSERT INTO public.audit_logs(id,tenant_id,actor_kind,event_type,entity_type,entity_id,action,reason,after_json,policy_version_id,correlation_id)
 VALUES(gen_random_uuid(),j.tenant_id,'WORKER','JOB_'||outcome,'AutomationJob',j.id,'JOB_'||outcome,'P0 worker execution',jsonb_build_object('attempt',j.attempt_count,'errorCode',code),j.policy_version_id,j.correlation_id);
 IF outcome IN ('FAILED','NEEDS_INFORMATION','PENDING_APPROVAL') THEN PERFORM educore_r4.job_alert(j); END IF;
 RETURN jsonb_build_object('id',j.id,'status',j.status,'result',value);
END $$;
CREATE FUNCTION educore_r4.retry_job(t uuid,id uuid,reason text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; j public.automation_jobs%ROWTYPE;
BEGIN
 m:=educore_r4.authorize(t,'job.retry');
 IF COALESCE(length(btrim(reason)),0)=0 THEN RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM public.automation_jobs WHERE tenant_id=t AND automation_jobs.id=retry_job.id FOR UPDATE;
 IF j.id IS NULL OR j.status NOT IN ('FAILED','NEEDS_INFORMATION') OR j.attempt_count>=4 OR EXISTS(SELECT FROM public.idempotency_records WHERE tenant_id=t AND operation_type='R4:JOB' AND idempotency_key=j.operation_key) OR NOT educore_r4.job_permission(t,j.actor_membership_id,j.job_kind,j.payload_json)
 THEN RAISE EXCEPTION 'JOB_RECOVERY_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.automation_jobs SET status='READY',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE automation_jobs.id=j.id;
 PERFORM educore_r4.audit(t,m,'JOB_RETRY',j.id,reason,'{}',j.policy_version_id,j.correlation_id);
 RETURN jsonb_build_object('id',j.id,'status','READY');
END $$;
CREATE TRIGGER r4_job_attempt_history BEFORE UPDATE OR DELETE ON public.job_attempts FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE FUNCTION educore_r4.retry_job_request(t uuid,id uuid,reason text,key text) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; j public.automation_jobs%ROWTYPE; receipt public.idempotency_records%ROWTYPE; hash text; value jsonb;
BEGIN
 m:=educore_r4.authorize(t,'job.retry');
 IF COALESCE(length(btrim(key)),0) NOT BETWEEN 1 AND 200 OR COALESCE(length(btrim(reason)),0)=0 THEN RAISE EXCEPTION 'INVALID_RETRY' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM public.automation_jobs WHERE tenant_id=t AND automation_jobs.id=retry_job_request.id;
 IF j.id IS NULL OR NOT educore_r4.job_permission(t,j.actor_membership_id,j.job_kind,j.payload_json) THEN RAISE EXCEPTION 'JOB_RECOVERY_DENIED' USING ERRCODE='42501'; END IF;
 hash:=educore_r4.digest(jsonb_build_object('jobId',id,'reason',reason)::text);
 SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t AND operation_type='R4:RETRY_JOB' AND idempotency_key=key;
 IF receipt.id IS NOT NULL THEN
  IF receipt.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN receipt.result_snapshot;
 END IF;
 value:=educore_r4.retry_job(t,id,reason);
 INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
 VALUES(gen_random_uuid(),t,'R4:RETRY_JOB',key,hash,'COMPLETED',value,clock_timestamp());
 RETURN value;
END $$;
DO $owners$ DECLARE f record; BEGIN FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r4'
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); END LOOP; END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r4 FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.enqueue(uuid,text,jsonb,text),educore_r4.retry_job_request(uuid,uuid,text,text) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.claim_job(),educore_r4.perform_job(uuid,bigint) TO educore_r4_worker;
COMMIT;
