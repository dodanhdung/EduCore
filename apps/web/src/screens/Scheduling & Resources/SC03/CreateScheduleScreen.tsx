import { useState } from 'react'
import type { SchedulingData } from '../SchedulingTypes.ts'
import { formatDate, shortDate, timezoneLabel } from '../SchedulingDates.ts'
import { candidateDates, validateDraft } from '../SchedulingLogic.ts'
import type { DraftErrors, ScheduleDraft } from '../SchedulingLogic.ts'
import { Panel, PendingAction } from '../SchedulingPrimitives.tsx'
import { ConflictPanel } from '../SC04/ConflictPanel.tsx'
import type { ScheduleConflict } from '../SC04/ConflictPanel.tsx'
import '../SchedulingScreens.css'

const weekdays = [[1, 'Thứ 2'], [2, 'Thứ 3'], [3, 'Thứ 4'], [4, 'Thứ 5'], [5, 'Thứ 6'], [6, 'Thứ 7'], [0, 'Chủ nhật']] as const
const blankDraft: ScheduleDraft = { classId: '', teacherId: '', roomId: '', format: 'IN_PERSON', date: '', start: '', end: '', repeat: 'SINGLE', weekdays: [], repeatUntil: '' }
const sampleDraft: ScheduleDraft = { classId: 'ENG-C1', teacherId: 'GV-018', roomId: 'P.304', format: 'IN_PERSON', date: '2026-10-23', start: '17:00', end: '18:30', repeat: 'WEEKLY', weekdays: [5], repeatUntil: '2026-12-11' }

export function CreateScheduleScreen({ data, preview = false, timeZone, conflicts = [], race = false, initialConflictOpen = false, initialRepeat = 'WEEKLY' }: {
  data?: SchedulingData; preview?: boolean; timeZone?: string; conflicts?: readonly ScheduleConflict[]; race?: boolean; initialConflictOpen?: boolean; initialRepeat?: 'SINGLE' | 'WEEKLY'
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(preview ? { ...sampleDraft, repeat: initialRepeat } : blankDraft)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [step, setStep] = useState<1 | 2 | 3>(initialConflictOpen ? 2 : 1)
  const [conflictOpen, setConflictOpen] = useState(initialConflictOpen)
  const [notice, setNotice] = useState(false)
  const classes = data?.classes ?? []
  const teachers = [...new Map((data?.sessions ?? []).map((session) => [session.teacherId, session.teacherName])).entries()]
  const rooms = (data?.rooms ?? []).filter((room) => room.status === 'ACTIVE')
  const candidates = candidateDates(draft)
  const className = classes.find((item) => item.id === draft.classId)?.name ?? draft.classId
  const teacherName = teachers.find(([id]) => id === draft.teacherId)?.[1] ?? draft.teacherId
  const set = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => { setDraft((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); setNotice(false) }
  const next = () => { const found = validateDraft(draft); setErrors(found); if (Object.keys(found).length === 0) setStep(step === 1 ? 2 : 3) }
  const err = (key: keyof ScheduleDraft) => errors[key] && <span className="scheduling-error" id={`schedule-${key}-error`} role="alert">{errors[key]}</span>
  const input = (key: 'date' | 'start' | 'end' | 'repeatUntil', label: string, type: 'date' | 'time') => <label className="scheduling-field" key={key}>{label}<input type={type} value={draft[key]} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `schedule-${key}-error` : undefined} onChange={(event) => set(key, event.target.value)} />{err(key)}</label>
  const openConflict = () => setConflictOpen(true)

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Tạo lịch / buổi học</h1><p>{preview ? `${className || 'Chọn lớp'} · Dữ liệu mẫu` : 'Chưa kết nối dữ liệu lớp và tài nguyên'} · {timezoneLabel(timeZone)}</p></div></div>
    <div className="scheduling-steps" role="tablist" aria-label="Bước tạo lịch">{[[1, 'Thông tin buổi'], [2, 'Xem trước'], [3, 'Xác nhận']] .map(([value, label]) => <button type="button" role="tab" aria-selected={step === value} disabled={Number(value) > step} key={value} onClick={() => setStep(value as 1 | 2 | 3)}>{value} · {label}</button>)}</div>
    {!data && <p role="alert" className="scheduling-pending">Chưa có dữ liệu lớp, giáo viên và phòng từ dịch vụ. Không thể tạo hoặc xác nhận lịch.</p>}
    {step === 1 && <div className="scheduling-create-grid"><Panel title="Chọn lớp và tài nguyên" hint={`Thời gian theo ${timezoneLabel(timeZone)}.`}><div className="scheduling-fields">
      <label className="scheduling-field">Lớp<select value={draft.classId} aria-invalid={Boolean(errors.classId)} onChange={(event) => set('classId', event.target.value)}><option value="">Chọn lớp</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select>{err('classId')}</label>
      <label className="scheduling-field">Giáo viên<select value={draft.teacherId} aria-invalid={Boolean(errors.teacherId)} onChange={(event) => set('teacherId', event.target.value)}><option value="">Chọn giáo viên</option>{teachers.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>{err('teacherId')}</label>
      <label className="scheduling-field">Hình thức<select value={draft.format} onChange={(event) => set('format', event.target.value as ScheduleDraft['format'])}><option value="IN_PERSON">Học trực tiếp</option><option value="ONLINE">Học trực tuyến</option></select></label>
      {draft.format === 'IN_PERSON' && <label className="scheduling-field">Phòng<select value={draft.roomId} aria-invalid={Boolean(errors.roomId)} onChange={(event) => set('roomId', event.target.value)}><option value="">Chọn phòng</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.id} · {room.capacity} chỗ</option>)}</select>{err('roomId')}</label>}
      {input('date', 'Ngày bắt đầu', 'date')}{input('start', 'Giờ bắt đầu', 'time')}{input('end', 'Giờ kết thúc', 'time')}
    </div><h3>Lặp lại</h3><p className="scheduling-hint">Một buổi hoặc hằng tuần, tối đa sáu tháng.</p><div className="scheduling-choice" role="group" aria-label="Kiểu lịch lặp"><button type="button" aria-pressed={draft.repeat === 'SINGLE'} onClick={() => set('repeat', 'SINGLE')}>Một buổi</button><button type="button" aria-pressed={draft.repeat === 'WEEKLY'} onClick={() => set('repeat', 'WEEKLY')}>Hằng tuần</button></div>
      {draft.repeat === 'WEEKLY' && <><fieldset className="scheduling-weekdays"><legend>Thứ trong tuần</legend>{weekdays.map(([number, label]) => <label key={number}><input type="checkbox" checked={draft.weekdays.includes(number)} onChange={(event) => set('weekdays', event.target.checked ? [...draft.weekdays, number] : draft.weekdays.filter((day) => day !== number))} />{label}</label>)}{err('weekdays')}</fieldset>{input('repeatUntil', 'Lặp đến', 'date')}</>}
    </Panel><Panel title="Kiểm tra trước khi lưu" hint={candidates.length ? `Dự kiến ${candidates.length} buổi, ${shortDate(candidates[0])}–${shortDate(candidates.at(-1)!)}.` : 'Nhập đủ thông tin để xem chuỗi dự kiến.'}><p className="scheduling-hint">Lớp, giáo viên, học sinh, phòng, lịch bận và sức chứa phải được máy chủ kiểm tra.</p><PendingAction>Xem trước chỉ minh họa ngày dự kiến.</PendingAction></Panel></div>}
    {(step === 2 || step === 3) && <><Panel title={step === 2 ? 'Xem trước các buổi' : 'Rà soát trước xác nhận'} hint="Dữ liệu mẫu chỉ minh họa; chưa giữ phòng, giáo viên hoặc học sinh."><div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>BUỔI</th><th>NGÀY / GIỜ</th><th>LỚP</th><th>TÀI NGUYÊN</th><th>KẾT QUẢ</th></tr></thead><tbody>{candidates.map((date, index) => <tr key={date}><th>{String(index + 1).padStart(2, '0')}/{String(candidates.length).padStart(2, '0')}</th><td>{formatDate(date)} · {draft.start}–{draft.end}</td><td>{draft.classId}</td><td>{teacherName} · {draft.format === 'ONLINE' ? 'Trực tuyến' : draft.roomId}</td><td>Chờ máy chủ kiểm tra</td></tr>)}</tbody></table></div></Panel><Panel title="Xung đột lịch (SC04)"><p className="scheduling-hint">Các trạng thái xung đột bên dưới chỉ dùng để xem thiết kế UI.</p><button type="button" onClick={openConflict}>Xem panel xung đột minh họa</button></Panel></>}
    <div className="scheduling-form-actions scheduling-create-actions"><button type="button" onClick={() => setStep(step === 3 ? 2 : 1)} disabled={step === 1}>Quay lại</button><button type="button" onClick={() => setNotice(true)}>Lưu bản nháp</button>{step < 3 ? <button type="button" className="scheduling-primary" onClick={next}>Tiếp tục</button> : <button type="button" disabled aria-label="Xác nhận lịch đang chờ API">Xác nhận {draft.repeat === 'WEEKLY' ? 'cả chuỗi' : 'buổi học'}</button>}</div>
    {notice && <PendingAction>Lưu bản nháp.</PendingAction>}
    {step === 3 && <Panel title="Quy tắc xác nhận"><p className="scheduling-hint">Máy chủ phải kiểm tra lại quyền, lịch, học sinh và sức chứa trong giao dịch khi xác nhận.</p><p className="scheduling-hint">Nếu một buổi xung đột hoặc có thay đổi đồng thời, từ chối cả chuỗi; không tạo thành công một phần.</p><PendingAction>Xác nhận lịch.</PendingAction></Panel>}
    {conflictOpen && <ConflictPanel conflicts={conflicts} checkedCount={candidates.length} race={race} onClose={() => setConflictOpen(false)} onEdit={() => { setConflictOpen(false); setStep(1) }} />}
  </div>
}
