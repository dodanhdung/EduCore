import { useEffect, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../../api.ts'
import type { ManagementData } from '../ManagementTypes.ts'
import { ManagerDashboardScreen } from './ManagerDashboardScreen.tsx'
import { Skeleton } from '../../Authentication & Shared/BatchPrimitives.tsx'
import { Heading } from '../ManagementPrimitives.tsx'

type Overview = { tenantId: string; tenantName: string; timeZone: string; asOf: string; scope: string;
  students: number | null; classes: number | null; outstandingVnd: string | null }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')

export function DashboardProduction({ tenantId, token }: { tenantId: string; token: string }) {
  const [state, setState] = useState<{ key: string; data: Overview } | null>(null)
  const [error, setError] = useState<{ message: string; forbidden: boolean } | null>(null)
  const [revision, setRevision] = useState(0)
  const key = `${tenantId}:${token}`
  useEffect(() => {
    const abort = new AbortController()
    setState(null); setError(null)
    void api.request<Overview>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/portal/overview`,
      { accessToken: token, cache: 'no-store', signal: abort.signal })
      .then(data => { if (abort.signal.aborted) return; if (data.tenantId !== tenantId) throw new ApiError(502, 'INVALID_CONTEXT'); setState({ key, data }) })
      .catch(cause => { if (!abort.signal.aborted) setError({ message: safeErrorMessage(cause), forbidden: cause instanceof ApiError && cause.status === 403 }) })
    return () => abort.abort()
  }, [key, tenantId, token, revision])
  if (error) return <div className="management"><Heading title="Tổng quan quản lý" detail="Số liệu trong phạm vi trung tâm hiện tại" /><section className="mo-card" role="alert"><h2>{error.forbidden ? 'Không có quyền xem tổng quan' : 'Không thể tải tổng quan'}</h2><p>{error.message}</p>{!error.forbidden && <button onClick={() => setRevision(n => n + 1)}>Thử lại</button>}</section></div>
  if (state?.key !== key) return <div className="management"><Heading title="Tổng quan quản lý" detail="Đang tải tổng quan theo quyền hiện hành…" /><Skeleton metrics /></div>
  const row = state.data
  const data: ManagementData = { tenantId, tenantName: row.tenantName, timezone: row.timeZone,
    asOf: row.asOf, scope: row.scope, dashboard: { students: row.students,
      classes: row.classes, outstandingVnd: row.outstandingVnd },
    members: [], relationships: [], approvals: [], audit: [], jobs: [], sessions: [], receivables: [] }
  return <div className="management mo-dashboard" data-screen-id="G01"><ManagerDashboardScreen data={data} canReview={false} production /></div>
}
