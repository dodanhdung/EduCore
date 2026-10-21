import { useState } from 'react'
import type { SchedulingData, SchedulingState, ScheduleSession } from '../SchedulingTypes.ts'
import { addDays, dayDate, formatDate, periodLabel, shiftPeriod, shortDate, startOfWeek, tenantLocalDate, timezoneLabel } from '../SchedulingDates.ts'
import { Panel, PendingAction, StatusBadge } from '../SchedulingPrimitives.tsx'
import '../SchedulingScreens.css'

type CalendarMode = 'day' | 'week' | 'month'
function matchesPeriod(session: ScheduleSession, date: string, mode: CalendarMode) {
  if (mode === 'day') return session.date === date
  if (mode === 'week') return startOfWeek(session.date) === startOfWeek(date)
  return session.date.slice(0, 7) === date.slice(0, 7)
}

export function CentralScheduleScreen({ data, state = 'ready', preview = false, today, timeZone, now, onCreate, onOpenSession }: {
  data?: SchedulingData; state?: SchedulingState; preview?: boolean; today?: string; timeZone?: string; now?: Date; onCreate?: () => void; onOpenSession?: (id: string) => void
}) {
  const localToday = tenantLocalDate(timeZone, now)
  const currentToday = localToday ? (today ?? localToday) : null
  const [mode, setMode] = useState<CalendarMode>('week')
  const [selectedDate, setDate] = useState(currentToday ?? '')
  const date = selectedDate || currentToday || ''
  const [classId, setClassId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [roomId, setRoomId] = useState('')
  const [selected, setSelected] = useState<ScheduleSession | null>(null)
  const [pending, setPending] = useState(false)
  const [displayState, setDisplayState] = useState<SchedulingState>(state)
  const all = data?.sessions ?? []
  const filtered = currentToday ? all.filter((session) => matchesPeriod(session, date, mode) && (!classId || session.classId === classId) && (!teacherId || session.teacherId === teacherId) && (!roomId || session.roomId === roomId)) : []
  const hours = [...new Set(filtered.map((session) => `${session.start.slice(0, 2)}:00`))].sort()
  const classes = [...new Map(all.map((item) => [item.classId, item.className])).entries()]
  const teachers = [...new Map(all.map((item) => [item.teacherId, item.teacherName])).entries()]
  const rooms = data?.rooms ?? []
  const openCreate = () => { if (onCreate) onCreate(); else setPending(true) }
  const eventButton = (session: ScheduleSession) => <button key={session.id} type="button" className={`scheduling-event scheduling-event-${session.status.toLowerCase()}`} onClick={() => setSelected(session)} aria-label={`Xem buổi ${session.className}, ${formatDate(session.date)} lúc ${session.start}`}><strong>{session.className}</strong><small>{session.start} · {session.roomId}</small><StatusBadge status={session.status} /></button>
  const modeButtons: [CalendarMode, string][] = [['week', 'Tuần'], ['day', 'Ngày'], ['month', 'Tháng']]
  if (!currentToday || !date) return <section className="scheduling-page"><h1>Lịch học trung tâm</h1><p role="alert" className="scheduling-pending">Chưa có múi giờ tenant hợp lệ từ dịch vụ. Không thể xác định ngày hôm nay để hiển thị lịch.</p></section>

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Lịch học trung tâm</h1><p>{periodLabel(date, mode)} · {timezoneLabel(timeZone)} · {preview ? 'Dữ liệu mẫu' : 'Dữ liệu cần kết nối'}</p></div><button type="button" className="scheduling-primary" onClick={openCreate}>Tạo buổi học</button></div>
    <div className="scheduling-toolbar" role="group" aria-label="Điều khiển lịch">
      <div role="tablist" aria-label="Chế độ xem lịch">{modeButtons.map(([value, label]) => <button type="button" role="tab" aria-selected={mode === value} key={value} onClick={() => { setMode(value); setSelected(null) }}>{label}</button>)}</div>
      <div className="scheduling-period"><button type="button" aria-label="Kỳ trước" onClick={() => { setDate(shiftPeriod(date, mode, -1)); setSelected(null) }}>‹</button><span aria-live="polite">{periodLabel(date, mode)}</span><button type="button" aria-label="Kỳ sau" onClick={() => { setDate(shiftPeriod(date, mode, 1)); setSelected(null) }}>›</button></div>
      <button type="button" onClick={() => { setDate(currentToday); setSelected(null) }}>Hôm nay</button>
    </div>
    <Panel title="Bộ lọc theo phạm vi" hint="Chỉ hiện lịch và tài nguyên được cấp quyền."><div className="scheduling-filters">
      <label>Lớp<select value={classId} onChange={(event) => { setClassId(event.target.value); setSelected(null) }}><option value="">Tất cả lớp</option>{classes.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      <label>Giáo viên<select value={teacherId} onChange={(event) => { setTeacherId(event.target.value); setSelected(null) }}><option value="">Tất cả giáo viên</option>{teachers.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
      <label>Phòng<select value={roomId} onChange={(event) => { setRoomId(event.target.value); setSelected(null) }}><option value="">Tất cả phòng</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.id}</option>)}</select></label>
    </div></Panel>
    <Panel title={`Lịch ${mode === 'week' ? 'tuần' : mode === 'day' ? 'ngày' : 'tháng'} · ${periodLabel(date, mode)}`} hint="Chọn buổi để xem thông tin; lịch mẫu không giữ chỗ hoặc xác nhận tài nguyên.">
      {displayState === 'loading' ? <p role="status" className="scheduling-empty">Đang tải lịch…</p> : displayState === 'error' || !data ? <div role="alert" className="scheduling-empty"><p>Chưa thể tải lịch từ dịch vụ.</p>{preview && <button type="button" onClick={() => setDisplayState('ready')}>Thử lại</button>}</div> : filtered.length === 0 ? <div className="scheduling-empty"><strong>Không có buổi học trong {mode === 'day' ? 'ngày' : mode === 'week' ? 'tuần' : 'tháng'} này</strong><p>Thử đổi bộ lọc hoặc chuyển sang kỳ khác. Không có dữ liệu lịch thuộc phạm vi bạn được phép xem.</p></div> : mode === 'month' ? <MonthGrid date={date} sessions={filtered} onDate={(next) => { setDate(next); setMode('day') }} /> : mode === 'week' ? <div className="scheduling-calendar-scroll"><div className="scheduling-week-grid"><div className="scheduling-week-label">GIỜ</div>{Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index)).map((day, index) => <div className="scheduling-week-label" key={day}>THỨ {index === 6 ? 'CN' : index + 2} · {shortDate(day)}</div>)}{hours.map((hour) => <div className="scheduling-week-row" key={hour}><span className="scheduling-time">{hour}</span>{Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index)).map((day) => <div className="scheduling-slot" key={day}>{filtered.filter((session) => session.date === day && session.start.slice(0, 2) === hour.slice(0, 2)).map(eventButton)}</div>)}</div>)}</div></div> : <div className="scheduling-agenda">{filtered.sort((a, b) => a.start.localeCompare(b.start)).map((session) => <div className="scheduling-agenda-row" key={session.id}><span>{session.start}–{session.end}</span>{eventButton(session)}<span>{session.teacherName}</span></div>)}</div>}
    </Panel>
    <div className="scheduling-legend" aria-label="Chú giải trạng thái"><StatusBadge status="CONFIRMED" /><StatusBadge status="DRAFT" /><StatusBadge status="CANCELLED" /></div>
    <Panel title="Nguyên tắc lịch"><p className="scheduling-hint">Lịch đã hủy không chiếm giáo viên/phòng/học sinh. Buổi tiếp giáp đúng thời điểm kết thúc không xung đột.</p><p className="scheduling-hint">Màu chỉ hỗ trợ nhận biết; trạng thái luôn có nhãn. Không tự gợi ý tối ưu lịch trong P0.</p></Panel>
    {selected && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}><section role="dialog" aria-modal="true" aria-label="Thông tin buổi học" className="scheduling-dialog"><div className="scheduling-dialog-head"><h2>{selected.className}</h2><button type="button" aria-label="Đóng thông tin buổi học" onClick={() => setSelected(null)}>×</button></div><p>{formatDate(selected.date)} · {selected.start}–{selected.end} · {timezoneLabel(timeZone)}</p><p>{selected.teacherName} · Phòng {selected.roomId}</p><StatusBadge status={selected.status} /><p className="scheduling-hint">Thông tin minh họa. Chi tiết đầy đủ thuộc màn SC05.</p>{onOpenSession ? <button type="button" onClick={() => onOpenSession(selected.id)}>Xem chi tiết buổi</button> : <PendingAction>Chi tiết buổi học chưa kết nối.</PendingAction>}</section></div>}
    {pending && <div className="scheduling-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPending(false) }}><section role="dialog" aria-modal="true" aria-label="Tạo buổi học" className="scheduling-dialog"><div className="scheduling-dialog-head"><h2>Tạo buổi học</h2><button type="button" aria-label="Đóng" onClick={() => setPending(false)}>×</button></div><PendingAction>Tạo lịch đang chờ API và quyền hiệu lực.</PendingAction></section></div>}
  </div>
}

function MonthGrid({ date, sessions, onDate }: { date: string; sessions: ScheduleSession[]; onDate: (date: string) => void }) {
  const first = `${date.slice(0, 7)}-01`
  const start = startOfWeek(first)
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index))
  return <div className="scheduling-month-grid">{['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((label) => <strong key={label}>{label}</strong>)}{days.map((day) => { const count = sessions.filter((session) => session.date === day).length; return <button type="button" key={day} className={day.slice(0, 7) === date.slice(0, 7) ? '' : 'scheduling-outside-month'} onClick={() => onDate(day)}><span>{dayDate(day).getUTCDate()}</span>{count > 0 && <small>{count} buổi</small>}</button> })}</div>
}
