import { useState } from 'react'
import type { SchedulingData } from '../SchedulingTypes.ts'
import { formatDate, isoDate, tenantTimezone } from '../SchedulingDates.ts'
import { Panel, PendingAction, StatusBadge } from '../SchedulingPrimitives.tsx'
import { ConflictPanel } from '../SC04/ConflictPanel.tsx'
import type { ScheduleConflict } from '../SC04/ConflictPanel.tsx'
import '../SchedulingScreens.css'

type Action = 'reschedule-one' | 'reschedule-future' | 'cancel'
const runtimeToday = isoDate(new Date())
export function SessionDetailScreen({ data, selectedId, preview = false, canEdit = false, today = runtimeToday, conflicts = [], onBack, onOpenStudent }: {
  data?: SchedulingData; selectedId?: string; preview?: boolean; canEdit?: boolean; today?: string; conflicts?: readonly ScheduleConflict[];
  onBack?: () => void; onOpenStudent?: (studentId: string) => void
}) {
  const [action, setAction] = useState<Action | null>(null)
  const [form, setForm] = useState({ date: '', start: '', end: '', reason: '' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(false)
  const [conflictOpen, setConflictOpen] = useState(false)
  const session = data?.sessions.find((item) => item.id === selectedId)
  if (!data) return <section className="scheduling-page"><h1>Chi tiết buổi học</h1><p role="alert" className="scheduling-pending">Chưa thể tải buổi học từ dịch vụ.</p></section>
  if (!session) return <section className="scheduling-page"><h1>Không tìm thấy buổi học</h1><p role="alert">Mã buổi không hợp lệ hoặc nằm ngoài phạm vi được cấp quyền.</p>{onBack && <button type="button" onClick={onBack}>Quay lại lịch</button>}</section>
  const editable = canEdit && session.status !== 'CANCELLED' && session.date > today
  const attendees = data.attendees?.[session.id] ?? []
  const room = data.rooms.find((item) => item.id === session.roomId)
  const className = data.classes?.find((item) => item.id === session.classId)?.name ?? session.className
  const open = (kind: Action) => { setAction(kind); setError(''); setNotice(false); setForm({ date: session.date, start: session.start, end: session.end, reason: '' }) }
  const validate = () => {
    if (!form.reason.trim()) return 'Vui lòng nhập lý do.'
    if (action !== 'cancel') {
      if (!form.date || form.date <= today) return 'Ngày mới phải ở tương lai.'
      if (!form.start || !form.end || form.end <= form.start) return 'Giờ kết thúc phải sau giờ bắt đầu.'
    }
    return ''
  }
  const review = () => { const message = validate(); setError(message); if (!message) setNotice(true) }
  const editField = (key: keyof typeof form, label: string, type = 'text') => <label className="scheduling-field" key={key}>{label}<input type={type} value={form[key]} onChange={(event) => { setForm({ ...form, [key]: event.target.value }); setError(''); setNotice(false) }} /></label>

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Chi tiết buổi học</h1><p>Buổi #{session.id} · {session.classId} · {preview ? 'Dữ liệu mẫu' : 'Dữ liệu từ dịch vụ'}</p></div></div>
    <div className="scheduling-session-status"><StatusBadge status={session.status} /><span>{formatDate(session.date)} · {session.start}–{session.end} · {tenantTimezone}</span></div>
    <div className="scheduling-detail-grid"><Panel title={className} hint={`Lớp ${session.classId} · ${session.status === 'CANCELLED' ? 'Đã hủy' : 'Thông tin buổi học'}`}><dl className="scheduling-description"><div><dt>Giáo viên</dt><dd>{session.teacherName}</dd></div><div><dt>Phòng</dt><dd>{session.roomId} · {room?.location ?? 'Chưa có vị trí'}</dd></div><div><dt>Bắt đầu</dt><dd>{formatDate(session.date)} · {session.start}</dd></div><div><dt>Kết thúc</dt><dd>{formatDate(session.date)} · {session.end}</dd></div></dl><p className="scheduling-hint">Sĩ số: {data.classes?.find((item) => item.id === session.classId)?.enrollmentCount ?? '—'}/{room?.capacity ?? '—'} · Chi tiết học sinh chỉ hiển thị theo phạm vi được cấp quyền.</p></Panel><Panel title="Đổi hoặc hủy buổi" hint="Chỉ áp dụng với buổi tương lai và quyền hiệu lực.">{editable ? <div className="scheduling-action-stack"><button type="button" className="scheduling-primary" onClick={() => open('reschedule-one')}>Đổi buổi này</button><button type="button" onClick={() => open('reschedule-future')}>Đổi các buổi tương lai</button><button type="button" onClick={() => open('cancel')}>Hủy buổi học</button></div> : <p className="scheduling-hint">{session.status === 'CANCELLED' ? 'Buổi đã hủy: không thể đổi giờ hoặc hủy thêm.' : session.date <= today ? 'Buổi đã qua hoặc diễn ra hôm nay: không thể âm thầm sửa lịch sử.' : 'Chế độ chỉ xem: chưa có bằng chứng quyền sửa từ máy chủ.'}</p>}<p className="scheduling-hint">Cần lý do và xác nhận. Xung đột phải được kiểm tra lại trước khi lưu.</p></Panel></div>
    <Panel title="Học sinh trong phạm vi lớp" hint="Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.">{attendees.length ? <div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>MÃ / HỌC SINH</th><th>GHI DANH</th><th>TRẠNG THÁI</th><th>THÔNG TIN</th><th>THAO TÁC</th></tr></thead><tbody>{attendees.map((attendee) => <tr key={attendee.id}><th>{attendee.id} · {attendee.name}</th><td>{formatDate(attendee.enrolledAt)}</td><td>Đang hoạt động</td><td>Có trong buổi</td><td>{onOpenStudent ? <button type="button" className="scheduling-link" onClick={() => onOpenStudent(attendee.id)}>Xem hồ sơ</button> : '—'}</td></tr>)}</tbody></table></div> : <p className="scheduling-empty">Không có chi tiết học sinh trong phạm vi dữ liệu được cấp.</p>}</Panel>
    <Panel title="Lịch sử thay đổi"><ol className="scheduling-timeline"><li>17/10/2026 10:15 · Nguyễn Văn An xác nhận buổi học. {preview && 'Dữ liệu mẫu.'}</li>{session.status === 'CANCELLED' && <li>21/10/2026 11:20 · Buổi học bị hủy. Tài nguyên được giải phóng theo kết quả máy chủ.</li>}</ol><p className="scheduling-hint">Khi đổi/hủy thành công, lịch sử và thông báo trong ứng dụng phải được lưu qua dịch vụ.</p></Panel>
    {action && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setAction(null) }}><section role="dialog" aria-modal="true" aria-label={action === 'cancel' ? 'Hủy buổi học' : 'Đổi lịch buổi học'} className="scheduling-dialog"><div className="scheduling-dialog-head"><h2>{action === 'cancel' ? 'Hủy buổi học' : action === 'reschedule-future' ? 'Đổi các buổi tương lai' : 'Đổi buổi này'}</h2><button type="button" aria-label="Đóng" onClick={() => setAction(null)}>×</button></div><p className="scheduling-hint">Buổi #{session.id} · {formatDate(session.date)} · Thao tác thực tế chờ API.</p><div className="scheduling-form">{action !== 'cancel' && <>{editField('date', 'Ngày mới', 'date')}{editField('start', 'Giờ bắt đầu', 'time')}{editField('end', 'Giờ kết thúc', 'time')}</>}{editField('reason', 'Lý do')}{error && <p role="alert" className="scheduling-error">{error}</p>}{action !== 'cancel' && <button type="button" onClick={() => setConflictOpen(true)}>Xem xung đột minh họa (SC04)</button>}{notice && <PendingAction>{action === 'cancel' ? 'Hủy buổi' : 'Đổi lịch'}.</PendingAction>}<div className="scheduling-form-actions"><button type="button" onClick={() => setAction(null)}>Đóng</button><button type="button" className="scheduling-primary" onClick={review}>Rà soát yêu cầu</button></div></div></section></div>}
    {conflictOpen && <ConflictPanel conflicts={conflicts} checkedCount={1} onClose={() => setConflictOpen(false)} onEdit={() => setConflictOpen(false)} />}
  </div>
}
