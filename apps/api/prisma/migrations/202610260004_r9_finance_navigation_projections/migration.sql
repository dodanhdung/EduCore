BEGIN;

-- Add only the owner-approved finance screens to the final R8 navigation body.
-- Existing identity/session checks and the 60-second TTL remain untouched.
DO $nav$ DECLARE ddl text; BEGIN
  ddl:=pg_get_functiondef('educore_r4.navigation_access(uuid)'::regprocedure);
  IF position('  RETURN jsonb_build_object(' IN ddl)=0
    OR position('screenIds'',screens' IN ddl)=0
    OR position('(''BL07'',''invoice.read'')' IN ddl)=0 THEN
    RAISE EXCEPTION 'NAVIGATION_BASELINE_MISMATCH' USING ERRCODE='23514'; END IF;
  ddl:=replace(ddl,'  RETURN jsonb_build_object(', $insert$
  -- A class grant cannot satisfy a NULL-class permission check. Student
  -- candidates come from the caller's own scoped assignments, then use the
  -- existing tenant/student invoice index. The tenant branch uses the
  -- existing tenant/status invoice index.
  SELECT COALESCE(jsonb_agg(DISTINCT screen ORDER BY screen),'[]'::jsonb) INTO screens FROM (
    SELECT jsonb_array_elements_text(screens) screen
    UNION ALL SELECT 'BL09' WHERE educore_r4.has_permission(t,m,'payment.read',NULL,NULL)
      OR EXISTS (SELECT FROM public.membership_roles mr
        JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
          AND sc.scope_kind='STUDENT'
        JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=sc.student_id
        WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL
          AND educore_r4.has_permission(t,m,'payment.read',NULL,sp.id))
    UNION ALL SELECT 'BL10' WHERE (
      (educore_r4.has_permission(t,m,'billing.read',NULL,NULL)
        AND educore_r4.has_permission(t,m,'invoice.read',NULL,NULL)
        AND (educore_r4.has_permission(t,m,'invoice.adjust_request',NULL,NULL)
          OR educore_r4.has_permission(t,m,'invoice.cancel_request',NULL,NULL))
        AND EXISTS (SELECT FROM public.invoices i WHERE i.tenant_id=t AND i.status='ISSUED'))
      OR EXISTS (SELECT FROM public.membership_roles mr
        JOIN public.access_scopes sc ON sc.tenant_id=t AND sc.membership_role_id=mr.id
          AND sc.scope_kind='STUDENT'
        JOIN public.invoices i ON i.tenant_id=t AND i.student_id=sc.student_id AND i.status='ISSUED'
        WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL
          AND educore_r4.has_permission(t,m,'billing.read',NULL,i.student_id)
          AND educore_r4.has_permission(t,m,'invoice.read',NULL,i.student_id)
          AND (educore_r4.has_permission(t,m,'invoice.adjust_request',NULL,i.student_id)
            OR educore_r4.has_permission(t,m,'invoice.cancel_request',NULL,i.student_id))))
  ) finance_navigation;
  RETURN jsonb_build_object($insert$);
  EXECUTE ddl;
END $nav$;

-- The selector and wallet reader are staff finance APIs. Restrict newly
-- activated BL09 paths to the approved TENANT/STUDENT scopes.
CREATE OR REPLACE FUNCTION educore_r4.finance_students(t uuid, page_no int DEFAULT 1, size int DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; items jsonb; total int;
BEGIN
  IF page_no NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  m:=educore_r3.principal(t);
  IF NOT educore_r4.has_permission(t,m,'payment.read',NULL,NULL) AND NOT EXISTS (
    SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t
      AND educore_r4.has_permission(t,m,'payment.read',NULL,sp.id)) THEN
    RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT count(*)::int INTO total FROM public.student_profiles sp WHERE sp.tenant_id=t
    AND educore_r4.has_permission(t,m,'payment.read',NULL,sp.id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.full_name,'code',sp.student_code)
    ORDER BY sp.full_name,sp.id),'[]'::jsonb) INTO items
  FROM (SELECT * FROM public.student_profiles sp WHERE sp.tenant_id=t
    AND educore_r4.has_permission(t,m,'payment.read',NULL,sp.id)
    ORDER BY sp.full_name,sp.id LIMIT size OFFSET (page_no-1)*size) sp;
  RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;

-- Payment readers receive only wallet fields. Invoices and allocations have
-- moved to finance_receivables, which independently checks receivable.read.
CREATE OR REPLACE FUNCTION educore_r4.finance_wallet(t uuid,s uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; w public.wallet_accounts%ROWTYPE;
BEGIN
  m:=educore_r3.principal(t);
  IF NOT educore_r4.has_permission(t,m,'payment.read',NULL,s) OR NOT EXISTS
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
    'canTopUp',educore_r4.has_permission(t,m,'payment.record',NULL,s),
    'canReverse',educore_r4.has_permission(t,m,'payment.reverse',NULL,s),
    'transactions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,
      'amountVnd',x.amount_vnd::text,'createdAt',x.created_at,'receiptReference',x.receipt_reference,
      'fundingMethod',x.funding_method,'evidence',x.evidence,'paymentId',x.payment_id,
      'reversedTopUpId',x.reversed_top_up_id) ORDER BY x.created_at DESC,x.id DESC)
      FROM (SELECT * FROM public.wallet_transactions WHERE tenant_id=t AND wallet_id=w.id
        ORDER BY created_at DESC,id DESC LIMIT 100) x),'[]'::jsonb),
    'asOf',clock_timestamp());
END $$;

CREATE FUNCTION educore_r4.finance_receivables(t uuid,s uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid;
BEGIN
  m:=educore_r3.principal(t);
  IF NOT educore_r4.has_permission(t,m,'receivable.read',NULL,s) OR NOT EXISTS
    (SELECT FROM public.student_profiles WHERE tenant_id=t AND id=s) THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('studentId',s,
    'invoices',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,
      'status',i.status,'originalTotalVnd',i.total_vnd::text,'netObligationVnd',educore_r2.net(i.id,t)::bigint::text,
      'netAllocatedVnd',educore_r2.paid(i.id,t)::bigint::text,
      'outstandingVnd',greatest(educore_r2.net(i.id,t)-educore_r2.paid(i.id,t),0)::bigint::text,
      'canOpenDetail',educore_r4.has_permission(t,m,'billing.read',NULL,s)
        AND educore_r4.has_permission(t,m,'invoice.read',NULL,s),
      'legacyMixed',EXISTS(SELECT FROM public.payments p WHERE p.tenant_id=t AND p.invoice_id=i.id AND p.method<>'WALLET')
        OR EXISTS(SELECT FROM public.payment_excess_resolutions er WHERE er.tenant_id=t AND er.invoice_id=i.id))
      ORDER BY i.created_at DESC,i.id) FROM public.invoices i
      WHERE i.tenant_id=t AND i.student_id=s AND i.status<>'DRAFT'),'[]'::jsonb),
    'asOf',clock_timestamp());
END $$;

-- Preview uses the same student for both reads and both independent request
-- permissions. It never returns wallet or unrelated invoice data.
CREATE FUNCTION educore_r4.finance_request_preview(t uuid, invoice_id uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; i public.invoices%ROWTYPE; n numeric; p numeric; available boolean;
BEGIN
  m:=educore_r3.principal(t);
  SELECT * INTO i FROM public.invoices WHERE tenant_id=t AND id=invoice_id AND status<>'DRAFT';
  IF i.id IS NULL OR NOT educore_r4.has_permission(t,m,'billing.read',NULL,i.student_id)
    OR NOT educore_r4.has_permission(t,m,'invoice.read',NULL,i.student_id) THEN
    RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
  available:=EXISTS(SELECT FROM public.billing_runs br WHERE br.tenant_id=t
      AND br.id=i.billing_run_id AND br.current_generation_id IS NOT NULL)
    AND NOT EXISTS(SELECT FROM public.payments pay WHERE pay.tenant_id=t AND pay.invoice_id=i.id AND pay.method<>'WALLET')
    AND NOT EXISTS(SELECT FROM public.payment_excess_resolutions er WHERE er.tenant_id=t AND er.invoice_id=i.id);
  n:=educore_r2.net(i.id,t); p:=educore_r2.paid(i.id,t);
  RETURN jsonb_build_object('invoiceId',i.id,'studentId',i.student_id,'status',i.status,
    'originalTotalVnd',i.total_vnd::text,'netObligationVnd',n::bigint::text,
    'netAllocatedVnd',p::bigint::text,'outstandingVnd',greatest(n-p,0)::bigint::text,
    'canRequestAdjustment',i.status='ISSUED' AND available
      AND educore_r4.has_permission(t,m,'invoice.adjust_request',NULL,i.student_id),
    'canRequestCancellation',i.status='ISSUED' AND available
      AND educore_r4.has_permission(t,m,'invoice.cancel_request',NULL,i.student_id),
    'policyAvailability',CASE WHEN available THEN 'AVAILABLE' ELSE 'BLOCKED_LEGACY_MIXED' END,
    'asOf',clock_timestamp());
END $$;

ALTER FUNCTION educore_r4.finance_receivables(uuid,uuid) OWNER TO educore_r4_owner;
ALTER FUNCTION educore_r4.finance_request_preview(uuid,uuid) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.finance_receivables(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION educore_r4.finance_request_preview(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.finance_receivables(uuid,uuid),
  educore_r4.finance_request_preview(uuid,uuid) TO educore_r4_api;
COMMIT;
