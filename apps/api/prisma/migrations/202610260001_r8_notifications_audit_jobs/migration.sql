BEGIN;

-- R8 read projections are deliberately separate from the legacy, tenant-wide
-- R4 read function. Unknown resource types are visible only with a TENANT grant.
CREATE FUNCTION educore_r4.ops_job_visible(t uuid, m uuid, j public.automation_jobs, permission text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE c uuid; s uuid;
BEGIN
 IF j.id IS NULL OR j.tenant_id<>t THEN RETURN false; END IF;
 IF j.job_kind='SCHEDULE_CHECK' THEN
  SELECT class_id INTO c FROM public.class_sessions WHERE tenant_id=t AND id=(j.payload_json->>'sessionId')::uuid;
  RETURN c IS NOT NULL AND educore_r4.has_permission(t,m,permission,c,NULL);
 ELSIF j.job_kind='BILLING_GENERATE' THEN
  SELECT id INTO s FROM public.student_profiles WHERE tenant_id=t AND id=(j.payload_json->>'studentId')::uuid;
  RETURN s IS NOT NULL AND educore_r4.has_permission(t,m,permission,NULL,s);
 END IF;
 RETURN false;
END $$;

CREATE FUNCTION educore_r4.ops_audit_visible(t uuid, m uuid, a public.audit_logs, permission text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE c uuid; s uuid; j public.automation_jobs%ROWTYPE;
BEGIN
 IF a.id IS NULL OR a.tenant_id<>t THEN RETURN false; END IF;
 IF educore_r4.has_permission(t,m,permission,NULL,NULL) THEN RETURN true; END IF;
 IF a.entity_type='ClassSession' THEN
  SELECT class_id INTO c FROM public.class_sessions WHERE tenant_id=t AND id=a.entity_id;
  RETURN c IS NOT NULL AND educore_r4.has_permission(t,m,permission,c,NULL);
 ELSIF a.entity_type='Class' THEN
  SELECT id INTO c FROM public.classes WHERE tenant_id=t AND id=a.entity_id;
  RETURN c IS NOT NULL AND educore_r4.has_permission(t,m,permission,c,NULL);
 ELSIF a.entity_type='Assignment' THEN
  SELECT class_id INTO c FROM public.assignments WHERE tenant_id=t AND id=a.entity_id;
  RETURN c IS NOT NULL AND educore_r4.has_permission(t,m,permission,c,NULL);
 ELSIF a.entity_type='Invoice' THEN
  SELECT student_id INTO s FROM public.invoices WHERE tenant_id=t AND id=a.entity_id;
  RETURN s IS NOT NULL AND educore_r4.has_permission(t,m,permission,NULL,s);
 ELSIF a.entity_type IN ('Student','StudentProfile') THEN
  SELECT id INTO s FROM public.student_profiles WHERE tenant_id=t AND id=a.entity_id;
  RETURN s IS NOT NULL AND educore_r4.has_permission(t,m,permission,NULL,s);
 ELSIF a.entity_type='AutomationJob' OR (a.entity_type='R4' AND a.event_type IN ('JOB_ENQUEUED','JOB_RETRY')) THEN
  SELECT * INTO j FROM public.automation_jobs WHERE tenant_id=t AND id=a.entity_id;
  RETURN j.id IS NOT NULL AND educore_r4.ops_job_visible(t,m,j,permission);
 END IF;
 RETURN false;
END $$;

CREATE FUNCTION educore_r4.ops_audit(t uuid, q jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; n int:=COALESCE((q->>'page')::int,1); z int:=COALESCE((q->>'pageSize')::int,20);
 total int; rows jsonb; zone text; perm text; correlation uuid;
BEGIN
 m:=educore_r3.principal(t);
 perm:=CASE WHEN q?'correlationId' THEN 'audit.explain' ELSE 'audit.read' END;
 IF NOT EXISTS(SELECT FROM public.membership_roles mr JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=mr.role_id
  JOIN public.permissions p ON p.id=rp.permission_id AND p.code=perm
  WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'AUDIT_DENIED' USING ERRCODE='42501'; END IF;
 IF n<1 OR n>100000 OR z NOT BETWEEN 1 AND 100 OR
  (q?'eventType' AND (length(q->>'eventType')>100 OR q->>'eventType' !~ '^[A-Za-z0-9_]+$')) OR
  (q?'entityType' AND (length(q->>'entityType')>100 OR q->>'entityType' !~ '^[A-Za-z0-9_]+$')) OR
  (q?'entityId' AND q->>'entityId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') OR
  (q?'actor' AND length(q->>'actor')>100) OR
  (q?'actorKind' AND q->>'actorKind' NOT IN ('USER','WORKER','OPERATOR')) OR
  (q?'outcome' AND q->>'outcome' NOT IN ('COMPLETED','FAILED','READY','NEEDS_INFORMATION','PENDING_APPROVAL')) OR
  (q?'from' AND q->>'from' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$') OR
  (q?'to' AND q->>'to' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
 THEN RAISE EXCEPTION 'INVALID_AUDIT_FILTER' USING ERRCODE='22023'; END IF;
 correlation:=(q->>'correlationId')::uuid;
 SELECT timezone INTO zone FROM public.tenants WHERE id=t;
 IF q?'from' AND q?'to' AND (q->>'from')::date>(q->>'to')::date THEN RAISE EXCEPTION 'INVALID_DATE_RANGE' USING ERRCODE='22023'; END IF;
 WITH visible AS (
  SELECT a.* FROM public.audit_logs a WHERE a.tenant_id=t
   AND (correlation IS NULL OR a.correlation_id=correlation)
   AND (NOT q?'eventType' OR a.event_type=q->>'eventType')
   AND (NOT q?'entityType' OR a.entity_type=q->>'entityType')
   AND (NOT q?'entityId' OR a.entity_id=(q->>'entityId')::uuid)
   AND (NOT q?'actorKind' OR a.actor_kind::text=q->>'actorKind')
   AND (NOT q?'actor' OR EXISTS(SELECT FROM public.tenant_memberships tm
    JOIN public.users u ON u.id=tm.user_id WHERE tm.tenant_id=t AND tm.id=a.actor_membership_id
    AND a.actor_kind='USER' AND lower(u.display_name)=lower(q->>'actor')))
   AND (NOT q?'outcome' OR a.event_type=('JOB_'||(q->>'outcome')))
   AND (NOT q?'from' OR (a.created_at AT TIME ZONE zone)::date >= (q->>'from')::date)
   AND (NOT q?'to' OR (a.created_at AT TIME ZONE zone)::date <= (q->>'to')::date)
   AND educore_r4.ops_audit_visible(t,m,a,perm)
 ), paged AS (
  SELECT * FROM visible ORDER BY created_at DESC,id LIMIT z OFFSET (n-1)*z
 )
 SELECT (SELECT count(*)::int FROM visible),
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',a.id,'eventType',CASE WHEN a.event_type ~ '^[A-Z][A-Z0-9_]{0,63}$' THEN a.event_type ELSE NULL END,
   'entityType',CASE WHEN a.entity_type ~ '^[A-Za-z][A-Za-z0-9_]{0,63}$' THEN a.entity_type ELSE NULL END,
   'entityId',a.entity_id,
   'actorKind',a.actor_kind,'actorDisplay',CASE WHEN a.actor_kind='USER' THEN u.display_name ELSE NULL END,
   'createdAt',a.created_at,'outcome',CASE WHEN a.event_type IN ('JOB_COMPLETED','JOB_FAILED','JOB_NEEDS_INFORMATION','JOB_PENDING_APPROVAL','JOB_READY') THEN substring(a.event_type from 5) ELSE NULL END,
   'reasonCode',CASE WHEN a.event_type LIKE 'JOB_%' AND a.after_json->>'errorCode' ~ '^[A-Z0-9_]{1,40}$'
      THEN a.after_json->>'errorCode' ELSE NULL END,
   'policyVersionId',a.policy_version_id,'correlationId',a.correlation_id)
   ORDER BY a.created_at DESC,a.id)
   FROM paged a LEFT JOIN public.tenant_memberships tm ON tm.tenant_id=t AND tm.id=a.actor_membership_id
   LEFT JOIN public.users u ON u.id=tm.user_id AND a.actor_kind='USER'),'[]') INTO total,rows;
 IF correlation IS NOT NULL AND total=0 THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('items',rows,'page',n,'pageSize',z,'total',total,'asOf',clock_timestamp(),'timezone',zone);
END $$;

CREATE FUNCTION educore_r4.ops_jobs(t uuid, q jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; n int:=COALESCE((q->>'page')::int,1); z int:=COALESCE((q->>'pageSize')::int,20);
 target uuid:=(q->>'id')::uuid; total int; rows jsonb; zone text;
BEGIN
 m:=educore_r3.principal(t);
 IF NOT EXISTS(SELECT FROM public.membership_roles mr JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=mr.role_id
  JOIN public.permissions p ON p.id=rp.permission_id AND p.code='job.read'
  WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL)
 THEN RAISE EXCEPTION 'JOB_READ_DENIED' USING ERRCODE='42501'; END IF;
 IF n<1 OR n>100000 OR z NOT BETWEEN 1 AND 100 OR (q?'status' AND q->>'status' NOT IN ('READY','RUNNING','FAILED','NEEDS_INFORMATION','PENDING_APPROVAL','COMPLETED'))
 THEN RAISE EXCEPTION 'INVALID_JOB_FILTER' USING ERRCODE='22023'; END IF;
 SELECT timezone INTO zone FROM public.tenants WHERE id=t;
 WITH visible AS (
  SELECT j.* FROM public.automation_jobs j WHERE j.tenant_id=t AND (target IS NULL OR j.id=target)
   AND (NOT q?'status' OR j.status::text=q->>'status') AND educore_r4.ops_job_visible(t,m,j,'job.read')
 ), paged AS (SELECT * FROM visible ORDER BY created_at DESC,id LIMIT z OFFSET (n-1)*z)
 SELECT (SELECT count(*)::int FROM visible), COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',j.id,'jobKind',j.job_kind,'status',j.status,'attemptCount',j.attempt_count,
  'nextAttemptAt',j.next_attempt_at,'lastErrorCode',CASE WHEN j.last_error_code ~ '^[A-Z0-9_]{1,40}$' THEN j.last_error_code ELSE NULL END,'policyVersionId',j.policy_version_id,
  'correlationId',j.correlation_id,'sourceType',CASE j.job_kind WHEN 'SCHEDULE_CHECK' THEN 'ClassSession' ELSE 'Student' END,
  'sourceId',CASE j.job_kind WHEN 'SCHEDULE_CHECK' THEN j.payload_json->>'sessionId' ELSE j.payload_json->>'studentId' END,
  'retryEligible',j.job_kind='SCHEDULE_CHECK' AND j.status='FAILED' AND j.attempt_count<4
    AND j.lease_owner IS NULL AND j.lease_until IS NULL AND educore_r4.has_permission(t,m,'job.retry',
      (SELECT class_id FROM public.class_sessions WHERE tenant_id=t AND id=(j.payload_json->>'sessionId')::uuid),NULL)
    AND educore_r4.job_permission(t,m,j.job_kind,j.payload_json)
    AND educore_r4.job_permission(t,j.actor_membership_id,j.job_kind,j.payload_json)
    AND EXISTS(SELECT FROM public.auth_sessions a WHERE a.id=j.actor_session_id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp())
    AND NOT EXISTS(SELECT FROM public.idempotency_records r WHERE r.tenant_id=t AND r.operation_type='R4:JOB' AND r.idempotency_key=j.operation_key),
  'attempts',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'attemptNo',a.attempt_no,'startedAt',a.started_at,
    'finishedAt',a.finished_at,'outcome',CASE WHEN a.outcome ~ '^[A-Z_]{1,40}$' THEN a.outcome ELSE NULL END,
    'errorCode',CASE WHEN a.error_code ~ '^[A-Z0-9_]{1,40}$' THEN a.error_code ELSE NULL END) ORDER BY a.attempt_no,a.id)
    FROM public.job_attempts a WHERE a.tenant_id=t AND a.job_id=j.id),'[]')) ORDER BY j.created_at DESC,j.id)
  FROM paged j),'[]') INTO total,rows;
 IF target IS NOT NULL THEN
  IF total=0 THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
  RETURN rows->0;
 END IF;
 RETURN jsonb_build_object('items',rows,'page',n,'pageSize',z,'total',total,'asOf',clock_timestamp(),'timezone',zone);
END $$;

-- The former four-argument entry point cannot prove explicit confirmation or
-- remediation. Remove API admission; retain the internal R4 helper unchanged.
CREATE OR REPLACE FUNCTION educore_r4.retry_job_request(t uuid,id uuid,reason text,key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
BEGIN
 RAISE EXCEPTION 'JOB_RECOVERY_DENIED' USING ERRCODE='42501';
END $$;
CREATE FUNCTION educore_r4.ops_retry(t uuid, target uuid, reason text, key text, confirmed boolean) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; j public.automation_jobs%ROWTYPE; receipt public.idempotency_records%ROWTYPE; hash text; value jsonb;
BEGIN
 m:=educore_r3.principal(t);
 IF confirmed IS DISTINCT FROM true OR COALESCE(length(btrim(reason)),0) NOT BETWEEN 1 AND 2000
  OR COALESCE(length(btrim(key)),0) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'INVALID_RETRY' USING ERRCODE='22023'; END IF;
 SELECT * INTO j FROM public.automation_jobs WHERE tenant_id=t AND id=target FOR UPDATE;
 IF j.id IS NULL OR NOT educore_r4.ops_job_visible(t,m,j,'job.retry')
  OR NOT educore_r4.job_permission(t,m,j.job_kind,j.payload_json)
  OR NOT educore_r4.job_permission(t,j.actor_membership_id,j.job_kind,j.payload_json)
  OR NOT EXISTS(SELECT FROM public.auth_sessions a WHERE a.id=j.actor_session_id AND a.revoked_at IS NULL AND a.expires_at>clock_timestamp())
 THEN RAISE EXCEPTION 'JOB_RECOVERY_DENIED' USING ERRCODE='42501'; END IF;
 hash:=educore_r4.digest(jsonb_build_object('jobId',target,'reason',reason,'confirmed',true)::text);
 SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t AND operation_type='R8:RETRY_JOB' AND idempotency_key=key;
 IF receipt.id IS NOT NULL THEN
  IF receipt.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN receipt.result_snapshot;
 END IF;
 IF j.job_kind<>'SCHEDULE_CHECK' OR j.status<>'FAILED' OR j.attempt_count>=4
  OR j.lease_owner IS NOT NULL OR j.lease_until IS NOT NULL
  OR EXISTS(SELECT FROM public.idempotency_records WHERE tenant_id=t AND operation_type='R4:JOB' AND idempotency_key=j.operation_key)
 THEN RAISE EXCEPTION 'JOB_RECOVERY_DENIED' USING ERRCODE='42501'; END IF;
 UPDATE public.automation_jobs SET status='READY',next_attempt_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id;
 PERFORM educore_r4.audit(t,m,'JOB_RETRY',j.id,reason,'{}',j.policy_version_id,j.correlation_id);
 value:=jsonb_build_object('id',j.id,'status','READY');
 INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
 VALUES(gen_random_uuid(),t,'R8:RETRY_JOB',key,hash,'COMPLETED',value,clock_timestamp());
 RETURN value;
END $$;

CREATE FUNCTION educore_r4.ops_inbox(t uuid, unread_only boolean, page_no int, size int) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; total int; rows jsonb; zone text;
BEGIN
 -- The existing function performs the current principal and empty-inbox grant check.
 PERFORM educore_r4.inbox(t,'UNREAD_COUNT');
 m:=educore_r3.principal(t);
 IF page_no<1 OR page_no>100000 OR size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 SELECT timezone INTO zone FROM public.tenants WHERE id=t;
 SELECT count(*)::int INTO total FROM public.notifications n WHERE n.tenant_id=t AND n.recipient_membership_id=m
  AND (NOT unread_only OR n.read_at IS NULL) AND educore_r4.can_event(t,m,n.outbox_event_id,'notification.read');
 SELECT COALESCE(jsonb_agg(row),'[]') INTO rows FROM (
  SELECT n.id,n.kind,n.title,n.body,n.read_at AS "readAt",n.created_at AS "createdAt"
  FROM public.notifications n WHERE n.tenant_id=t AND n.recipient_membership_id=m
   AND (NOT unread_only OR n.read_at IS NULL) AND educore_r4.can_event(t,m,n.outbox_event_id,'notification.read')
  ORDER BY n.created_at DESC,n.id LIMIT size OFFSET (page_no-1)*size) row;
 RETURN jsonb_build_object('items',rows,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp(),'timezone',zone);
END $$;

-- GL01 is available to any current member granted notification.read, including
-- a Student or Parent with an empty inbox. The endpoint still checks each event.
DO $nav$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
 IF position('(''OP01'',''member.read'')' IN ddl)=0
  OR position('WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)' IN ddl)=0
 THEN RAISE EXCEPTION 'NAVIGATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
 ddl:=replace(ddl,'(''OP01'',''member.read'')',
  '(''GL01'',''notification.read''),(''OP01'',''member.read'')');
 ddl:=replace(ddl,'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)',
  'WHERE (educore_r4.has_permission(t,m,v.permission,NULL,NULL)
    OR (v.screen=''GL01'' AND EXISTS(
     SELECT FROM public.membership_roles mr JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=mr.role_id
     JOIN public.permissions p ON p.id=rp.permission_id AND p.code=''notification.read''
     WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL))');
 EXECUTE ddl;
END $nav$;

-- Close the direct SQL path through the legacy reader as well as the HTTP path.
-- Unrelated R4 read contracts remain byte-for-byte equivalent.
CREATE OR REPLACE FUNCTION educore_r4.read(t uuid,kind text,query jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; result jsonb; page_no int:=COALESCE((query->>'page')::int,1); size int:=COALESCE((query->>'pageSize')::int,20);
 items jsonb; total int; target uuid:=(query->>'id')::uuid; s uuid:=(query->>'studentId')::uuid; c uuid;
BEGIN
 IF page_no<1 OR page_no>100000 OR size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 IF kind='AUDIT' THEN RETURN educore_r4.ops_audit(t,query); END IF;
 IF kind='JOBS' THEN RETURN educore_r4.ops_jobs(t,query); END IF;
 IF kind='ATTENDANCE' THEN
  SELECT sp.student_id,cs.class_id INTO s,c FROM public.session_participants sp JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=sp.session_id WHERE sp.tenant_id=t AND sp.id=target;
  IF s IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  PERFORM educore_r3.authorize(t,c,s,'attendance.read');
  SELECT jsonb_build_object('participantId',target,'studentId',s,'status',ar.attendance_status,'revision',ar.revision,'recordedAt',ar.recorded_at) INTO result
  FROM public.session_participants sp LEFT JOIN public.attendance_records ar ON ar.tenant_id=t AND ar.participant_id=sp.id WHERE sp.tenant_id=t AND sp.id=target;
  RETURN result;
 END IF;
 m:=educore_r4.authorize(t,CASE kind WHEN 'ROLES' THEN 'role.read' WHEN 'MEMBERS' THEN 'member.read' WHEN 'APPROVALS' THEN 'approval.read' ELSE '__DENY__' END);
 IF kind='ROLES' THEN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name) ORDER BY code),'[]') INTO items FROM public.roles WHERE tenant_id=t;
  RETURN jsonb_build_object('items',items,'page',1,'pageSize',100,'total',jsonb_array_length(items),'asOf',clock_timestamp());
 ELSIF kind='MEMBERS' THEN
  SELECT count(*)::int INTO total FROM public.tenant_memberships WHERE tenant_id=t;
  SELECT COALESCE(jsonb_agg(row),'[]') INTO items FROM (SELECT id,user_id AS "userId",status FROM public.tenant_memberships WHERE tenant_id=t ORDER BY id LIMIT size OFFSET (page_no-1)*size) row;
 ELSIF kind='APPROVALS' THEN
  SELECT count(*)::int INTO total FROM public.approval_requests WHERE tenant_id=t AND (target IS NULL OR id=target);
  SELECT COALESCE(jsonb_agg(row),'[]') INTO items FROM (SELECT ap.id,ap.operation_type AS "operationType",ap.target_type AS "targetType",ap.target_id AS "targetId",ap.status,ap.reason,ap.policy_version_id AS "policyVersionId",ap.correlation_id AS "correlationId",
   jsonb_build_object('studentId',ap.payload_snapshot_json->'studentId','invoiceId',ap.payload_snapshot_json->'invoiceId','amountDeltaVnd',ap.payload_snapshot_json->'deltaVnd','paymentId',ap.payload_snapshot_json->'paymentId','topUpId',ap.payload_snapshot_json->'topUpId') payload,
   COALESCE((SELECT jsonb_agg(jsonb_build_object('decision',d.decision,'reason',d.reason,'selfApproved',d.self_approved,'decidedAt',d.decided_at) ORDER BY d.decided_at) FROM public.approval_decisions d WHERE d.tenant_id=t AND d.approval_request_id=ap.id),'[]') decisions
   FROM public.approval_requests ap WHERE ap.tenant_id=t AND (target IS NULL OR ap.id=target) ORDER BY ap.created_at DESC,ap.id LIMIT size OFFSET (page_no-1)*size) row;
 END IF;
 IF target IS NOT NULL THEN
  IF total=0 THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
  RETURN items->0;
 END IF;
 RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;

DO $owner$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='educore_r4' AND p.proname IN ('ops_job_visible','ops_audit_visible','ops_audit','ops_jobs','ops_retry','ops_inbox')
 LOOP EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r4_owner',f.signature); EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature); END LOOP;
END $owner$;
GRANT EXECUTE ON FUNCTION educore_r4.ops_audit(uuid,jsonb),educore_r4.ops_jobs(uuid,jsonb),educore_r4.ops_retry(uuid,uuid,text,text,boolean),educore_r4.ops_inbox(uuid,boolean,integer,integer) TO educore_r4_api;
COMMIT;
