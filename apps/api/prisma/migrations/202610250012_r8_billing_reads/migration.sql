BEGIN;
-- Narrow, server-scoped read model. The API role gets no public-table SELECT.
GRANT EXECUTE ON FUNCTION educore_r2.net(uuid,uuid),educore_r2.paid(uuid,uuid) TO educore_r4_owner;
CREATE FUNCTION educore_r4.billing_read(t uuid, kind text, target uuid DEFAULT NULL,
  page_no int DEFAULT 1, size int DEFAULT 20) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=pg_catalog,educore_r4,pg_temp AS $$
DECLARE m uuid; invoice_row public.invoices%ROWTYPE; items jsonb; total int;
BEGIN
  IF page_no NOT BETWEEN 1 AND 100000 OR size NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
  IF kind IN ('DRAFT','INVOICE') THEN
    SELECT * INTO invoice_row FROM public.invoices WHERE tenant_id=t AND id=target;
    IF invoice_row.id IS NULL OR (kind='DRAFT' AND invoice_row.status<>'DRAFT')
      OR (kind='INVOICE' AND invoice_row.status='DRAFT') THEN
      RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
    m:=educore_r4.authorize(t,'billing.read',NULL,invoice_row.student_id);
    RETURN jsonb_build_object('id',invoice_row.id,'studentId',invoice_row.student_id,
      'studentName',(SELECT full_name FROM public.student_profiles WHERE tenant_id=t AND id=invoice_row.student_id),
      'periodId',invoice_row.period_id,'period',(SELECT month_start FROM public.billing_periods WHERE tenant_id=t AND id=invoice_row.period_id),
      'status',invoice_row.status,'number',invoice_row.invoice_number,'issuedAt',invoice_row.issued_at,'dueAt',invoice_row.due_at,
      'grossVnd',invoice_row.gross_vnd::text,'discountVnd',invoice_row.discount_vnd::text,'totalVnd',invoice_row.total_vnd::text,
      'policyVersionId',invoice_row.policy_version_id,'snapshot',invoice_row.snapshot_json,
      'canIssue',invoice_row.status='DRAFT' AND educore_r4.has_permission(t,m,'invoice.issue',NULL,invoice_row.student_id),
      'currentGenerationId',(SELECT current_generation_id FROM public.billing_runs WHERE tenant_id=t AND id=invoice_row.billing_run_id),
      'latestGenerationId',(SELECT id FROM public.billing_run_generations WHERE tenant_id=t AND run_id=invoice_row.billing_run_id ORDER BY generation_no DESC LIMIT 1),
      'generationHistory',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.id,'number',g.generation_no,'status',g.status,
        'reason',g.reason,'createdAt',g.created_at,'inputHash',g.input_hash,'result',g.result_snapshot) ORDER BY g.generation_no),'[]'::jsonb)
        FROM public.billing_run_generations g WHERE g.tenant_id=t AND g.run_id=invoice_row.billing_run_id),
      'lines',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',l.id,'source',l.source_snapshot_json,
        'amountVnd',l.base_amount_vnd::text) ORDER BY l.id),'[]'::jsonb)
        FROM public.invoice_lines l WHERE l.tenant_id=t AND l.invoice_id=invoice_row.id),
      'payments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',pay.id,'amountVnd',pay.amount_vnd::text,
          'method',pay.method,'paidAt',pay.paid_at,'reversed',EXISTS(SELECT FROM public.payment_reversals rev
            WHERE rev.tenant_id=t AND rev.payment_id=pay.id),
          'allocations',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',alloc.id,'kind',alloc.kind,
            'amountVnd',alloc.amount_vnd::text,'allocatedAt',alloc.allocated_at) ORDER BY alloc.allocated_at,alloc.id),'[]'::jsonb)
            FROM public.receivable_allocations alloc WHERE alloc.tenant_id=t AND alloc.invoice_id=invoice_row.id AND alloc.payment_id=pay.id))
          ORDER BY pay.paid_at,pay.id),'[]'::jsonb) FROM public.payments pay WHERE pay.tenant_id=t AND pay.invoice_id=invoice_row.id),
      'adjustments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',adj.id,'kind',adj.adjustment_kind,
          'deltaVnd',adj.delta_vnd::text,'status',adj.status,'appliedAt',adj.applied_at,
          'approvalRequestId',adj.approval_request_id) ORDER BY adj.created_at,adj.id),'[]'::jsonb)
          FROM public.invoice_adjustments adj WHERE adj.tenant_id=t AND adj.invoice_id=invoice_row.id));
  END IF;
  m:=educore_r4.authorize(t,CASE kind WHEN 'PRICE_RULES' THEN 'pricing.manage'
    WHEN 'PRICE_TARGETS' THEN 'pricing.manage'
    WHEN 'INVOICES' THEN 'invoice.read' WHEN 'SIBLINGS' THEN 'billing.read'
    WHEN 'PERIODS' THEN 'billing.read' WHEN 'DRAFTS' THEN 'billing.read'
    WHEN 'STUDENTS' THEN 'billing.read'
    ELSE '__DENY__' END);
  IF kind='PRICE_TARGETS' THEN
    SELECT count(*) INTO total FROM (
      SELECT id FROM public.courses WHERE tenant_id=t UNION ALL
      SELECT id FROM public.classes WHERE tenant_id=t UNION ALL
      SELECT id FROM public.class_sessions WHERE tenant_id=t) targets;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',x.id,'scope',x.scope,'label',x.label)
      ORDER BY x.scope,x.label,x.id),'[]'::jsonb) INTO items FROM (
      SELECT * FROM (
        SELECT id,'COURSE' scope,name label FROM public.courses WHERE tenant_id=t
        UNION ALL SELECT id,'CLASS',name FROM public.classes WHERE tenant_id=t
        UNION ALL SELECT id,'SESSION',id::text FROM public.class_sessions WHERE tenant_id=t
      ) all_targets ORDER BY scope,label,id LIMIT size OFFSET (page_no-1)*size) x;
  ELSIF kind='PRICE_RULES' THEN
    SELECT count(*) INTO total FROM public.price_rules p WHERE p.tenant_id=t;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'scope',p.scope_kind,
      'targetId',COALESCE(p.session_id,p.class_id,p.course_id),'amountVnd',p.unit_price_vnd::text,
      'effectiveFrom',p.effective_from,'effectiveTo',p.effective_to,'policyVersionId',p.policy_version_id,
      'createdAt',p.created_at) ORDER BY p.effective_from DESC,p.id),'[]'::jsonb) INTO items
      FROM (SELECT * FROM public.price_rules WHERE tenant_id=t ORDER BY effective_from DESC,id LIMIT size OFFSET (page_no-1)*size) p;
  ELSIF kind='SIBLINGS' THEN
    SELECT count(*) INTO total FROM public.verified_sibling_relationships s WHERE s.tenant_id=t;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'studentAId',s.student_a_id,'studentBId',s.student_b_id,
      'studentAName',a.full_name,'studentBName',b.full_name,'verifiedAt',s.verified_at,
      'revokedAt',s.revoked_at,'evidenceNote',s.evidence_note,'verifiedByMembershipId',s.verified_by_membership_id,
      'eligible',s.revoked_at IS NULL
        AND EXISTS(SELECT FROM public.enrollments ea WHERE ea.tenant_id=t AND ea.student_id=s.student_a_id
          AND ea.status='ACTIVE' AND ea.effective_from<=clock_timestamp() AND (ea.effective_to IS NULL OR ea.effective_to>clock_timestamp()))
        AND EXISTS(SELECT FROM public.enrollments eb WHERE eb.tenant_id=t AND eb.student_id=s.student_b_id
          AND eb.status='ACTIVE' AND eb.effective_from<=clock_timestamp() AND (eb.effective_to IS NULL OR eb.effective_to>clock_timestamp())))
      ORDER BY s.created_at DESC,s.id),'[]'::jsonb) INTO items
      FROM (SELECT * FROM public.verified_sibling_relationships WHERE tenant_id=t ORDER BY created_at DESC,id LIMIT size OFFSET (page_no-1)*size) s
      JOIN public.student_profiles a ON a.tenant_id=t AND a.id=s.student_a_id
      JOIN public.student_profiles b ON b.tenant_id=t AND b.id=s.student_b_id;
  ELSIF kind='PERIODS' THEN
    SELECT count(*) INTO total FROM public.billing_periods p WHERE p.tenant_id=t;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'monthStart',p.month_start,'monthEnd',p.month_end,
      'status',p.status,'timezone',tn.timezone,'draftCount',(SELECT count(*) FROM public.invoices i WHERE i.tenant_id=t AND i.period_id=p.id AND i.status='DRAFT'),
      'issuedCount',(SELECT count(*) FROM public.invoices i WHERE i.tenant_id=t AND i.period_id=p.id AND i.status<>'DRAFT'),
      'generations',(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',g.id,'runId',g.run_id,
        'studentId',g.student_id,'status',g.status,'createdAt',g.created_at,'reason',g.reason,
        'missing',g.input_snapshot->'missing','invoiceId',g.result_snapshot->>'invoiceId',
        'current',g.id=br.current_generation_id) ORDER BY g.created_at DESC,g.id),'[]'::jsonb)
        FROM (SELECT * FROM public.billing_run_generations WHERE tenant_id=t AND period_id=p.id
          ORDER BY created_at DESC,id LIMIT 100) g
        JOIN public.billing_runs br ON br.tenant_id=t AND br.id=g.run_id))
      ORDER BY p.month_start DESC,p.id),'[]'::jsonb) INTO items
      FROM (SELECT * FROM public.billing_periods WHERE tenant_id=t ORDER BY month_start DESC,id LIMIT size OFFSET (page_no-1)*size) p
      JOIN public.tenants tn ON tn.id=t;
  ELSIF kind='STUDENTS' THEN
    SELECT count(*) INTO total FROM public.student_profiles sp WHERE sp.tenant_id=t
      AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.student_id=sp.id AND e.status='ACTIVE');
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',sp.id,'name',sp.full_name,'code',sp.student_code)
      ORDER BY sp.full_name,sp.id),'[]'::jsonb) INTO items
      FROM (SELECT * FROM public.student_profiles sp WHERE sp.tenant_id=t
        AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.student_id=sp.id AND e.status='ACTIVE')
        ORDER BY sp.full_name,sp.id LIMIT size OFFSET (page_no-1)*size) sp;
  ELSIF kind IN ('DRAFTS','INVOICES') THEN
    SELECT count(*) INTO total FROM public.invoices v WHERE v.tenant_id=t
      AND (kind='DRAFTS')=(v.status='DRAFT');
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'studentId',v.student_id,'studentName',sp.full_name,
      'periodId',v.period_id,'period',bp.month_start,'status',v.status,'number',v.invoice_number,
      'totalVnd',v.total_vnd::text,'issuedAt',v.issued_at,'dueAt',v.due_at,
      'netObligationVnd',CASE WHEN v.status='DRAFT' THEN NULL ELSE educore_r2.net(v.id,t)::bigint::text END,
      'allocatedVnd',CASE WHEN v.status='DRAFT' THEN NULL ELSE educore_r2.paid(v.id,t)::bigint::text END,
      'outstandingVnd',CASE WHEN v.status='DRAFT' THEN NULL ELSE greatest(educore_r2.net(v.id,t)-educore_r2.paid(v.id,t),0)::bigint::text END,
      'settlement',CASE WHEN v.status='DRAFT' THEN NULL WHEN v.status='CANCELLED' THEN 'CANCELLED'
        WHEN educore_r2.net(v.id,t)<=educore_r2.paid(v.id,t) THEN 'SETTLED'
        WHEN educore_r2.paid(v.id,t)=0 THEN 'UNPAID' ELSE 'PARTIAL' END,
      'overdue',COALESCE(v.status='ISSUED' AND v.due_at<clock_timestamp() AND educore_r2.net(v.id,t)>educore_r2.paid(v.id,t),false),
      'generationId',v.snapshot_json->>'id','currentGenerationId',br.current_generation_id,
      'latestGenerationId',(SELECT id FROM public.billing_run_generations g WHERE g.tenant_id=t AND g.run_id=br.id ORDER BY g.generation_no DESC LIMIT 1))
      ORDER BY v.created_at DESC,v.id),'[]'::jsonb) INTO items
      FROM (SELECT * FROM public.invoices WHERE tenant_id=t AND (kind='DRAFTS')=(status='DRAFT')
        ORDER BY created_at DESC,id LIMIT size OFFSET (page_no-1)*size) v
      JOIN public.student_profiles sp ON sp.tenant_id=t AND sp.id=v.student_id
      JOIN public.billing_periods bp ON bp.tenant_id=t AND bp.id=v.period_id
      JOIN public.billing_runs br ON br.tenant_id=t AND br.id=v.billing_run_id;
  END IF;
  RETURN jsonb_build_object('items',items,'page',page_no,'pageSize',size,'total',total,'asOf',clock_timestamp());
END $$;
ALTER FUNCTION educore_r4.billing_read(uuid,text,uuid,int,int) OWNER TO educore_r4_owner;
REVOKE ALL ON FUNCTION educore_r4.billing_read(uuid,text,uuid,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r4.billing_read(uuid,text,uuid,int,int) TO educore_r4_api;
COMMIT;
