import { useEffect, useRef, useState } from 'react'
import { ApiClient, safeErrorMessage } from '../../api.ts'
import type { Capabilities, Enrollment, PlacementContext } from './AcademicApi.ts'
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
  const selectedSource = enrollments.find((item) => item.id === source)
  const effectiveStudent = mode === 'TRANSFER_REQUEST' ? selectedSource?.studentId ?? studentId ?? '' : student

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
      if (!abort.signal.aborted) { setCapabilities(caps); setContext(placement); setMessage('') }
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) setMessage(safeErrorMessage(error))
    })
    return () => abort.abort()
  }, [tenantId, token, effectiveStudent, target, mode, revision])

  async function submit() {
    if (busy || !confirmed || !effectiveStudent || !target || !reason.trim() || !effective) return
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
    setBusy(true); setMessage('')
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
      setMessage(mode === 'ENROLL' ? `Ghi danh: ${result.status}.` : `Yêu cầu chuyển lớp: ${result.status}. Chưa xác nhận chuyển lớp.`)
      setConfirmed(false); setRevision((value) => value + 1); onChanged()
    } catch (error) { setMessage(safeErrorMessage(error)) }
    finally { setBusy(false) }
  }

  return <div className="academic-form" data-screen-id="AC09">
    <label className="academic-field"><span>Thao tác</span><select value={mode} onChange={(event) => {
      setMode(event.target.value as Mode); setTarget(event.target.value === 'ENROLL' ? classId ?? '' : '')
    }}><option value="ENROLL">Ghi danh</option><option value="TRANSFER_REQUEST">Yêu cầu chuyển lớp</option></select></label>
    {mode === 'TRANSFER_REQUEST' && <label className="academic-field"><span>Ghi danh hiện tại</span>
      <select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Chọn ghi danh</option>
        {enrollments.filter((item) => item.status === 'ACTIVE').map((item) =>
          <option key={item.id} value={item.id}>{item.classCode ?? item.studentCode ?? item.id}</option>)}</select></label>}
    {mode === 'ENROLL' && !studentId && <label className="academic-field"><span>Mã định danh học sinh</span>
      <input value={student} onChange={(event) => setStudent(event.target.value.trim())} /></label>}
    <label className="academic-field"><span>Mã định danh lớp {mode === 'TRANSFER_REQUEST' ? 'đích' : ''}</span>
      <input value={target} onChange={(event) => setTarget(event.target.value.trim())} /></label>
    {mode === 'ENROLL' && context && <><p>Đích: môn {context.targetSubjectId}, trình độ {context.targetLevelId}.</p>
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
    <button className="academic-primary" disabled={busy || !confirmed || !reason.trim() || !effective ||
      (mode === 'ENROLL' ? !capabilities?.enroll || !context : !capabilities?.transferRequest || !source)}
      onClick={() => { void submit() }}>{mode === 'ENROLL' ? 'Xác nhận ghi danh' : 'Gửi yêu cầu chuyển lớp'}</button>
    {message && <p role="status">{message}</p>}
  </div>
}
