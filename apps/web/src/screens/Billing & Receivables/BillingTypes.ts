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

export type BillingData = {
  priceRules: PriceRule[]; priceMissingCount: string; latestPriceEffectiveDate: string; siblingEligibility: SiblingEligibility[];
  periods: BillingPeriod[]; generations: BillingGeneration[];
}
