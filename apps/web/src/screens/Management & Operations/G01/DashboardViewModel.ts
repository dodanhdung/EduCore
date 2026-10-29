import { ApiError } from '../../../api.ts'
import type { ManagementData } from '../ManagementTypes.ts'

export const overviewPath = (tenantId: string) => `/api/v1/tenants/${encodeURIComponent(tenantId)}/portal/overview`

export type DashboardViewModel = {
  tenantName: string
  scope: string
  timeZone: string
  asOf: string
  students: number | null
  classes: number | null
  outstandingVnd: string | null
}

function invalid(): never { throw new ApiError(502, 'INVALID_RESPONSE') }
function text(value: unknown): value is string { return typeof value === 'string' && value.trim().length > 0 }
function count(value: unknown): value is number | null {
  return value === null || typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/** Rejects malformed or cross-tenant API data before any KPI reaches presentation. */
export function fromOverviewResponse(value: unknown, tenantId: string): DashboardViewModel {
  if (!value || typeof value !== 'object') return invalid()
  const row = value as Record<string, unknown>
  if (row.tenantId !== tenantId || !text(row.tenantName) || !text(row.scope)
    || !text(row.timeZone) || !text(row.asOf) || !Number.isFinite(Date.parse(row.asOf))
    || !count(row.students) || !count(row.classes)
    || !(row.outstandingVnd === null || typeof row.outstandingVnd === 'string' && /^(0|[1-9]\d*)$/.test(row.outstandingVnd))) return invalid()
  try { new Intl.DateTimeFormat('vi-VN', { timeZone: row.timeZone }) } catch { return invalid() }
  return {
    tenantName: row.tenantName, scope: row.scope, timeZone: row.timeZone, asOf: row.asOf,
    students: row.students, classes: row.classes, outstandingVnd: row.outstandingVnd,
  }
}

/** DEV fixture adapter: no fixture data or preview flag enters the production path. */
export function fromManagementFixture(data: Pick<ManagementData, 'tenantId' | 'tenantName' | 'timezone' | 'asOf' | 'scope' | 'dashboard'>): DashboardViewModel {
  return fromOverviewResponse({ tenantId: data.tenantId, tenantName: data.tenantName, timeZone: data.timezone,
    asOf: data.asOf, scope: data.scope, students: data.dashboard.students,
    classes: data.dashboard.classes, outstandingVnd: data.dashboard.outstandingVnd }, data.tenantId)
}

export function formatVnd(value: string) { return `${BigInt(value).toLocaleString('vi-VN')} ₫` }
export function formatAsOf(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(value))
}
