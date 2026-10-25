import { useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { tenantPath } from '../../routes.ts'
import { validScore, validateSelection } from './AssignmentTypes.ts'
import { Badge, Button, Card, Notice, Page, State } from './AssignmentPrimitives.tsx'

type Assignment = { id: string; title: string; description: string; class_id: string | null; deadline_at: string; priority: number; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; revision: number }
type Recipient = { id: string; studentName: string; assignment_id: string; revoked_at: string | null; deadline_override_at: string | null; submission_status: string | null; current_version_id: string | null }
type Version = { id: string; version_no: number; submitted_at: string; answer_text: string | null; is_late: boolean; fileIds: string[] }
type History = { submissionId: string | null; currentVersionId: string | null; versions: Version[] }
type Mine = { id: string; title: string; description: string; className: string | null; deadlineAt: string; priority: number; status: 'PUBLISHED' | 'ARCHIVED'; recipientId: string; submissionId: string | null; versionNo: number | null; isLate: boolean | null; canSubmit: boolean; gradeId: string | null; score: string | null; feedback: string | null }
type Queue = { submissionId: string; versionId: string; versionNo: number; submittedAt: string; isLate: boolean; assignmentId: string; assignmentTitle: string; className: string | null; studentName: string; gradeId: string | null; gradeStatus: string | null; gradeRevision: number | null; score: string | null }
type GradeItem = { submissionId: string; recipientId: string; assignmentTitle: string; studentName: string; currentVersionId: string; timezone: string; versions: Version[]; grade: { id: string; revision: number; status: string; score: string; feedback: string | null } | null }
type ClassItem = { id: string; name: string }
type CommandResult = { id: string; revision: number; status: string }
type Props = { id: 'AS01' | 'AS02' | 'AS03' | 'AS04' | 'AS05' | 'AS06' | 'AS07'; tenantId: string; token: string; selectedId?: string; navigate: (path: string) => void }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
const key = () => crypto.randomUUID()
const date = (value: string, timeZone: string) => new Intl.DateTimeFormat('vi-VN', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
function tenantInstant(local: string, timeZone: string): string {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(local)) throw new Error('INVALID_DEADLINE')
  const format = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const wall = (value: number) => {
    const p = Object.fromEntries(format.formatToParts(new Date(value)).map(part => [part.type, part.value]))
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`
  }
  const wanted = Date.parse(`${local}:00Z`)
  let instant = wanted
  for (let i = 0; i < 3; i++) {
    const observed = Date.parse(`${wall(instant)}:00Z`)
    instant -= observed - wanted
  }
  if (wall(instant) !== local) throw new Error('INVALID_LOCAL_DEADLINE')
  return new Date(instant).toISOString()
}
const issue = (e: unknown) => e instanceof ApiError && e.status === 409 ? 'Dữ liệu đã thay đổi. Tải lại màn hình trước khi tiếp tục.' : safeErrorMessage(e)

export function AssignmentsProduction(props: Props) {
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('')
  const [assignments, setAssignments] = useState<Assignment[]>([]), [classes, setClasses] = useState<ClassItem[]>([])
  const [timeZone, setTimeZone] = useState('')
  const [mine, setMine] = useState<Mine[]>([]), [queue, setQueue] = useState<Queue[]>([])
  const [recipients, setRecipients] = useState<Recipient[]>([]), [histories, setHistories] = useState<Record<string, History>>({})
  const [gradeItem, setGradeItem] = useState<GradeItem | null>(null)
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all')
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [classId, setClassId] = useState(''), [deadline, setDeadline] = useState(''), [priority, setPriority] = useState('3')
  const [score, setScore] = useState(''), [feedback, setFeedback] = useState(''), [reason, setReason] = useState('')
  const [answer, setAnswer] = useState(''), [files, setFiles] = useState<File[]>([]), [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [now] = useState(() => Date.now())
  const createdDraft = useRef<CommandResult | null>(null)
  const [createKey] = useState(key), [publishKey] = useState(key)
  const pendingSubmission = useRef<{ answer: string; files: File[]; fileIds: string[]; key: string } | null>(null)
  const read = <T,>(path: string) => api.learning<T>(props.tenantId, path, props.token)
  const write = <T,>(path: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown, revision?: number, requestKey?: string) =>
    api.learning<T>(props.tenantId, path, props.token, { method, body, idempotencyKey: requestKey ?? key(), ifMatch: revision })
  const teacherPath = (suffix: string) => tenantPath(props.tenantId, `/teaching/${suffix}`)
  const studentPath = (suffix: string) => tenantPath(props.tenantId, `/my/${suffix}`)
  const reload = async () => {
    setLoading(true); setError('')
    try {
      if (props.id === 'AS01' || props.id === 'AS02' || props.id === 'AS03') {
        const [list, cls] = await Promise.all([read<Assignment[]>('/teaching/assignments'), read<{ classes: ClassItem[]; timezone: string }>('/teaching/assignment-classes')])
        setAssignments(list); setClasses(cls.classes); setTimeZone(cls.timezone)
        if (props.id === 'AS03' && props.selectedId) {
          const rows = await read<Recipient[]>(`/teaching/assignments/${encodeURIComponent(props.selectedId)}/recipients`)
          setRecipients(rows)
          const historyRows = await Promise.all(rows.map(async r => [r.id, await read<History>(`/assignment-recipients/${r.id}/submissions`)] as const))
          setHistories(Object.fromEntries(historyRows))
        }
      } else if (props.id === 'AS04') { const result = await read<{items: Queue[]; timezone: string}>('/grading/queue'); setQueue(result.items); setTimeZone(result.timezone) }
      else if (props.id === 'AS05' && props.selectedId) {
        const item = await read<GradeItem>(`/submissions/${props.selectedId}/grading-context`)
        setGradeItem(item); setScore(item.grade?.score ?? ''); setFeedback(item.grade?.feedback ?? ''); setTimeZone(item.timezone)
      } else if (props.id === 'AS06' || props.id === 'AS07') {
        const result = await read<{items: Mine[]; timezone: string}>('/my/assignments'); const rows = result.items; setMine(rows); setTimeZone(result.timezone)
        if (props.id === 'AS07' && props.selectedId) {
          const item = rows.find(row => row.id === props.selectedId)
          if (item) setHistories({ [item.recipientId]: await read<History>(`/assignment-recipients/${item.recipientId}/submissions`) })
        }
      }
    } catch (e) { setError(issue(e)) } finally { setLoading(false) }
  }
  useEffect(() => { void reload() }, [props.id, props.selectedId, props.tenantId, props.token])
  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('')
    try { await action(); setMessage(success); await reload() } catch (e) { setError(issue(e)) } finally { setBusy(false) }
  }
  const selected = assignments.find(a => a.id === props.selectedId)
  const studentItem = mine.find(a => a.id === props.selectedId)
  const className = (id: string | null) => classes.find(c => c.id === id)?.name ?? 'Lớp được giao'
  const when = (value: string) => timeZone ? date(value, timeZone) : new Date(value).toISOString()
  useEffect(() => {
    if (!['AS02', 'AS03'].includes(props.id) || !selected || !timeZone) return
    setTitle(selected.title); setDescription(selected.description); setClassId(selected.class_id ?? '')
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(selected.deadline_at))
    const p = Object.fromEntries(parts.map(part => [part.type, part.value]))
    setDeadline(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`); setPriority(String(selected.priority))
  }, [props.id, selected?.id, timeZone])
  if (loading) return <Page title="Bài tập"><State kind="loading" /></Page>
  if (error && !assignments.length && !mine.length && !queue.length && !gradeItem) return <Page title="Bài tập"><p role="alert">{error}</p><Button onClick={() => void reload()}>Thử lại</Button></Page>
  const alerts = <>{error && <p role="alert" className="as-error">{error}</p>}{message && <Notice>{message}</Notice>}</>

  if (props.id === 'AS01') {
    const rows = assignments.filter(a => `${a.title} ${className(a.class_id)}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (status === 'all' || a.status === status))
    return <Page title="Danh sách bài tập" action={<Button onClick={() => props.navigate(teacherPath('assignments/new'))}>Tạo bài tập</Button>}>
      {alerts}<Card title="Tìm bài tập"><label className="as-field">Tìm kiếm<input value={search} onChange={e => setSearch(e.target.value)} /></label><label className="as-field">Trạng thái<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Tất cả</option><option value="DRAFT">Bản nháp</option><option value="PUBLISHED">Đã giao</option><option value="ARCHIVED">Đã lưu trữ</option></select></label></Card>
      <Card title="Bài tập trong phạm vi"><ul className="as-list">{rows.map(a => <li key={a.id}><button className="as-link" onClick={() => props.navigate(teacherPath(`assignments/${a.id}`))}>{a.title}</button> · {className(a.class_id)} · {when(a.deadline_at)} · Ưu tiên {a.priority}/5 · {a.status}</li>)}</ul>{!rows.length && <p>Không có bài tập phù hợp.</p>}</Card>
    </Page>
  }
  if (props.id === 'AS02') {
    if (props.selectedId && !selected) return <Page title="Chỉnh sửa bài tập"><State kind="not-found" /></Page>
    if (selected && selected.status !== 'DRAFT') return <Page title="Chỉnh sửa bài tập"><Notice>Chỉ hỗ trợ chỉnh sửa bản nháp ở màn hình này.</Notice></Page>
    const valid = title.trim() && description.trim() && classId && deadline && /^[1-5]$/.test(priority)
    const save = async (publish: boolean) => {
      if (!valid) { setError('Nhập đầy đủ tiêu đề, mô tả, lớp, hạn nộp và ưu tiên 1–5.'); return }
      if (publish && !window.confirm('Xuất bản bài tập cho học sinh trong lớp đã chọn?')) return
      await act(async () => {
        const body = { title: title.trim(), description: description.trim(), priority: Number(priority), deadlineAt: tenantInstant(deadline, timeZone) }
        const saved = selected
          ? await write<CommandResult>(`/assignments/${selected.id}`, 'PATCH', body, selected.revision)
          : createdDraft.current ?? await write<CommandResult>('/assignments', 'POST', { ...body, classId }, undefined, createKey)
        createdDraft.current = saved
        if (publish) await write(`/assignments/${saved.id}/publish`, 'POST', {}, saved.revision, publishKey)
        props.navigate(teacherPath(`assignments/${saved.id}`))
      }, publish ? 'Đã xuất bản bài tập.' : 'Đã lưu bản nháp.')
    }
    return <Page title="Tạo và giao bài tập" action={<Button secondary onClick={() => props.navigate(teacherPath('assignments'))}>Quay lại</Button>}>
      {alerts}<Card title="Nội dung"><label className="as-field">Tiêu đề<input value={title} onChange={e => setTitle(e.target.value)} /></label><label className="as-field">Lớp<select value={classId} onChange={e => setClassId(e.target.value)}><option value="">Chọn lớp</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label className="as-field">Mô tả<textarea value={description} onChange={e => setDescription(e.target.value)} /></label><label className="as-field">Hạn nộp theo giờ địa phương<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></label><label className="as-field">Ưu tiên<input type="number" min="1" max="5" step="1" value={priority} onChange={e => setPriority(e.target.value)} /></label></Card>
      <div className="as-actions"><Button disabled={busy || !valid} secondary onClick={() => void save(false)}>Lưu bản nháp</Button><Button disabled={busy || !valid} onClick={() => void save(true)}>Xác nhận xuất bản</Button></div><Notice>Người nhận được xác thực và chụp tại backend. Lưu nháp không gửi thông báo.</Notice>
    </Page>
  }
  if (props.id === 'AS03') {
    if (!selected) return <Page title="Chi tiết bài tập"><State kind="not-found" /></Page>
    return <Page title="Chi tiết bài tập" action={<Button secondary onClick={() => props.navigate(teacherPath('assignments'))}>Danh sách</Button>}>
      {alerts}<Card title={selected.title}><p>{selected.description}</p><p>{className(selected.class_id)} · {when(selected.deadline_at)} · Ưu tiên {selected.priority}/5</p><Badge tone={selected.status === 'PUBLISHED' ? 'success' : 'warning'}>{selected.status}</Badge><p>Phiên bản {selected.revision}</p>
      {selected.status === 'DRAFT' && <Button secondary onClick={() => setEditing(!editing)}>{editing ? 'Đóng chỉnh sửa' : 'Chỉnh sửa bản nháp'}</Button>}
      {selected.status === 'DRAFT' && <Button onClick={() => { if (window.confirm('Xuất bản bài tập này?')) void act(() => write(`/assignments/${selected.id}/publish`, 'POST', {}, selected.revision), 'Đã xuất bản bài tập.') }}>Xuất bản</Button>}
      {selected.status === 'PUBLISHED' && <Button secondary onClick={() => { const reason = window.prompt('Lý do lưu trữ'); if (reason?.trim()) void act(() => write(`/assignments/${selected.id}/archive`, 'POST', { reason }, selected.revision), 'Đã lưu trữ.') }}>Lưu trữ</Button>}</Card>
      {editing && selected.status === 'DRAFT' && <Card title="Chỉnh sửa bản nháp"><label className="as-field">Tiêu đề<input value={title} onChange={e => setTitle(e.target.value)} /></label><label className="as-field">Mô tả<textarea value={description} onChange={e => setDescription(e.target.value)} /></label><label className="as-field">Hạn nộp<input type="datetime-local" value={deadline} onChange={e => setDeadline(e.target.value)} /></label><label className="as-field">Ưu tiên<input type="number" min="1" max="5" step="1" value={priority} onChange={e => setPriority(e.target.value)} /></label><Button disabled={busy || !title.trim() || !description.trim() || !deadline || !/^[1-5]$/.test(priority)} onClick={() => void act(async () => { await write(`/assignments/${selected.id}`, 'PATCH', { title: title.trim(), description: description.trim(), deadlineAt: tenantInstant(deadline, timeZone), priority: Number(priority) }, selected.revision); setEditing(false) }, 'Đã lưu bản nháp.')}>Lưu chỉnh sửa</Button></Card>}
      <Card title="Người nhận và bài nộp"><ul className="as-list">{recipients.map(r => <li key={r.id}>{r.studentName} · {r.revoked_at ? 'Đã thu hồi' : r.submission_status ?? 'Chưa nộp'}
        {histories[r.id]?.versions.map(v => <div key={v.id}>v{v.version_no} · {when(v.submitted_at)} {v.is_late && '· Nộp muộn'} {histories[r.id]?.submissionId && <button className="as-link" onClick={() => props.navigate(teacherPath(`submissions/${histories[r.id].submissionId}/grade`))}>Chấm bài</button>}</div>)}
        {!r.revoked_at && selected.status === 'PUBLISHED' && <button className="as-link" onClick={() => { const reason = window.prompt('Lý do thu hồi'); if (reason?.trim()) void act(() => write(`/assignment-recipients/${r.id}/revocation`, 'POST', { reason }, selected.revision), 'Đã thu hồi người nhận.') }}>Thu hồi</button>}
        {!r.revoked_at && selected.status === 'PUBLISHED' && <button className="as-link" onClick={() => { const local = window.prompt('Hạn mới theo giờ trung tâm (YYYY-MM-DDTHH:mm)'); const reason = local && window.prompt('Lý do gia hạn'); if (local && reason?.trim()) void act(() => write(`/assignment-recipients/${r.id}/deadline-extension`, 'POST', { deadlineAt: tenantInstant(local, timeZone), reason }, selected.revision), 'Đã gia hạn người nhận.') }}>Gia hạn</button>}
      </li>)}</ul>{!recipients.length && <p>Không có người nhận.</p>}</Card>
    </Page>
  }
  if (props.id === 'AS04') {
    const rows = queue.filter(q => status === 'all' || (status === 'UNGRADED' ? !q.gradeStatus : q.gradeStatus === status))
    return <Page title="Hàng chờ chấm bài">{alerts}<Card title="Bài nộp"><label className="as-field">Trạng thái<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Tất cả</option><option value="UNGRADED">Chưa chấm</option><option value="DRAFT">Nháp</option><option value="PUBLISHED">Đã công bố</option></select></label><ul className="as-list">{rows.map(q => <li key={q.submissionId}><button className="as-link" onClick={() => props.navigate(teacherPath(`submissions/${q.submissionId}/grade`))}>{q.studentName} · {q.assignmentTitle}</button> · v{q.versionNo} · {when(q.submittedAt)} {q.isLate && '· Muộn'} · {q.gradeStatus ?? 'Chưa chấm'}</li>)}</ul>{!rows.length && <p>Không có bài cần chấm.</p>}</Card></Page>
  }
  if (props.id === 'AS05') {
    if (!gradeItem) return <Page title="Chấm bài"><State kind="not-found" /></Page>
    const latest = gradeItem.versions.at(-1)
    const published = gradeItem.grade?.status === 'PUBLISHED'
    const save = () => act(async () => {
      if (!validScore(score)) throw new ApiError(400, 'INVALID_SCORE')
      if (published) {
        if (!reason.trim()) throw new ApiError(400, 'REASON_REQUIRED')
        await write(`/grades/${gradeItem.grade!.id}/revisions`, 'POST', { score, feedback, reason }, gradeItem.grade!.revision)
      } else await write(`/submission-versions/${gradeItem.currentVersionId}/grade-draft`, 'PUT', { score, feedback }, gradeItem.grade?.revision ?? 0)
    }, published ? 'Đã lưu bản sửa điểm. Cần công bố riêng.' : 'Đã lưu nháp điểm.')
    return <Page title="Chấm điểm và phản hồi" subtitle={`${gradeItem.studentName} · ${gradeItem.assignmentTitle}`} action={<Button secondary onClick={() => props.navigate(teacherPath('grading'))}>Hàng chờ</Button>}>
      {alerts}<Card title="Bài nộp và lịch sử"><p>Phiên bản hiện tại v{latest?.version_no}. Chỉ phiên bản này được chấm.</p><ul className="as-list">{gradeItem.versions.map(v => <li key={v.id}><strong>v{v.version_no}{v.id === gradeItem.currentVersionId ? ' · hiện tại' : ''}</strong> · {when(v.submitted_at)} {v.is_late && '· Nộp muộn'}<p>{v.answer_text}</p>{v.fileIds.map(id => <button key={id} className="as-link" onClick={() => void api.downloadAssignmentFile(props.tenantId, id, props.token).catch(e => setError(issue(e)))}>Tải tệp đính kèm</button>)}</li>)}</ul></Card>
      <Card title="Điểm"><p>{gradeItem.grade ? `${gradeItem.grade.status} · Lần sửa ${gradeItem.grade.revision}` : 'Chưa chấm'}</p><label className="as-field">Điểm 0–10<input value={score} onChange={e => setScore(e.target.value)} inputMode="decimal" /></label><label className="as-field">Phản hồi<textarea value={feedback} onChange={e => setFeedback(e.target.value)} /></label>{published && <label className="as-field">Lý do sửa điểm<textarea value={reason} onChange={e => setReason(e.target.value)} /></label>}</Card>
      <div className="as-actions"><Button disabled={busy || !latest || !validScore(score)} secondary onClick={() => void save()}>{published ? 'Lưu bản sửa' : 'Lưu nháp'}</Button>{gradeItem.grade?.status === 'DRAFT' && <Button disabled={busy} onClick={() => { if (window.confirm('Công bố điểm cho học sinh?')) void act(() => write(`/submission-versions/${gradeItem.currentVersionId}/grades/publish`, 'POST', { revision: gradeItem.grade!.revision }), 'Đã công bố điểm.') }}>Công bố điểm</Button>}</div>
    </Page>
  }
  if (props.id === 'AS06') return <Page title="Bài tập của tôi">{alerts}<Card title="Bài đã giao"><ul className="as-list">{mine.map(a => <li key={a.id}><button className="as-link" onClick={() => props.navigate(studentPath(`assignments/${a.id}`))}>{a.title}</button> · {a.className} · {when(a.deadlineAt)} · Ưu tiên {a.priority}/5 · {a.status === 'ARCHIVED' ? 'Đã lưu trữ · ' : ''}{a.score ? `Điểm ${a.score}/10` : a.versionNo ? a.isLate ? 'Đã nộp muộn' : 'Đã nộp' : 'Chưa nộp'}</li>)}</ul>{!mine.length && <p>Chưa có bài tập được giao.</p>}</Card></Page>
  if (!studentItem) return <Page title="Chi tiết bài tập"><State kind="not-found" /></Page>
  const history = histories[studentItem.recipientId]
  const expired = now > Date.parse(studentItem.deadlineAt) + 168 * 60 * 60 * 1000
  const submit = () => act(async () => {
    const selected = validateSelection([], files)
    if (selected.errors.length || selected.files.length !== files.length || (!answer.trim() && !files.length)) throw new ApiError(400, 'INVALID_SUBMISSION')
    if (!pendingSubmission.current || pendingSubmission.current.answer !== answer.trim() || pendingSubmission.current.files.length !== files.length || pendingSubmission.current.files.some((f, i) => f !== files[i]))
      pendingSubmission.current = { answer: answer.trim(), files: [...files], fileIds: [], key: key() }
    const pending = pendingSubmission.current
    for (const f of files.slice(pending.fileIds.length)) { const result = await api.uploadAssignmentFile<{ id: string }>(props.tenantId, studentItem.recipientId, f, props.token); pending.fileIds.push(result.id) }
    await write(`/assignment-recipients/${studentItem.recipientId}/submissions`, 'POST', { answerText: pending.answer, fileIds: pending.fileIds }, undefined, pending.key)
    pendingSubmission.current = null
    setAnswer(''); setFiles([])
  }, 'Đã nộp bài thành công.')
  return <Page title="Chi tiết và nộp bài" action={<Button secondary onClick={() => props.navigate(studentPath('assignments'))}>Bài tập của tôi</Button>}>
    {alerts}<Card title={studentItem.title}><p>{studentItem.description}</p><p>{studentItem.className} · Hạn {when(studentItem.deadlineAt)} · Ưu tiên {studentItem.priority}/5</p>{studentItem.score && <p>Điểm đã công bố: {studentItem.score}/10 · {studentItem.feedback}</p>}</Card>
    <Card title="Nộp bài"><label className="as-field">Bài làm<textarea value={answer} onChange={e => setAnswer(e.target.value)} disabled={expired || !studentItem.canSubmit} /></label><label className="as-field">Tệp đính kèm<input type="file" multiple accept=".pdf,.docx,.jpg,.png" disabled={expired || !studentItem.canSubmit} onChange={e => setFiles(Array.from(e.target.files ?? []))} /></label><p>{files.length} / 5 tệp · tối đa 10,000,000 byte mỗi tệp.</p><Button disabled={busy || expired || !studentItem.canSubmit || (!answer.trim() && !files.length)} onClick={() => void submit()}>Nộp bài</Button>{expired && <Notice>Đã hết cửa sổ nộp bài 168 giờ sau hạn.</Notice>}{studentItem.status === 'ARCHIVED' ? <Notice>Bài tập đã lưu trữ. Lịch sử và điểm đã công bố vẫn xem được; không nhận bài nộp mới.</Notice> : !studentItem.canSubmit && <Notice>Phiên bản nộp tiếp theo đang bị khóa theo trạng thái chấm bài.</Notice>}</Card>
    <Card title="Lịch sử bài nộp"><ul className="as-list">{history?.versions.map(v => <li key={v.id}>v{v.version_no} · {when(v.submitted_at)} {v.is_late && '· Nộp muộn'} · {v.answer_text}{v.fileIds.map(id => <button key={id} className="as-link" onClick={() => void api.downloadAssignmentFile(props.tenantId, id, props.token).catch(e => setError(issue(e)))}>Tải tệp</button>)}</li>)}</ul>{!history?.versions.length && <p>Chưa có phiên bản nộp bài.</p>}</Card>
  </Page>
}
