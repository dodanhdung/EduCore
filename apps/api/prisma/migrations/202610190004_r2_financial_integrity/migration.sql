BEGIN;
-- No silent adoption/default provenance for populated financial history.
DO $adoption$ BEGIN
 IF EXISTS(SELECT FROM public.billing_runs) OR EXISTS(SELECT FROM public.invoices)
 OR EXISTS(SELECT FROM public.payments) OR EXISTS(SELECT FROM public.invoice_adjustments)
 THEN RAISE EXCEPTION 'R2_LEGACY_ADOPTION_REQUIRES_REVIEW' USING ERRCODE='23514'; END IF;
END $adoption$;
-- DropIndex
DROP INDEX "receivable_allocations_tenant_id_payment_id_key";

-- DropIndex
DROP INDEX "receivable_allocations_tenant_id_payment_id_invoice_id_key";

-- AlterTable
ALTER TABLE "billing_runs" ADD COLUMN     "current_generation_id" UUID;

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "financial_revision" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "invoice_discounts" ALTER COLUMN "raw_discount_decimal" SET DATA TYPE DECIMAL(24,6);

-- AlterTable
ALTER TABLE "receivable_allocations" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'PAYMENT',
ADD COLUMN     "wallet_transaction_id" UUID;

-- CreateTable
CREATE TABLE "billing_run_generations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "policy_version_id" UUID NOT NULL,
    "generation_no" INTEGER NOT NULL,
    "base_generation_id" UUID,
    "operation_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "input_hash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "result_snapshot" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_run_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "balance_vnd" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "amount_vnd" BIGINT NOT NULL,
    "source_key" TEXT NOT NULL,
    "operation_key" TEXT NOT NULL,
    "funding_method" TEXT,
    "receipt_reference" TEXT,
    "payment_id" UUID,
    "reversed_top_up_id" UUID,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "recorded_by_membership_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_number_counters" (
    "tenant_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "next_value" BIGINT NOT NULL,

    CONSTRAINT "invoice_number_counters_pkey" PRIMARY KEY ("tenant_id","year")
);

-- CreateTable
CREATE TABLE "r2_principal_bindings" (
    "database_role" TEXT NOT NULL,
    "auth_session_id" UUID NOT NULL,

    CONSTRAINT "r2_principal_bindings_pkey" PRIMARY KEY ("database_role")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_run_generations_tenant_id_id_key" ON "billing_run_generations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_run_generations_tenant_id_run_id_student_id_period__key" ON "billing_run_generations"("tenant_id", "run_id", "student_id", "period_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_run_generations_tenant_id_run_id_generation_no_key" ON "billing_run_generations"("tenant_id", "run_id", "generation_no");

-- CreateIndex
CREATE UNIQUE INDEX "billing_run_generations_tenant_id_operation_key_key" ON "billing_run_generations"("tenant_id", "operation_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_tenant_id_id_key" ON "wallet_accounts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_tenant_id_student_id_key" ON "wallet_accounts"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_tenant_id_wallet_id_created_at_idx" ON "wallet_transactions"("tenant_id", "wallet_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_tenant_id_id_key" ON "wallet_transactions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_tenant_id_source_key_key" ON "wallet_transactions"("tenant_id", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_tenant_id_funding_method_receipt_refere_key" ON "wallet_transactions"("tenant_id", "funding_method", "receipt_reference");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_tenant_id_reversed_top_up_id_key" ON "wallet_transactions"("tenant_id", "reversed_top_up_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_allocations_wallet_transaction_id_key" ON "receivable_allocations"("wallet_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_allocations_tenant_id_wallet_transaction_id_key" ON "receivable_allocations"("tenant_id", "wallet_transaction_id");

-- AddForeignKey
ALTER TABLE "billing_runs" ADD CONSTRAINT "billing_runs_tenant_id_id_student_id_period_id_current_gen_fkey" FOREIGN KEY ("tenant_id", "id", "student_id", "period_id", "current_generation_id") REFERENCES "billing_run_generations"("tenant_id", "run_id", "student_id", "period_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "receivable_allocations" ADD CONSTRAINT "receivable_allocations_tenant_id_wallet_transaction_id_fkey" FOREIGN KEY ("tenant_id", "wallet_transaction_id") REFERENCES "wallet_transactions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "billing_run_generations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "r2_generation_run_fk" FOREIGN KEY ("tenant_id", "run_id", "student_id", "period_id") REFERENCES "billing_runs"("tenant_id", "id", "student_id", "period_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "billing_run_generations_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "billing_run_generations_tenant_id_period_id_fkey" FOREIGN KEY ("tenant_id", "period_id") REFERENCES "billing_periods"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "billing_run_generations_tenant_id_policy_version_id_fkey" FOREIGN KEY ("tenant_id", "policy_version_id") REFERENCES "policy_versions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "billing_run_generations_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_run_generations" ADD CONSTRAINT "r2_generation_base_fk" FOREIGN KEY ("tenant_id", "run_id", "student_id", "period_id", "base_generation_id") REFERENCES "billing_run_generations"("tenant_id", "run_id", "student_id", "period_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_tenant_id_student_id_fkey" FOREIGN KEY ("tenant_id", "student_id") REFERENCES "student_profiles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_wallet_id_fkey" FOREIGN KEY ("tenant_id", "wallet_id") REFERENCES "wallet_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_payment_id_fkey" FOREIGN KEY ("tenant_id", "payment_id") REFERENCES "payments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_recorded_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "recorded_by_membership_id") REFERENCES "tenant_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_reversed_top_up_id_fkey" FOREIGN KEY ("tenant_id", "reversed_top_up_id") REFERENCES "wallet_transactions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "invoice_number_counters" ADD CONSTRAINT "invoice_number_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "r2_principal_bindings" ADD CONSTRAINT "r2_principal_bindings_auth_session_id_fkey" FOREIGN KEY ("auth_session_id") REFERENCES "auth_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Raw DML remains closed. Only narrow, actor-bound SECURITY DEFINER commands
-- may write finance. Operator provisions LOGIN -> verified auth-session binding;
-- no caller-controlled actor GUC or arbitrary SQL executor is accepted.
CREATE ROLE educore_r2_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
CREATE ROLE educore_r2_command NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE SCHEMA educore_r2 AUTHORIZATION educore_r2_owner;
REVOKE ALL ON SCHEMA educore_r2 FROM PUBLIC;
GRANT USAGE ON SCHEMA public,educore_private TO educore_r2_owner;
GRANT EXECUTE ON FUNCTION educore_private.r1b_lock_tenant(uuid),educore_private.r1b_freeze_tenant(uuid) TO educore_r2_owner;
GRANT SELECT ON public.tenants,public.users,public.auth_sessions,public.tenant_memberships,
 public.roles,public.membership_roles,public.role_permissions,public.permissions,public.access_scopes,
 public.student_profiles,public.parent_student_links,public.policy_versions,public.verified_sibling_relationships,
 public.enrollments,public.classes,public.courses,public.class_sessions,public.session_participants,
 public.attendance_records,public.attendance_finalizations,public.absence_requests,public.price_rules,
 public.billing_periods,public.billing_runs,public.billing_run_generations,public.invoices,public.invoice_lines,
 public.invoice_discounts,public.invoiced_participation_claims,public.payments,public.receivable_allocations,
 public.payment_reversals,public.invoice_adjustments,public.approval_requests,public.approval_decisions,
 public.idempotency_records,public.audit_logs,public.payment_excess_resolutions,public.wallet_accounts,
 public.wallet_transactions,public.invoice_number_counters,public.r2_principal_bindings TO educore_r2_owner;
GRANT UPDATE ON public.billing_runs,public.invoices,public.wallet_accounts,public.invoice_number_counters,public.approval_requests TO educore_r2_owner;
-- PostgreSQL row-lock SELECT requires UPDATE privilege on at least one column.
-- The NOLOGIN owner has no public arbitrary-user mutation function.
GRANT UPDATE(id) ON public.users TO educore_r2_owner;
GRANT INSERT ON public.billing_runs,public.billing_run_generations,public.invoices,public.invoice_lines,
 public.invoice_discounts,public.invoiced_participation_claims,public.payments,public.receivable_allocations,
 public.payment_reversals,public.invoice_adjustments,public.approval_requests,public.approval_decisions,
 public.idempotency_records,public.audit_logs,public.wallet_accounts,public.wallet_transactions,
 public.invoice_number_counters TO educore_r2_owner;
GRANT DELETE ON public.invoice_lines,public.invoice_discounts TO educore_r2_owner;
GRANT USAGE ON SCHEMA educore_r2 TO educore_r2_command;

ALTER TABLE public.wallet_accounts ADD CONSTRAINT r2_wallet_nonnegative CHECK(balance_vnd>=0);
ALTER TABLE public.invoice_number_counters ADD CONSTRAINT r2_counter_positive CHECK(next_value>0);
ALTER TABLE public.invoices ADD CONSTRAINT r2_financial_revision CHECK(financial_revision>=0);
ALTER TABLE public.invoices ADD CONSTRAINT r2_invoice_money CHECK(gross_vnd>=0 AND discount_vnd>=0 AND total_vnd>=0 AND total_vnd::numeric=gross_vnd::numeric-discount_vnd);
ALTER TABLE public.invoice_lines ADD CONSTRAINT r2_line_money CHECK(charge_units IN (0,1) AND unit_price_vnd>=0 AND base_amount_vnd::numeric=charge_units::numeric*unit_price_vnd);
ALTER TABLE public.billing_run_generations ADD CONSTRAINT r2_generation_shape CHECK
 (generation_no>0 AND ((generation_no=1)=(base_generation_id IS NULL)) AND status IN ('DRAFT','NEEDS_INFORMATION') AND jsonb_typeof(input_snapshot)='object'
 AND jsonb_typeof(result_snapshot)='object' AND length(reason)>0);
ALTER TABLE public.wallet_transactions ADD CONSTRAINT r2_wallet_transaction_shape CHECK
 (amount_vnd<>0 AND length(reason)>0 AND length(evidence)>0 AND
 ((kind='TOP_UP' AND amount_vnd>0 AND payment_id IS NULL AND reversed_top_up_id IS NULL
    AND funding_method IS NOT NULL AND receipt_reference IS NOT NULL AND funding_method IN ('CASH','BANK_TRANSFER') AND length(receipt_reference)>0)
 OR (kind='INVOICE_PAYMENT' AND amount_vnd<0 AND payment_id IS NOT NULL AND reversed_top_up_id IS NULL AND funding_method IS NULL AND receipt_reference IS NULL)
 OR (kind='INVOICE_REFUND' AND amount_vnd>0 AND payment_id IS NOT NULL AND reversed_top_up_id IS NULL AND funding_method IS NULL AND receipt_reference IS NULL)
 OR (kind='TOP_UP_REVERSAL' AND amount_vnd<0 AND payment_id IS NULL AND reversed_top_up_id IS NOT NULL AND funding_method IS NULL AND receipt_reference IS NULL)));
ALTER TABLE public.receivable_allocations ADD CONSTRAINT r2_allocation_sign CHECK
 ((kind='PAYMENT' AND amount_vnd>0) OR (kind='RELEASE' AND amount_vnd<0 AND wallet_transaction_id IS NOT NULL));
CREATE UNIQUE INDEX r2_one_positive_allocation ON public.receivable_allocations(tenant_id,payment_id) WHERE kind='PAYMENT';
CREATE UNIQUE INDEX r2_one_wallet_debit ON public.wallet_transactions(tenant_id,payment_id) WHERE kind='INVOICE_PAYMENT';
CREATE UNIQUE INDEX r2_one_adjustment_root ON public.invoice_adjustments(tenant_id,approval_request_id);
CREATE UNIQUE INDEX r2_one_approval_decision ON public.approval_decisions(tenant_id,approval_request_id);

-- A transaction-local permit is private table state, not a forgeable GUC.
CREATE TABLE educore_r2.effect_permits(tx bigint NOT NULL,invoice_id uuid NOT NULL,operation text NOT NULL,PRIMARY KEY(tx,invoice_id));
ALTER TABLE educore_r2.effect_permits OWNER TO educore_r2_owner;
GRANT USAGE ON SCHEMA educore_r2 TO educore_r1b_guard_owner;
GRANT SELECT ON educore_r2.effect_permits TO educore_r1b_guard_owner;

CREATE FUNCTION educore_r2.authorize(t uuid,s uuid,permission text) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE a public.auth_sessions%ROWTYPE; m uuid;
BEGIN
 SELECT x.* INTO a FROM public.r2_principal_bindings b JOIN public.auth_sessions x ON x.id=b.auth_session_id WHERE b.database_role=session_user;
 IF a.id IS NULL THEN RAISE EXCEPTION 'UNVERIFIED_DATABASE_PRINCIPAL' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.users WHERE id=a.user_id FOR SHARE;
 PERFORM educore_private.r1b_lock_tenant(t);
 -- Fresh statement after both locks. IAM writers must use the R1b protocol.
 SELECT x.* INTO a FROM public.r2_principal_bindings b JOIN public.auth_sessions x ON x.id=b.auth_session_id
 JOIN public.users u ON u.id=x.user_id AND u.status='ACTIVE'
 WHERE b.database_role=session_user AND x.revoked_at IS NULL AND x.expires_at>clock_timestamp() AND x.active_tenant_id=t;
 IF a.id IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_CURRENT' USING ERRCODE='42501'; END IF;
 SELECT tm.id INTO m FROM public.tenant_memberships tm JOIN public.tenants tn ON tn.id=tm.tenant_id AND tn.status='ACTIVE'
 JOIN public.membership_roles mr ON mr.tenant_id=tm.tenant_id AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
 JOIN public.roles role ON role.tenant_id=mr.tenant_id AND role.id=mr.role_id
 JOIN public.role_permissions rp ON rp.tenant_id=mr.tenant_id AND rp.role_id=mr.role_id
 JOIN public.permissions p ON p.id=rp.permission_id AND p.code=permission
 JOIN public.access_scopes sc ON sc.tenant_id=mr.tenant_id AND sc.membership_role_id=mr.id
 WHERE tm.tenant_id=t AND tm.user_id=a.user_id AND tm.status='ACTIVE' AND tm.left_at IS NULL
 AND (role.code NOT IN ('STUDENT','PARENT') OR (permission IN ('payment.read','invoice.read') AND
 ((role.code='STUDENT' AND EXISTS(SELECT FROM public.student_profiles sp WHERE sp.tenant_id=t AND sp.id=s AND sp.membership_id=tm.id))
 OR (role.code='PARENT' AND EXISTS(SELECT FROM public.parent_student_links ps WHERE ps.tenant_id=t AND ps.student_id=s AND ps.parent_membership_id=tm.id AND ps.verified_at IS NOT NULL AND ps.revoked_at IS NULL)))))
 AND (sc.scope_kind='TENANT' OR (sc.scope_kind='STUDENT' AND sc.student_id=s)
 OR (sc.scope_kind='CLASS' AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.class_id=sc.class_id AND e.student_id=s)))
 ORDER BY tm.id LIMIT 1;
 IF m IS NULL THEN RAISE EXCEPTION 'PERMISSION_OR_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN m;
END $$;

CREATE FUNCTION educore_r2.audit(t uuid,m uuid,op text,target uuid,body jsonb,policy uuid DEFAULT NULL) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
 INSERT INTO public.audit_logs(id,tenant_id,actor_user_id,actor_membership_id,actor_kind,event_type,entity_type,entity_id,action,reason,before_json,after_json,policy_version_id,correlation_id)
 SELECT gen_random_uuid(),t,user_id,m,'USER',op,'R2',target,op,body->>'reason',CASE WHEN op='GENERATION' THEN body->'change'->'before' ELSE NULL END,body,policy,gen_random_uuid() FROM public.tenant_memberships WHERE tenant_id=t AND id=m;
$$;

CREATE FUNCTION educore_r2.net(i uuid,t uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
 SELECT inv.total_vnd::numeric+COALESCE((SELECT sum(delta_vnd) FROM public.invoice_adjustments WHERE tenant_id=t AND invoice_id=i AND status='APPLIED'),0)
 FROM public.invoices inv WHERE inv.tenant_id=t AND inv.id=i;
$$;
CREATE FUNCTION educore_r2.paid(i uuid,t uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
 SELECT COALESCE(sum(amount_vnd),0) FROM public.receivable_allocations WHERE tenant_id=t AND invoice_id=i;
$$;

-- Capture all relevant source/price/eligibility facts under the tenant mutex.
CREATE FUNCTION educore_r2.capture(t uuid,student uuid,period uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE z text; bp public.billing_periods%ROWTYPE; r record; pr record; tier int; n int; units int;
 lines jsonb:='[]'; missing jsonb:='[]'; sibling boolean;
BEGIN
 SELECT timezone INTO z FROM public.tenants WHERE id=t;
 SELECT * INTO STRICT bp FROM public.billing_periods WHERE tenant_id=t AND id=period;
 IF (clock_timestamp() AT TIME ZONE z)::date<bp.month_end THEN RAISE EXCEPTION 'PERIOD_NOT_CLOSED' USING ERRCODE='23514'; END IF;
 -- An expected enrollment/session with no participation must never disappear
 -- silently from billing. Transfers use the original interval and lineage.
 IF EXISTS(SELECT FROM public.enrollments e JOIN public.class_sessions cs ON cs.tenant_id=e.tenant_id AND cs.class_id=e.class_id
 WHERE e.tenant_id=t AND e.student_id=student AND e.effective_from<=cs.starts_at AND (e.effective_to IS NULL OR cs.starts_at<e.effective_to)
 AND (cs.starts_at AT TIME ZONE z)::date>=bp.month_start AND (cs.starts_at AT TIME ZONE z)::date<bp.month_end
 AND NOT EXISTS(SELECT FROM public.session_participants p WHERE p.tenant_id=t AND p.session_id=cs.id AND p.student_id=student AND p.removed_at IS NULL)) THEN
 missing:=missing||'"MISSING_PARTICIPANT"'::jsonb; END IF;
 FOR r IN SELECT p.id participant,p.session_id,p.enrollment_id,p.participant_kind,cs.class_id,c.course_id,cs.status session_status,cs.starts_at,cs.ends_at,cs.revision session_revision,
 (cs.starts_at AT TIME ZONE z)::date local_date, ar.id attendance,ar.attendance_status,ar.finalization_id,af.confirmed_at,ar.revision attendance_revision,af.revision finalization_revision,
 EXISTS(SELECT FROM public.absence_requests ab WHERE ab.tenant_id=t AND ab.participant_id=p.id AND ab.status='APPROVED'
 AND ab.approved_by_membership_id IS NOT NULL AND ab.decided_at IS NOT NULL) approved_leave
 FROM public.session_participants p JOIN public.class_sessions cs ON cs.tenant_id=t AND cs.id=p.session_id
 JOIN public.classes c ON c.tenant_id=t AND c.id=cs.class_id
 LEFT JOIN public.attendance_records ar ON ar.tenant_id=t AND ar.participant_id=p.id
 LEFT JOIN public.attendance_finalizations af ON af.tenant_id=t AND af.session_id=cs.id AND af.id=ar.finalization_id
 WHERE p.tenant_id=t AND p.student_id=student AND p.removed_at IS NULL
 AND (cs.starts_at AT TIME ZONE z)::date>=bp.month_start AND (cs.starts_at AT TIME ZONE z)::date<bp.month_end ORDER BY p.id
 LOOP
  IF r.participant_kind<>'REGULAR' OR r.enrollment_id IS NULL OR NOT EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.id=r.enrollment_id
   AND e.student_id=student AND e.class_id=r.class_id AND e.effective_from<=r.starts_at AND (e.effective_to IS NULL OR r.starts_at<e.effective_to)) THEN
   missing:=missing||jsonb_build_array('INVALID_LINEAGE:'||r.participant); CONTINUE; END IF;
  IF r.session_status<>'CANCELLED' AND (r.session_status NOT IN ('CONFIRMED','COMPLETED') OR r.attendance IS NULL OR r.confirmed_at IS NULL
   OR (r.attendance_status='EXCUSED' AND NOT r.approved_leave)) THEN missing:=missing||jsonb_build_array('UNCONFIRMED_SOURCE:'||r.participant); CONTINUE; END IF;
  SELECT min(CASE scope_kind WHEN 'SESSION' THEN 1 WHEN 'CLASS' THEN 2 ELSE 3 END) INTO tier FROM public.price_rules
   WHERE tenant_id=t AND effective_from<=r.local_date AND (effective_to IS NULL OR r.local_date<effective_to)
   AND ((scope_kind='SESSION' AND session_id=r.session_id) OR (scope_kind='CLASS' AND class_id=r.class_id) OR (scope_kind='COURSE' AND course_id=r.course_id));
  SELECT count(*) INTO n FROM public.price_rules WHERE tenant_id=t AND effective_from<=r.local_date AND (effective_to IS NULL OR r.local_date<effective_to)
   AND CASE scope_kind WHEN 'SESSION' THEN 1 WHEN 'CLASS' THEN 2 ELSE 3 END=tier
   AND ((scope_kind='SESSION' AND session_id=r.session_id) OR (scope_kind='CLASS' AND class_id=r.class_id) OR (scope_kind='COURSE' AND course_id=r.course_id));
  IF n<>1 THEN missing:=missing||jsonb_build_array('MISSING_OR_AMBIGUOUS_PRICE:'||r.participant); CONTINUE; END IF;
  SELECT id,unit_price_vnd,scope_kind,effective_from,effective_to,policy_version_id INTO pr FROM public.price_rules
   WHERE tenant_id=t AND effective_from<=r.local_date AND (effective_to IS NULL OR r.local_date<effective_to)
   AND CASE scope_kind WHEN 'SESSION' THEN 1 WHEN 'CLASS' THEN 2 ELSE 3 END=tier
   AND ((scope_kind='SESSION' AND session_id=r.session_id) OR (scope_kind='CLASS' AND class_id=r.class_id) OR (scope_kind='COURSE' AND course_id=r.course_id));
  units:=CASE WHEN r.session_status='CANCELLED' OR r.attendance_status='EXCUSED' THEN 0 ELSE 1 END;
  lines:=lines||jsonb_build_array(jsonb_build_object('participantId',r.participant,'sessionId',r.session_id,'enrollmentId',r.enrollment_id,
   'classId',r.class_id,'courseId',r.course_id,'attendanceId',CASE WHEN r.session_status='CANCELLED' THEN NULL ELSE r.attendance END,
   'finalizationId',CASE WHEN r.session_status='CANCELLED' THEN NULL ELSE r.finalization_id END,'confirmedAt',CASE WHEN r.session_status='CANCELLED' THEN NULL ELSE r.confirmed_at END,
   'localDate',r.local_date,'sourceBusinessDate',r.local_date,'pricingLocalDate',r.local_date,'timezone',z,'billingMonth',bp.month_start,
   'sessionRevision',r.session_revision,'attendanceRevision',r.attendance_revision,'finalizationRevision',r.finalization_revision,
   'startsAt',to_char(r.starts_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'sourceStatus',CASE WHEN r.session_status='CANCELLED' THEN 'CANCELLED' ELSE r.attendance_status::text END,
   'units',units,'unitPriceVnd',pr.unit_price_vnd::text,'priceRuleId',pr.id,'priceScope',pr.scope_kind,'priceEffectiveFrom',pr.effective_from,'priceEffectiveTo',pr.effective_to,'tariffPolicyVersionId',pr.policy_version_id));
 END LOOP;
 IF jsonb_array_length(lines)=0 THEN missing:=missing||'"NO_BILLABLE_SOURCES"'::jsonb; END IF;
 SELECT EXISTS(SELECT FROM public.verified_sibling_relationships sr WHERE sr.tenant_id=t AND sr.revoked_at IS NULL
 AND student IN (sr.student_a_id,sr.student_b_id) AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.student_id=student
 AND e.status='ACTIVE' AND e.effective_from<=clock_timestamp() AND (e.effective_to IS NULL OR e.effective_to>clock_timestamp()))
 AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=t AND e.student_id=CASE WHEN sr.student_a_id=student THEN sr.student_b_id ELSE sr.student_a_id END
 AND e.status='ACTIVE' AND e.effective_from<=clock_timestamp() AND (e.effective_to IS NULL OR e.effective_to>clock_timestamp()))) INTO sibling;
 RETURN jsonb_build_object('schemaVersion',1,'timezone',z,'studentId',student,'periodId',period,'monthStart',bp.month_start,'lines',lines,'missing',missing,'sibling',sibling,
 'siblingEvidence',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',sr.id,'studentAId',sr.student_a_id,'studentBId',sr.student_b_id,'verifiedAt',sr.verified_at,'verifiedByMembershipId',sr.verified_by_membership_id) ORDER BY sr.id)
 FROM public.verified_sibling_relationships sr WHERE sr.tenant_id=t AND sr.revoked_at IS NULL AND student IN (sr.student_a_id,sr.student_b_id)),'[]'));
END $$;

CREATE FUNCTION educore_r2.immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN RAISE EXCEPTION 'R2_IMMUTABLE_HISTORY' USING ERRCODE='23514'; END $$;
CREATE TRIGGER r2_generation_immutable BEFORE UPDATE OR DELETE ON public.billing_run_generations FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_wallet_history BEFORE UPDATE OR DELETE ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_payment_history BEFORE UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_allocation_history BEFORE UPDATE OR DELETE ON public.receivable_allocations FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_adjustment_history BEFORE UPDATE OR DELETE ON public.invoice_adjustments FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_reversal_history BEFORE UPDATE OR DELETE ON public.payment_reversals FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_decision_history BEFORE UPDATE OR DELETE ON public.approval_decisions FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_receipt_history BEFORE UPDATE OR DELETE ON public.idempotency_records FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();
CREATE TRIGGER r2_audit_history BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();

ALTER TABLE public.idempotency_records ADD COLUMN result_snapshot jsonb;

CREATE FUNCTION educore_r2.release_payment(t uuid,payment uuid,amount numeric,root text,m uuid,reason text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE p public.payments%ROWTYPE; w public.wallet_accounts%ROWTYPE; wt uuid:=gen_random_uuid(); remaining numeric;
BEGIN
 IF amount=0 THEN RETURN; END IF;
 SELECT * INTO STRICT p FROM public.payments WHERE tenant_id=t AND id=payment;
 SELECT * INTO STRICT w FROM public.wallet_accounts WHERE tenant_id=t AND student_id=(SELECT student_id FROM public.invoices WHERE tenant_id=t AND id=p.invoice_id) FOR UPDATE;
 SELECT COALESCE(sum(amount_vnd),0) INTO remaining FROM public.receivable_allocations WHERE tenant_id=t AND payment_id=p.id;
 IF p.method<>'WALLET' OR amount<=0 OR amount>remaining THEN RAISE EXCEPTION 'INVALID_RELEASE' USING ERRCODE='23514'; END IF;
 INSERT INTO public.wallet_transactions(id,tenant_id,wallet_id,kind,amount_vnd,source_key,operation_key,payment_id,reason,evidence,recorded_by_membership_id)
 VALUES(wt,t,w.id,'INVOICE_REFUND',amount::bigint,root||':'||p.id,root,p.id,reason,'Approved financial root '||root,m);
 INSERT INTO public.receivable_allocations(id,tenant_id,invoice_id,payment_id,amount_vnd,kind,wallet_transaction_id,allocated_at,operation_key)
 VALUES(gen_random_uuid(),t,p.invoice_id,p.id,-amount::bigint,'RELEASE',wt,clock_timestamp(),root||':'||p.id);
 UPDATE public.wallet_accounts SET balance_vnd=(balance_vnd::numeric+amount)::bigint,updated_at=clock_timestamp() WHERE id=w.id;
END $$;

CREATE FUNCTION educore_r2.refund_excess(t uuid,i uuid,root text,m uuid,reason text) RETURNS numeric
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE excess numeric; remaining numeric; part numeric; p record; total numeric;
BEGIN
 excess:=greatest(educore_r2.paid(i,t)-educore_r2.net(i,t),0); total:=excess;
 FOR p IN SELECT pay.id,COALESCE(sum(a.amount_vnd),0) available FROM public.payments pay LEFT JOIN public.receivable_allocations a
 ON a.tenant_id=t AND a.payment_id=pay.id WHERE pay.tenant_id=t AND pay.invoice_id=i GROUP BY pay.id ORDER BY pay.paid_at DESC,pay.id DESC
 LOOP
  EXIT WHEN excess=0; part:=least(excess,p.available);
  IF part>0 THEN PERFORM educore_r2.release_payment(t,p.id,part,root,m,reason); excess:=excess-part; END IF;
 END LOOP;
 IF excess<>0 THEN RAISE EXCEPTION 'REFUND_RECONCILIATION_FAILED' USING ERRCODE='23514'; END IF;
 RETURN total;
END $$;

CREATE FUNCTION educore_r2.generate(t uuid,m uuid,body jsonb,request_hash text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE student uuid:=(body->>'studentId')::uuid; period uuid:=(body->>'periodId')::uuid;
 run public.billing_runs%ROWTYPE; inv public.invoices%ROWTYPE; pol uuid; captured jsonb; result jsonb; item jsonb;
 gross numeric:=0; net numeric; discount numeric; input_hash text; generation uuid:=gen_random_uuid(); base uuid; seq int; ready boolean; invoice_identity uuid; previous_result jsonb;
BEGIN
 SELECT id INTO pol FROM public.policy_versions WHERE tenant_id=t AND effective_from<=clock_timestamp()
 AND (effective_to IS NULL OR clock_timestamp()<effective_to) ORDER BY effective_from DESC,id LIMIT 1;
 IF pol IS NULL THEN RAISE EXCEPTION 'NO_EFFECTIVE_CALCULATION_POLICY' USING ERRCODE='23514'; END IF;
 SELECT * INTO run FROM public.billing_runs WHERE tenant_id=t AND student_id=student AND period_id=period FOR UPDATE;
 IF run.id IS NULL THEN
  IF body->>'operation'='RECOMPUTE' THEN RAISE EXCEPTION 'NO_BASE_GENERATION' USING ERRCODE='23514'; END IF;
  INSERT INTO public.billing_runs(id,tenant_id,period_id,student_id,operation_key,state,policy_version_id,input_snapshot_hash,requested_by_membership_id,updated_at)
  VALUES(gen_random_uuid(),t,period,student,body->>'key','CAPTURING',pol,'initial',m,clock_timestamp()) RETURNING * INTO run;
 END IF;
 SELECT id,generation_no+1,result_snapshot INTO base,seq,previous_result FROM public.billing_run_generations WHERE tenant_id=t AND run_id=run.id ORDER BY generation_no DESC LIMIT 1;
 IF body->>'operation'='RECOMPUTE' THEN
  IF base IS DISTINCT FROM (body->>'expectedBase')::uuid OR run.current_generation_id IS DISTINCT FROM (body->>'expectedApplied')::uuid THEN RAISE EXCEPTION 'GENERATION_CAS_CONFLICT' USING ERRCODE='40001'; END IF;
 ELSIF base IS NOT NULL THEN RAISE EXCEPTION 'INITIAL_GENERATION_EXISTS' USING ERRCODE='23505'; END IF;
 SELECT * INTO inv FROM public.invoices WHERE tenant_id=t AND billing_run_id=run.id FOR UPDATE;
 IF inv.id IS NOT NULL AND (inv.status<>'DRAFT' OR inv.issued_at IS NOT NULL) THEN RAISE EXCEPTION 'ISSUED_RECOMPUTE_DENIED' USING ERRCODE='23514'; END IF;
 captured:=educore_r2.capture(t,student,period); input_hash:=encode(sha256(convert_to(captured::text,'UTF8')),'hex');
 ready:=jsonb_array_length(captured->'missing')=0;
 invoice_identity:=CASE WHEN ready THEN COALESCE(inv.id,gen_random_uuid()) ELSE inv.id END;
 FOR item IN SELECT value FROM jsonb_array_elements(captured->'lines') LOOP
  gross:=gross+(item->>'unitPriceVnd')::numeric*(item->>'units')::int;
 END LOOP;
 -- Wide NUMERIC intermediate, ROUND(numeric,0) is HALF_UP for nonnegative money.
 net:=round(gross*CASE WHEN (captured->>'sibling')::boolean THEN 0.9 ELSE 1 END,0); discount:=gross-net;
 IF gross>9223372036854775807 OR net>9223372036854775807 THEN RAISE EXCEPTION 'MONEY_OVERFLOW' USING ERRCODE='22003'; END IF;
 result:=jsonb_build_object('schemaVersion',1,'id',generation,'runId',run.id,'generationNo',COALESCE(seq,1),'baseGenerationId',base,
 'policyVersionId',pol,'inputHash',input_hash,'status',CASE WHEN ready THEN 'DRAFT' ELSE 'NEEDS_INFORMATION' END,
 'grossVnd',gross::bigint::text,'discountVnd',discount::bigint::text,'totalVnd',net::bigint::text,'invoiceId',invoice_identity,'source',captured,
 'change',jsonb_build_object('before',CASE WHEN base IS NULL THEN NULL ELSE jsonb_build_object('grossVnd',previous_result->>'grossVnd','discountVnd',previous_result->>'discountVnd','totalVnd',previous_result->>'totalVnd') END,
 'after',jsonb_build_object('grossVnd',gross::bigint::text,'discountVnd',discount::bigint::text,'totalVnd',net::bigint::text),'previousInputHash',previous_result->>'inputHash','inputChanged',input_hash IS DISTINCT FROM previous_result->>'inputHash'));
 INSERT INTO public.billing_run_generations(id,tenant_id,run_id,student_id,period_id,policy_version_id,generation_no,base_generation_id,
 operation_key,request_hash,input_hash,status,input_snapshot,result_snapshot,reason,created_by_membership_id)
 VALUES(generation,t,run.id,student,period,pol,COALESCE(seq,1),base,body->>'key',request_hash,input_hash,result->>'status',captured,result,body->>'reason',m);
 IF ready THEN
  IF inv.id IS NULL THEN
   INSERT INTO public.invoices(id,tenant_id,billing_run_id,student_id,period_id,status,gross_vnd,discount_vnd,total_vnd,policy_version_id,snapshot_json,updated_at)
   VALUES(invoice_identity,t,run.id,student,period,'DRAFT',gross::bigint,discount::bigint,net::bigint,pol,result,clock_timestamp()) RETURNING * INTO inv;
  ELSE
   DELETE FROM public.invoice_lines WHERE tenant_id=t AND invoice_id=inv.id;
   DELETE FROM public.invoice_discounts WHERE tenant_id=t AND invoice_id=inv.id;
   UPDATE public.invoices SET gross_vnd=gross::bigint,discount_vnd=discount::bigint,total_vnd=net::bigint,policy_version_id=pol,snapshot_json=result,updated_at=clock_timestamp() WHERE id=inv.id;
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(captured->'lines') LOOP
   INSERT INTO public.invoice_lines(id,tenant_id,invoice_id,student_id,participant_id,session_id,attendance_id,price_rule_id,source_status,
    charge_units,unit_price_vnd,base_amount_vnd,reason_code,source_snapshot_json,updated_at)
   VALUES(gen_random_uuid(),t,inv.id,student,(item->>'participantId')::uuid,(item->>'sessionId')::uuid,(item->>'attendanceId')::uuid,
    (item->>'priceRuleId')::uuid,item->>'sourceStatus',(item->>'units')::int,(item->>'unitPriceVnd')::bigint,
    ((item->>'unitPriceVnd')::numeric*(item->>'units')::int)::bigint,'R2_GENERATION',item,clock_timestamp());
  END LOOP;
  IF (captured->>'sibling')::boolean THEN
   INSERT INTO public.invoice_discounts(id,tenant_id,invoice_id,kind,sequence_no,rate,raw_discount_decimal,evidence_snapshot_json,updated_at)
   VALUES(gen_random_uuid(),t,inv.id,'SIBLING',1,0.1,gross*0.1,captured,clock_timestamp());
  END IF;
  UPDATE public.billing_runs SET current_generation_id=generation,state='DRAFT',updated_at=clock_timestamp() WHERE id=run.id AND current_generation_id IS NOT DISTINCT FROM run.current_generation_id;
 ELSE
  -- A missing G2 is retained without applying it. Latest != applied blocks ISSUE.
  UPDATE public.billing_runs SET state='NEEDS_INFORMATION',error_reason=(captured->'missing')::text,updated_at=clock_timestamp() WHERE id=run.id;
 END IF;
 PERFORM educore_r2.audit(t,m,'GENERATION',generation,result,pol);
 RETURN result||jsonb_build_object('invoiceId',inv.id);
END $$;

CREATE FUNCTION educore_r2.execute(t uuid,body jsonb) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE op text:=body->>'operation'; student uuid; m uuid; policy uuid; hash text; receipt public.idempotency_records%ROWTYPE;
 inv public.invoices%ROWTYPE; w public.wallet_accounts%ROWTYPE; wt public.wallet_transactions%ROWTYPE; pay public.payments%ROWTYPE;
 ap public.approval_requests%ROWTYPE; g public.billing_run_generations%ROWTYPE; r record; result jsonb; root text;
 amount numeric; n numeric; p numeric; delta numeric; refunded numeric:=0; target uuid; fresh jsonb; stamp timestamptz; z text; number text;
BEGIN
 IF jsonb_typeof(body)<>'object' OR length(body->>'key') NOT BETWEEN 1 AND 200 OR COALESCE(length(body->>'reason'),0)=0 THEN RAISE EXCEPTION 'INVALID_COMMAND' USING ERRCODE='22023'; END IF;
 IF op IN ('GENERATE','RECOMPUTE','TOP_UP') THEN student:=(body->>'studentId')::uuid;
 ELSIF op='REVERSE_TOP_UP_REQUEST' THEN
  SELECT x.*,a.student_id INTO r FROM public.wallet_transactions x JOIN public.wallet_accounts a ON a.tenant_id=x.tenant_id AND a.id=x.wallet_id WHERE x.tenant_id=t AND x.id=(body->>'topUpId')::uuid; student:=r.student_id;
 ELSIF op IN ('APPROVE','EXECUTE_APPROVAL') THEN
  SELECT * INTO ap FROM public.approval_requests WHERE tenant_id=t AND id=(body->>'approvalId')::uuid;
  student:=(ap.payload_snapshot_json->>'studentId')::uuid;
 ELSE SELECT * INTO inv FROM public.invoices WHERE tenant_id=t AND id=(body->>'invoiceId')::uuid; student:=inv.student_id; END IF;
 IF student IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
 m:=educore_r2.authorize(t,student,CASE WHEN op IN ('GENERATE','RECOMPUTE') THEN 'billing.generate_draft'
 WHEN op='ISSUE' THEN 'invoice.issue' WHEN op IN ('TOP_UP','PAY') THEN 'payment.record'
 WHEN op='ADJUST_REQUEST' THEN 'invoice.adjust_request' WHEN op='CANCEL_REQUEST' THEN 'invoice.cancel_request'
 WHEN op IN ('REVERSE_PAYMENT_REQUEST','REVERSE_TOP_UP_REQUEST') THEN 'payment.reverse'
 WHEN op='APPROVE' THEN 'approval.decide' WHEN op='EXECUTE_APPROVAL' THEN 'approval.execute' ELSE '__DENY__' END);
 IF op='EXECUTE_APPROVAL' THEN
  PERFORM educore_r2.authorize(t,student,CASE WHEN ap.operation_type IN ('REVERSE_TOP_UP_REQUEST','REVERSE_PAYMENT_REQUEST') THEN 'payment.reverse'
   WHEN ap.operation_type='CANCEL_REQUEST' THEN 'invoice.cancel_request' ELSE 'invoice.adjust_request' END);
 END IF;
 hash:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
 SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t AND operation_type=op AND idempotency_key=body->>'key';
 IF receipt.id IS NOT NULL THEN
  IF receipt.request_hash<>hash THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE='23505'; END IF;
  RETURN receipt.result_snapshot;
 END IF;
 SELECT id INTO policy FROM public.policy_versions WHERE tenant_id=t AND effective_from<=clock_timestamp() AND (effective_to IS NULL OR effective_to>clock_timestamp()) ORDER BY effective_from DESC,id LIMIT 1;
 IF op IN ('GENERATE','RECOMPUTE') THEN result:=educore_r2.generate(t,m,body,hash);
 ELSE
  INSERT INTO public.wallet_accounts(id,tenant_id,student_id,balance_vnd,updated_at) VALUES(gen_random_uuid(),t,student,0,clock_timestamp()) ON CONFLICT(tenant_id,student_id) DO NOTHING;
  SELECT * INTO STRICT w FROM public.wallet_accounts WHERE tenant_id=t AND student_id=student FOR UPDATE;
  -- Fixed domain order after User/Tenant: Wallet -> Invoice -> immutable rows.
  IF op IN ('APPROVE','EXECUTE_APPROVAL') THEN
   SELECT * INTO ap FROM public.approval_requests WHERE tenant_id=t AND id=ap.id FOR UPDATE;
   IF ap.target_type='Invoice' THEN SELECT * INTO inv FROM public.invoices WHERE tenant_id=t AND id=ap.target_id FOR UPDATE; END IF;
  ELSIF inv.id IS NOT NULL THEN SELECT * INTO inv FROM public.invoices WHERE tenant_id=t AND id=inv.id FOR UPDATE; END IF;
  IF op='TOP_UP' THEN
   amount:=(body->>'amountVnd')::numeric;
   IF amount<=0 OR amount<>trunc(amount) OR amount>9223372036854775807 OR body->>'method' NOT IN ('CASH','BANK_TRANSFER')
    OR COALESCE(length(body->>'receiptReference'),0)=0 OR COALESCE(length(body->>'evidence'),0)=0 THEN RAISE EXCEPTION 'INVALID_TOP_UP' USING ERRCODE='23514'; END IF;
   INSERT INTO public.wallet_transactions(id,tenant_id,wallet_id,kind,amount_vnd,source_key,operation_key,funding_method,receipt_reference,reason,evidence,recorded_by_membership_id)
   VALUES(gen_random_uuid(),t,w.id,'TOP_UP',amount::bigint,'RECEIPT:'||(body->>'method')||':'||(body->>'receiptReference'),body->>'key',body->>'method',body->>'receiptReference',body->>'reason',body->>'evidence',m) RETURNING * INTO wt;
   UPDATE public.wallet_accounts SET balance_vnd=(balance_vnd::numeric+amount)::bigint,updated_at=clock_timestamp() WHERE id=w.id;
   result:=jsonb_build_object('id',wt.id,'balanceVnd',(w.balance_vnd::numeric+amount)::bigint::text);
  ELSIF op='PAY' THEN
   PERFORM educore_r2.assert_wallet_cohort(t,inv.id);
   amount:=(body->>'amountVnd')::numeric; n:=educore_r2.net(inv.id,t); p:=educore_r2.paid(inv.id,t);
   IF inv.status<>'ISSUED' OR amount<=0 OR amount<>trunc(amount) OR amount>w.balance_vnd OR amount>n-p THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE_OR_DUE' USING ERRCODE='23514'; END IF;
   INSERT INTO public.payments(id,tenant_id,invoice_id,amount_vnd,method,paid_at,recorded_by_membership_id,evidence_note,idempotency_key)
   VALUES(gen_random_uuid(),t,inv.id,amount::bigint,'WALLET',clock_timestamp(),m,body->>'reason',body->>'key') RETURNING * INTO pay;
   INSERT INTO public.wallet_transactions(id,tenant_id,wallet_id,kind,amount_vnd,source_key,operation_key,payment_id,reason,evidence,recorded_by_membership_id)
   VALUES(gen_random_uuid(),t,w.id,'INVOICE_PAYMENT',-amount::bigint,'PAYMENT:'||pay.id,body->>'key',pay.id,body->>'reason','Explicit wallet payment',m) RETURNING * INTO wt;
   INSERT INTO public.receivable_allocations(id,tenant_id,invoice_id,payment_id,amount_vnd,allocated_at,operation_key,kind,wallet_transaction_id)
   VALUES(gen_random_uuid(),t,inv.id,pay.id,amount::bigint,clock_timestamp(),body->>'key','PAYMENT',wt.id);
   UPDATE public.wallet_accounts SET balance_vnd=balance_vnd-amount::bigint,updated_at=clock_timestamp() WHERE id=w.id;
   PERFORM educore_r2.bump(t,inv.id,false);
   result:=jsonb_build_object('id',pay.id,'balanceVnd',(w.balance_vnd-amount::bigint)::text,'outstandingVnd',(n-p-amount)::bigint::text);
  ELSIF op='ISSUE' THEN
   IF inv.status<>'DRAFT' OR inv.issued_at IS NOT NULL THEN RAISE EXCEPTION 'INVOICE_NOT_DRAFT' USING ERRCODE='23514'; END IF;
   SELECT gen.* INTO g FROM public.billing_runs br JOIN public.billing_run_generations gen ON gen.tenant_id=t AND gen.id=br.current_generation_id WHERE br.tenant_id=t AND br.id=inv.billing_run_id;
   IF g.id IS NULL OR g.id IS DISTINCT FROM (SELECT id FROM public.billing_run_generations WHERE tenant_id=t AND run_id=inv.billing_run_id ORDER BY generation_no DESC LIMIT 1) THEN RAISE EXCEPTION 'GENERATION_PENDING_OR_MISSING' USING ERRCODE='23514'; END IF;
   fresh:=educore_r2.capture(t,student,inv.period_id);
   IF educore_r2.fingerprint(fresh) IS DISTINCT FROM educore_r2.fingerprint(g.input_snapshot) OR g.status<>'DRAFT' THEN RAISE EXCEPTION 'STALE_OR_INCOMPLETE_GENERATION' USING ERRCODE='23514'; END IF;
   IF (SELECT count(*) FROM public.invoice_lines WHERE tenant_id=t AND invoice_id=inv.id)<>jsonb_array_length(fresh->'lines')
   OR inv.gross_vnd::text<>g.result_snapshot->>'grossVnd' OR inv.discount_vnd::text<>g.result_snapshot->>'discountVnd' OR inv.total_vnd::text<>g.result_snapshot->>'totalVnd'
   OR inv.policy_version_id<>g.policy_version_id
   OR EXISTS(SELECT FROM public.invoice_lines l WHERE l.tenant_id=t AND l.invoice_id=inv.id AND NOT EXISTS(SELECT FROM jsonb_array_elements(fresh->'lines') src
    WHERE src->>'participantId'=l.participant_id::text AND src->>'sessionId'=l.session_id::text
     AND (src->>'attendanceId')::uuid IS NOT DISTINCT FROM l.attendance_id AND src->>'priceRuleId'=l.price_rule_id::text
     AND (src->>'unitPriceVnd')::bigint=l.unit_price_vnd AND (src->>'units')::int=l.charge_units))
   THEN RAISE EXCEPTION 'PROJECTION_INCOMPLETE' USING ERRCODE='23514'; END IF;
   stamp:=clock_timestamp(); SELECT timezone INTO z FROM public.tenants WHERE id=t; number:=educore_r2.invoice_number(t,stamp);
   UPDATE public.invoices SET status='ISSUED',invoice_number=number,issued_at=stamp,issued_by_membership_id=m,
    due_at=educore_r2.due_date(t,stamp),snapshot_json=snapshot_json||jsonb_build_object('issuedTimezone',z,'dueRule','LOCAL_CALENDAR_7_SAME_TIME','appliedGenerationId',g.id),updated_at=stamp WHERE id=inv.id;
   INSERT INTO public.invoiced_participation_claims(id,tenant_id,participant_id,invoice_line_id,claimed_at)
   SELECT gen_random_uuid(),t,participant_id,id,stamp FROM public.invoice_lines WHERE tenant_id=t AND invoice_id=inv.id;
   result:=jsonb_build_object('id',inv.id,'status','ISSUED','invoiceNumber',number);
  ELSIF op IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_PAYMENT_REQUEST','REVERSE_TOP_UP_REQUEST') THEN
   IF op<>'REVERSE_TOP_UP_REQUEST' AND ((inv.status<>'ISSUED' AND NOT(op='REVERSE_PAYMENT_REQUEST' AND inv.status='CANCELLED')) OR inv.issued_at IS NULL) THEN RAISE EXCEPTION 'INVOICE_NOT_ISSUED' USING ERRCODE='23514'; END IF;
   IF op='REVERSE_TOP_UP_REQUEST' THEN
    SELECT * INTO STRICT wt FROM public.wallet_transactions WHERE tenant_id=t AND id=(body->>'topUpId')::uuid AND wallet_id=w.id AND kind='TOP_UP';
    target:=wt.id; n:=wt.amount_vnd; delta:=-n;
   ELSE
    n:=educore_r2.net(inv.id,t); target:=inv.id;
    IF op='CANCEL_REQUEST' THEN delta:=-n;
    ELSIF op='REVERSE_PAYMENT_REQUEST' THEN
     SELECT * INTO STRICT pay FROM public.payments WHERE tenant_id=t AND invoice_id=inv.id AND id=(body->>'paymentId')::uuid; delta:=0;
    ELSE delta:=(body->>'deltaVnd')::numeric;
     IF delta=0 OR delta<>trunc(delta) OR n+delta<0 OR n+delta>9223372036854775807 THEN RAISE EXCEPTION 'INVALID_ADJUSTMENT' USING ERRCODE='23514'; END IF;
    END IF;
   END IF;
   INSERT INTO public.approval_requests(id,tenant_id,operation_type,target_type,target_id,requester_membership_id,policy_version_id,status,reason,payload_snapshot_json,correlation_id,updated_at)
   VALUES(gen_random_uuid(),t,op,CASE WHEN op='REVERSE_TOP_UP_REQUEST' THEN 'TopUp' ELSE 'Invoice' END,target,m,policy,'PENDING_APPROVAL',body->>'reason',
    jsonb_build_object('schemaVersion',1,'studentId',student,'invoiceId',inv.id,'topUpId',wt.id,'paymentId',pay.id,'deltaVnd',delta::text,'netBeforeVnd',n::text,
     'basisHash',CASE WHEN inv.id IS NOT NULL THEN educore_r2.obligation_hash(t,inv.id) ELSE NULL END,'intent',body),gen_random_uuid(),clock_timestamp()) RETURNING * INTO ap;
   result:=jsonb_build_object('id',ap.id,'status','PENDING_APPROVAL');
  ELSIF op='APPROVE' THEN
   IF ap.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'APPROVAL_NOT_PENDING' USING ERRCODE='23514'; END IF;
   IF ap.requester_membership_id=m THEN PERFORM educore_r2.assert_self_approval(t,m); END IF;
   INSERT INTO public.approval_decisions(id,tenant_id,approval_request_id,decided_by_membership_id,decision,reason,decided_at,self_approved)
   VALUES(gen_random_uuid(),t,ap.id,m,'APPROVE',body->>'reason',clock_timestamp(),ap.requester_membership_id=m);
   UPDATE public.approval_requests SET status='APPROVED',decided_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=ap.id;
   result:=jsonb_build_object('id',ap.id,'status','APPROVED');
  ELSIF op='EXECUTE_APPROVAL' THEN
   root:='APPROVAL:'||ap.id;
   SELECT * INTO receipt FROM public.idempotency_records WHERE tenant_id=t AND operation_type='ROOT_EFFECT' AND idempotency_key=root;
   IF receipt.id IS NOT NULL THEN RETURN receipt.result_snapshot; END IF;
   IF ap.status<>'APPROVED' OR NOT EXISTS(SELECT FROM public.approval_decisions WHERE tenant_id=t AND approval_request_id=ap.id AND decision='APPROVE') THEN RAISE EXCEPTION 'NOT_APPROVED' USING ERRCODE='23514'; END IF;
   PERFORM educore_r2.authorize(t,student,CASE WHEN ap.operation_type IN ('REVERSE_TOP_UP_REQUEST','REVERSE_PAYMENT_REQUEST') THEN 'payment.reverse' WHEN ap.operation_type='CANCEL_REQUEST' THEN 'invoice.cancel_request' ELSE 'invoice.adjust_request' END);
   IF inv.id IS NOT NULL THEN
    PERFORM educore_r2.assert_wallet_cohort(t,inv.id);
    IF (inv.status<>'ISSUED' AND NOT(ap.operation_type='REVERSE_PAYMENT_REQUEST' AND inv.status='CANCELLED')) OR educore_r2.obligation_hash(t,inv.id) IS DISTINCT FROM ap.payload_snapshot_json->>'basisHash' THEN RAISE EXCEPTION 'APPROVED_BASIS_CHANGED' USING ERRCODE='23514'; END IF;
   END IF;
   IF ap.operation_type='REVERSE_TOP_UP_REQUEST' THEN
    SELECT * INTO STRICT wt FROM public.wallet_transactions WHERE tenant_id=t AND id=ap.target_id AND wallet_id=w.id AND kind='TOP_UP';
    IF w.balance_vnd<wt.amount_vnd THEN RAISE EXCEPTION 'INSUFFICIENT_AVAILABLE_BALANCE' USING ERRCODE='23514'; END IF;
    INSERT INTO public.wallet_transactions(id,tenant_id,wallet_id,kind,amount_vnd,source_key,operation_key,reversed_top_up_id,reason,evidence,recorded_by_membership_id)
    VALUES(gen_random_uuid(),t,w.id,'TOP_UP_REVERSAL',-wt.amount_vnd,root,body->>'key',wt.id,ap.reason,'Approved full reversal '||ap.id,m);
    UPDATE public.wallet_accounts SET balance_vnd=balance_vnd-wt.amount_vnd,updated_at=clock_timestamp() WHERE id=w.id;
   ELSIF ap.operation_type='REVERSE_PAYMENT_REQUEST' THEN
    SELECT * INTO STRICT pay FROM public.payments WHERE tenant_id=t AND invoice_id=inv.id AND id=(ap.payload_snapshot_json->>'paymentId')::uuid;
    INSERT INTO public.payment_reversals(id,tenant_id,payment_id,amount_vnd,reason,reversed_by_membership_id,reversed_at,approval_request_id,operation_key)
    VALUES(gen_random_uuid(),t,pay.id,pay.amount_vnd,ap.reason,m,clock_timestamp(),ap.id,root);
    SELECT COALESCE(sum(amount_vnd),0) INTO amount FROM public.receivable_allocations WHERE tenant_id=t AND payment_id=pay.id;
    PERFORM educore_r2.release_payment(t,pay.id,amount,root,m,ap.reason); refunded:=amount;
    PERFORM educore_r2.bump(t,inv.id,false);
   ELSE
    delta:=(ap.payload_snapshot_json->>'deltaVnd')::numeric;
    IF educore_r2.net(inv.id,t)+delta<0 THEN RAISE EXCEPTION 'NEGATIVE_OBLIGATION' USING ERRCODE='23514'; END IF;
    INSERT INTO public.invoice_adjustments(id,tenant_id,invoice_id,approval_request_id,adjustment_kind,delta_vnd,reason,status,applied_at,applied_by_membership_id,operation_key,updated_at)
    VALUES(gen_random_uuid(),t,inv.id,ap.id,CASE WHEN ap.operation_type='CANCEL_REQUEST' THEN 'CANCELLATION'::public."InvoiceAdjustmentKind" ELSE 'AMOUNT'::public."InvoiceAdjustmentKind" END,
     delta::bigint,ap.reason,'APPLIED',clock_timestamp(),m,root,clock_timestamp());
    refunded:=educore_r2.refund_excess(t,inv.id,root,m,ap.reason);
    PERFORM educore_r2.bump(t,inv.id,ap.operation_type='CANCEL_REQUEST');
   END IF;
   UPDATE public.approval_requests SET status='COMPLETED',updated_at=clock_timestamp() WHERE id=ap.id;
   result:=jsonb_build_object('id',ap.id,'status','COMPLETED','refundVnd',refunded::bigint::text);
   INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_ref_type,result_ref_id,result_snapshot,updated_at)
   VALUES(gen_random_uuid(),t,'ROOT_EFFECT',root,encode(sha256(convert_to(ap.payload_snapshot_json::text,'UTF8')),'hex'),'COMPLETED','Approval',ap.id,result,clock_timestamp());
  ELSE RAISE EXCEPTION 'COMMAND_NOT_SUPPORTED' USING ERRCODE='22023'; END IF;
  PERFORM educore_r2.audit(t,m,op,(result->>'id')::uuid,body||result,policy);
 END IF;
 INSERT INTO public.idempotency_records(id,tenant_id,operation_type,idempotency_key,request_hash,status,result_ref_type,result_ref_id,result_snapshot,updated_at)
 VALUES(gen_random_uuid(),t,op,body->>'key',hash,'COMPLETED','R2',(result->>'id')::uuid,result,clock_timestamp());
 RETURN result;
END $$;

CREATE FUNCTION educore_r2.assert_wallet_cohort(t uuid,i uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.invoices inv JOIN public.billing_runs br ON br.tenant_id=t AND br.id=inv.billing_run_id
 WHERE inv.tenant_id=t AND inv.id=i AND br.current_generation_id IS NOT NULL)
 OR EXISTS(SELECT FROM public.payments WHERE tenant_id=t AND invoice_id=i AND method<>'WALLET')
 OR EXISTS(SELECT FROM public.payment_excess_resolutions WHERE tenant_id=t AND invoice_id=i)
 THEN RAISE EXCEPTION 'UNSUPPORTED_LEGACY_MIXED_OR_EXCESS_CASE' USING ERRCODE='23514'; END IF;
END $$;

CREATE FUNCTION educore_r2.obligation_hash(t uuid,i uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('invoice',i,'total',inv.total_vnd::text,'status',inv.status,
 'adjustments',COALESCE((SELECT jsonb_agg(jsonb_build_array(id,delta_vnd::text) ORDER BY id) FROM public.invoice_adjustments WHERE tenant_id=t AND invoice_id=i AND status='APPLIED'),'[]'))::text,'UTF8')),'hex')
 FROM public.invoices inv WHERE inv.tenant_id=t AND inv.id=i;
$$;

CREATE FUNCTION educore_r2.assert_self_approval(t uuid,m uuid) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT FROM public.membership_roles mr JOIN public.roles r ON r.tenant_id=t AND r.id=mr.role_id
  WHERE mr.tenant_id=t AND mr.membership_id=m AND mr.revoked_at IS NULL AND r.code='MANAGER')
 OR EXISTS(SELECT FROM public.tenant_memberships tm JOIN public.users u ON u.id=tm.user_id AND u.status='ACTIVE'
  JOIN public.membership_roles mr ON mr.tenant_id=t AND mr.membership_id=tm.id AND mr.revoked_at IS NULL
  JOIN public.role_permissions rp ON rp.tenant_id=t AND rp.role_id=mr.role_id
  JOIN public.permissions p ON p.id=rp.permission_id AND p.code='approval.decide'
  WHERE tm.tenant_id=t AND tm.id<>m AND tm.status='ACTIVE' AND tm.left_at IS NULL)
 THEN RAISE EXCEPTION 'SEPARATE_APPROVER_REQUIRED' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION educore_r2.bump(t uuid,i uuid,cancel boolean) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN
 INSERT INTO educore_r2.effect_permits VALUES(txid_current(),i,CASE WHEN cancel THEN 'CANCEL' ELSE 'REVISION' END);
 UPDATE public.invoices SET financial_revision=financial_revision+1,status=CASE WHEN cancel THEN 'CANCELLED'::public."InvoiceStatus" ELSE status END,updated_at=clock_timestamp() WHERE tenant_id=t AND id=i;
 DELETE FROM educore_r2.effect_permits WHERE tx=txid_current() AND invoice_id=i;
END $$;

-- Replace only this precise predicate in the original function definition.
-- All identity/history/period/claim checks remain. Permit allows only one
-- revision increment and optionally ISSUED->CANCELLED, never issued basis edits.
DO $guard$
DECLARE ddl text; needle text := 'IF frozen AND (TG_OP';
BEGIN
 SELECT pg_get_functiondef('educore_private.r1b_billing_guard()'::regprocedure) INTO ddl;
 IF position(needle IN ddl)=0 THEN RAISE EXCEPTION 'Unexpected R1b guard definition'; END IF;
 ddl:=replace(ddl,needle,$replacement$IF frozen AND NOT (TG_OP='UPDATE' AND OLD.status IN ('ISSUED','CANCELLED')
  AND NEW.status IN ('ISSUED','CANCELLED') AND NEW.financial_revision=OLD.financial_revision+1
  AND (to_jsonb(NEW)-ARRAY['updated_at','financial_revision','status'])=(to_jsonb(OLD)-ARRAY['updated_at','financial_revision','status'])
  AND EXISTS(SELECT FROM educore_r2.effect_permits p WHERE p.tx=txid_current() AND p.invoice_id=OLD.id
    AND ((p.operation='CANCEL' AND NEW.status='CANCELLED') OR (p.operation='REVISION' AND NEW.status=OLD.status)))) AND (TG_OP$replacement$);
 EXECUTE ddl;
END $guard$;

CREATE FUNCTION educore_r2.source_gate() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN
 PERFORM educore_private.r1b_lock_tenant(CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END);
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.tenant_id) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id) THEN RAISE EXCEPTION 'SOURCE_IDENTITY_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER r2_absence_gate BEFORE INSERT OR UPDATE OR DELETE ON public.absence_requests FOR EACH ROW EXECUTE FUNCTION educore_r2.source_gate();
CREATE TRIGGER r2_sibling_gate BEFORE INSERT OR UPDATE OR DELETE ON public.verified_sibling_relationships FOR EACH ROW EXECUTE FUNCTION educore_r2.source_gate();

CREATE FUNCTION educore_r2.fingerprint(snapshot jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,educore_r2,pg_temp AS $$
 SELECT jsonb_set(snapshot,'{lines}',COALESCE((SELECT jsonb_agg(value-ARRAY['priceEffectiveTo','sessionRevision','attendanceRevision','finalizationRevision'] ORDER BY value->>'participantId') FROM jsonb_array_elements(snapshot->'lines')),'[]'));
$$;

CREATE FUNCTION educore_r2.price_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE t uuid; z text; safe_future_close boolean:=false;
BEGIN
 t:=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END;
 PERFORM educore_private.r1b_lock_tenant(t); SELECT timezone INTO z FROM public.tenants WHERE id=t;
 IF TG_OP<>'INSERT' THEN
  IF TG_OP='UPDATE' THEN
   safe_future_close:=(to_jsonb(NEW)-ARRAY['effective_to','updated_at'])=(to_jsonb(OLD)-ARRAY['effective_to','updated_at'])
    AND NEW.effective_to>(clock_timestamp() AT TIME ZONE z)::date AND (OLD.effective_to IS NULL OR NEW.effective_to<=OLD.effective_to)
    AND NOT EXISTS(SELECT FROM public.billing_run_generations g,jsonb_array_elements(g.input_snapshot->'lines') l WHERE g.tenant_id=t AND l->>'priceRuleId'=OLD.id::text AND (l->>'localDate')::date>=NEW.effective_to);
  END IF;
  IF NOT safe_future_close AND (EXISTS(SELECT FROM public.invoice_lines WHERE tenant_id=t AND price_rule_id=OLD.id)
  OR EXISTS(SELECT FROM public.billing_run_generations g,jsonb_array_elements(g.input_snapshot->'lines') l WHERE g.tenant_id=t AND l->>'priceRuleId'=OLD.id::text)
  OR OLD.effective_from<=(clock_timestamp() AT TIME ZONE z)::date) THEN RAISE EXCEPTION 'PRICE_HISTORY_PROTECTED' USING ERRCODE='23514'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF NEW.unit_price_vnd<0 OR NEW.effective_to<=NEW.effective_from
 OR NOT ((NEW.scope_kind='SESSION' AND NEW.session_id IS NOT NULL AND NEW.class_id IS NULL AND NEW.course_id IS NULL)
 OR (NEW.scope_kind='CLASS' AND NEW.class_id IS NOT NULL AND NEW.course_id IS NULL AND NEW.session_id IS NULL)
 OR (NEW.scope_kind='COURSE' AND NEW.course_id IS NOT NULL AND NEW.class_id IS NULL AND NEW.session_id IS NULL))
 OR (NEW.created_at AT TIME ZONE z)::date>NEW.effective_from THEN RAISE EXCEPTION 'PRICE_SHAPE_OR_BACKDATE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.price_rules p WHERE p.tenant_id=t AND p.id<>NEW.id AND p.scope_kind=NEW.scope_kind
 AND COALESCE(p.session_id,p.class_id,p.course_id)=COALESCE(NEW.session_id,NEW.class_id,NEW.course_id)
 AND daterange(p.effective_from,p.effective_to,'[)') && daterange(NEW.effective_from,NEW.effective_to,'[)')) THEN RAISE EXCEPTION 'PRICE_WINDOW_OVERLAP' USING ERRCODE='23P01'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r2_price_guard BEFORE INSERT OR UPDATE OR DELETE ON public.price_rules FOR EACH ROW EXECUTE FUNCTION educore_r2.price_guard();

CREATE FUNCTION educore_r2.approval_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['status','updated_at','decided_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','updated_at','decided_at'])
 OR current_user<>'educore_r2_owner' THEN RAISE EXCEPTION 'APPROVAL_PAYLOAD_IMMUTABLE_OR_UNAUTHORIZED' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r2_approval_guard BEFORE UPDATE OR DELETE ON public.approval_requests FOR EACH ROW WHEN(OLD.operation_type IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_PAYMENT_REQUEST','REVERSE_TOP_UP_REQUEST')) EXECUTE FUNCTION educore_r2.approval_guard();

CREATE FUNCTION educore_r2.discount_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE t uuid; i uuid;
BEGIN
 t:=CASE WHEN TG_OP='INSERT' THEN NEW.tenant_id ELSE OLD.tenant_id END;
 i:=CASE WHEN TG_OP='INSERT' THEN NEW.invoice_id ELSE OLD.invoice_id END;
 PERFORM educore_private.r1b_lock_tenant(t);
 IF EXISTS(SELECT FROM public.invoices WHERE tenant_id=t AND id=i AND (status<>'DRAFT' OR issued_at IS NOT NULL OR invoice_number IS NOT NULL))
 THEN RAISE EXCEPTION 'ISSUED_DISCOUNT_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND ROW(NEW.id,NEW.tenant_id,NEW.invoice_id) IS DISTINCT FROM ROW(OLD.id,OLD.tenant_id,OLD.invoice_id) THEN RAISE EXCEPTION 'DISCOUNT_OWNER_IMMUTABLE' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER r2_discount_guard BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_discounts FOR EACH ROW EXECUTE FUNCTION educore_r2.discount_guard();
CREATE TRIGGER r2_policy_history BEFORE UPDATE OR DELETE ON public.policy_versions FOR EACH ROW EXECUTE FUNCTION educore_r2.immutable();

CREATE FUNCTION educore_r2.pointer_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,educore_r2,pg_temp AS $$
BEGIN
 IF NEW.current_generation_id IS DISTINCT FROM OLD.current_generation_id AND current_user<>'educore_r2_owner'
 THEN RAISE EXCEPTION 'APPLIED_POINTER_REQUIRES_COMMAND_CAS' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r2_pointer_guard BEFORE UPDATE ON public.billing_runs FOR EACH ROW EXECUTE FUNCTION educore_r2.pointer_guard();

CREATE FUNCTION educore_r2.issued_source_guard() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE source_date date; source_start timestamptz; source_class uuid;
BEGIN
 PERFORM educore_private.r1b_lock_tenant(NEW.tenant_id);
 IF TG_TABLE_NAME='class_sessions' THEN source_start:=NEW.starts_at; source_class:=NEW.class_id;
 ELSE SELECT starts_at INTO source_start FROM public.class_sessions WHERE tenant_id=NEW.tenant_id AND id=NEW.session_id; END IF;
 SELECT (source_start AT TIME ZONE timezone)::date INTO source_date FROM public.tenants WHERE id=NEW.tenant_id;
 IF EXISTS(SELECT FROM public.invoices i JOIN public.billing_periods bp ON bp.tenant_id=i.tenant_id AND bp.id=i.period_id
 JOIN public.billing_runs br ON br.tenant_id=i.tenant_id AND br.id=i.billing_run_id
 WHERE i.tenant_id=NEW.tenant_id AND i.issued_at IS NOT NULL AND br.current_generation_id IS NOT NULL
 AND source_date>=bp.month_start AND source_date<bp.month_end AND
 ((TG_TABLE_NAME='class_sessions' AND EXISTS(SELECT FROM public.enrollments e WHERE e.tenant_id=NEW.tenant_id AND e.student_id=i.student_id AND e.class_id=source_class AND e.effective_from<=source_start AND (e.effective_to IS NULL OR source_start<e.effective_to)))
 OR (TG_TABLE_NAME='session_participants' AND i.student_id=(to_jsonb(NEW)->>'student_id')::uuid)))
 THEN RAISE EXCEPTION 'ISSUED_SOURCE_COMPLETENESS_REQUIRES_REVIEWED_CORRECTION' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER r2_issued_session_insert BEFORE INSERT ON public.class_sessions FOR EACH ROW EXECUTE FUNCTION educore_r2.issued_source_guard();
CREATE TRIGGER r2_issued_participant_insert BEFORE INSERT ON public.session_participants FOR EACH ROW EXECUTE FUNCTION educore_r2.issued_source_guard();

CREATE FUNCTION educore_r2.reconcile() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE t uuid:=NEW.tenant_id;
BEGIN
 IF EXISTS(SELECT FROM public.wallet_accounts w WHERE w.tenant_id=t AND (w.balance_vnd<0 OR w.balance_vnd::numeric<>(SELECT COALESCE(sum(x.amount_vnd),0) FROM public.wallet_transactions x WHERE x.tenant_id=t AND x.wallet_id=w.id))) THEN RAISE EXCEPTION 'WALLET_BALANCE_RECONCILIATION' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.wallet_transactions x JOIN public.wallet_accounts w ON w.tenant_id=t AND w.id=x.wallet_id LEFT JOIN public.payments p ON p.tenant_id=t AND p.id=x.payment_id LEFT JOIN public.invoices i ON i.tenant_id=t AND i.id=p.invoice_id
  WHERE x.tenant_id=t AND x.payment_id IS NOT NULL AND (p.method<>'WALLET' OR i.student_id<>w.student_id OR NOT EXISTS(SELECT FROM public.receivable_allocations a WHERE a.tenant_id=t AND a.wallet_transaction_id=x.id AND a.payment_id=p.id AND a.invoice_id=i.id AND a.amount_vnd=-x.amount_vnd))) THEN RAISE EXCEPTION 'WALLET_ALLOCATION_PAIR' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.wallet_transactions x LEFT JOIN public.wallet_transactions original ON original.tenant_id=t AND original.id=x.reversed_top_up_id
 WHERE x.tenant_id=t AND x.kind='TOP_UP_REVERSAL' AND (original.id IS NULL OR original.kind<>'TOP_UP' OR original.wallet_id<>x.wallet_id OR original.amount_vnd<>-x.amount_vnd)) THEN RAISE EXCEPTION 'TOP_UP_REVERSAL_SOURCE' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.payments p WHERE p.tenant_id=t AND p.method='WALLET' AND
  ((SELECT COALESCE(sum(amount_vnd),0) FROM public.receivable_allocations a WHERE a.tenant_id=t AND a.payment_id=p.id) NOT BETWEEN 0 AND p.amount_vnd
  OR NOT EXISTS(SELECT FROM public.wallet_transactions x WHERE x.tenant_id=t AND x.payment_id=p.id AND x.kind='INVOICE_PAYMENT' AND x.amount_vnd=-p.amount_vnd)
  OR NOT EXISTS(SELECT FROM public.receivable_allocations a WHERE a.tenant_id=t AND a.payment_id=p.id AND a.kind='PAYMENT' AND a.amount_vnd=p.amount_vnd)
  OR (EXISTS(SELECT FROM public.payment_reversals r WHERE r.tenant_id=t AND r.payment_id=p.id) AND (SELECT sum(amount_vnd) FROM public.receivable_allocations a WHERE a.tenant_id=t AND a.payment_id=p.id)<>0))) THEN RAISE EXCEPTION 'PAYMENT_ALLOCATION_RECONCILIATION' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.invoices i JOIN public.billing_runs br ON br.tenant_id=t AND br.id=i.billing_run_id WHERE i.tenant_id=t AND i.status<>'DRAFT' AND br.current_generation_id IS NOT NULL
 AND (educore_r2.net(i.id,t)<0 OR educore_r2.paid(i.id,t)>educore_r2.net(i.id,t))) THEN RAISE EXCEPTION 'INVOICE_NET_RECONCILIATION' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT FROM public.approval_requests a WHERE a.tenant_id=t AND a.status='COMPLETED' AND a.operation_type IN ('ADJUST_REQUEST','CANCEL_REQUEST','REVERSE_PAYMENT_REQUEST','REVERSE_TOP_UP_REQUEST')
 AND NOT EXISTS(SELECT FROM public.idempotency_records ir WHERE ir.tenant_id=t AND ir.operation_type='ROOT_EFFECT' AND ir.idempotency_key='APPROVAL:'||a.id)) THEN RAISE EXCEPTION 'COMPLETED_WITHOUT_ROOT_RECEIPT' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER r2_reconcile_wallet AFTER INSERT OR UPDATE ON public.wallet_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();
CREATE CONSTRAINT TRIGGER r2_reconcile_transactions AFTER INSERT ON public.wallet_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();
CREATE CONSTRAINT TRIGGER r2_reconcile_allocations AFTER INSERT ON public.receivable_allocations DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();
CREATE CONSTRAINT TRIGGER r2_reconcile_payments AFTER INSERT ON public.payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();
CREATE CONSTRAINT TRIGGER r2_reconcile_adjustments AFTER INSERT ON public.invoice_adjustments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();
CREATE CONSTRAINT TRIGGER r2_reconcile_reversals AFTER INSERT ON public.payment_reversals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();
CREATE CONSTRAINT TRIGGER r2_reconcile_approvals AFTER UPDATE ON public.approval_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION educore_r2.reconcile();

CREATE FUNCTION educore_r2.summary(t uuid,student uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE m uuid; result jsonb;
BEGIN
 m:=educore_r2.authorize(t,student,'invoice.read');
 SELECT jsonb_build_object('studentId',student,'balanceVnd',COALESCE(w.balance_vnd,0)::text,
 'transactions',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'kind',x.kind,'amountVnd',x.amount_vnd::text,'createdAt',x.created_at) ORDER BY x.created_at,x.id)
 FROM (SELECT * FROM public.wallet_transactions WHERE tenant_id=t AND wallet_id=w.id ORDER BY created_at DESC,id DESC LIMIT 100) x),'[]')) INTO result
 FROM (SELECT 1) seed LEFT JOIN public.wallet_accounts w ON w.tenant_id=t AND w.student_id=student;
 RETURN result;
END $$;

CREATE FUNCTION educore_r2.invoice_number(t uuid,stamp timestamptz) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE y int; seq bigint;
BEGIN
 SELECT extract(year FROM stamp AT TIME ZONE timezone)::int INTO y FROM public.tenants WHERE id=t;
 INSERT INTO public.invoice_number_counters(tenant_id,year,next_value) VALUES(t,y,2)
 ON CONFLICT(tenant_id,year) DO UPDATE SET next_value=public.invoice_number_counters.next_value+1 RETURNING next_value-1 INTO seq;
 RETURN 'INV-'||y||'-'||lpad(seq::text,greatest(6,length(seq::text)),'0');
END $$;
CREATE FUNCTION educore_r2.due_date(t uuid,stamp timestamptz) RETURNS timestamptz
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE z text; local_due timestamp; resolved timestamptz;
BEGIN
 SELECT timezone INTO z FROM public.tenants WHERE id=t;
 local_due:=(stamp AT TIME ZONE z)+interval '7 days'; resolved:=local_due AT TIME ZONE z;
 IF resolved AT TIME ZONE z<>local_due THEN RAISE EXCEPTION 'DUE_LOCAL_TIME_GAP_REQUIRES_POLICY' USING ERRCODE='23514'; END IF;
 -- Ambiguous repeated wall times use PostgreSQL's standard-offset resolution.
 RETURN resolved;
END
$$;

-- Post-rollback reconciliation of an explicit execution attempt. Never asserts
-- a failure from an uncertain COMMIT: waits on the same anchors and checks the
-- durable root. Audit records only the observed APPROVED/no-effect state.
CREATE FUNCTION educore_r2.execution_outcome(t uuid,approval uuid,operation_key text) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE ap public.approval_requests%ROWTYPE; m uuid; result jsonb;
BEGIN
 SELECT * INTO ap FROM public.approval_requests WHERE tenant_id=t AND id=approval;
 IF ap.id IS NULL THEN RETURN NULL; END IF;
 m:=educore_r2.authorize(t,(ap.payload_snapshot_json->>'studentId')::uuid,'approval.execute');
 PERFORM educore_r2.authorize(t,(ap.payload_snapshot_json->>'studentId')::uuid,CASE WHEN ap.operation_type IN ('REVERSE_TOP_UP_REQUEST','REVERSE_PAYMENT_REQUEST') THEN 'payment.reverse'
 WHEN ap.operation_type='CANCEL_REQUEST' THEN 'invoice.cancel_request' ELSE 'invoice.adjust_request' END);
 SELECT result_snapshot INTO result FROM public.idempotency_records WHERE tenant_id=t AND operation_type='ROOT_EFFECT' AND idempotency_key='APPROVAL:'||approval;
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF EXISTS(SELECT FROM public.approval_requests WHERE tenant_id=t AND id=approval AND status='APPROVED')
 AND NOT EXISTS(SELECT FROM public.audit_logs WHERE tenant_id=t AND entity_id=approval AND action='EXECUTION_NO_EFFECT' AND after_json->>'operationKey'=operation_key) THEN
  PERFORM educore_r2.audit(t,m,'EXECUTION_NO_EFFECT',approval,jsonb_build_object('operationKey',operation_key,'observedState','APPROVED','effect','NONE','reason','Post-rollback reconciliation'),ap.policy_version_id);
 END IF;
 RETURN NULL;
END $$;

CREATE FUNCTION educore_r2.receivable(t uuid,invoice uuid) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,educore_r2,pg_temp AS $$
DECLARE i public.invoices%ROWTYPE; n numeric; p numeric;
BEGIN
 SELECT * INTO i FROM public.invoices WHERE tenant_id=t AND id=invoice;
 IF i.id IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_ACCESSIBLE' USING ERRCODE='42501'; END IF;
 PERFORM educore_r2.authorize(t,i.student_id,'invoice.read');
 SELECT * INTO STRICT i FROM public.invoices WHERE tenant_id=t AND id=invoice;
 PERFORM educore_r2.assert_wallet_cohort(t,i.id);
 n:=educore_r2.net(i.id,t); p:=educore_r2.paid(i.id,t);
 RETURN jsonb_build_object('invoiceId',i.id,'status',i.status,'originalTotalVnd',i.total_vnd::text,'netObligationVnd',n::bigint::text,
 'netAllocatedVnd',p::bigint::text,'outstandingVnd',CASE WHEN i.status='DRAFT' THEN '0' ELSE greatest(n-p,0)::bigint::text END,'financialRevision',i.financial_revision::text,'asOf',clock_timestamp());
END $$;

-- Transfer only the newly created functions. No PUBLIC/default EXECUTE leak.
DO $owners$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r2' LOOP
 EXECUTE format('ALTER FUNCTION %s OWNER TO educore_r2_owner',f.signature); END LOOP;
END $owners$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_r2 FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE educore_r2_owner REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
GRANT EXECUTE ON FUNCTION educore_r2.execute(uuid,jsonb),educore_r2.summary(uuid,uuid) TO educore_r2_command;
GRANT EXECUTE ON FUNCTION educore_r2.execution_outcome(uuid,uuid,text) TO educore_r2_command;
GRANT EXECUTE ON FUNCTION educore_r2.receivable(uuid,uuid) TO educore_r2_command;
COMMIT;
