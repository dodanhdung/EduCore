import { useEffect, useState } from 'react'
import { ApiClient, safeErrorMessage } from '../../../api.ts'
import type { ManagementData } from '../ManagementTypes.ts'
import { ManagerDashboardScreen } from './ManagerDashboardScreen.tsx'

type Overview = { tenantId: string; tenantName: string; timeZone: string; asOf: string; scope: string;
  students: number | null; classes: number | null; outstandingVnd: string | null }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')

export function DashboardProduction({ tenantId, token }: { tenantId: string; token: string }) {
  const [state, setState] = useState<{ key: string; data: Overview } | null>(null)
  const [error, setError] = useState('')
  const key = `${tenantId}:${token}`
  useEffect(() => {
    const abort = new AbortController()
    setState(null); setError('')
    void api.request<Overview>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/portal/overview`,
      { accessToken: token, cache: 'no-store', signal: abort.signal })
      .then(data => { if (!abort.signal.aborted && data.tenantId === tenantId) setState({ key, data }) })
      .catch(cause => { if (!abort.signal.aborted) setError(safeErrorMessage(cause)) })
    return () => abort.abort()
  }, [key])
  if (error) return <section className="panel" role="alert">{error}</section>
  if (state?.key !== key) return <section className="panel" role="status">Đang tải tổng quan theo quyền hiện hành…</section>
  const row = state.data
  const data: ManagementData = { tenantId, tenantName: row.tenantName, timezone: row.timeZone,
    asOf: row.asOf, scope: row.scope, dashboard: { students: row.students,
      classes: row.classes, outstandingVnd: row.outstandingVnd },
    members: [], relationships: [], approvals: [], audit: [], jobs: [], sessions: [], receivables: [] }
  return <ManagerDashboardScreen data={data} canReview={false} production />
}
