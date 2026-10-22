import { useEffect, useState } from 'react'
import type { AttendanceData, AttendanceRole } from '../AttendanceTypes.ts'
import { leaveHoursBefore } from '../AttendanceLogic.ts'
import { AttendanceCard, AttendanceHeading, AttendancePending, AttendanceState } from '../AttendancePrimitives.tsx'
import { formatAttendanceDate } from '../AttendanceText.ts'
import '../AttendanceScreens.css'

type LeaveFormProps = {
  data?: AttendanceData; role?: AttendanceRole; preview?: boolean; state?: 'ready' | 'forbidden' | 'loading' | 'error'; initialStudentId?: string; viewerId?: string; tenantId?: string; onViewRequests?: () => void
}

export function LeaveRequestFormScreen(props: LeaveFormProps) {
  const { data, role = 'student', initialStudentId, viewerId, tenantId } = props
  const [selection, setSelection] = useState<{ context: string; studentId: string }>()
  const context = JSON.stringify([tenantId, viewerId, role, initialStudentId])
  const permittedIds = role === 'parent' ? data?.linkedChildIds ?? [] : role === 'student' && data?.ownStudentId ? [data.ownStudentId] : []
  const studentId = selection?.context === context ? selection.studentId : initialStudentId ?? ''
  const effectiveStudentId = role === 'student' ? permittedIds[0] ?? '' : permittedIds.includes(studentId) ? studentId : ''
  return <LeaveRequestFormContent key={JSON.stringify([context, effectiveStudentId])} {...props} role={role} permittedIds={permittedIds} effectiveStudentId={effectiveStudentId} onSelectStudent={(selectedId) => setSelection({ context, studentId: selectedId })} />
}

function LeaveRequestFormContent({ data, role = 'student', preview = false, state = 'ready', onViewRequests, permittedIds, effectiveStudentId, onSelectStudent }: LeaveFormProps & { permittedIds: string[]; effectiveStudentId: string; onSelectStudent: (studentId: string) => void }) {
  const [sessionId, setSessionId] = useState('')
  const [reason, setReason] = useState('')
  const [review, setReview] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(false)
  const evaluated = data?.sessions.filter((session) => session.phase !== 'LOCKED' && (data.rosters[session.id] ?? []).includes(effectiveStudentId)).map((session) => ({ session, timing: leaveHoursBefore(session, data.sampleNow, data.timeZone) })) ?? []
  const candidates = evaluated.filter((item) => item.timing.kind === 'resolved' && item.timing.hours > 0).map((item) => item.session)
  const unavailableTiming = evaluated.some((item) => item.timing.kind === 'unresolved')
  const session = candidates.find((item) => item.id === sessionId)
  useEffect(() => {
    if (sessionId && !session) { setSessionId(''); setReview(false); setNotice(false) }
  }, [sessionId, session])
  const duplicate = data?.leaveRequests.find((item) => item.sessionId === sessionId && item.studentId === effectiveStudentId && ['PENDING', 'APPROVED', 'NEEDS_INFORMATION'].includes(item.status))
  const selectedTiming = evaluated.find((item) => item.session.id === session?.id)?.timing
  const hours = selectedTiming?.kind === 'resolved' ? selectedTiming.hours : null
  const late = hours !== null && hours < 24
  const submitReview = () => { if (!effectiveStudentId || !session || !candidates.some((item) => item.id === session.id)) { setError('Vui lòng chọn học sinh và buổi học hợp lệ.'); return } if (!reason.trim()) { setError('Vui lòng nhập lý do xin nghỉ.'); return } if (duplicate) { setError('Đã có đơn còn hiệu lực cho học sinh và buổi này.'); return } setReview(true); setError('') }
  return <div className="attendance-page"><AttendanceHeading title="Gửi đơn xin nghỉ" subtitle={preview ? 'Chỉ gửi cho học sinh thuộc phạm vi liên kết · Dữ liệu mẫu' : 'Chọn buổi học và nêu lý do xin nghỉ'} />
    {!data ? <AttendanceState title="Chưa có dữ liệu đơn nghỉ" alert>Chờ API tải học sinh liên kết và các buổi đủ điều kiện.</AttendanceState>
      : state === 'forbidden' || !permittedIds.length ? <AttendanceState title="Không thể gửi đơn cho học sinh này" alert>Học sinh không nằm trong liên kết hoặc phạm vi đã được xác minh.</AttendanceState>
        : state === 'loading' ? <AttendanceState title="Đang tải dữ liệu">Vui lòng chờ.</AttendanceState>
          : state === 'error' ? <AttendanceState title="Không thể tải buổi học" alert>Thử lại khi kết nối khả dụng.</AttendanceState> : <>
            <AttendanceCard title="Thông tin đơn xin nghỉ" hint="Đơn đúng hạn vẫn phải chờ người có quyền duyệt."><div className="attendance-form-grid">{role === 'parent' && <label className="attendance-field">Học sinh đã liên kết<select value={effectiveStudentId} onChange={(event) => onSelectStudent(event.target.value)}><option value="">Chọn học sinh</option>{data.students.filter((item) => permittedIds.includes(item.id)).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}</select></label>}{role === 'student' && <div className="attendance-readonly"><span>Học sinh</span><strong>{data.students.find((item) => item.id === effectiveStudentId)?.name ?? effectiveStudentId}</strong></div>}<label className="attendance-field">Buổi học muốn xin nghỉ<select value={sessionId && session ? sessionId : ''} onChange={(event) => { setSessionId(event.target.value); setReview(false) }} disabled={!effectiveStudentId}><option value="">Chọn buổi học</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.classId} · {formatAttendanceDate(item.date)} · {item.start}–{item.end}</option>)}</select></label></div>{effectiveStudentId && unavailableTiming && <AttendanceState title="Chưa xác định thời gian buổi">Một số buổi có thời gian hoặc múi giờ chưa đủ rõ để xét hạn. Cần dữ liệu lịch học được xác nhận trước khi chọn.</AttendanceState>}{effectiveStudentId && !candidates.length && !unavailableTiming && <AttendanceState title="Không có buổi sắp tới">Không có buổi học hợp lệ cho học sinh đã chọn.</AttendanceState>}{session && <div className={`attendance-callout ${late ? 'attendance-callout-warning' : ''}`}><strong>{late ? 'Đơn nộp muộn · cần xử lý ngoại lệ' : 'Trong hạn thông thường'}</strong><p>Buổi bắt đầu {formatAttendanceDate(session.date)} lúc {session.start} ({data.timeZone}). {late ? 'Còn dưới 24 giờ trước buổi; người có quyền ngoại lệ sẽ xem xét.' : 'Cần gửi trước ít nhất 24 giờ; đơn không tự được duyệt.'}</p></div>}{duplicate && <AttendanceState title="Đơn trùng còn hiệu lực" alert>Đã có đơn {duplicate.status === 'APPROVED' ? 'được duyệt' : 'đang chờ xử lý'} cho buổi này. Xem đơn hiện có thay vì tạo đơn mới.</AttendanceState>}<label className="attendance-field">Lý do xin nghỉ<textarea value={reason} onChange={(event) => { setReason(event.target.value); setReview(false); setError('') }} rows={4} placeholder="Mô tả lý do xin nghỉ" aria-invalid={!!error && !reason.trim()} aria-describedby={error ? 'leave-form-error' : undefined} /></label>{error && <p id="leave-form-error" role="alert" className="attendance-error">{error}</p>}<div className="attendance-actions"><button type="button" className="attendance-primary" onClick={submitReview} disabled={!!duplicate}>Xem lại đơn</button>{onViewRequests && <button type="button" className="attendance-secondary" onClick={onViewRequests}>Xem đơn của tôi</button>}</div></AttendanceCard>
            {review && session && <AttendanceCard title="Xem lại trước khi gửi"><dl className="attendance-description"><div><dt>Học sinh</dt><dd>{data.students.find((item) => item.id === effectiveStudentId)?.name}</dd></div><div><dt>Buổi học</dt><dd>{session.classId} · {formatAttendanceDate(session.date)} {session.start}</dd></div><div><dt>Thời hạn</dt><dd>{late ? 'Muộn, cần duyệt ngoại lệ' : 'Trong hạn, vẫn chờ duyệt'}</dd></div><div><dt>Lý do</dt><dd>{reason.trim()}</dd></div></dl><div className="attendance-actions"><button type="button" className="attendance-secondary" onClick={() => setReview(false)}>Chỉnh sửa</button><button type="button" className="attendance-primary" onClick={() => setNotice(true)}>Gửi đơn xin nghỉ</button></div>{notice && <AttendancePending>Gửi đơn đang chờ API. Chưa có đơn nào được tạo hoặc duyệt.</AttendancePending>}</AttendanceCard>}
          </>}
  </div>
}
