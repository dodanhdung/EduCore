import { useEffect, useState } from 'react'
import { ApiClient, ApiError } from '../../api.ts'
import { DataTable, ResourceState, StatusBadge } from '../../shared/ui/SharedUI.tsx'
import type { ResourceKind } from '../../shared/ui/SharedUI.tsx'
import { formatInstant, tenantLocalDate } from '../Scheduling & Resources/SchedulingDates.ts'
import type { ApiSession } from '../Scheduling & Resources/SchedulingAdapter.ts'

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
type Page = { items: ApiSession[]; total: number }
export function AcademicClassSchedule({ tenantId, token, classId, timezone, navigate, allowed = [] }: {
  tenantId: string; token: string; classId: string; timezone: string; navigate: (path: string) => void; allowed?: readonly string[]
}) {
  const [month, setMonth] = useState(() => tenantLocalDate(timezone)?.slice(0, 7) ?? '')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ scope: string; kind: ResourceKind | 'ready'; sessions: ApiSession[] }>()
  const scope = JSON.stringify([tenantId, token, classId, month, revision])
  useEffect(() => {
    const abort = new AbortController()
    void (async () => {
      try {
        if (!/^\d{4}-\d{2}$/.test(month)) return
        // Two bounded UTC windows cover the tenant month including timezone edges.
        const first = new Date(`${month}-01T00:00:00Z`), next = new Date(first)
        next.setUTCMonth(next.getUTCMonth() + 1)
        const middle = new Date(`${month}-16T00:00:00Z`)
        const windows = [[new Date(+first - 86400000), middle], [middle, new Date(+next + 86400000)]]
        const pages = await Promise.all(windows.map(async ([from, to]) => {
          const path = `/api/v1/tenants/${encodeURIComponent(tenantId)}/scheduling/calendar?from=${from.toISOString()}&to=${to.toISOString()}&pageSize=100`
          const get = (page: number) => api.request<Page>(`${path}&page=${page}`, { accessToken: token, signal: abort.signal, cache: 'no-store' })
          const firstPage = await get(1)
          if (firstPage.total > 2000) throw Error('RESULT_TOO_LARGE')
          const rest = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(firstPage.total / 100) - 1) }, (_, i) => get(i + 2)))
          return [firstPage, ...rest].flatMap(p => p.items)
        }))
        const sessions = [...new Map(pages.flat().filter(s => s.classId === classId && tenantLocalDate(timezone, new Date(s.startsAt))?.startsWith(month)).map(s => [s.id, s])).values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        if (!abort.signal.aborted) setResult({ scope, kind: 'ready', sessions })
      } catch (error) {
        const kind = error instanceof ApiError && error.status === 401 ? 'unauthenticated' : error instanceof ApiError && error.status === 403 ? 'forbidden' : 'error'
        if (!abort.signal.aborted) setResult({ scope, kind, sessions: [] })
      }
    })()
    return () => abort.abort()
  }, [tenantId, token, classId, timezone, month, revision, scope])
  const go = (suffix: string) => navigate(`/app/${encodeURIComponent(tenantId)}/${suffix}`)
  const kind = result?.scope === scope ? result.kind : 'loading'
  return <div className="academic-class-schedule">
    <div className="academic-dialog-actions"><label className="academic-field">Tháng lịch học<input type="month" value={month} onChange={e => setMonth(e.target.value)} /></label>
      {allowed.includes('SC03') && <button type="button" className="academic-primary" onClick={() => go(`schedule/create?classId=${encodeURIComponent(classId)}`)}>Tạo buổi cho lớp</button>}
      {allowed.includes('SC01') && <button type="button" onClick={() => go(`schedule?classId=${encodeURIComponent(classId)}`)}>Mở lịch trung tâm</button>}</div>
    <p>Thời gian theo {timezone}. Xác nhận điểm danh là bước riêng sau buổi học, theo quyền hiện hành.</p>
    {kind !== 'ready' ? <ResourceState kind={kind} onRetry={kind === 'error' ? () => setRevision(v => v + 1) : undefined} />
      : <DataTable caption="Lịch học của lớp trong tháng" rows={result!.sessions} rowKey={s => s.id} columns={[
        { key: 'time', header: 'Thời gian', cell: s => `${formatInstant(s.startsAt, timezone)} – ${formatInstant(s.endsAt, timezone)}` },
        { key: 'teacher', header: 'Giáo viên', cell: s => s.teacherName },
        { key: 'status', header: 'Trạng thái', cell: s => <StatusBadge domain="schedule" label={s.status === 'CONFIRMED' ? 'Đã xác nhận' : s.status === 'DRAFT' ? 'Bản nháp' : s.status === 'CANCELLED' ? 'Đã hủy' : 'Đã hoàn tất'} tone={s.status === 'CONFIRMED' ? 'success' : 'neutral'} /> },
        { key: 'actions', header: 'Thao tác', cell: s => <>{allowed.includes('SC05') && <button type="button" className="academic-link" onClick={() => go(`schedule/sessions/${encodeURIComponent(s.id)}`)}>Xem buổi</button>}
          {allowed.includes('AT02') && ['CONFIRMED', 'COMPLETED'].includes(s.status) && <button type="button" className="academic-link" onClick={() => go(`sessions/${encodeURIComponent(s.id)}/attendance`)}>Bảng điểm danh</button>}</> },
      ]} empty={<ResourceState kind="empty" title="Chưa có buổi học trong tháng này" detail="Đổi tháng để xem lịch khác hoặc tạo buổi học mới cho lớp." />} />}
  </div>
}
