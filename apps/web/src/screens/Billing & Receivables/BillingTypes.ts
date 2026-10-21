export type PriceRule = {
  id: string; scope: 'SESSION' | 'CLASS' | 'COURSE'; target: string; amountVnd: string;
  effectiveFrom: string; effectiveTo?: string; policy: string;
  status: 'ACTIVE' | 'INACTIVE' | 'HISTORICAL' | 'OVERLAP';
}

export type SiblingEligibility = {
  id: string; studentNames: string; evidence: 'VERIFIED' | 'UNVERIFIED' | 'REVOKED';
  enrollment: 'ACTIVE' | 'INACTIVE'; eligible: boolean; evidenceNote: string;
}

export type BillingGeneration = {
  id: string; runId: string; period: string; startedAt: string;
  status: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'NEEDS_INFORMATION' | 'STALE_GENERATION';
  draftCount?: string; reason?: string; current: boolean; diff?: string;
}

export type BillingPeriod = {
  id: string; label: string; attendance: string; price: string; policy: string; sourceReadyCount: string;
  ready: boolean; draftCount: string; sourceTimeZone: string;
}

export type BillingLine = {
  id: string; sessionId: string; className: string; sourceBusinessDate: string; timeZone: string;
  attendance: 'ATTENDED' | 'UNEXCUSED' | 'EXCUSED' | 'CANCELLED'; chargeUnit: '0' | '1';
  priceRuleId: string; priceScope: PriceRule['scope']; effectiveFrom: string; effectiveTo?: string;
  unitPriceVnd: string; amountVnd: string; sourceConfirmed: boolean;
}

export type BillingDraft = {
  id: string; studentId: string; studentName: string; period: string;
  status: 'DRAFT' | 'NEEDS_INFORMATION' | 'FAILED';
  reviewState: 'READY' | 'STALE_SOURCE' | 'STALE_GENERATION' | 'PENDING_APPROVAL' | 'NEEDS_INFORMATION' | 'FAILED';
  generationId: string; currentGenerationId: string; policyVersion: string; timeZone: string;
  grossVnd?: string; discountVnd?: string; netVnd?: string; siblingVerified: boolean;
  lines: BillingLine[]; warnings: string[];
}

export type BillingPayment = {
  id: string; receivedAt: string; method: 'WALLET' | 'CASH' | 'BANK_TRANSFER';
  amountVnd: string; allocatedVnd: string; status: 'APPLIED' | 'REVERSED'; receiptRef: string;
}

export type BillingAdjustmentHistory = {
  id: string; kind: 'ADJUSTMENT' | 'CANCELLATION'; decision: 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  execution: 'NOT_STARTED' | 'COMPLETED' | 'FAILED'; occurredAt: string; note: string; walletCreditVnd?: string;
}

export type BillingInvoice = {
  id: string; number: string; studentId: string; studentName: string; period: string;
  status: 'ISSUED' | 'CANCELLED'; settlement: 'UNPAID' | 'PARTIAL' | 'SETTLED'; overdue: boolean;
  issuedAt: string; dueAt: string; policyVersion: string; generationId: string; timeZone: string;
  originalObligationVnd: string; adjustedObligationVnd: string; allocatedVnd: string;
  outstandingVnd: string; walletAvailableVnd: string; verifiedCashReceivedVnd: string;
  sourceType: 'PURE_WALLET' | 'LEGACY_MIXED'; lines: BillingLine[];
  payments: BillingPayment[]; adjustments: BillingAdjustmentHistory[];
}

export type BillingData = {
  priceRules: PriceRule[]; priceMissingCount: string; latestPriceEffectiveDate: string; siblingEligibility: SiblingEligibility[];
  periods: BillingPeriod[]; generations: BillingGeneration[]; drafts: BillingDraft[]; invoices: BillingInvoice[];
  draftEstimatedTotalVnd: string; issuedOutstandingTotalVnd: string;
}
