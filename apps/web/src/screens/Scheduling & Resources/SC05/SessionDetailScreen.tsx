import { useState } from 'react'
import type { SchedulingData } from '../SchedulingTypes.ts'
import { formatDate, formatInstant, timezoneLabel } from '../SchedulingDates.ts'
import { Panel, PendingAction, StatusBadge } from '../SchedulingPrimitives.tsx'
import { ConflictPanel } from '../SC04/ConflictPanel.tsx'
import type { ScheduleConflict } from '../SC04/ConflictPanel.tsx'
import { conflictsFromServer, futureSessionStart, localInstant } from '../SchedulingAdapter.ts'
import type { ApiPreview } from '../SchedulingAdapter.ts'
import '../SchedulingScreens.css'

type Action = 'reschedule-one' | 'cancel'
type SessionActions = { canConfirm?: boolean; canCancel?: boolean; busy?: boolean; draftPreview?: ApiPreview | null; onCheckDraft?: () => Promise<ApiPreview | null>; onConfirmDraft?: () => Promise<boolean>; onReschedule?: (date: string, start: string, end: string, reason: string) => Promise<boolean>; onCancel?: (reason: string) => Promise<boolean> }
export function SessionDetailScreen({ data, selectedId, preview = false, canEdit = false, timeZone, now, clock, conflicts = [], onBack, onOpenStudent, actions }: {
  data?: SchedulingData; selectedId?: string; preview?: boolean; canEdit?: boolean; timeZone?: string; now?: Date; clock?: () => Date; conflicts?: readonly ScheduleConflict[];
  onBack?: () => void; onOpenStudent?: (studentId: string) => void; actions?: SessionActions
}) {
  const [action, setAction] = useState<Action | null>(null)
  const [form, setForm] = useState({ date: '', start: '', end: '', reason: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const session = data?.sessions.find((item) => item.id === selectedId)
  const renderTime = clock?.() ?? now
  if (!data) return <section className="scheduling-page"><h1>Chi tiết buổi học</h1><p role="alert" className="scheduling-pending">Chưa thể tải buổi học từ dịch vụ.</p></section>
  if (!session) return <section className="scheduling-page"><h1>Không tìm thấy buổi học</h1><p role="alert">Mã buổi không hợp lệ hoặc nằm ngoài phạm vi được cấp quyền.</p>{onBack && <button type="button" onClick={onBack}>Quay lại lịch</button>}</section>
  const sessionInstant = session.startsAt ?? (preview && timeZone ? localInstant(session.date, session.start, timeZone) ?? undefined : undefined)
  const future = (at: Date | undefined) => (session.status === 'DRAFT' || session.status === 'CONFIRMED') && futureSessionStart(sessionInstant, timeZone, at)
  const editable = canEdit && future(renderTime)
  const cancelable = (preview ? canEdit : actions?.canCancel) && future(renderTime)
  const attendees = data.attendees?.[session.id] ?? []
  const history = data.historyBySessionId?.[session.id] ?? []
  const room = data.rooms.find((item) => item.id === session.roomId)
  const className = data.classes?.find((item) => item.id === session.classId)?.name ?? session.className
  const open = (kind: Action) => { setAction(kind); setError(''); setNotice(false); setForm({ date: session.date, start: session.start, end: session.end, reason: '' }) }
  const validate = () => {
    const at = clock?.() ?? now
    if (!future(at) || (action === 'cancel' ? !cancelable : !editable)) return 'Buổi học đã bắt đầu hoặc quyền thao tác không còn hợp lệ. Vui lòng tải lại.'
    if (!form.reason.trim()) return 'Vui lòng nhập lý do.'
    if (action !== 'cancel') {
      const start = timeZone ? localInstant(form.date, form.start, timeZone) : null
      const end = timeZone ? localInstant(form.date, form.end, timeZone) : null
      if (!start || !end) return 'Thời gian mới không hợp lệ trong múi giờ trung tâm.'
      if (!at || Date.parse(start) <= at.getTime()) return 'Giờ bắt đầu mới phải ở tương lai.'
      if (Date.parse(end) <= Date.parse(start)) return 'Giờ kết thúc phải sau giờ bắt đầu.'
    }
    return ''
  }
  const review = async () => { const message = validate(); setError(message); if (message) return; if (!actions) { setNotice(true); return }
    const saved = action === 'cancel' ? await actions.onCancel?.(form.reason) : action === 'reschedule-one' ? await actions.onReschedule?.(form.date, form.start, form.end, form.reason) : false
    if (saved) { setAction(null); setNotice(true) }
  }
  const editField = (key: keyof typeof form, label: string, type = 'text') => <label className="scheduling-field" key={key}>{label}<input type={type} value={form[key]} onChange={(event) => { setForm({ ...form, [key]: event.target.value }); setError(''); setNotice(false) }} /></label>

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Chi tiết buổi học</h1><p>Buổi #{session.id} · {session.classId} · {preview ? 'Dữ liệu mẫu' : 'Dữ liệu từ dịch vụ'}</p></div></div>
    <div className="scheduling-session-status"><StatusBadge status={session.status} /><span>{formatDate(session.date)} · {session.start}–{session.end} · {timezoneLabel(timeZone)}</span></div>
<div className="scheduling-detail-grid"><Panel title={className} hint={`Lớp ${session.classId} · ${session.status === 'CANCELLED' ? 'Đã hủy' : 'Thông tin buổi học'}`}><dl className="scheduling-description"><div><dt>Giáo viên</dt><dd>{session.teacherName}</dd></div><div><dt>Phòng</dt><dd>{session.deliveryMode === 'ONLINE' ? 'Trực tuyến' : `${session.roomId} · ${room?.location ?? 'Chưa có vị trí'}`}</dd></div><div><dt>Bắt đầu</dt><dd>{formatDate(session.date)} · {session.start}</dd></div><div><dt>Kết thúc</dt><dd>{formatDate(session.date)} · {session.end}</dd></div></dl><p className="scheduling-hint">Sĩ số: {data.classes?.find((item) => item.id === session.classId)?.enrollmentCount ?? '—'}/{room?.capacity ?? '—'} · Chi tiết học sinh chỉ hiển thị theo phạm vi được cấp quyền.</p></Panel><Panel title="Đổi hoặc hủy buổi" hint="Chỉ áp dụng với buổi tương lai và quyền hiệu lực.">{editable || cancelable ? <div className="scheduling-action-stack">{editable && <button type="button" className="scheduling-primary" onClick={() => open('reschedule-one')}>Đổi buổi này</button>}{session.seriesId && <p className="scheduling-hint">Đổi các buổi tương lai chưa có endpoint trong API hiện tại.</p>}{cancelable && <button type="button" onClick={() => open('cancel')}>Hủy buổi học</button>}</div> : <p className="scheduling-hint">{session.status === 'CANCELLED' ? 'Buổi đã hủy: không thể đổi giờ hoặc hủy thêm.' : session.status === 'COMPLETED' ? 'Buổi đã hoàn tất: chỉ xem lịch sử.' : !future(renderTime) ? 'Buổi đã bắt đầu hoặc thiếu thời gian/múi giờ hợp lệ: chỉ xem lịch sử.' : 'Chế độ chỉ xem: chưa có bằng chứng quyền sửa từ máy chủ.'}</p>}<p className="scheduling-hint">Cần lý do và xác nhận. Xung đột phải được kiểm tra lại trước khi lưu.</p></Panel></div>
    {session.status === 'DRAFT' && actions && <Panel title="Kiểm tra và xác nhận bản nháp"><p className="scheduling-hint">{actions.draftPreview ? actions.draftPreview.ready && !actions.draftPreview.conflicts.length ? 'Chưa thấy xung đột tại thời điểm kiểm tra; chưa giữ tài nguyên.' : `${actions.draftPreview.conflicts.length} vấn đề từ máy chủ; chưa thể xác nhận.` : 'Chưa có kết quả kiểm tra từ máy chủ.'}</p><div className="scheduling-form-actions"><button type="button" disabled={actions.busy} onClick={() => { void actions.onCheckDraft?.() }}>Kiểm tra lại</button><button type="button" onClick={() => setConflictOpen(true)}>Xem xung đột (SC04)</button><button type="button" className="scheduling-primary" disabled={actions.busy || !actions.canConfirm || !actions.draftPreview?.ready || Boolean(actions.draftPreview?.conflicts.length)} onClick={() => { void actions.onConfirmDraft?.() }}>Xác nhận buổi</button></div></Panel>}
    <Panel title="Học sinh trong phạm vi lớp" hint={`${preview ? 'Dữ liệu mẫu · ' : ''}Chỉ hiển thị thông tin trong phạm vi được cấp quyền.`}>{attendees.length ? <div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>MÃ / HỌC SINH</th><th>GHI DANH</th><th>TRẠNG THÁI</th><th>THÔNG TIN</th><th>THAO TÁC</th></tr></thead><tbody>{attendees.map((attendee) => <tr key={attendee.id}><th>{attendee.id} · {attendee.name}</th><td>{formatDate(attendee.enrolledAt)}</td><td>Đang hoạt động</td><td>Có trong buổi</td><td>{onOpenStudent ? <button type="button" className="scheduling-link" onClick={() => onOpenStudent(attendee.id)}>Xem hồ sơ</button> : '—'}</td></tr>)}</tbody></table></div> : <p className="scheduling-empty">{preview ? 'Không có chi tiết học sinh trong phạm vi dữ liệu được cấp.' : 'API chi tiết buổi hiện không cấp danh sách học sinh.'}</p>}</Panel>
    <Panel title="Lịch sử thay đổi">{history.length ? <ol className="scheduling-timeline">{history.map((event) => <li key={event.id}><time dateTime={event.occurredAt}>{formatInstant(event.occurredAt, timeZone)}</time> · {event.description}</li>)}</ol> : <p className="scheduling-empty">Chưa có dữ liệu lịch sử được cung cấp cho buổi này.</p>}<p className="scheduling-hint">Khi đổi/hủy thành công, lịch sử và thông báo trong ứng dụng phải được lưu qua dịch vụ.</p></Panel>
    {action && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setAction(null) }}><section role="dialog" aria-modal="true" aria-label={action === 'cancel' ? 'Hủy buổi học' : 'Đổi lịch buổi học'} className="scheduling-dialog"><div className="scheduling-dialog-head"><h2>{action === 'cancel' ? 'Hủy buổi học' : 'Đổi buổi này'}</h2><button type="button" aria-label="Đóng" onClick={() => setAction(null)}>×</button></div><p className="scheduling-hint">Buổi #{session.id} · {formatDate(session.date)} · {preview ? 'Thao tác thực tế chờ API.' : 'Máy chủ kiểm tra lại xung đột khi lưu.'}</p><div className="scheduling-form">{action !== 'cancel' && <>{editField('date', 'Ngày mới', 'date')}{editField('start', 'Giờ bắt đầu', 'time')}{editField('end', 'Giờ kết thúc', 'time')}</>}{editField('reason', 'Lý do')}{error && <p role="alert" className="scheduling-error">{error}</p>}{preview && action !== 'cancel' && <button type="button" onClick={() => setConflictOpen(true)}>Xem xung đột minh họa (SC04)</button>}{notice && <PendingAction>{action === 'cancel' ? 'Hủy buổi' : 'Đổi lịch'}.</PendingAction>}<div className="scheduling-form-actions"><button type="button" onClick={() => setAction(null)}>Đóng</button><button type="button" className="scheduling-primary" disabled={actions?.busy} onClick={() => { void review() }}>{preview ? 'Rà soát yêu cầu' : 'Lưu trên máy chủ'}</button></div></div></section></div>}
    {conflictOpen && <ConflictPanel conflicts={actions ? conflictsFromServer(actions.draftPreview) : conflicts} checkedCount={1} preview={!actions} available={!actions || Boolean(actions.draftPreview)} ready={actions?.draftPreview?.ready} onClose={() => setConflictOpen(false)} onEdit={() => setConflictOpen(false)} />}
  </div>
}
