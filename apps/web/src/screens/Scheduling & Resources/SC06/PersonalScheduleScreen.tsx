import { useState } from 'react'
import type { PersonalScheduleScope, ScheduleSession, SchedulingData } from '../SchedulingTypes.ts'
import { addDays, formatDate, periodLabel, shiftPeriod, shortDate, startOfWeek, tenantLocalDate, timezoneLabel } from '../SchedulingDates.ts'
import { Panel, StatusBadge } from '../SchedulingPrimitives.tsx'
import '../SchedulingScreens.css'

export function PersonalScheduleScreen({ data, scope, preview = false, initialChildId, today, timeZone, now, onOpenSession }: {
  data?: SchedulingData; scope?: PersonalScheduleScope; preview?: boolean; initialChildId?: string; today?: string; timeZone?: string; now?: Date; onOpenSession?: (id: string) => void
}) {
  const localToday = tenantLocalDate(timeZone, now)
  const currentToday = localToday ? (today ?? localToday) : null
  const [selectedWeek, setWeek] = useState(currentToday ? startOfWeek(currentToday) : '')
  const week = selectedWeek || (currentToday ? startOfWeek(currentToday) : '')
  const [view, setView] = useState<'week' | 'list'>('week')
  const [childId, setChildId] = useState(initialChildId ?? scope?.children?.[0]?.id ?? '')
  const child = scope?.children?.find((item) => item.id === childId)
  if (!currentToday || !week) return <section className="scheduling-page"><h1>Lịch cá nhân</h1><p role="alert" className="scheduling-pending">Chưa có múi giờ tenant hợp lệ từ dịch vụ. Không thể xác định tuần hiện tại.</p></section>
  if (!data || !scope) return <section className="scheduling-page"><h1>Lịch cá nhân</h1><p role="alert" className="scheduling-pending">Chưa thể tải lịch cá nhân và phạm vi được cấp quyền từ dịch vụ.</p></section>
  if (scope.mode === 'parent' && !child) return <section className="scheduling-page"><h1>Lịch cá nhân</h1><p role="alert">Học sinh đã chọn không nằm trong danh sách liên kết của dữ liệu xem trước.</p><label className="scheduling-field">Học sinh<select value={childId} onChange={(event) => setChildId(event.target.value)}><option value="">Chọn học sinh</option>{scope.children?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></section>
  const allowed = new Set(scope.mode === 'parent' ? child?.allowedSessionIds ?? [] : scope.allowedSessionIds)
  const sessions = data.sessions.filter((session) => allowed.has(session.id) && startOfWeek(session.date) === week).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
  const selectedDay = sessions[0]
  const open = (session: ScheduleSession) => { if (onOpenSession && allowed.has(session.id)) onOpenSession(session.id) }
  const openButton = (session: ScheduleSession) => onOpenSession ? <button type="button" className="scheduling-link" onClick={() => open(session)}>Xem buổi</button> : <span>Chi tiết cần quyền từ dịch vụ</span>

  return <div className="scheduling-page scheduling-personal">
    <div className="scheduling-heading"><div><h1>Lịch cá nhân</h1><p>{scope.label} · Tuần {periodLabel(week, 'week')} · {preview ? 'Dữ liệu mẫu' : timezoneLabel(timeZone)}</p></div></div>
    <div className="scheduling-toolbar"><div role="tablist" aria-label="Chế độ xem lịch cá nhân"><button type="button" role="tab" aria-selected={view === 'week'} onClick={() => setView('week')}>Tuần</button><button type="button" role="tab" aria-selected={view === 'list'} onClick={() => setView('list')}>Danh sách</button></div><div className="scheduling-period"><button type="button" aria-label="Tuần trước" onClick={() => setWeek(shiftPeriod(week, 'week', -1))}>‹</button><span aria-live="polite">{periodLabel(week, 'week')}</span><button type="button" aria-label="Tuần sau" onClick={() => setWeek(shiftPeriod(week, 'week', 1))}>›</button></div><button type="button" onClick={() => setWeek(startOfWeek(currentToday))}>Hôm nay</button></div>
    {scope.mode === 'parent' && <Panel title="Lịch của học sinh" hint="Chỉ hiển thị học sinh thuộc danh sách liên kết của dữ liệu xem trước."><label className="scheduling-field">Học sinh<select value={childId} onChange={(event) => setChildId(event.target.value)}>{scope.children?.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></Panel>}
    <Panel title="Phạm vi lịch của tôi"><p className="scheduling-hint">{scope.mode === 'teacher' ? 'Chỉ xem các buổi được phân công.' : scope.mode === 'parent' ? 'Chỉ xem lịch của học sinh đã chọn.' : 'Chỉ xem các buổi của lớp học viên đang theo học.'} Không có thao tác sửa lịch trong màn cá nhân này.</p><p className="scheduling-hint">Mốc giờ hiển thị theo {timezoneLabel(timeZone)}; mở buổi để xem chi tiết khi được cấp quyền.</p></Panel>
    {sessions.length === 0 ? <Panel title="Chưa có buổi học trong tuần này"><p className="scheduling-hint">Thử tuần khác hoặc kiểm tra phạm vi lớp được phân công. Lịch cá nhân chỉ hiển thị các buổi mà tài khoản được quyền xem.</p></Panel> : <Panel title="Buổi học sắp tới" hint="Dữ liệu minh họa · Chỉ hiển thị thông tin trong phạm vi được cấp quyền."><div className={`scheduling-personal-table${view === 'list' ? ' scheduling-list-view' : ''}`}><div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>NGÀY / GIỜ</th><th>LỚP</th><th>PHÒNG / HÌNH THỨC</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{sessions.map((session) => <tr key={session.id}><th>{shortDate(session.date)} · {session.start}–{session.end}</th><td>{session.className}</td><td>{session.roomId} · Trực tiếp</td><td><StatusBadge status={session.status} /></td><td>{openButton(session)}</td></tr>)}</tbody></table></div></div><div className="scheduling-mobile-agenda">{sessions.map((session) => <article className="scheduling-agenda-card" key={session.id}><h3>{formatDate(session.date)}</h3><StatusBadge status={session.status} /><strong>{session.start}–{session.end} · {session.className}</strong><p>Phòng {session.roomId} · Trực tiếp</p>{openButton(session)}</article>)}</div></Panel>}
    {selectedDay && <div className="scheduling-detail-grid"><Panel title={`${formatDate(selectedDay.date)}`} hint="Một buổi học trong lịch cá nhân."><p>{selectedDay.start}–{selectedDay.end} · {selectedDay.className} · Phòng {selectedDay.roomId}</p>{onOpenSession && <button type="button" className="scheduling-primary" onClick={() => open(selectedDay)}>Xem chi tiết buổi</button>}</Panel><Panel title="Trạng thái buổi"><div className="scheduling-legend"><StatusBadge status="CONFIRMED" /><StatusBadge status="DRAFT" /><StatusBadge status="CANCELLED" /></div></Panel></div>}
    <p className="scheduling-hint">Tuần gồm {formatDate(week)}–{formatDate(addDays(week, 6))}; dữ liệu mẫu không xác lập quyền hiệu lực.</p>
  </div>
}
