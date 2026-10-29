import type { BillingData } from '../BillingTypes.ts'

export type PeriodGenerationRow = {
  id: string; runId: string; studentId: string; status: string; createdAt: string;
  reason: string; missing: string[]; invoiceId: string | null; current: boolean
}
export type PeriodRow = {
  id: string; monthStart: string; status: string; timezone: string;
  draftCount: number | null; issuedCount: number | null; generations: PeriodGenerationRow[];
  sampleReadiness?: string
}
export type BillingPeriodsModel = {
  periods: PeriodRow[]; page: number; pageSize: number; total: number;
  selectedPeriodId: string; selectedStudentId: string; studentChoices: { id: string; name: string; code: string }[];
  studentTotal: number | null; sample: boolean
}
type ProductionPage = { items: PeriodRow[]; page: number; pageSize: number; total: number }

export function fromPeriodPage(page: ProductionPage, students: { id: string; name: string; code: string }[],
  studentTotal: number | null, selectedPeriodId: string, selectedStudentId: string): BillingPeriodsModel {
  return { periods: page.items, page: page.page, pageSize: page.pageSize, total: page.total,
    selectedPeriodId: selectedPeriodId || page.items[0]?.id || '', selectedStudentId, studentChoices: students, studentTotal, sample: false }
}
export function fromPeriodFixture(data: BillingData, selectedPeriodId: string, sample = true): BillingPeriodsModel {
  const periods = data.periods.map(period => ({ id: period.id, monthStart: period.label, status: period.ready ? 'OPEN' : 'NEEDS_INFORMATION',
    timezone: period.sourceTimeZone, draftCount: Number(period.draftCount), issuedCount: null,
    sampleReadiness: period.ready ? period.attendance : 'NEEDS_INFORMATION · ' + period.attendance,
    generations: data.generations.filter(g => g.period === period.id).map(g => ({
      id: g.id, runId: g.runId, studentId: sample ? 'Dữ liệu mẫu' : 'Học sinh trong tập được cấp', status: g.status, createdAt: g.startedAt,
      reason: g.reason ?? '', missing: [], invoiceId: null, current: g.current,
    })) }))
  return { periods, page: 1, pageSize: periods.length || 1, total: periods.length,
    selectedPeriodId, selectedStudentId: '', studentChoices: [], studentTotal: null, sample }
}
