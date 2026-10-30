import { useEffect, useRef, useState } from 'react'
import { ApiClient, safeErrorMessage } from '../../api.ts'
import type { Capabilities, ClassRow, Enrollment, Page, Person, PlacementContext } from './AcademicApi.ts'
import { tenantLocalToUtc } from './AcademicTime.ts'

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
type Mode = 'ENROLL' | 'TRANSFER_REQUEST'
type Grade = PlacementContext['publishedAssessments'][number]

export function AcademicAdmission({ tenantId, token, studentId, classId, enrollments, onChanged }: {
  tenantId: string; token: string; studentId?: string; classId?: string;
  enrollments: Enrollment[]; onChanged: () => void
}) {
  const [mode, setMode] = useState<Mode>('ENROLL')
  const [student, setStudent] = useState(studentId ?? '')
  const [target, setTarget] = useState(classId ?? '')
  const [source, setSource] = useState('')
  const [context, setContext] = useState<PlacementContext | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [basis, setBasis] = useState('STAFF_CONFIRMATION')
  const [gradeId, setGradeId] = useState('')
  const [reason, setReason] = useState('')
  const [effective, setEffective] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const pendingRequest = useRef<{ body: string; key: string } | null>(null)
  const inFlight = useRef(false)
  const [students, setStudents] = useState<Person[]>([])
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [choicesState, setChoicesState] = useState('loading')
  const [choicesRevision, setChoicesRevision] = useState(0)
  const [loadedContext, setLoadedContext] = useState('')
  const selectedSource = enrollments.find((item) => item.id === source)
  const effectiveStudent = mode === 'TRANSFER_REQUEST' ? selectedSource?.studentId ?? studentId ?? '' : student
  const contextScope = JSON.stringify([tenantId, token, effectiveStudent, target, mode, revision])
  const contextReady = loadedContext === contextScope

  useEffect(() => {
    const abort = new AbortController()
    async function all<T>(resource: string): Promise<T[]> {
      const get = (page: number) => api.academic<Page<T>>(tenantId, `/${resource}?pageSize=100&page=${page}`, token, { signal: abort.signal })
      const first = await get(1)
      if (!Array.isArray(first.items) || !Number.isSafeInteger(first.total) || first.total > 2000) throw Error('CHOICES_UNAVAILABLE')
      const pages = await Promise.all(Array.from({ length: Math.max(0, Math.ceil(first.total / 100) - 1) }, (_, i) => get(i + 2)))
      if (pages.some(p => !Array.isArray(p.items))) throw Error('CHOICES_UNAVAILABLE')
      return [first, ...pages].flatMap(p => p.items)
    }
    queueMicrotask(() => { if (!abort.signal.aborted) setChoicesState('loading') })
    void Promise.all([!studentId ? all<Person>('students') : Promise.resolve([]), !classId || mode === 'TRANSFER_REQUEST' ? all<ClassRow>('classes') : Promise.resolve([])])
      .then(([s, c]) => { if (!abort.signal.aborted) { setStudents(s); setClasses(c); setChoicesState('ready') } })
      .catch(() => { if (!abort.signal.aborted) { setStudents([]); setClasses([]); setChoicesState('error') } })
    return () => abort.abort()
  }, [tenantId, token, studentId, classId, mode, choicesRevision])

  useEffect(() => {
    const abort = new AbortController()
    queueMicrotask(() => {
      if (!abort.signal.aborted) { setContext(null); setCapabilities(null); setConfirmed(false) }
    })
    if (!effectiveStudent || !target) return () => abort.abort()
    const scoped = new URLSearchParams({ classId: target, studentId: effectiveStudent })
    void Promise.all([
      api.academic<Capabilities>(tenantId, `/permissions/capabilities/current?${scoped}`, token, { signal: abort.signal }),
      mode === 'ENROLL'
        ? api.academic<PlacementContext>(tenantId,
          `/classes/${encodeURIComponent(target)}/students/${encodeURIComponent(effectiveStudent)}/placement-context`,
          token, { signal: abort.signal })
        : Promise.resolve(null),
    ]).then(([caps, placement]) => {
      if (!abort.signal.aborted) { setCapabilities(caps); setContext(placement); setLoadedContext(contextScope); setMessage('') }
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setMessage(safeErrorMessage(error))
    })
    return () => abort.abort()
  }, [tenantId, token, effectiveStudent, target, mode, revision, contextScope])

  async function submit() {
    if (inFlight.current || busy || !contextReady || !confirmed || !effectiveStudent || !target || !reason.trim() || !effective) return
    const effectiveAt = tenantLocalToUtc(effective, capabilities?.tenantTimezone ?? '')
    if (!effectiveAt || Date.parse(effectiveAt) <= Date.now()) {
      setMessage('Chọn thời điểm tương lai hợp lệ theo múi giờ trung tâm.'); return
    }
    if (mode === 'ENROLL' && (!context || !capabilities?.enroll)) return
    if (mode === 'TRANSFER_REQUEST' && (!source || !capabilities?.transferRequest)) return
    let grades: Pick<Grade, 'gradeId' | 'revision' | 'evidenceHash'>[] | undefined
    if (mode === 'ENROLL' && basis === 'PUBLISHED_GRADES') {
      const selected = context?.publishedAssessments.find((item) => item.gradeId === gradeId)
      if (!selected) { setMessage('Chọn bằng chứng điểm đã công bố.'); return }
      grades = [{ gradeId: selected.gradeId, revision: selected.revision, evidenceHash: selected.evidenceHash }]
    }
    inFlight.current = true; setBusy(true); setMessage('')
    try {
      const body = mode === 'ENROLL'
        ? { classId: target, studentId: effectiveStudent, effectiveFrom: effectiveAt,
          placement: { basis, subjectId: context!.targetSubjectId, levelId: context!.targetLevelId,
            reason: reason.trim(), ...(grades ? { grades } : {}) }, reason: reason.trim(), confirmed: true }
        : { enrollmentId: source, targetClassId: target, effectiveAt,
          reason: reason.trim(), confirmed: true }
      const endpoint = mode === 'ENROLL' ? '/enrollments' : '/transfers'
      const serialized = JSON.stringify({ endpoint, body })
      if (pendingRequest.current?.body !== serialized)
        pendingRequest.current = { body: serialized, key: crypto.randomUUID() }
      const result = await api.academic<{ status: string }>(tenantId, endpoint, token,
        { method: 'POST', body, idempotencyKey: pendingRequest.current.key })
      pendingRequest.current = null
      setMessage(mode === 'ENROLL' ? `Đã ghi danh theo xác nhận máy chủ (${result.status === 'ACTIVE' ? 'Đang hoạt động' : result.status}). Hiệu lực từ thời điểm đã chọn.` : `Yêu cầu chuyển lớp: ${result.status}. Chưa xác nhận chuyển lớp.`)
      setConfirmed(false); setRevision((value) => value + 1); onChanged()
    } catch (error) { setMessage(safeErrorMessage(error)) }
    finally { inFlight.current = false; setBusy(false) }
  }

  return <div className="academic-form" data-screen-id="AC09">
    <fieldset disabled={busy} className="academic-admission-fields">
    <label className="academic-field"><span>Thao tác</span><select value={mode} onChange={(event) => {
      setMode(event.target.value as Mode); setTarget(event.target.value === 'ENROLL' ? classId ?? '' : '')
    }}><option value="ENROLL">Ghi danh</option><option value="TRANSFER_REQUEST">Yêu cầu chuyển lớp</option></select></label>
    {mode === 'TRANSFER_REQUEST' && <label className="academic-field"><span>Ghi danh hiện tại</span>
      <select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Chọn ghi danh</option>
        {enrollments.filter((item) => item.status === 'ACTIVE').map((item) =>
          <option key={item.id} value={item.id}>{item.studentName ?? item.className ?? item.studentCode ?? item.classCode ?? 'Ghi danh hiện tại'}</option>)}</select></label>}
    {choicesState === 'loading' && <p role="status">Đang tải lựa chọn ghi danh…</p>}
    {choicesState === 'error' && <p role="alert">Không tải đủ danh sách lựa chọn. <button type="button" onClick={() => setChoicesRevision(v => v + 1)}>Tải lại lựa chọn</button></p>}
    {mode === 'ENROLL' && !studentId && <label className="academic-field"><span>Học viên ghi danh</span>
      <select value={student} disabled={choicesState !== 'ready'} onChange={event => { setStudent(event.target.value); setConfirmed(false) }}><option value="">Chọn học viên</option>
        {students.filter(s => s.status === 'ACTIVE' && !enrollments.some(e => e.studentId === s.id && e.status === 'ACTIVE' && !e.effectiveTo)).map(s => <option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}</select></label>}
    {classId && mode === 'ENROLL' ? <p>Ghi danh vào lớp đang mở. Hiệu lực phải nằm trong tương lai.</p> : <label className="academic-field"><span>Lớp {mode === 'TRANSFER_REQUEST' ? 'đích' : 'ghi danh'}</span>
      <select value={target} disabled={choicesState !== 'ready'} onChange={event => { setTarget(event.target.value); setConfirmed(false) }}><option value="">Chọn lớp</option>{classes.filter(c => c.status === 'ACTIVE').map(c => <option key={c.id} value={c.id}>{c.name} · {c.code}</option>)}</select></label>}
    {mode === 'ENROLL' && contextReady && context && <>
      <label className="academic-field"><span>Căn cứ xếp lớp</span><select value={basis} onChange={(event) => setBasis(event.target.value)}>
        <option value="STAFF_CONFIRMATION">Nhân viên xác nhận</option><option value="ENTRY_TEST">Kiểm tra đầu vào</option>
        <option value="PUBLISHED_GRADES">Điểm đã công bố</option></select></label>
      {basis === 'PUBLISHED_GRADES' && <label className="academic-field"><span>Bằng chứng điểm</span>
        <select value={gradeId} onChange={(event) => setGradeId(event.target.value)}><option value="">Chọn</option>
          {context.publishedAssessments.map((item) => <option key={item.gradeId} value={item.gradeId}>
            {item.gradeId} · lần {item.revision}</option>)}</select></label>}</>}
    <label className="academic-field"><span>Hiệu lực từ ({capabilities?.tenantTimezone || 'múi giờ trung tâm'})</span><input type="datetime-local" value={effective}
      onChange={(event) => setEffective(event.target.value)} /></label>
    <label className="academic-field"><span>Lý do và đánh giá phù hợp</span><textarea value={reason}
      onChange={(event) => setReason(event.target.value)} /></label>
    <label className="academic-field"><input type="checkbox" checked={confirmed}
      onChange={(event) => setConfirmed(event.target.checked)} /><span>Tôi xác nhận thực hiện thao tác này</span></label>
    <button className="academic-primary" disabled={busy || !contextReady || choicesState !== 'ready' || !confirmed || !reason.trim() || !effective ||
      (mode === 'ENROLL' ? !capabilities?.enroll || !context : !capabilities?.transferRequest || !source)}
      onClick={() => { void submit() }}>{mode === 'ENROLL' ? 'Xác nhận ghi danh' : 'Gửi yêu cầu chuyển lớp'}</button>
    </fieldset>
    {message && <p role="status">{message}</p>}
  </div>
}
