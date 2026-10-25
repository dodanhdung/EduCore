import { useEffect, useRef, useState } from 'react'
import { ApiClient, safeErrorMessage } from '../../api.ts'
import type { Capabilities } from './AcademicApi.ts'
import { tenantLocalToUtc } from './AcademicTime.ts'

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')

export function AcademicTeacherAssignment({ tenantId, token, teacherId, classId, onChanged }: {
  tenantId: string; token: string; teacherId?: string; classId?: string; onChanged: () => void
}) {
  const [targetClass, setTargetClass] = useState(classId ?? '')
  const [teacher, setTeacher] = useState(teacherId ?? '')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const pending = useRef<{ body: string; key: string } | null>(null)

  useEffect(() => {
    const abort = new AbortController()
    queueMicrotask(() => { if (!abort.signal.aborted) { setCapabilities(null); setConfirmed(false) } })
    if (!targetClass) return () => abort.abort()
    const query = new URLSearchParams({ classId: targetClass })
    void api.academic<Capabilities>(tenantId, `/permissions/capabilities/current?${query}`, token,
      { signal: abort.signal }).then((value) => {
      if (!abort.signal.aborted) { setCapabilities(value); setMessage('') }
    }).catch((error: unknown) => { if (!abort.signal.aborted) setMessage(safeErrorMessage(error)) })
    return () => abort.abort()
  }, [tenantId, token, targetClass])

  async function submit() {
    if (busy || !confirmed || !capabilities?.teacherAssign || !targetClass || !teacher || !reason.trim()) return
    const validFrom = tenantLocalToUtc(from, capabilities.tenantTimezone)
    const validTo = to ? tenantLocalToUtc(to, capabilities.tenantTimezone) : null
    if (!validFrom || Date.parse(validFrom) <= Date.now() || (to && !validTo)
      || (validTo && Date.parse(validTo) <= Date.parse(validFrom))) {
      setMessage('Khoảng phân công phải hợp lệ và bắt đầu trong tương lai theo múi giờ trung tâm.'); return
    }
    const body = { classId: targetClass, teacherId: teacher, validFrom, validTo,
      reason: reason.trim(), confirmed: true }
    const serialized = JSON.stringify(body)
    if (pending.current?.body !== serialized) pending.current = { body: serialized, key: crypto.randomUUID() }
    setBusy(true); setMessage('')
    try {
      const result = await api.academic<{ status: string }>(tenantId, '/teacher-assignments', token,
        { method: 'POST', body, idempotencyKey: pending.current.key })
      pending.current = null
      setConfirmed(false); setMessage(`Phân công: ${result.status}.`); onChanged()
    } catch (error) { setMessage(safeErrorMessage(error)) }
    finally { setBusy(false) }
  }

  return <div className="academic-form" data-academic-action="teacher-assignment">
    {!classId && <label className="academic-field"><span>Mã định danh lớp</span>
      <input value={targetClass} onChange={(event) => setTargetClass(event.target.value.trim())} /></label>}
    {!teacherId && <label className="academic-field"><span>Mã định danh giáo viên</span>
      <input value={teacher} onChange={(event) => setTeacher(event.target.value.trim())} /></label>}
    <label className="academic-field"><span>Bắt đầu ({capabilities?.tenantTimezone || 'múi giờ trung tâm'})</span>
      <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
    <label className="academic-field"><span>Kết thúc, nếu có</span>
      <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    <label className="academic-field"><span>Lý do phân công</span>
      <textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    <label className="academic-field"><input type="checkbox" checked={confirmed}
      onChange={(event) => setConfirmed(event.target.checked)} /><span>Tôi xác nhận phân công giáo viên phụ trách lớp</span></label>
    <button className="academic-primary" disabled={busy || !capabilities?.teacherAssign || !confirmed || !reason.trim() || !from}
      onClick={() => { void submit() }}>Xác nhận phân công</button>
    {message && <p role="status">{message}</p>}
  </div>
}
