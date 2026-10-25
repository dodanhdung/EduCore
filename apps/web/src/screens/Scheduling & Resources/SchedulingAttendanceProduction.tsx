import { useCallback, useEffect, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { addDays, formatInstant, tenantLocalDate } from './SchedulingDates.ts'
import './SchedulingScreens.css'
import '../Attendance & Leave/AttendanceScreens.css'

type Id = 'SC01' | 'SC02' | 'SC03' | 'SC05' | 'SC06' | 'AT01' | 'AT02' | 'AT03' | 'AT04'
type Page<T> = { items: T[]; page: number; pageSize: number; total: number; timeZone: string }
type Session = { id: string; classId: string; className: string; teacherId: string; teacherName: string; roomId: string | null;
  startsAt: string; endsAt: string; status: string; revision: number; seriesId: string | null; deliveryMode: string }
type Room = { id: string; code: string; name: string; capacity: number; active: boolean; location: string | null }
type Busy = { id: string; resourceId: string; resourceKind: string; startsAt: string; endsAt: string; status: string; reason: string }
type Choice = { id: string; name: string; capacity?: number; enrollmentCount?: number; kind?: string }
type Choices = { timeZone: string; classes: Choice[]; teachers: Choice[]; rooms: Choice[]; resources: Choice[];
  assignments: { classId: string; teacherId: string; validFrom: string; validTo: string | null }[] }
type Caps = { scheduleCreate: boolean; scheduleConfirm: boolean; scheduleUpdate: boolean; scheduleCancel: boolean; roomManage: boolean; resourceManage: boolean }
type Due = { id: string; classId: string; className: string; startsAt: string; endsAt: string; teacherName: string; expectedCount: number; finalized: boolean }
type Participant = { id: string; studentId: string; name: string; enrollmentId: string | null; attendanceId: string | null; status: 'ATTENDED' | 'UNEXCUSED' | 'EXCUSED' | null; revision: number; approvedLeave: boolean; billingSourceLocked: boolean; invoiceIssued: boolean }
type Sheet = { sessionId: string; classId: string; startsAt: string; endsAt: string; status: string; timeZone: string; finalized: boolean; participants: Participant[] }
type Leave = { id: string; participantId: string; studentId: string; sessionId: string; reason: string; submittedAt: string;
  late: boolean; status: string; decisionReason: string | null; canDecide: boolean; canApproveLate: boolean }
type Eligible = { id: string; studentId: string; studentName: string; sessionId: string; startsAt: string; className: string; lateNotice: boolean }
type CommandResult = { id: string; status?: string; revision?: number; sessionIds?: string[] }
type DraftPreview = { ready: boolean; sessionIds: string[]; conflicts: { sessionId: string; kind: string }[]; reserved: false; asOf: string }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')

function phaseMessage(error: unknown) {
  if (error instanceof ApiError && error.status === 403) return 'Bạn không có quyền truy cập dữ liệu này.'
  return safeErrorMessage(error)
}
function range(month: string) {
  const first = `${month}-01`
  const middle = `${month}-16`
  const next = new Date(`${first}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1)
  return [[`${addDays(first, -1)}T00:00:00Z`, `${middle}T00:00:00Z`],
    [`${middle}T00:00:00Z`, `${addDays(next.toISOString().slice(0, 10), 1)}T00:00:00Z`]]
}
function dateTime(value: string, zone: string) { return `${formatInstant(value, zone)} (${zone})` }
function navigateTo(tenantId: string, path: string, navigate: (path: string) => void) {
  navigate(`/app/${encodeURIComponent(tenantId)}${path}`)
}
function newKey() { return crypto.randomUUID() }

export function SchedulingAttendanceProduction({ id, tenantId, token, selectedId, navigate }: {
  id: Id; tenantId: string; token: string; selectedId?: string; navigate: (path: string) => void
}) {
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [zone, setZone] = useState('')
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [calendar, setCalendar] = useState<Session[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [blocks, setBlocks] = useState<Busy[]>([])
  const [resources, setResources] = useState<Choice[]>([])
  const [choices, setChoices] = useState<Choices | null>(null)
  const [caps, setCaps] = useState<Caps | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [due, setDue] = useState<Due[]>([])
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [leaves, setLeaves] = useState<Leave[]>([])
  const [eligible, setEligible] = useState<Eligible[]>([])
  const [form, setForm] = useState<Record<string, string>>({})
  const [draft, setDraft] = useState<CommandResult | null>(null)
  const [draftSeries, setDraftSeries] = useState(false)
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null)
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week')
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [classFilter, setClassFilter] = useState('')
  const [teacherFilter, setTeacherFilter] = useState('')
  const [roomFilter, setRoomFilter] = useState('')
  const [openedAt] = useState(() => Date.now())

  const req = useCallback(<T,>(area: 'scheduling' | 'attendance', path: string, signal?: AbortSignal) =>
    api.request<T>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/${area}${path}`,
      { accessToken: token, cache: 'no-store', signal }), [tenantId, token])
  const command = async (area: 'scheduling' | 'attendance', path: string, body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') => {
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await api.request<CommandResult>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/${area}${path}`,
        { method, body, accessToken: token, idempotencyKey: newKey(), cache: 'no-store' })
      setReload((n) => n + 1)
      setNotice('Đã lưu trên máy chủ.')
      return value
    } catch (cause) { setError(phaseMessage(cause)); return null } finally { setBusy(false) }
  }
  const allPages = useCallback(async <T,>(area: 'scheduling' | 'attendance', path: string, signal: AbortSignal) => {
    const first = await req<Page<T>>(area, `${path}${path.includes('?') ? '&' : '?'}pageSize=100`, signal)
    const pages = Math.min(Math.ceil(first.total / 100), 20)
    const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      req<Page<T>>(area, `${path}${path.includes('?') ? '&' : '?'}pageSize=100&page=${i + 2}`, signal)))
    return { items: [first, ...rest].flatMap((p) => p.items), timeZone: first.timeZone, truncated: first.total > 2000 }
  }, [req])
  useEffect(() => {
    const abort = new AbortController()
    queueMicrotask(() => { if (!abort.signal.aborted) { setLoading(true); setError('') } })
    void (async () => {
      try {
        if (id === 'SC01' || id === 'SC06') {
          const pages = await Promise.all(range(month).map(([from, to]) =>
            allPages<Session>('scheduling', `/${id === 'SC06' ? 'personal' : 'calendar'}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, abort.signal)))
          const values = [...new Map(pages.flatMap((p) => p.items).map((s) => [s.id, s])).values()]
          setCalendar(values); setZone(pages[0].timeZone)
          if (id === 'SC01') setCaps(await req<Caps>('scheduling', '/capabilities', abort.signal))
          if (pages.some((p) => p.truncated)) setNotice('Danh sách quá lớn; hãy xem khoảng thời gian hẹp hơn.')
        } else if (id === 'SC02') {
          const [r, b, resource, c] = await Promise.all([
            allPages<Room>('scheduling', '/rooms', abort.signal), allPages<Busy>('scheduling', '/unavailability', abort.signal),
            allPages<Choice>('scheduling', '/resources', abort.signal),
            req<Caps>('scheduling', '/capabilities', abort.signal)])
          setRooms(r.items); setBlocks(b.items); setResources(resource.items); setCaps(c); setZone(r.timeZone)
        } else if (id === 'SC03') {
          const [c, cap] = await Promise.all([req<Choices>('scheduling', '/choices', abort.signal), req<Caps>('scheduling', '/capabilities', abort.signal)])
          setChoices(c); setCaps(cap); setZone(c.timeZone)
        } else if (id === 'SC05' && selectedId) {
          const [s, c] = await Promise.all([req<Session & { timeZone: string }>('scheduling', `/sessions/${encodeURIComponent(selectedId)}`, abort.signal),
            req<Caps>('scheduling', '/capabilities', abort.signal)])
          setSession(s); setCaps(c); setZone(s.timeZone)
          if (s.status === 'DRAFT') {
            try { setDraftPreview(await req<DraftPreview>('scheduling', `/drafts/${encodeURIComponent(s.id)}/preview`, abort.signal)) }
            catch { setDraftPreview(null) }
          }
        } else if (id === 'AT01') {
          const pages = await Promise.all(range(month).map(([from, to]) =>
            allPages<Due>('attendance', `/due?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, abort.signal)))
          setDue([...new Map(pages.flatMap((p) => p.items).map((s) => [s.id, s])).values()]); setZone(pages[0].timeZone)
        } else if (id === 'AT02' && selectedId) {
          const s = await req<Sheet>('attendance', `/sessions/${encodeURIComponent(selectedId)}`, abort.signal)
          setSheet(s); setZone(s.timeZone)
        } else if (id === 'AT03') {
          const p = await allPages<Eligible>('attendance', '/my-participants', abort.signal)
          setEligible(p.items); setZone(p.timeZone)
        } else if (id === 'AT04') {
          const p = await allPages<Leave>('attendance', '/leaves', abort.signal)
          setLeaves(p.items); setZone(p.timeZone)
        } else throw Error('MISSING_TARGET')
      } catch (cause) { if (!abort.signal.aborted) setError(phaseMessage(cause)) }
      finally { if (!abort.signal.aborted) setLoading(false) }
    })()
    return () => abort.abort()
  }, [id, selectedId, reload, month, allPages, req])
  useEffect(() => {
    if (!zone) return
    const local = tenantLocalDate(zone)
    if (local) { setDay(local); setMonth(local.slice(0, 7)) }
  }, [zone])

  const update = (key: string, value: string) => setForm((previous) => ({ ...previous, [key]: value }))
  const input = (key: string, title: string, type = 'text') => <label className="attendance-field">{title}<input type={type} value={form[key] ?? ''} onChange={(e) => update(key, e.target.value)} /></label>
  const select = (key: string, title: string, values: Choice[]) => <label className="attendance-field">{title}<select value={form[key] ?? ''} onChange={(e) => update(key, e.target.value)}><option value="">Chọn</option>{values.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
  const action = (title: string, invoke: () => void, disabled = false) => <button type="button" className="attendance-primary" disabled={busy || disabled} onClick={invoke}>{title}</button>
  const go = (path: string) => navigateTo(tenantId, path, navigate)
  const intervalBody = { startsAt: form.startsAt, endsAt: form.endsAt }
  const saveSchedule = async (series: boolean) => {
    const body = series ? { classId: form.classId, teacherId: form.teacherId, roomId: form.roomId || undefined,
      deliveryMode: form.deliveryMode || 'ONSITE', weekday: Number(form.weekday), localStartTime: form.localStartTime,
      durationMinutes: Number(form.durationMinutes), validFrom: form.validFrom, validTo: form.validTo, reason: form.reason }
      : { classId: form.classId, teacherId: form.teacherId, roomId: form.roomId || undefined,
        deliveryMode: form.deliveryMode || 'ONSITE', ...intervalBody, reason: form.reason }
    const saved = await command('scheduling', series ? '/series' : '/sessions', body)
    if (saved) { setDraft(saved); setDraftSeries(series); await loadDraftPreview(saved.id, series) }
  }
  const loadDraftPreview = async (draftId: string, series: boolean) => {
    setDraftPreview(null)
    try { setDraftPreview(await req<DraftPreview>('scheduling', `/drafts/${encodeURIComponent(draftId)}/preview${series ? '?series=true' : ''}`)) }
    catch (cause) { setError(phaseMessage(cause)) }
  }
  const saveMarks = async () => {
    if (!sheet) return
    for (const p of sheet.participants) {
      const value = form[`status:${p.id}`] ?? p.status
      if (!value || (value === 'EXCUSED' && !p.approvedLeave)) { setError('Chọn kết quả hợp lệ cho mỗi học sinh.'); return }
    }
    for (const p of sheet.participants) {
      const value = form[`status:${p.id}`] ?? p.status
      if (value === p.status) continue
      const result = await command('attendance', `/sessions/${encodeURIComponent(sheet.sessionId)}/marks`,
        { participantId: p.id, status: value, revision: p.revision, reason: 'Lưu nháp điểm danh' })
      if (!result) return
    }
    setNotice('Bản nháp đã lưu. Xác nhận là bước riêng.')
  }
  const finalize = async () => {
    if (!sheet || !sheet.participants.length || sheet.participants.some((p) => !p.status)) { setError('Cần lưu đủ kết quả trước khi xác nhận.'); return }
    await command('attendance', `/sessions/${encodeURIComponent(sheet.sessionId)}/finalize`, { reason: 'Xác nhận điểm danh đầy đủ' })
  }
  const localDay = (iso: string) => tenantLocalDate(zone, new Date(iso)) ?? ''
  const filteredCalendar = calendar.filter((s) => (!classFilter || s.classId === classFilter)
    && (!teacherFilter || s.teacherId === teacherFilter) && (!roomFilter || s.roomId === roomFilter)
    && (mode === 'month' ? localDay(s.startsAt).startsWith(month)
    : mode === 'day' ? localDay(s.startsAt) === day
      : localDay(s.startsAt) >= addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))
        && localDay(s.startsAt) < addDays(day, 7 - ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7))))
  return <section className="scheduling-page attendance-page">
    <h1>{({ SC01: 'Lịch học trung tâm', SC02: 'Phòng học và lịch bận', SC03: 'Tạo lịch học', SC05: 'Chi tiết buổi học', SC06: 'Lịch cá nhân',
      AT01: 'Buổi cần điểm danh', AT02: 'Điểm danh buổi học', AT03: 'Gửi đơn xin nghỉ', AT04: 'Đơn xin nghỉ' } as Record<Id, string>)[id]}</h1>
    {zone && <p>Múi giờ trung tâm: {zone}</p>}
    {loading && <p role="status">Đang tải dữ liệu...</p>}
    {error && <p role="alert" className="attendance-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!loading && <>
      {(id === 'SC01' || id === 'SC06') && <>
        <div className="attendance-actions"><label>Tháng <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
          <label>Chế độ <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="day">Ngày</option><option value="week">Tuần</option><option value="month">Tháng</option></select></label>
          {mode !== 'month' && <label>Ngày <input type="date" value={day} onChange={(e) => { setDay(e.target.value); setMonth(e.target.value.slice(0, 7)) }} /></label>}
          {id === 'SC01' && caps?.scheduleCreate && <button onClick={() => go('/schedule/create')}>Tạo buổi học</button>}</div>
        {id === 'SC01' && <div className="scheduling-filters">
          <label>Lớp<select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}><option value="">Tất cả</option>
            {[...new Map(calendar.map((s) => [s.classId, s.className])).entries()].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Giáo viên<select value={teacherFilter} onChange={(e) => setTeacherFilter(e.target.value)}><option value="">Tất cả</option>
            {[...new Map(calendar.map((s) => [s.teacherId, s.teacherName])).entries()].map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
          <label>Phòng<select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}><option value="">Tất cả</option>
            {[...new Set(calendar.map((s) => s.roomId).filter((v): v is string => !!v))].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        </div>}
        {filteredCalendar.length ? <ul>{filteredCalendar.map((s) => <li key={s.id}>
          <button type="button" onClick={() => go(`/schedule/sessions/${encodeURIComponent(s.id)}`)}>{s.className}</button>
          {' '}· {dateTime(s.startsAt, zone)}–{dateTime(s.endsAt, zone)} · {s.teacherName} · {s.status}</li>)}</ul>
          : <p>Không có buổi học trong khoảng và phạm vi này.</p>}
      </>}
      {id === 'SC02' && <>
        <h2>Phòng học</h2>{rooms.length ? <ul>{rooms.map((r) => <li key={r.id}>{r.code} · {r.name} · sức chứa {r.capacity} · {r.active ? 'Hoạt động' : 'Ngừng dùng'}</li>)}</ul> : <p>Chưa có phòng trong phạm vi được xem.</p>}
        {caps?.roomManage && <form onSubmit={async (e) => { e.preventDefault(); await command('scheduling', '/rooms', { code: form.code, name: form.name, capacity: Number(form.capacity), reason: form.reason }) }}>
          <h3>Thêm phòng</h3>{input('code', 'Mã phòng')}{input('name', 'Tên phòng')}{input('capacity', 'Sức chứa', 'number')}{input('reason', 'Lý do')}
          <button disabled={busy}>Lưu phòng</button></form>}
        {caps?.roomManage && rooms.length > 0 && <div><h3>Sửa phòng</h3><label className="attendance-field">Phòng
          <select value={form.editRoomId ?? ''} onChange={(e) => { const room = rooms.find((r) => r.id === e.target.value)
            setForm((old) => ({ ...old, editRoomId: e.target.value, editCapacity: String(room?.capacity ?? ''), editActive: String(room?.active ?? true) })) }}>
            <option value="">Chọn</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          {input('editCapacity', 'Sức chứa mới', 'number')}
          <label className="attendance-field">Trạng thái<select value={form.editActive ?? 'true'} onChange={(e) => update('editActive', e.target.value)}>
            <option value="true">Hoạt động</option><option value="false">Ngừng dùng</option></select></label>
          {input('editReason', 'Lý do')}{action('Lưu thay đổi phòng', () => { void command('scheduling', `/rooms/${form.editRoomId}`, {
            capacity: Number(form.editCapacity), active: form.editActive !== 'false', reason: form.editReason }, 'PATCH') }, !form.editRoomId)}</div>}
        <h2>Lịch bận tài nguyên</h2>{blocks.length ? <ul>{blocks.map((b) => <li key={b.id}>{b.resourceKind} · {dateTime(b.startsAt, zone)}–{dateTime(b.endsAt, zone)} · {b.status} · {b.reason}
          {caps?.resourceManage && b.status === 'DRAFT' && <span> {action('Xác nhận', () => { void command('scheduling', `/unavailability/${b.id}/confirm`, { reason: 'Xác nhận lịch bận' }) })}</span>}
          {caps?.resourceManage && b.status !== 'CANCELLED' && <span> {action('Hủy', () => { void command('scheduling', `/unavailability/${b.id}/cancel`, { reason: 'Hủy lịch bận' }) })}</span>}</li>)}</ul> : <p>Chưa có lịch bận.</p>}
        {caps?.resourceManage && <div><h3>Thêm lịch bận</h3>{select('busyResource', 'Tài nguyên', resources)}
          {input('busyStartsAt', 'Bắt đầu ISO 8601')}{input('busyEndsAt', 'Kết thúc ISO 8601')}{input('busyReason', 'Lý do')}
          {action('Tạo lịch bận nháp', () => { const resource = resources.find((r) => r.id === form.busyResource)
            if (resource) void command('scheduling', '/unavailability', { resourceKind: resource.kind,
              resourceId: resource.id, startsAt: form.busyStartsAt, endsAt: form.busyEndsAt, reason: form.busyReason }) }, !form.busyResource)}</div>}
      </>}
      {id === 'SC03' && choices && <>
        <p>Bản nháp không giữ chỗ. Xác nhận sẽ kiểm tra lại xung đột và sức chứa trong giao dịch.</p>
        {select('classId', 'Lớp', choices.classes)}{select('teacherId', 'Giáo viên đã phân công', choices.teachers.filter((teacher) =>
          choices.assignments.some((a) => a.classId === form.classId && a.teacherId === teacher.id
            && (!form.startsAt || (a.validFrom <= form.startsAt && (!a.validTo || form.startsAt < a.validTo))))))}
        <label className="attendance-field">Hình thức<select value={form.deliveryMode ?? 'ONSITE'} onChange={(e) => update('deliveryMode', e.target.value)}><option value="ONSITE">Tại trung tâm</option><option value="ONLINE">Trực tuyến</option></select></label>
        {(form.deliveryMode ?? 'ONSITE') === 'ONSITE' && select('roomId', 'Phòng đủ sức chứa', choices.rooms.filter((r) =>
          r.capacity === undefined || r.capacity >= (choices.classes.find((c) => c.id === form.classId)?.enrollmentCount ?? 0)))}
        <label>Loại lịch<select value={form.kind ?? 'single'} onChange={(e) => update('kind', e.target.value)}><option value="single">Một buổi</option><option value="series">Hàng tuần</option></select></label>
        {form.kind === 'series' ? <>{input('weekday', 'Thứ trong tuần (1–7)', 'number')}{input('localStartTime', 'Giờ địa phương (HH:mm)')}
          {input('durationMinutes', 'Số phút', 'number')}{input('validFrom', 'Từ ngày', 'date')}{input('validTo', 'Đến ngày (tối đa 6 tháng)', 'date')}</>
          : <>{input('startsAt', 'Bắt đầu ISO 8601 với Z hoặc múi giờ')}{input('endsAt', 'Kết thúc ISO 8601 với Z hoặc múi giờ')}</>}
        {input('reason', 'Lý do')}{caps?.scheduleCreate && action('Tạo bản nháp', () => { void saveSchedule(form.kind === 'series') })}
        {draft && <div className="attendance-card"><h2>Bản nháp {draft.id}</h2><p>{draft.sessionIds?.length ?? 1} buổi · chưa giữ chỗ</p>
          {draftPreview ? <><p>{draftPreview.ready ? 'Chưa thấy xung đột tại thời điểm kiểm tra.' : 'Có xung đột hoặc điều kiện chưa đạt.'} Xác nhận sẽ kiểm tra lại.</p>
            {draftPreview.conflicts.map((c, i) => <p key={`${c.sessionId}:${c.kind}:${i}`}>{c.sessionId} · {c.kind}</p>)}</> : <p>Chưa tải được kiểm tra xung đột.</p>}
          <button type="button" onClick={() => { void loadDraftPreview(draft.id, draftSeries) }}>Kiểm tra lại</button>
          {caps?.scheduleConfirm && action('Xác nhận toàn bộ', () => { void command('scheduling', `${draftSeries ? '/series' : '/sessions'}/${draft.id}/confirm`, { reason: form.reason }).then((r) => { if (r) { setDraft(null); setDraftPreview(null) } }) }, !draftPreview?.ready)}</div>}
      </>}
      {id === 'SC05' && session && <>
        <p>{session.className} · {dateTime(session.startsAt, zone)}–{dateTime(session.endsAt, zone)} · {session.status}</p>
        <p>{session.teacherName} · {session.roomId ? `Phòng ${session.roomId}` : 'Trực tuyến'} · phiên bản {session.revision}</p>
        {session.status === 'DRAFT' && <div><h2>Kiểm tra và xác nhận bản nháp</h2>
          <p>{draftPreview ? (draftPreview.ready ? 'Chưa thấy xung đột; xác nhận sẽ kiểm tra lại.' : 'Có xung đột hoặc điều kiện chưa đạt.') : 'Chưa thể kiểm tra xung đột.'}</p>
          {draftPreview?.conflicts.map((c, i) => <p key={`${c.sessionId}:${i}`}>{c.kind}</p>)}
          <button type="button" onClick={() => { void loadDraftPreview(session.id, false) }}>Kiểm tra lại</button>
          {caps?.scheduleConfirm && action('Xác nhận buổi', () => { void command('scheduling', `/sessions/${session.id}/confirm`,
            { reason: 'Xác nhận bản nháp' }) }, !draftPreview?.ready)}</div>}
        {['DRAFT','CONFIRMED'].includes(session.status) && Date.parse(session.startsAt) > openedAt && <>
          {caps?.scheduleUpdate && <div><h2>Đổi lịch</h2>{input('startsAt', 'Bắt đầu ISO 8601')}{input('endsAt', 'Kết thúc ISO 8601')}{input('reason', 'Lý do')}
            {action('Lưu thay đổi', () => { void command('scheduling', `/sessions/${session.id}/reschedule`, { ...intervalBody, reason: form.reason, revision: session.revision }) })}</div>}
          {caps?.scheduleCancel && <div><h2>Hủy buổi</h2>{input('cancelReason', 'Lý do hủy')}
            {action('Xác nhận hủy', () => { void command('scheduling', `/sessions/${session.id}/cancel`, { revision: session.revision, reason: form.cancelReason }) })}</div>}
        </>}
      </>}
      {id === 'AT01' && <><label>Tháng <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        {due.length ? <ul>{due.map((s) => <li key={s.id}><button onClick={() => go(`/sessions/${s.id}/attendance`)}>{s.className}</button>
          {' '}· {dateTime(s.startsAt, zone)} · {s.expectedCount} học sinh · {s.finalized ? 'Đã xác nhận' : 'Chưa xác nhận'}</li>)}</ul> : <p>Không có buổi cần điểm danh.</p>}</>}
      {id === 'AT02' && sheet && <><p>{dateTime(sheet.startsAt, zone)} · {sheet.finalized ? 'Đã xác nhận' : 'Bản nháp'}</p>
        {sheet.participants.length ? <ul>{sheet.participants.map((p) => <li key={p.id}><strong>{p.name}</strong> · {p.enrollmentId ?? 'Không có ghi danh'}
          {!sheet.finalized && <select aria-label={`Điểm danh ${p.name}`} value={form[`status:${p.id}`] ?? p.status ?? ''} onChange={(e) => update(`status:${p.id}`, e.target.value)}>
            <option value="">Chọn kết quả</option><option value="ATTENDED">Có mặt</option><option value="UNEXCUSED">Vắng không phép</option>
            <option value="EXCUSED" disabled={!p.approvedLeave}>Vắng có phép</option></select>}
          {sheet.finalized && <span> {p.status ?? 'Chưa có'} · {p.approvedLeave ? 'Đã duyệt nghỉ' : 'Không có đơn nghỉ được duyệt'}</span>}
          {p.billingSourceLocked && <p>{p.invoiceIssued
            ? 'Hóa đơn đã phát hành: không sửa nguồn điểm danh trực tiếp; cần điều chỉnh tài chính riêng.'
            : 'Nguồn đã được dùng trong bản nháp tính phí; điều chỉnh trực tiếp đang bị khóa.'}</p>}
          {sheet.finalized && p.attendanceId && <details><summary>Đề nghị điều chỉnh</summary><p>Chỉ người có quyền điều chỉnh mới lưu được. Nguồn đã tính phí sẽ bị chặn.</p>
            <select aria-label={`Trạng thái mới ${p.name}`} value={form[`correct:${p.id}`] ?? ''} onChange={(e) => update(`correct:${p.id}`, e.target.value)}>
              <option value="">Chọn kết quả</option><option value="ATTENDED">Có mặt</option><option value="UNEXCUSED">Vắng không phép</option><option value="EXCUSED" disabled={!p.approvedLeave}>Vắng có phép</option></select>
            {input(`reason:${p.id}`, 'Lý do điều chỉnh')}{action('Gửi điều chỉnh', () => { void command('attendance', `/records/${p.attendanceId}/correct`,
              { status: form[`correct:${p.id}`], revision: p.revision, reason: form[`reason:${p.id}`] }) }, p.billingSourceLocked)}</details>}
        </li>)}</ul> : <p>Danh sách tham gia trống; không thể xác nhận.</p>}
        {!sheet.finalized && <div className="attendance-actions">{action('Lưu nháp', () => { void saveMarks() }, !sheet.participants.length)}
          {action('Xác nhận đầy đủ', () => { void finalize() }, !sheet.participants.length || sheet.participants.some((p) => !p.status))}</div>}
      </>}
      {id === 'AT03' && <><p>Đơn nghỉ đúng hạn vẫn phải chờ người có quyền duyệt. Đơn dưới 24 giờ cần quyền duyệt ngoại lệ.</p>
        <label className="attendance-field">Buổi và học sinh<select value={form.participantId ?? ''} onChange={(e) => update('participantId', e.target.value)}><option value="">Chọn</option>
          {eligible.map((p) => <option key={p.id} value={p.id}>{p.studentName} · {p.className} · {dateTime(p.startsAt, zone)}</option>)}</select></label>
        {form.participantId && <p>{eligible.find((p) => p.id === form.participantId)?.lateNotice
          ? 'Đơn dưới 24 giờ: cần quyền duyệt ngoại lệ.' : 'Đơn trong hạn: vẫn chờ duyệt.'}</p>}
        {input('reason', 'Lý do')}{action('Gửi đơn xin nghỉ', () => { void command('attendance', '/leaves', { participantId: form.participantId, reason: form.reason }) })}
        <button type="button" onClick={() => go('/leave-requests')}>Xem đơn của tôi</button></>}
      {id === 'AT04' && <><button type="button" onClick={() => go('/leave-requests/new')}>Gửi đơn mới</button>
        {leaves.length ? <ul>{leaves.map((l) => <li key={l.id}><strong>{l.status}</strong> · {l.late ? 'Nộp muộn' : 'Trong hạn'} · {l.reason} · {dateTime(l.submittedAt, zone)}
          {l.decisionReason && <span> · {l.decisionReason}</span>}
          {l.canDecide && l.status === 'PENDING_APPROVAL' && <div>{input(`reason:${l.id}`, 'Lý do quyết định')}
            {(!l.late || l.canApproveLate) && action('Duyệt', () => { void command('attendance', `/leaves/${l.id}/approve`, { reason: form[`reason:${l.id}`] }) })}
            {action('Từ chối', () => { void command('attendance', `/leaves/${l.id}/reject`, { reason: form[`reason:${l.id}`] }) })}</div>}</li>)}</ul>
          : <p>Chưa có đơn trong phạm vi.</p>}</>}
    </>}
  </section>
}
