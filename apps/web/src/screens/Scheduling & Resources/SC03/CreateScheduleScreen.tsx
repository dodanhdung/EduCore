import { useRef, useState } from 'react'
import type { SchedulingData } from '../SchedulingTypes.ts'
import { formatDate, shortDate, timezoneLabel } from '../SchedulingDates.ts'
import { candidateDates, validateDraft } from '../SchedulingLogic.ts'
import type { DraftErrors, ScheduleDraft } from '../SchedulingLogic.ts'
import { Panel, PendingAction } from '../SchedulingPrimitives.tsx'
import { ConflictPanel } from '../SC04/ConflictPanel.tsx'
import type { ScheduleConflict } from '../SC04/ConflictPanel.tsx'
import { conflictsFromServer } from '../SchedulingAdapter.ts'
import type { ApiPreview } from '../SchedulingAdapter.ts'
import '../SchedulingScreens.css'

const weekdays = [[1, 'Thứ 2'], [2, 'Thứ 3'], [3, 'Thứ 4'], [4, 'Thứ 5'], [5, 'Thứ 6'], [6, 'Thứ 7'], [0, 'Chủ nhật']] as const
const blankDraft: ScheduleDraft = { classId: '', teacherId: '', roomId: '', format: 'IN_PERSON', date: '', start: '', end: '', repeat: 'SINGLE', weekdays: [], repeatUntil: '' }
const sampleDraft: ScheduleDraft = { classId: 'ENG-C1', teacherId: 'GV-018', roomId: 'P.304', format: 'IN_PERSON', date: '2026-10-23', start: '17:00', end: '18:30', repeat: 'WEEKLY', weekdays: [5], repeatUntil: '2026-12-11' }

type SavedDraft = { id: string; series: boolean; preview: ApiPreview | null }
export function CreateScheduleScreen({ data, preview = false, timeZone, conflicts = [], race = false, initialConflictOpen = false, initialRepeat = 'WEEKLY', canCreate = true, canConfirm = false, busy = false, onSaveDraft, onCheckDraft, onConfirmDraft }: {
  data?: SchedulingData; preview?: boolean; timeZone?: string; conflicts?: readonly ScheduleConflict[]; race?: boolean; initialConflictOpen?: boolean; initialRepeat?: 'SINGLE' | 'WEEKLY'; canCreate?: boolean; canConfirm?: boolean; busy?: boolean;
  onSaveDraft?: (draft: ScheduleDraft, reason: string) => Promise<SavedDraft | null>; onCheckDraft?: (saved: SavedDraft) => Promise<ApiPreview | null>; onConfirmDraft?: (saved: SavedDraft, reason: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<ScheduleDraft>(preview ? { ...sampleDraft, repeat: initialRepeat } : blankDraft)
  const [errors, setErrors] = useState<DraftErrors & { reason?: string }>({})
  const [step, setStep] = useState<1 | 2 | 3>(initialConflictOpen ? 2 : 1)
  const [conflictOpen, setConflictOpen] = useState(initialConflictOpen)
  const [notice, setNotice] = useState(false)
  const [reason, setReason] = useState('')
  const [saved, setSaved] = useState<SavedDraft | null>(null)
  const generation = useRef(0)
  const classes = data?.classes ?? []
  const teachers = data?.teachers?.map((item) => [item.id, item.name] as const) ?? [...new Map((data?.sessions ?? []).map((session) => [session.teacherId, session.teacherName])).entries()]
  const enrollment = classes.find((item) => item.id === draft.classId)?.enrollmentCount
  const rooms = (data?.rooms ?? []).filter((room) => room.status === 'ACTIVE' && (preview || enrollment === undefined || room.capacity >= enrollment))
  const candidates = candidateDates(draft)
  const className = classes.find((item) => item.id === draft.classId)?.name ?? draft.classId
  const teacherName = teachers.find(([id]) => id === draft.teacherId)?.[1] ?? draft.teacherId
  const set = <K extends keyof ScheduleDraft>(key: K, value: ScheduleDraft[K]) => { if (busy) return; generation.current += 1; setDraft((current) => ({ ...current, [key]: value })); setErrors((current) => ({ ...current, [key]: undefined })); setNotice(false); setSaved(null) }
  const next = () => { const found = validateDraft(draft); setErrors(found); if (Object.keys(found).length === 0) setStep(step === 1 ? 2 : 3) }
  const err = (key: keyof ScheduleDraft) => errors[key] && <span className="scheduling-error" id={`schedule-${key}-error`} role="alert">{errors[key]}</span>
  const input = (key: 'date' | 'start' | 'end' | 'repeatUntil', label: string, type: 'date' | 'time') => <label className="scheduling-field" key={key}>{label}<input type={type} value={draft[key]} aria-invalid={Boolean(errors[key])} aria-describedby={errors[key] ? `schedule-${key}-error` : undefined} onChange={(event) => set(key, event.target.value)} />{err(key)}</label>
  const openConflict = () => setConflictOpen(true)
  const serverConflicts = conflictsFromServer(saved?.preview)
  const save = async () => { if (!onSaveDraft || !canCreate || !reason.trim()) { setErrors((current) => ({ ...current, reason: 'Vui lòng nhập lý do.' })); return }
    const found = validateDraft(draft); setErrors(found); if (Object.keys(found).length) return
    const current = generation.current
    const result = await onSaveDraft(draft, reason); if (result && generation.current === current) { setSaved(result); setStep(2); if (!result.preview?.ready) setConflictOpen(true) }
  }
  const check = async () => { if (!saved || !onCheckDraft) return; const current = generation.current; const result = await onCheckDraft(saved); if (generation.current !== current) return; setSaved({ ...saved, preview: result }); if (!result?.ready) setConflictOpen(true) }
  const confirm = async () => { if (!saved || !saved.preview?.ready || saved.preview.conflicts.length || !canConfirm || !onConfirmDraft) return; if (await onConfirmDraft(saved, reason)) { setSaved(null); setNotice(true) } }

  return <div className="scheduling-page">
    <div className="scheduling-heading"><div><h1>Tạo lịch / buổi học</h1><p>{preview ? `${className || 'Chọn lớp'} · Dữ liệu mẫu` : `${className || 'Chọn lớp'} · Dữ liệu từ dịch vụ`} · {timezoneLabel(timeZone)}</p></div></div>
    <div className="scheduling-steps" role="tablist" aria-label="Bước tạo lịch">{[[1, 'Thông tin buổi'], [2, 'Xem trước'], [3, 'Xác nhận']] .map(([value, label]) => <button type="button" role="tab" aria-selected={step === value} disabled={Number(value) > step} key={value} onClick={() => setStep(value as 1 | 2 | 3)}>{value} · {label}</button>)}</div>
    {!data && <p role="alert" className="scheduling-pending">Chưa có dữ liệu lớp, giáo viên và phòng từ dịch vụ. Không thể tạo hoặc xác nhận lịch.</p>}
    {step === 1 && <div className="scheduling-create-grid"><Panel title="Chọn lớp và tài nguyên" hint={`Thời gian theo ${timezoneLabel(timeZone)}.`}><div className="scheduling-fields">
      <label className="scheduling-field">Lớp<select value={draft.classId} aria-invalid={Boolean(errors.classId)} onChange={(event) => set('classId', event.target.value)}><option value="">Chọn lớp</option>{classes.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select>{err('classId')}</label>
      <label className="scheduling-field">Giáo viên<select value={draft.teacherId} aria-invalid={Boolean(errors.teacherId)} onChange={(event) => set('teacherId', event.target.value)}><option value="">Chọn giáo viên</option>{teachers.filter(([id]) => !data?.assignments || data.assignments.some((assignment) => assignment.classId === draft.classId && assignment.teacherId === id && assignment.validFrom.slice(0, 10) <= draft.date && (!assignment.validTo || draft.date < assignment.validTo.slice(0, 10)))).map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select>{err('teacherId')}</label>
      <label className="scheduling-field">Hình thức<select value={draft.format} onChange={(event) => set('format', event.target.value as ScheduleDraft['format'])}><option value="IN_PERSON">Học trực tiếp</option><option value="ONLINE">Học trực tuyến</option></select></label>
      {draft.format === 'IN_PERSON' && <label className="scheduling-field">Phòng<select value={draft.roomId} aria-invalid={Boolean(errors.roomId)} onChange={(event) => set('roomId', event.target.value)}><option value="">Chọn phòng</option>{rooms.map((room) => <option value={room.id} key={room.id}>{room.id} · {room.capacity} chỗ</option>)}</select>{err('roomId')}</label>}
      {input('date', 'Ngày bắt đầu', 'date')}{input('start', 'Giờ bắt đầu', 'time')}{input('end', 'Giờ kết thúc', 'time')}
    </div><h3>Lặp lại</h3><p className="scheduling-hint">Một buổi hoặc hằng tuần, tối đa sáu tháng.</p><div className="scheduling-choice" role="group" aria-label="Kiểu lịch lặp"><button type="button" aria-pressed={draft.repeat === 'SINGLE'} onClick={() => set('repeat', 'SINGLE')}>Một buổi</button><button type="button" aria-pressed={draft.repeat === 'WEEKLY'} onClick={() => set('repeat', 'WEEKLY')}>Hằng tuần</button></div>
      {draft.repeat === 'WEEKLY' && <><fieldset className="scheduling-weekdays" aria-invalid={Boolean(errors.weekdays)} aria-describedby={errors.weekdays ? 'schedule-weekdays-error' : undefined}><legend>Thứ trong tuần</legend><p className="scheduling-hint">Mỗi lịch lặp hiện hỗ trợ một thứ trong tuần.</p>{weekdays.map(([number, label]) => <label key={number}><input type="radio" name="schedule-weekday" checked={draft.weekdays.length === 1 && draft.weekdays[0] === number} onChange={() => set('weekdays', [number])} />{label}</label>)}{err('weekdays')}</fieldset>{input('repeatUntil', 'Lặp đến', 'date')}</>}
    </Panel><Panel title="Kiểm tra trước khi lưu" hint={candidates.length ? `Dự kiến ${candidates.length} buổi, ${shortDate(candidates[0])}–${shortDate(candidates.at(-1)!)}.` : 'Nhập đủ thông tin để xem chuỗi dự kiến.'}><p className="scheduling-hint">Lớp, giáo viên, học sinh, phòng, lịch bận và sức chứa phải được máy chủ kiểm tra.</p>{preview ? <PendingAction>Xem trước chỉ minh họa ngày dự kiến.</PendingAction> : <p className="scheduling-hint">Bản nháp và kết quả kiểm tra không giữ chỗ. Máy chủ kiểm tra lại khi xác nhận.</p>}</Panel></div>}
    {(step === 2 || step === 3) && <><Panel title={step === 2 ? 'Xem trước các buổi' : 'Rà soát trước xác nhận'} hint={preview ? 'Dữ liệu mẫu chỉ minh họa; chưa giữ phòng, giáo viên hoặc học sinh.' : 'Kết quả máy chủ tại thời điểm kiểm tra; chưa giữ phòng, giáo viên hoặc học sinh.'}><div className="scheduling-table-scroll"><table className="scheduling-table"><thead><tr><th>BUỔI</th><th>NGÀY / GIỜ</th><th>LỚP</th><th>TÀI NGUYÊN</th><th>KẾT QUẢ</th></tr></thead><tbody>{candidates.map((date, index) => <tr key={date}><th>{String(index + 1).padStart(2, '0')}/{String(candidates.length).padStart(2, '0')}</th><td>{formatDate(date)} · {draft.start}–{draft.end}</td><td>{draft.classId}</td><td>{teacherName} · {draft.format === 'ONLINE' ? 'Trực tuyến' : draft.roomId}</td><td>{saved?.preview ? saved.preview.ready ? 'Không có xung đột tại thời điểm kiểm tra' : 'Có điều kiện không đạt' : 'Chờ máy chủ kiểm tra'}</td></tr>)}</tbody></table></div></Panel><Panel title="Xung đột lịch (SC04)"><p className="scheduling-hint">{preview ? 'Các trạng thái xung đột bên dưới chỉ dùng để xem thiết kế UI.' : saved?.preview ? `${saved.preview.conflicts.length} vấn đề từ máy chủ · Kết quả không giữ chỗ.` : 'Lưu bản nháp để kiểm tra xung đột trên máy chủ.'}</p><button type="button" onClick={openConflict}>{preview ? 'Xem panel xung đột minh họa' : 'Xem kết quả kiểm tra'}</button></Panel></>}
    {!preview && <label className="scheduling-field">Lý do<input value={reason} disabled={busy} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: undefined })) }} aria-invalid={Boolean(errors.reason)} />{errors.reason && <span role="alert" className="scheduling-error">{errors.reason}</span>}</label>}
    <div className="scheduling-form-actions scheduling-create-actions"><button type="button" onClick={() => setStep(step === 3 ? 2 : 1)} disabled={step === 1 || busy}>Quay lại</button><button type="button" disabled={busy || (!preview && !canCreate)} onClick={() => { if (preview) setNotice(true); else void save() }}>Lưu bản nháp</button>{step < 3 ? <button type="button" className="scheduling-primary" disabled={busy} onClick={next}>Tiếp tục</button> : <button type="button" disabled={preview || busy || !canConfirm || !saved?.preview?.ready || Boolean(saved?.preview?.conflicts.length)} onClick={() => { void confirm() }} aria-label={preview ? 'Xác nhận lịch đang chờ API' : undefined}>Xác nhận {draft.repeat === 'WEEKLY' ? 'cả chuỗi' : 'buổi học'}</button>}{!preview && saved && <button type="button" disabled={busy} onClick={() => { void check() }}>Kiểm tra lại</button>}</div>
    {notice && (preview ? <PendingAction>Lưu bản nháp.</PendingAction> : <p role="status">Máy chủ đã xác nhận toàn bộ yêu cầu.</p>)}
    {step === 3 && <Panel title="Quy tắc xác nhận"><p className="scheduling-hint">Máy chủ phải kiểm tra lại quyền, lịch, học sinh và sức chứa trong giao dịch khi xác nhận.</p><p className="scheduling-hint">Nếu một buổi xung đột hoặc có thay đổi đồng thời, từ chối cả chuỗi; không tạo thành công một phần.</p><PendingAction>Xác nhận lịch.</PendingAction></Panel>}
    {conflictOpen && <ConflictPanel conflicts={preview ? conflicts : serverConflicts} checkedCount={saved?.preview?.sessionIds.length ?? candidates.length} race={race} preview={preview} available={preview || Boolean(saved?.preview)} ready={preview ? undefined : saved?.preview?.ready} onClose={() => setConflictOpen(false)} onEdit={() => { setConflictOpen(false); setStep(1) }} />}
  </div>
}
