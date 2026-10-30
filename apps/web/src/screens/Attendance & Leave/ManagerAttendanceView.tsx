import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { DataTable, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../shared/ui/SharedUI.tsx'
import { formatInstant } from '../Scheduling & Resources/SchedulingDates.ts'
import './ManagerAttendanceView.css'

export type DueSession = { id: string; classId: string; className: string; startsAt: string; endsAt: string; teacherName: string; expectedCount: number; finalized: boolean }
export type SheetParticipant = { id: string; studentId: string; name: string; enrollmentId: string | null; attendanceId: string | null; status: 'ATTENDED' | 'UNEXCUSED' | 'EXCUSED' | null; revision: number; approvedLeave: boolean; billingSourceLocked: boolean; invoiceIssued: boolean }
export type AttendanceSheet = { sessionId: string; classId: string; startsAt: string; endsAt: string; status: string; timeZone: string; finalized: boolean; participants: SheetParticipant[] }
type Result = NonNullable<SheetParticipant['status']>
const labels: Record<Result, string> = { ATTENDED: 'Có mặt', UNEXCUSED: 'Vắng không phép', EXCUSED: 'Vắng có phép' }

export function ManagerAttendanceList({ sessions, zone, month, onMonth, onOpen }: { sessions: DueSession[]; zone: string; month: string; onMonth: (month: string) => void; onOpen: (id: string) => void }) {
  const [now] = useState(() => Date.now())
  return <div className="manager-attendance" data-screen-id="AT01"><PageLayout header={<PageHeader title="Điểm danh buổi học" description={`Chọn buổi để kiểm tra và hoàn tất kết quả · ${zone}`} />}>
    <label className="attendance-field">Tháng điểm danh<input type="month" value={month} onChange={e => onMonth(e.target.value)} /></label>
    <section className="attendance-card"><DataTable caption="Các buổi đã xác nhận trong tháng" rows={sessions} rowKey={s => s.id} columns={[
      { key: 'class', header: 'Lớp học', cell: s => <strong>{s.className}</strong> },
      { key: 'time', header: 'Thời gian', cell: s => formatInstant(s.startsAt, zone) },
      { key: 'teacher', header: 'Giáo viên', cell: s => s.teacherName },
      { key: 'count', header: 'Học viên', cell: s => s.expectedCount },
      { key: 'status', header: 'Điểm danh', cell: s => <StatusBadge domain="attendance" label={s.finalized ? 'Đã xác nhận' : Date.parse(s.startsAt) > now ? 'Chưa bắt đầu' : 'Chưa xác nhận'} tone={s.finalized ? 'success' : 'warning'} /> },
      { key: 'open', header: 'Thao tác', cell: s => <button type="button" className="attendance-link" onClick={() => onOpen(s.id)}>Mở bảng điểm danh</button> },
    ]} empty={<ResourceState kind="empty" title="Không có buổi đã xác nhận trong tháng" detail="Đổi tháng hoặc kiểm tra trạng thái xác nhận lịch học." />} /></section>
  </PageLayout></div>
}

export function ManagerAttendanceSheet({ sheet, className, busy, values, hasUnsaved, notice, error, onChoose, onSave, onFinalize, onBack, onClass, corrections }: {
  sheet: AttendanceSheet; className?: string; busy: boolean; values: Record<string, string>; hasUnsaved: boolean; notice: string; error: string;
  onChoose: (id: string, value: Result) => void; onSave: () => Promise<void>; onFinalize: () => Promise<void>; onBack: () => void; onClass?: () => void
  corrections?: ReactNode
}) {
  const [confirm, setConfirm] = useState(false)
  const [now] = useState(() => Date.now())
  const dialog = useRef<HTMLDialogElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  useEffect(() => { if (confirm) { dialog.current?.showModal(); dialog.current?.querySelector<HTMLButtonElement>('button')?.focus() } }, [confirm])
  function close() { if (busy) return; dialog.current?.close(); setConfirm(false); trigger.current?.focus() }
  const eligible = ['CONFIRMED', 'COMPLETED'].includes(sheet.status) && Date.parse(sheet.startsAt) <= now
  const locked = sheet.participants.some(p => p.billingSourceLocked)
  const editable = eligible && !locked && !sheet.finalized
  const current = (p: SheetParticipant) => values[`status:${p.id}`] ?? p.status
  const marked = sheet.participants.filter(p => current(p)).length
  const persisted = sheet.participants.filter(p => p.status).length
  const lockAt = new Date(Date.parse(sheet.endsAt) + 48 * 3600000).toISOString()
  const canFinalize = editable && !busy && !hasUnsaved && sheet.participants.length > 0 && persisted === sheet.participants.length
  return <div className="manager-attendance" data-screen-id="AT02"><PageLayout header={<PageHeader title={className ? `Điểm danh · ${className}` : 'Bảng điểm danh buổi học'} description={`${formatInstant(sheet.startsAt, sheet.timeZone)} – ${formatInstant(sheet.endsAt, sheet.timeZone)} · ${sheet.timeZone}`}
    action={<button type="button" onClick={onBack}>Về danh sách</button>} context={onClass && <button type="button" className="attendance-link" onClick={onClass}>← Chi tiết lớp học</button>} />} feedback={<>
      {notice && <p role="status" className="attendance-callout">{notice}</p>}{error && <p role="alert" className="attendance-error">{error}</p>}
    </>}>
    <div className="attendance-meta"><StatusBadge domain="attendance" label={sheet.finalized ? 'Đã xác nhận' : 'Chưa xác nhận'} tone={sheet.finalized ? 'success' : 'warning'} />
      <span>Mốc khóa sửa thường: {formatInstant(lockAt, sheet.timeZone)} hoặc khi phát hành hóa đơn.</span></div>
    {!eligible && <ResourceState kind="unavailable" title="Buổi học chưa đủ điều kiện điểm danh" detail="Chỉ thao tác khi buổi đã bắt đầu và lịch đã xác nhận. Máy chủ kiểm tra quyền và điều kiện ở mỗi lần lưu." />}
    {locked && <ResourceState kind="unavailable" title="Nguồn điểm danh đã được tính phí" detail="Không sửa nguồn trực tiếp; cần quy trình điều chỉnh được cấp quyền." />}
    {sheet.finalized && <p className="attendance-callout">Kết quả đã xác nhận trên máy chủ. Bảng hiện ở chế độ xem.</p>}
    <div className="manager-attendance-metrics"><MetricCard label="Học viên trong buổi" value={{ kind: 'available', display: String(sheet.participants.length) }} />
      <MetricCard label="Đã chọn kết quả" value={{ kind: 'available', display: `${marked}/${sheet.participants.length}` }} detail={hasUnsaved ? 'Có lựa chọn chưa lưu' : 'Khớp dữ liệu vừa đọc từ máy chủ'} />
      <MetricCard label="Đã lưu trên máy chủ" value={{ kind: 'available', display: `${persisted}/${sheet.participants.length}` }} detail="Lưu nháp và xác nhận là hai bước riêng" /></div>
    <section className="attendance-card"><h2>Danh sách học viên</h2><p className="attendance-help">Vắng có phép cần đơn nghỉ đã duyệt. Máy chủ quyết định quyền giáo viên hoặc xử lý quá hạn của Manager.</p>
      <DataTable caption="Kết quả tham gia theo học viên" rows={sheet.participants} rowKey={p => p.id} columns={[
        { key: 'name', header: 'Họ và tên', cell: p => <strong>{p.name}</strong> },
        { key: 'leave', header: 'Đơn nghỉ', cell: p => p.approvedLeave ? <StatusBadge label="Đã duyệt nghỉ" domain="leave" tone="info" /> : <span>Chưa có đơn được duyệt</span> },
        { key: 'result', header: 'Kết quả điểm danh', cell: p => sheet.finalized ? <StatusBadge label={p.status ? labels[p.status] : 'Chưa có kết quả'} domain="attendance-result" tone={p.status === 'ATTENDED' ? 'success' : 'neutral'} />
          : <label className="attendance-field"><span className="manager-attendance-sr">Điểm danh {p.name}</span><select aria-label={`Điểm danh ${p.name}`} disabled={!editable || busy} value={current(p) ?? ''} onChange={e => onChoose(p.id, e.target.value as Result)}>
            <option value="" disabled>Chọn kết quả</option>{(Object.entries(labels) as [Result, string][]).map(([value, text]) => <option key={value} value={value} disabled={value === 'EXCUSED' && !p.approvedLeave}>{text}</option>)}</select></label> },
      ]} empty={<ResourceState kind="empty" title="Danh sách tham gia trống" detail="Không thể xác nhận khi chưa có học viên hợp lệ trong buổi." />} />
    </section>
    {!sheet.finalized && <div className="attendance-actions manager-attendance-actions"><button type="button" disabled={busy || !editable || !sheet.participants.length || marked !== sheet.participants.length} onClick={() => { void onSave() }}>{busy ? 'Đang xử lý…' : 'Lưu nháp'}</button>
      <button ref={trigger} type="button" className="attendance-primary" disabled={!canFinalize} onClick={() => setConfirm(true)}>Xác nhận đầy đủ</button></div>}
    {corrections}
    {confirm && <dialog ref={dialog} className="manager-attendance-confirm" aria-labelledby="manager-attendance-confirm-title" onCancel={event => { event.preventDefault(); close() }} onKeyDown={event => {
      if (event.key !== 'Tab') return
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!buttons.length) { event.preventDefault(); return }
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }}><h2 id="manager-attendance-confirm-title">Xác nhận toàn bộ điểm danh?</h2><p>{persisted}/{sheet.participants.length} học viên đã lưu. Kết quả xác nhận sẽ là nguồn nghiệp vụ; máy chủ kiểm tra lại dữ liệu và quyền trước khi chốt.</p>
      <div className="attendance-actions"><button type="button" disabled={busy} onClick={close}>Kiểm tra lại</button><button type="button" className="attendance-primary" disabled={!canFinalize} onClick={() => { dialog.current?.close(); setConfirm(false); void onFinalize() }}>Xác nhận điểm danh</button></div></dialog>}
  </PageLayout></div>
}
