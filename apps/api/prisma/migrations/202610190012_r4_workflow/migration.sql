BEGIN;
-- Extend the existing R2 decision owner; never a competing financial executor.
CREATE FUNCTION educore_r2.r4_decide(t uuid,body jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE ap public.approval_requests%ROWTYPE; m uuid; s uuid; decision text:=body->>'decision'; replay public.idempotency_records%ROWTYPE; hash text; result jsonb;
BEGIN
 IF decision NOT IN ('APPROVE','REJECT','REQUEST_INFO') OR COALESCE(length(btrim(body->>'reason')),0)=0 OR COALESCE(length(body->>'key'),0) NOT BETWEEN 1 AND 200
 THEN RAISE EXCEPTION 'INVALID_DECISION' USING ERRCODE='22023'; END IF;
 SELECT * INTO ap FROM public.approval_requests WHERE tenant_id=t AND id=(body->>'approvalId')::uuid;
 IF ap.id IS NULL OR ap.operation_type NOT IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_PAYMENT_REQUEST','REVERSE_TOP_UP_REQUEST') THEN RAISE EXCEPTION 'UNSUPPORTED_APPROVAL_TARGET' USING ERRCODE='42501'; END IF;
 s:=(ap.payload_snapshot_json->>'studentId')::uuid;
 m:=educore_r2.authorize(t,s,'approval.decide');
 PERFORM educore_r2.authorize(t,s,CASE WHEN ap.operation_type='ADJUST_REQUEST' THEN 'invoice.adjust_request' WHEN ap.operation_type='CANCEL_REQUEST' THEN 'invoice.cancel_request' ELSE 'payment.reverse' END);
 IF decision='APPROVE' THEN RETURN educore_r2.execute(t,(body-'decision')||jsonb_build_object('operation','APPROVE')); END IF;
 hash:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
 SELECT * INTO replay FROM public.idempotency_records WHERE tenant_id=t AND operation_type='R4:DECIDE' AND idempotency_key=body->>'key';
 IF replay.id IS NOT NULL THEN
  IF replay.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN replay.result_snapshot;
 END IF;
 SELECT * INTO ap FROM public.approval_requests WHERE tenant_id=t AND id=ap.id FOR UPDATE;
 IF ap.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'APPROVAL_NOT_PENDING' USING ERRCODE='23514'; END IF;
 INSERT INTO public.approval_decisions(id,tenant_id,approval_request_id,decided_by_membership_id,decision,reason,decided_at)
 VALUES(gen_random_uuid(),t,ap.id,m,decision::public."ApprovalDecisionKind",body->>'reason',clock_timestamp());
 UPDATE public.approval_requests SET status=CASE WHEN decision='REJECT' THEN 'REJECTED'::public."ApprovalStatus" ELSE 'NEEDS_INFORMATION'::public."ApprovalStatus" END,decided_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=ap.id;
 result:=jsonb_build_object('id',ap.id,'status',CASE WHEN decision='REJECT' THEN 'REJECTED' ELSE 'NEEDS_INFORMATION' END);
 PERFORM educore_r2.audit(t,m,'APPROVAL_'||decision,ap.id,body||result,ap.policy_version_id);
 INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_snapshot,updated_at)
 VALUES(gen_random_uuid(),t,'R4:DECIDE',body->>'key',hash,'COMPLETED',result,clock_timestamp());
 RETURN result;
END $$;
ALTER FUNCTION educore_r2.r4_decide(uuid,jsonb) OWNER TO educore_r2_owner;
REVOKE ALL ON FUNCTION educore_r2.r4_decide(uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r2.r4_decide(uuid,jsonb) TO educore_r4_api;
-- Enforce operation-specific decision authority even if a caller invokes the
-- older R2 command directly. Existing execution authority remains unchanged.
DO $approve$ DECLARE ddl text; BEGIN
 ddl:=pg_get_functiondef('educore_r2.execute(uuid,jsonb)'::regprocedure);
 ddl:=replace(ddl,'IF op=''EXECUTE_APPROVAL'' THEN', 'IF op IN (''APPROVE'',''EXECUTE_APPROVAL'') THEN');
 EXECUTE ddl;
END $approve$;

CREATE FUNCTION educore_r4.read(t uuid,kind text,query jsonb) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; result jsonb; page_no int:=COALESCE((query->>'page')::int,1); size int:=COALESCE((query->>'pageSize')::int,20); items jsonb; total int; target uuid:=(query->>'id')::uuid; s uuid:=(query->>'studentId')::uuid; c uuid;
BEGIN
 IF page_no<1 OR page_no>100000 OR size NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 IF kind='ATTENDANCE' THEN
  SELECT sp.student_id,cs.class_id INTO s,c FROM public.session_participants sp JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=sp.session_id WHERE sp.tenant_id=t AND sp.id=target;
  IF s IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  PERFORM educore_r3.authorize(t,c,s,'attendance.read');
  SELECT jsonb_build_object('participantId',target,'studentId',s,'status',ar.attendance_status,'revision',ar.revision,'recordedAt',ar.recorded_at) INTO result
  FROM public.session_participants sp LEFT JOIN public.attendance_records ar ON ar.tenant_id=t AND ar.participant_id=sp.id WHERE sp.tenant_id=t AND sp.id=target;
  RETURN result;
 END IF;
 m:=educore_r4.authorize(t,CASE kind WHEN 'ROLES' THEN 'role.read' WHEN 'MEMBERS' THEN 'member.read' WHEN 'APPROVALS' THEN 'approval.read' WHEN 'AUDIT' THEN CASE WHEN query?'correlationId' THEN 'audit.explain' ELSE 'audit.read' END WHEN 'JOBS' THEN 'job.read' ELSE '__DENY__' END);
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
 ELSIF kind='AUDIT' THEN
  SELECT count(*)::int INTO total FROM public.audit_logs WHERE tenant_id=t AND (NOT(query?'correlationId') OR correlation_id=(query->>'correlationId')::uuid);
  SELECT COALESCE(jsonb_agg(row),'[]') INTO items FROM (SELECT id,event_type AS "eventType",entity_type AS "entityType",entity_id AS "entityId",actor_kind AS "actorKind",reason,policy_version_id AS "policyVersionId",correlation_id AS "correlationId",created_at AS "createdAt"
   FROM public.audit_logs WHERE tenant_id=t AND (NOT(query?'correlationId') OR correlation_id=(query->>'correlationId')::uuid) ORDER BY created_at DESC,id LIMIT size OFFSET (page_no-1)*size) row;
 ELSIF kind='JOBS' THEN
  SELECT count(*)::int INTO total FROM public.automation_jobs WHERE tenant_id=t AND (target IS NULL OR id=target);
  SELECT COALESCE(jsonb_agg(row),'[]') INTO items FROM (SELECT id,job_kind AS "jobKind",status,attempt_count AS "attemptCount",next_attempt_at AS "nextAttemptAt",last_error_code AS "lastErrorCode",policy_version_id AS "policyVersionId",correlation_id AS "correlationId" FROM public.automation_jobs WHERE tenant_id=t AND (target IS NULL OR id=target) ORDER BY created_at DESC,id LIMIT size OFFSET (page_no-1)*size) row;
 END IF;
 IF target IS NOT NULL THEN
  IF total=0 THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='P0002'; END IF;
  RETURN items->0;
 END IF;
 RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;
ALTER FUNCTION educore_r4.read(uuid,text,jsonb) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.read(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.read(uuid,text,jsonb) TO educore_r4_api;
COMMIT;
