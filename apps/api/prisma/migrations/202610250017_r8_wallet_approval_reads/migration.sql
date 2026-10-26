BEGIN;

-- A receipt identifies one physical intake, regardless of the method selected by staff.
CREATE UNIQUE INDEX r8_top_up_receipt_once
  ON public.wallet_transactions (tenant_id, receipt_reference)
  WHERE kind = 'TOP_UP';

CREATE FUNCTION educore_r4.finance_allowed(t uuid,m uuid,s uuid,p text) RETURNS boolean
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
  SELECT educore_r4.has_permission(t,m,p,NULL,s) OR EXISTS (
    SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.student_id=s
      AND educore_r4.has_permission(t,m,p,e.class_id,s));
$$;

CREATE FUNCTION educore_r4.finance_students(t uuid, page_no int DEFAULT 1, size int DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; items jsonb; total int;
BEGIN
  IF page_no NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  m:=educore_r3.principal(t);
  IF NOT educore_r4.has_permission(t,m,'payment.read') AND NOT EXISTS (
    SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t
      AND educore_r4.finance_allowed(t,m,sp.id,'payment.read')) THEN
    RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT count(*)::int INTO total FROM public.student_profiles sp WHERE sp.tenant_id=t
    AND educore_r4.finance_allowed(t,m,sp.id,'payment.read');
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.full_name,'code',sp.student_code)
    ORDER BY sp.full_name,sp.id),'[]'::jsonb) INTO items
  FROM (SELECT * FROM public.student_profiles sp WHERE sp.tenant_id=t
    AND educore_r4.finance_allowed(t,m,sp.id,'payment.read')
    ORDER BY sp.full_name,sp.id LIMIT size OFFSET (page_no-1)*size) sp;
  RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;

CREATE FUNCTION educore_r4.finance_wallet(t uuid,s uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; w public.wallet_accounts%ROWTYPE;
BEGIN
  m:=educore_r3.principal(t);
  IF NOT educore_r4.finance_allowed(t,m,s,'payment.read') OR NOT EXISTS
    (SELECT FROM public.student_profiles WHERE tenant_id=t AND id=s) THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO w FROM public.wallet_accounts WHERE tenant_id=t AND student_id=s;
  RETURN jsonb_build_object('studentId',s,'studentName',(SELECT full_name FROM public.student_profiles WHERE tenant_id=t AND id=s),
    'balanceVnd',COALESCE(w.balance_vnd,0)::text,
    'verifiedCashVnd',(SELECT COALESCE(sum(amount_vnd),0)::text FROM public.wallet_transactions
      WHERE tenant_id=t AND wallet_id=w.id AND kind IN ('TOP_UP','TOP_UP_REVERSAL')),
    'walletDebitsVnd',(SELECT COALESCE(-sum(amount_vnd),0)::text FROM public.wallet_transactions
      WHERE tenant_id=t AND wallet_id=w.id AND kind='INVOICE_PAYMENT'),
    'internalCreditsVnd',(SELECT COALESCE(sum(amount_vnd),0)::text FROM public.wallet_transactions
      WHERE tenant_id=t AND wallet_id=w.id AND kind='INVOICE_REFUND'),
    'reversedTopUpsVnd',(SELECT COALESCE(-sum(amount_vnd),0)::text FROM public.wallet_transactions
      WHERE tenant_id=t AND wallet_id=w.id AND kind='TOP_UP_REVERSAL'),
    'canTopUp',educore_r4.finance_allowed(t,m,s,'payment.record'),
    'canReverse',educore_r4.finance_allowed(t,m,s,'payment.reverse'),
    'canAdjust',educore_r4.finance_allowed(t,m,s,'invoice.adjust_request'),
    'canCancel',educore_r4.finance_allowed(t,m,s,'invoice.cancel_request'),
    'transactions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,
      'amountVnd',x.amount_vnd::text,'createdAt',x.created_at,'receiptReference',x.receipt_reference,
      'fundingMethod',x.funding_method,'evidence',x.evidence,'paymentId',x.payment_id,
      'reversedTopUpId',x.reversed_top_up_id) ORDER BY x.created_at DESC,x.id DESC)
      FROM (SELECT * FROM public.wallet_transactions WHERE tenant_id=t AND wallet_id=w.id
        ORDER BY created_at DESC,id DESC LIMIT 100) x),'[]'::jsonb),
    'invoices',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,
      'status',i.status,'originalTotalVnd',i.total_vnd::text,'netObligationVnd',educore_r2.net(i.id,t)::bigint::text,
      'netAllocatedVnd',educore_r2.paid(i.id,t)::bigint::text,
      'outstandingVnd',greatest(educore_r2.net(i.id,t)-educore_r2.paid(i.id,t),0)::bigint::text,
      'legacyMixed',EXISTS(SELECT FROM public.payments p WHERE p.tenant_id=t AND p.invoice_id=i.id AND p.method<>'WALLET')
        OR EXISTS(SELECT FROM public.payment_excess_resolutions er WHERE er.tenant_id=t AND er.invoice_id=i.id),
      'payments',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'method',p.method,
        'amountVnd',p.amount_vnd::text,'paidAt',p.paid_at,
        'allocations',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,
          'amountVnd',a.amount_vnd::text) ORDER BY a.allocated_at,a.id)
          FROM public.receivable_allocations a WHERE a.tenant_id=t AND a.payment_id=p.id),'[]'::jsonb))
        ORDER BY p.paid_at,p.id) FROM public.payments p WHERE p.tenant_id=t AND p.invoice_id=i.id),'[]'::jsonb))
      ORDER BY i.created_at DESC,i.id) FROM public.invoices i
      WHERE i.tenant_id=t AND i.student_id=s AND i.status<>'DRAFT'),'[]'::jsonb),
    'asOf',clock_timestamp());
END $$;

CREATE FUNCTION educore_r4.finance_outcome(t uuid,s uuid,op text,operation_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; receipt public.idempotency_records%ROWTYPE; student uuid;
BEGIN
  IF op NOT IN ('TOP_UP','PAY','ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_TOP_UP_REQUEST','EXECUTE_APPROVAL')
    OR length(operation_key) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'INVALID_OPERATION' USING ERRCODE='22023'; END IF;
  m:=educore_r3.principal(t);
  IF NOT EXISTS(SELECT FROM public.student_profiles WHERE tenant_id=t AND id=s)
    OR NOT educore_r4.finance_allowed(t,m,s,'payment.read') THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t
    AND operation_type=op AND idempotency_key=operation_key;
  IF receipt.id IS NULL THEN RETURN jsonb_build_object('status','PENDING_RECONCILIATION'); END IF;
  IF op='TOP_UP' THEN
    SELECT wa.student_id INTO student FROM public.wallet_transactions wt
      JOIN public.wallet_accounts wa ON wa.tenant_id=t AND wa.id=wt.wallet_id
      WHERE wt.tenant_id=t AND wt.id=receipt.result_ref_id;
  ELSIF op='PAY' THEN
    SELECT i.student_id INTO student FROM public.payments p JOIN public.invoices i
      ON i.tenant_id=t AND i.id=p.invoice_id WHERE p.tenant_id=t AND p.id=receipt.result_ref_id;
  ELSE
    SELECT (ap.payload_snapshot_json->>'studentId')::uuid INTO student
      FROM public.approval_requests ap WHERE ap.tenant_id=t AND ap.id=receipt.result_ref_id;
  END IF;
  -- An authorized student must not learn whether another student's key exists.
  IF student IS DISTINCT FROM s THEN RETURN jsonb_build_object('status','PENDING_RECONCILIATION'); END IF;
  RETURN jsonb_build_object('status','COMMITTED','operation',op,
    'receipt',jsonb_build_object('id',receipt.result_snapshot->>'id',
      'status',receipt.result_snapshot->>'status'));
END $$;

-- Read-only reconciliation of a single decision and its exact original payload.
-- APPROVE uses R2's APPROVE receipt; REJECT/REQUEST_INFO use R4:DECIDE.
CREATE FUNCTION educore_r4.finance_decision_outcome(t uuid,approval uuid,operation_key text,
  expected_decision text,expected_reason text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; ap public.approval_requests%ROWTYPE; receipt public.idempotency_records%ROWTYPE;
  command jsonb; receipt_kind text; expected_hash text; expected_status text;
BEGIN
  IF expected_decision NOT IN ('APPROVE','REJECT','REQUEST_INFO')
    OR length(operation_key) NOT BETWEEN 1 AND 200
    OR COALESCE(length(btrim(expected_reason)),0)=0 THEN
    RAISE EXCEPTION 'INVALID_DECISION_LOOKUP' USING ERRCODE='22023'; END IF;
  m:=educore_r3.principal(t);
  SELECT * INTO ap FROM public.approval_requests WHERE tenant_id=t AND id=approval
    AND operation_type IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_TOP_UP_REQUEST');
  IF ap.id IS NULL OR NOT educore_r4.finance_allowed(t,m,(ap.payload_snapshot_json->>'studentId')::uuid,'approval.read') THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  receipt_kind:=CASE WHEN expected_decision='APPROVE' THEN 'APPROVE' ELSE 'R4:DECIDE' END;
  command:=jsonb_build_object('key',operation_key,'reason',expected_reason,
    'approvalId',approval);
  IF expected_decision='APPROVE' THEN command:=command||jsonb_build_object('operation','APPROVE');
  ELSE command:=command||jsonb_build_object('decision',expected_decision); END IF;
  expected_hash:=encode(sha256(convert_to(command::text,'UTF8')),'hex');
  SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t
    AND operation_type=receipt_kind AND idempotency_key=operation_key;
  IF receipt.id IS NULL THEN RETURN jsonb_build_object('status','PENDING_RECONCILIATION'); END IF;
  IF receipt.result_snapshot->>'id' IS DISTINCT FROM approval::text THEN
    RETURN jsonb_build_object('status','PENDING_RECONCILIATION'); END IF;
  IF receipt.request_hash<>expected_hash THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  expected_status:=CASE expected_decision WHEN 'APPROVE' THEN 'APPROVED'
    WHEN 'REJECT' THEN 'REJECTED' ELSE 'NEEDS_INFORMATION' END;
  IF receipt.result_snapshot->>'status' IS DISTINCT FROM expected_status THEN
    RAISE EXCEPTION 'DECISION_RECEIPT_MISMATCH' USING ERRCODE='23514'; END IF;
  RETURN jsonb_build_object('status','COMMITTED','approvalId',approval,
    'decision',expected_decision,'decisionStatus',expected_status);
END $$;

CREATE FUNCTION educore_r4.finance_approvals(t uuid, target uuid DEFAULT NULL,
  page_no int DEFAULT 1, size int DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; items jsonb; total int;
BEGIN
  IF page_no NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  m := educore_r3.principal(t);
  IF NOT educore_r4.has_permission(t,m,'approval.read') AND NOT EXISTS (
    SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t
      AND educore_r4.finance_allowed(t,m,sp.id,'approval.read')) THEN
    RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  WITH visible AS (
    SELECT ap.* FROM public.approval_requests ap
    WHERE ap.tenant_id=t AND (target IS NULL OR ap.id=target)
      AND ap.operation_type IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_TOP_UP_REQUEST')
      AND (educore_r4.has_permission(t,m,'approval.read',NULL,(ap.payload_snapshot_json->>'studentId')::uuid)
        OR EXISTS (SELECT FROM public.enrollments e WHERE e.tenant_id=t
          AND e.student_id=(ap.payload_snapshot_json->>'studentId')::uuid
          AND educore_r4.has_permission(t,m,'approval.read',e.class_id,e.student_id)))
  ) SELECT count(*)::int INTO total FROM visible;
  IF target IS NOT NULL AND total=0 THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  WITH visible AS (
    SELECT ap.* FROM public.approval_requests ap
    WHERE ap.tenant_id=t AND (target IS NULL OR ap.id=target)
      AND ap.operation_type IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_TOP_UP_REQUEST')
      AND (educore_r4.has_permission(t,m,'approval.read',NULL,(ap.payload_snapshot_json->>'studentId')::uuid)
        OR EXISTS (SELECT FROM public.enrollments e WHERE e.tenant_id=t
          AND e.student_id=(ap.payload_snapshot_json->>'studentId')::uuid
          AND educore_r4.has_permission(t,m,'approval.read',e.class_id,e.student_id)))
    ORDER BY ap.created_at DESC, ap.id LIMIT size OFFSET (page_no-1)*size
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id',ap.id,'operationType',ap.operation_type,'targetType',ap.target_type,'targetId',ap.target_id,
      'studentId',ap.payload_snapshot_json->>'studentId','status',ap.status,'reason',ap.reason,
      'requesterMembershipId',ap.requester_membership_id,'createdAt',ap.created_at,'decidedAt',ap.decided_at,
      'canDecide',educore_r4.finance_allowed(t,m,(ap.payload_snapshot_json->>'studentId')::uuid,'approval.decide'),
      'canExecute',educore_r4.finance_allowed(t,m,(ap.payload_snapshot_json->>'studentId')::uuid,'approval.execute')
        AND educore_r4.finance_allowed(t,m,(ap.payload_snapshot_json->>'studentId')::uuid,
          CASE WHEN ap.operation_type='REVERSE_TOP_UP_REQUEST' THEN 'payment.reverse'
            WHEN ap.operation_type='CANCEL_REQUEST' THEN 'invoice.cancel_request'
            ELSE 'invoice.adjust_request' END),
      'policyVersionId',ap.policy_version_id,'correlationId',ap.correlation_id,
      'deltaVnd',ap.payload_snapshot_json->>'deltaVnd',
      'decisions',COALESCE((SELECT jsonb_agg(jsonb_build_object('decision',d.decision,
        'reason',d.reason,'selfApproved',d.self_approved,'decidedAt',d.decided_at)
        ORDER BY d.decided_at,d.id) FROM public.approval_decisions d
        WHERE d.tenant_id=t AND d.approval_request_id=ap.id),'[]'::jsonb),
      'executionReceipt',(SELECT ir.result_snapshot FROM public.idempotency_records ir
        WHERE ir.tenant_id=t AND ir.operation_type='ROOT_EFFECT'
          AND ir.idempotency_key='APPROVAL:'||ap.id)
    ) ORDER BY ap.created_at DESC,ap.id),'[]'::jsonb) INTO items FROM visible ap;
  IF target IS NOT NULL THEN RETURN items->0; END IF;
  RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,
    'total',total,'asOf',clock_timestamp());
END $$;

ALTER FUNCTION educore_r4.finance_approvals(uuid,uuid,int,int) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_allowed(uuid,uuid,uuid,text) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_students(uuid,int,int) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_wallet(uuid,uuid) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_outcome(uuid,uuid,text,text) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_decision_outcome(uuid,uuid,text,text,text) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.finance_approvals(uuid,uuid,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_allowed(uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_students(uuid,int,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_wallet(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_outcome(uuid,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_decision_outcome(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.finance_approvals(uuid,uuid,int,int) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.finance_students(uuid,int,int),educore_r4.finance_wallet(uuid,uuid) TO educore_r4_api;
GRANT EXECUTE ON FUNCTION educore_r4.finance_outcome(uuid,uuid,text,text),
  educore_r4.finance_decision_outcome(uuid,uuid,text,text,text) TO educore_r4_api;
COMMIT;
