import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { addDays, tenantLocalDate } from './SchedulingDates.ts'
import { apiWeekday, futureSessionStart, localInstant, schedulingView } from './SchedulingAdapter.ts'
import type { ApiBusy, ApiCaps, ApiChoice, ApiChoices, ApiPreview, ApiRoom, ApiSession } from './SchedulingAdapter.ts'
import { validateDraft } from './SchedulingLogic.ts'
import type { ScheduleDraft } from './SchedulingLogic.ts'
import { CentralScheduleScreen } from './SC01/CentralScheduleScreen.tsx'
import { ResourcesScreen } from './SC02/ResourcesScreen.tsx'
import { CreateScheduleScreen } from './SC03/CreateScheduleScreen.tsx'
import { SessionDetailScreen } from './SC05/SessionDetailScreen.tsx'
import { PersonalScheduleScreen } from './SC06/PersonalScheduleScreen.tsx'

type Id = 'SC01' | 'SC02' | 'SC03' | 'SC05' | 'SC06'
type Page<T> = { items: T[]; total: number; timeZone: string }
type CommandResult = { id: string; sessionIds?: string[] }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
const message = (cause: unknown) => cause instanceof ApiError && cause.status === 403 ? 'Bạn không có quyền truy cập dữ liệu này.' : safeErrorMessage(cause)

function monthWindows(anchor: string) {
  const first = `${anchor.slice(0, 7)}-01`
  const result: [string, string][] = []
  for (const delta of [-1, 0, 1]) {
    const month = new Date(`${first}T00:00:00Z`)
    month.setUTCMonth(month.getUTCMonth() + delta)
    const start = month.toISOString().slice(0, 10)
    month.setUTCMonth(month.getUTCMonth() + 1)
    const next = month.toISOString().slice(0, 10)
    result.push([`${addDays(start, -1)}T00:00:00Z`, `${start.slice(0, 7)}-16T00:00:00Z`])
    result.push([`${start.slice(0, 7)}-16T00:00:00Z`, `${addDays(next, 1)}T00:00:00Z`])
  }
  return result
}

type SchedulingProps = {
  id: Id; tenantId: string; token: string; selectedId?: string; navigate: (path: string) => void; allowed?: readonly string[]; clock?: () => Date
}
export function SchedulingProduction(props: SchedulingProps) {
  return <SchedulingScope key={JSON.stringify([props.id, props.tenantId, props.token, props.selectedId])} {...props} />
}
function SchedulingScope({ id, tenantId, token, selectedId, navigate, allowed = [], clock = () => new Date() }: SchedulingProps) {
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10))
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [readError, setReadError] = useState(false)
  const [errorStatus, setErrorStatus] = useState(0)
  const [retryAllowed, setRetryAllowed] = useState(false)
  const [notice, setNotice] = useState('')
  const [timeZone, setTimeZone] = useState('')
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [rooms, setRooms] = useState<ApiRoom[]>([])
  const [blocks, setBlocks] = useState<ApiBusy[]>([])
  const [resources, setResources] = useState<ApiChoice[]>([])
  const [choices, setChoices] = useState<ApiChoices>()
  const [caps, setCaps] = useState<ApiCaps>()
  const [draftPreview, setDraftPreview] = useState<ApiPreview | null>(null)
  const [initialClassId] = useState(() => new URLSearchParams(window.location.search).get('classId') ?? '')
  const commandInFlight = useRef(false)
  const base = `/api/v1/tenants/${encodeURIComponent(tenantId)}/scheduling`
  const req = useCallback(<T,>(path: string, signal?: AbortSignal) => api.request<T>(`${base}${path}`, { accessToken: token, cache: 'no-store', signal }), [base, token])
  const allPages = useCallback(async <T,>(path: string, signal: AbortSignal) => {
    const separator = path.includes('?') ? '&' : '?'
    const first = await req<Page<T>>(`${path}${separator}pageSize=100`, signal)
    const pageCount = Math.min(Math.ceil(first.total / 100), 20)
    const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => req<Page<T>>(`${path}${separator}pageSize=100&page=${index + 2}`, signal)))
    return { items: [first, ...rest].flatMap((page) => page.items), timeZone: first.timeZone, truncated: first.total > 2000 }
  }, [req])
  useEffect(() => {
    const abort = new AbortController()
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError(''); setReadError(false); setRetryAllowed(false) } })
    void (async () => {
      try {
        if (id === 'SC01' || id === 'SC06') {
          const path = id === 'SC01' ? '/calendar' : '/personal'
          const pages = await Promise.all(monthWindows(anchor).map(([from, to]) => allPages<ApiSession>(`${path}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, abort.signal)))
          if (abort.signal.aborted) return
          setSessions([...new Map(pages.flatMap((page) => page.items).map((session) => [session.id, session])).values()])
          setTimeZone(pages[0].timeZone)
          if (id === 'SC01') {
            const [capabilities, roomPage] = await Promise.all([req<ApiCaps>('/capabilities', abort.signal), allPages<ApiRoom>('/rooms', abort.signal).catch(() => null)])
            if (abort.signal.aborted) return
            setCaps(capabilities); setRooms(roomPage?.items ?? [])
          }
          if (pages.some((page) => page.truncated)) setNotice('Danh sách quá lớn; một số buổi ngoài phạm vi phân trang chưa được tải.')
        } else if (id === 'SC02') {
          const [roomPage, blockPage, resourcePage, capabilities] = await Promise.all([allPages<ApiRoom>('/rooms', abort.signal), allPages<ApiBusy>('/unavailability', abort.signal), allPages<ApiChoice>('/resources', abort.signal), req<ApiCaps>('/capabilities', abort.signal)])
          if (abort.signal.aborted) return
          setRooms(roomPage.items); setBlocks(blockPage.items); setResources(resourcePage.items); setCaps(capabilities); setTimeZone(roomPage.timeZone)
          if ([roomPage, blockPage, resourcePage].some((page) => page.truncated)) setNotice('Danh sách tài nguyên quá lớn; một số mục chưa được tải.')
        } else if (id === 'SC03') {
          const [options, capabilities] = await Promise.all([req<ApiChoices>('/choices', abort.signal), req<ApiCaps>('/capabilities', abort.signal)])
          if (abort.signal.aborted) return
          setChoices(options); setCaps(capabilities); setTimeZone(options.timeZone)
        } else if (id === 'SC05' && selectedId) {
          const [session, capabilities] = await Promise.all([req<ApiSession>(`/sessions/${encodeURIComponent(selectedId)}`, abort.signal), req<ApiCaps>('/capabilities', abort.signal)])
          if (abort.signal.aborted) return
          setSessions([session]); setCaps(capabilities); setTimeZone(session.timeZone ?? '')
          if (session.status === 'DRAFT') {
            try { setDraftPreview(await req<ApiPreview>(`/drafts/${encodeURIComponent(session.id)}/preview`, abort.signal)) }
            catch { setDraftPreview(null) }
          } else setDraftPreview(null)
        }
      } catch (cause) { if (!abort.signal.aborted) { const status = cause instanceof ApiError ? cause.status : 0; setError(message(cause)); setErrorStatus(status); setRetryAllowed(![401, 403, 404].includes(status)); setReadError(true) } }
      finally { if (!abort.signal.aborted) setLoading(false) }
    })()
    return () => abort.abort()
  }, [id, selectedId, anchor, reload, allPages, req])

  const send = async <T,>(path: string, body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST', refresh = true): Promise<T | null> => {
    if (commandInFlight.current) return null
    commandInFlight.current = true
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await api.request<T>(`${base}${path}`, { method, body, accessToken: token, idempotencyKey: crypto.randomUUID(), cache: 'no-store' })
      if (refresh) setReload((count) => count + 1)
      setNotice('Đã lưu trên máy chủ.')
      return value
    } catch (cause) { const status = cause instanceof ApiError ? cause.status : 0; setErrorStatus(status); setError(status === 409 ? 'Dữ liệu đã thay đổi hoặc có xung đột. Tải lại và rà soát trước khi gửi yêu cầu mới.' : status === 0 || status >= 500 ? 'Kết quả lệnh ghi chưa xác định. Kiểm tra dữ liệu trên máy chủ trước khi thao tác lại.' : message(cause)); if (status === 409 || status === 401 || status === 403 || status === 0 || status >= 500) { setReadError(true); setRetryAllowed(status === 409) } return null }
    finally { commandInFlight.current = false; setBusy(false) }
  }
  const go = (path: string) => navigate(`/app/${encodeURIComponent(tenantId)}${path}`)
  const data = useMemo(() => timeZone && tenantLocalDate(timeZone) ? schedulingView(timeZone, sessions, rooms, blocks, choices, resources) : undefined, [timeZone, sessions, rooms, blocks, choices, resources])
  const onPeriodChange = (date: string) => { if (date.slice(0, 7) !== anchor.slice(0, 7)) setAnchor(date) }
  const draftCheck = async (id: string, series: boolean) => {
    try { const result = await req<ApiPreview>(`/drafts/${encodeURIComponent(id)}/preview${series ? '?series=true' : ''}`); if (result.reserved !== false || typeof result.ready !== 'boolean' || !Array.isArray(result.sessionIds) || !Array.isArray(result.conflicts)) throw Error('INVALID_PREVIEW'); return result }
    catch (cause) { setError(message(cause)); return null }
  }
  const createDraft = async (draft: ScheduleDraft, reason: string) => {
    if (!caps?.scheduleCreate || !timeZone) return null
    if (Object.keys(validateDraft(draft)).length) { setError('Thông tin lịch chưa hợp lệ. Vui lòng kiểm tra lại các trường nhập.'); return null }
    const common = { classId: draft.classId, teacherId: draft.teacherId, roomId: draft.format === 'IN_PERSON' ? draft.roomId : undefined, deliveryMode: draft.format === 'IN_PERSON' ? 'ONSITE' : 'ONLINE', reason }
    let body: Record<string, unknown>
    if (draft.repeat === 'WEEKLY') {
      const weekday = apiWeekday(draft.weekdays)
      if (weekday === null) { setError('API hiện hỗ trợ một thứ trong tuần cho mỗi chuỗi.'); return null }
      const minutes = (Number(draft.end.slice(0, 2)) * 60 + Number(draft.end.slice(3))) - (Number(draft.start.slice(0, 2)) * 60 + Number(draft.start.slice(3)))
      body = { ...common, weekday, localStartTime: draft.start, durationMinutes: minutes, validFrom: draft.date, validTo: draft.repeatUntil }
    } else {
      const startsAt = localInstant(draft.date, draft.start, timeZone), endsAt = localInstant(draft.date, draft.end, timeZone)
      if (!startsAt || !endsAt) { setError('Thời gian không hợp lệ trong múi giờ trung tâm.'); return null }
      body = { ...common, startsAt, endsAt }
    }
    const saved = await send<CommandResult>(draft.repeat === 'WEEKLY' ? '/series' : '/sessions', body, 'POST', false)
    if (!saved) return null
    return { id: saved.id, series: draft.repeat === 'WEEKLY', preview: await draftCheck(saved.id, draft.repeat === 'WEEKLY') }
  }

  if (loading) return <section className="scheduling-page"><h1>{id === 'SC01' ? 'Lịch học trung tâm' : id === 'SC02' ? 'Phòng học & lịch bận tài nguyên' : id === 'SC03' ? 'Tạo lịch / buổi học' : id === 'SC05' ? 'Chi tiết buổi học' : 'Lịch cá nhân'}</h1><p role="status">Đang tải dữ liệu…</p></section>
  if (readError || !data) return <section className="scheduling-page"><h1>{errorStatus === 401 ? 'Phiên đăng nhập đã hết hạn' : errorStatus === 403 ? 'Không có quyền truy cập' : errorStatus === 404 ? 'Không tìm thấy buổi học' : errorStatus === 409 ? 'Cần rà soát dữ liệu mới' : 'Không thể tải dữ liệu'}</h1><p role="alert" className="scheduling-error">{error || 'Dữ liệu chưa sẵn sàng.'}</p>{retryAllowed && <button type="button" onClick={() => setReload((count) => count + 1)}>{errorStatus === 409 ? 'Tải lại dữ liệu' : 'Thử lại'}</button>}</section>
  return <div className="scheduling-production">
    {error && <p role="alert" className="scheduling-error">{error}</p>}
    {notice && <p role="status" className="scheduling-hint">{notice}</p>}
    {id === 'SC01' && <CentralScheduleScreen data={data} initialClassId={initialClassId} state="ready" timeZone={timeZone} canCreate={!!caps?.scheduleCreate && allowed.includes('SC03')} onCreate={() => go(`/schedule/create${initialClassId ? `?classId=${encodeURIComponent(initialClassId)}` : ''}`)} onOpenSession={allowed.includes('SC05') ? (sessionId) => go(`/schedule/sessions/${encodeURIComponent(sessionId)}`) : undefined} onPeriodChange={onPeriodChange} />}
    {id === 'SC02' && <ResourcesScreen data={data} state="ready" timeZone={timeZone} actions={{ canManageRooms: !!caps?.roomManage, canManageResources: !!caps?.resourceManage, busy,
      createRoom: async (form) => !!(caps?.roomManage && await send('/rooms', { code: form.code, name: form.name, capacity: Number(form.capacity), reason: form.reason })),
      updateRoom: async (roomId, form) => !!(caps?.roomManage && await send(`/rooms/${encodeURIComponent(roomId)}`, { capacity: Number(form.capacity), active: form.active === 'true', reason: form.reason }, 'PATCH')),
      createBlock: async (form) => { const resource = resources.find((item) => item.id === form.resource); const startsAt = localInstant(form.from.slice(0, 10), form.from.slice(11, 16), timeZone); const endsAt = localInstant(form.to.slice(0, 10), form.to.slice(11, 16), timeZone); if (!caps?.resourceManage || !resource?.kind || !startsAt || !endsAt) { setError('Tài nguyên hoặc thời gian không hợp lệ.'); return false } return !!await send('/unavailability', { resourceKind: resource.kind, resourceId: resource.id, startsAt, endsAt, reason: form.reason }) },
      confirmBlock: async (blockId) => !!(caps?.resourceManage && await send(`/unavailability/${encodeURIComponent(blockId)}/confirm`, { reason: 'Xác nhận lịch bận' })),
      cancelBlock: async (blockId) => !!(caps?.resourceManage && await send(`/unavailability/${encodeURIComponent(blockId)}/cancel`, { reason: 'Hủy lịch bận' })),
    }} />}
    {id === 'SC03' && <CreateScheduleScreen data={data} initialClassId={initialClassId} onBack={() => go(initialClassId && allowed.includes('AC08') ? `/classes/${encodeURIComponent(initialClassId)}` : '/schedule')} timeZone={timeZone} canCreate={!!caps?.scheduleCreate} canConfirm={!!caps?.scheduleConfirm} busy={busy} onSaveDraft={createDraft} onCheckDraft={async (saved) => draftCheck(saved.id, saved.series)} onConfirmDraft={async (saved, reason) => !!(caps?.scheduleConfirm && saved.preview?.ready && !saved.preview.conflicts.length && await send(`${saved.series ? '/series' : '/sessions'}/${encodeURIComponent(saved.id)}/confirm`, { reason }))} />}
{id === 'SC05' && <SessionDetailScreen data={data} selectedId={selectedId} timeZone={timeZone} clock={clock} canEdit={!!caps?.scheduleUpdate} onBack={() => go('/schedule')} actions={{ canConfirm: !!caps?.scheduleConfirm, canCancel: !!caps?.scheduleCancel, busy, draftPreview,
      onCheckDraft: async () => { if (!selectedId) return null; const result = await draftCheck(selectedId, false); setDraftPreview(result); return result },
      onConfirmDraft: async () => !!(selectedId && caps?.scheduleConfirm && draftPreview?.ready && !draftPreview.conflicts.length && await send(`/sessions/${encodeURIComponent(selectedId)}/confirm`, { reason: 'Xác nhận bản nháp' })),
      onReschedule: async (date, start, end, reason) => { const current = sessions[0]; const startsAt = localInstant(date, start, timeZone), endsAt = localInstant(date, end, timeZone); if (!current || !caps?.scheduleUpdate || (current.status !== 'DRAFT' && current.status !== 'CONFIRMED') || !futureSessionStart(current.startsAt, timeZone, clock()) || !startsAt || !endsAt || Date.parse(startsAt) <= clock().getTime() || Date.parse(endsAt) <= Date.parse(startsAt)) { setError('Thời gian hoặc quyền sửa không còn hợp lệ. Vui lòng tải lại.'); return false } return !!await send(`/sessions/${encodeURIComponent(current.id)}/reschedule`, { startsAt, endsAt, reason, revision: current.revision }) },
      onCancel: async (reason) => { const current = sessions[0]; if (!current || !caps?.scheduleCancel || (current.status !== 'DRAFT' && current.status !== 'CONFIRMED') || !futureSessionStart(current.startsAt, timeZone, clock())) { setError('Buổi học đã bắt đầu hoặc quyền hủy không còn hợp lệ. Vui lòng tải lại.'); return false } return !!await send(`/sessions/${encodeURIComponent(current.id)}/cancel`, { reason, revision: current.revision }) },
    }} />}
    {id === 'SC06' && <PersonalScheduleScreen data={data} timeZone={timeZone} onOpenSession={allowed.includes('SC05') ? (sessionId) => go(`/schedule/sessions/${encodeURIComponent(sessionId)}`) : undefined} onPeriodChange={onPeriodChange} />}
  </div>
}
