import { useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { Badge, Card, Empty, Heading, StateMessage, Table, Timeline } from './ManagementPrimitives.tsx'
import type { ViewState } from './ManagementTypes.ts'
import './management.css'

type Page<T> = { items: T[]; page: number; pageSize: number; total: number; timezone: string }
type Audit = { id: string; eventType: string | null; entityType: string | null; entityId: string; actorKind: string; actorDisplay: string | null; createdAt: string; outcome: string | null; reasonCode: string | null; policyVersionId: string | null; correlationId: string }
type Attempt = { id: string; attemptNo: number; startedAt: string; finishedAt: string | null; outcome: string; errorCode: string | null }
type Job = { id: string; jobKind: string; status: string; attemptCount: number; nextAttemptAt: string; lastErrorCode: string | null; policyVersionId: string; correlationId: string; sourceType: string; sourceId: string; retryEligible: boolean; attempts: Attempt[] }
type AuditFilters = { eventType: string; entityType: string; entityId: string; actor: string; actorKind: string; from: string; to: string; outcome: string }
const blankFilters: AuditFilters = { eventType: '', entityType: '', entityId: '', actor: '', actorKind: '', from: '', to: '', outcome: '' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
function viewState(error: unknown): ViewState {
  if (error instanceof ApiError) return error.status === 401 ? 'unauthenticated' : error.status === 403 ? 'forbidden'
    : error.status === 404 ? 'not-found' : error.status === 409 ? 'conflict'
      : error.status === 400 || error.status === 422 ? 'invalid' : 'error'
  return 'error'
}
function time(at: string | null, zone: string) {
  return at ? `${new Intl.DateTimeFormat('vi-VN', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(at))} (${zone})` : 'Không có'
}
function Pager({ data, page, setPage }: { data: Page<unknown>; page: number; setPage: (page: number) => void }) {
  return <nav className="mo-actions" aria-label="Phân trang"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
    <span>Trang {page} · {data.total} bản ghi</span><button disabled={page * data.pageSize >= data.total} onClick={() => setPage(page + 1)}>Sau</button></nav>
}

export function OperationsProduction({ id, tenantId, token }: { id: 'OP06' | 'OP07'; tenantId: string; token: string }) {
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [state, setState] = useState<ViewState>('loading')
  const [audit, setAudit] = useState<Page<Audit> | null>(null)
  const [jobs, setJobs] = useState<Page<Job> | null>(null)
  const [filters, setFilters] = useState<AuditFilters>(blankFilters)
  const [jobStatus, setJobStatus] = useState('')
  const [selectedAudit, setSelectedAudit] = useState<Audit | null>(null)
  const [timeline, setTimeline] = useState<Audit[] | null>(null)
  const [timelineError, setTimelineError] = useState('')
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)
  const [jobAudit, setJobAudit] = useState<Audit[] | null>(null)
  const [jobAuditError, setJobAuditError] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const retryKeys = useRef(new Map<string, string>())
  const retryInput = useRef<string | null>(null)
  const invalid = (filters.from && filters.to && filters.from > filters.to) || (filters.entityId && !uuid.test(filters.entityId))
  useEffect(() => {
    if (invalid) { queueMicrotask(() => setState('invalid')); return }
    const abort = new AbortController()
    queueMicrotask(() => { if (!abort.signal.aborted) setState('loading') })
    const params = new URLSearchParams({ page: String(page) })
    if (id === 'OP06') for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value)
    if (id === 'OP07' && jobStatus) params.set('status', jobStatus)
    api.learning<Page<Audit> | Page<Job>>(tenantId, `/${id === 'OP06' ? 'audit' : 'jobs'}?${params}`, token, { signal: abort.signal })
      .then((result) => { if (!abort.signal.aborted) { if (id === 'OP06') setAudit(result as Page<Audit>); else setJobs(result as Page<Job>); setState('ready') } })
      .catch((error: unknown) => { if (!abort.signal.aborted) setState(viewState(error)) })
    return () => abort.abort()
  }, [id, tenantId, token, page, filters, jobStatus, revision, invalid])
  async function showAudit(row: Audit) {
    setSelectedAudit(row); setTimeline(null); setTimelineError('')
    try {
      const result = await api.learning<Page<Audit>>(tenantId, `/audit/operations/${encodeURIComponent(row.correlationId)}?pageSize=100`, token)
      setTimeline(result.items)
      if (result.total > 100) setTimelineError('Chuỗi xử lý dài hơn 100 sự kiện; chỉ hiển thị trang đầu.')
    } catch (error) { setTimelineError(safeErrorMessage(error)) }
  }
  async function showJob(row: Job) {
    const pendingInput = retryInput.current
    const pendingSameJob = pendingInput !== null && pendingInput.startsWith(`${row.id}\n`) && retryKeys.current.has(pendingInput)
    setSelectedJob(null); setJobAudit(null); setJobAuditError(''); setReason(pendingSameJob ? reason : ''); setMessage('')
    if (!pendingSameJob) retryInput.current = null
    try {
      const detail = await api.learning<Job>(tenantId, `/jobs/${encodeURIComponent(row.id)}`, token)
      setSelectedJob(detail)
      try {
        const related = await api.learning<Page<Audit>>(tenantId, `/audit/operations/${encodeURIComponent(detail.correlationId)}?pageSize=100`, token)
        setJobAudit(related.items)
        if (related.total > 100) setJobAuditError('Chỉ hiển thị 100 sự kiện đầu tiên.')
      } catch (error) { setJobAuditError(safeErrorMessage(error)) }
    }
    catch (error) { setMessage(safeErrorMessage(error)) }
  }
  async function retry(job: Job) {
    const input = `${job.id}\n${reason.trim()}`
    if (!job.retryEligible || !reason.trim() || !window.confirm(`Thử lại job ${job.id} với lý do đã nhập?`)) return
    const key = retryKeys.current.get(input) ?? crypto.randomUUID()
    retryKeys.current.set(input, key)
    retryInput.current = input
    setBusy(true); setMessage('')
    try {
      const result = await api.learning<{ id: string; status: string }>(tenantId, `/jobs/${encodeURIComponent(job.id)}/retry`, token,
        { method: 'POST', body: { reason: reason.trim(), confirmed: true }, idempotencyKey: key })
      if (result.id !== job.id || result.status !== 'READY') throw new ApiError(502, 'INVALID_RESPONSE')
      retryKeys.current.delete(input)
      if (retryInput.current === input) retryInput.current = null
      setSelectedJob(null)
      setMessage('Máy chủ đã nhận yêu cầu retry; đang tải trạng thái mới.'); setRevision((value) => value + 1)
      setSelectedJob(await api.learning<Job>(tenantId, `/jobs/${encodeURIComponent(job.id)}`, token))
    } catch (error) {
      if (error instanceof ApiError && [401, 403, 404, 409].includes(error.status)) {
        retryKeys.current.delete(input)
        if (retryInput.current === input) retryInput.current = null
        setSelectedJob(null)
      }
      setMessage(safeErrorMessage(error)); setRevision((value) => value + 1)
    }
    finally { setBusy(false) }
  }
  return <div className="management" data-screen-id={id}>
    {id === 'OP06' ? <Heading title="Tra cứu audit log" detail="Nhật ký được lọc theo quyền và phạm vi hiện tại" />
      : <Heading title="Quản lý job và retry" detail="Theo dõi tác vụ P0 và lịch sử lần thử" />}
    {id === 'OP06' && <Card title="Bộ lọc trên máy chủ"><form className="mo-filters" onSubmit={(event) => { event.preventDefault(); setPage(1) }}>
      {(['eventType', 'entityType', 'entityId'] as const).map((key) => <label key={key}>{key}<input value={filters[key]} onChange={(event) => { setFilters({ ...filters, [key]: event.target.value }); setPage(1) }} /></label>)}
      <label>Tên người thực hiện (chính xác)<input value={filters.actor} onChange={(event) => { setFilters({ ...filters, actor: event.target.value }); setPage(1) }} /></label>
      <label>Người thực hiện<select value={filters.actorKind} onChange={(event) => { setFilters({ ...filters, actorKind: event.target.value }); setPage(1) }}><option value="">Tất cả</option><option>USER</option><option>WORKER</option><option>OPERATOR</option></select></label>
      <label>Từ ngày<input type="date" value={filters.from} onChange={(event) => { setFilters({ ...filters, from: event.target.value }); setPage(1) }} /></label>
      <label>Đến ngày<input type="date" value={filters.to} onChange={(event) => { setFilters({ ...filters, to: event.target.value }); setPage(1) }} /></label>
      <label>Kết quả job<select value={filters.outcome} onChange={(event) => { setFilters({ ...filters, outcome: event.target.value }); setPage(1) }}><option value="">Tất cả</option>{['COMPLETED','FAILED','READY','NEEDS_INFORMATION','PENDING_APPROVAL'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <button type="button" onClick={() => { setFilters(blankFilters); setPage(1) }}>Xóa lọc</button>
    </form>{invalid && <p role="alert">Khoảng ngày hoặc mã đối tượng không hợp lệ.</p>}{audit && <p>Ngày được lọc theo {audit.timezone}.</p>}</Card>}
    {id === 'OP07' && <Card title="Trạng thái"><label>Trạng thái job<select value={jobStatus} onChange={(event) => { setJobStatus(event.target.value); setPage(1) }}><option value="">Tất cả</option>{['READY','RUNNING','FAILED','NEEDS_INFORMATION','PENDING_APPROVAL','COMPLETED'].map((value) => <option key={value}>{value}</option>)}</select></label></Card>}
    {state !== 'ready' && <StateMessage state={state} />}
    {message && <p role="status" className="mo-warning">{message}</p>}
    {state === 'ready' && id === 'OP06' && audit && <Card title="Sự kiện đã được cấp quyền">{audit.items.length ? <Table caption="Audit" columns={['Thời gian','Hành động','Đối tượng','Người thực hiện','Kết quả','Chi tiết']} rows={audit.items.map((row) => ({ id: row.id, cells: [time(row.createdAt,audit.timezone),row.eventType ?? 'Không có',`${row.entityType ?? 'Không có'} · ${row.entityId}`,row.actorDisplay ?? row.actorKind,row.outcome ?? 'Chưa có chứng cứ',<button key="detail" onClick={() => void showAudit(row)}>Xem</button>] }))} /> : <Empty filtered={Object.values(filters).some(Boolean)} />}
      <Pager data={audit} page={page} setPage={setPage} /></Card>}
    {state === 'ready' && selectedAudit && id === 'OP06' && <Card title={`Sự kiện ${selectedAudit.id}`}><dl className="mo-detail">
      {([['Hành động',selectedAudit.eventType],['Đối tượng',`${selectedAudit.entityType} · ${selectedAudit.entityId}`],['Người thực hiện',selectedAudit.actorDisplay ?? selectedAudit.actorKind],['Kết quả',selectedAudit.outcome ?? 'Không có chứng cứ'],['Mã lỗi',selectedAudit.reasonCode ?? 'Không có'],['Policy',selectedAudit.policyVersionId ?? 'Không có'],['Correlation ID',selectedAudit.correlationId]] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl><h3>Chuỗi xử lý được cấp quyền</h3>{timeline ? <Timeline items={timeline.map((row) => `${time(row.createdAt,audit?.timezone ?? 'UTC')} · ${row.eventType}`)} /> : <p>Đang tải chuỗi xử lý…</p>}{timelineError && <p role="alert">{timelineError}</p>}</Card>}
    {state === 'ready' && id === 'OP07' && jobs && <Card title="Tác vụ đã được cấp quyền">{jobs.items.length ? <Table caption="Jobs" columns={['Job','Nguồn','Trạng thái','Lượt thử','Lỗi','Chi tiết']} rows={jobs.items.map((row) => ({ id: row.id, cells: [<strong key="name">{row.jobKind} · {row.id}</strong>,`${row.sourceType} · ${row.sourceId}`,<Badge key="status" value={row.status} />,`${row.attemptCount}/4`,row.lastErrorCode ?? 'Không có',<button key="detail" onClick={() => void showJob(row)}>Xem</button>] }))} /> : <Empty filtered={!!jobStatus} />}
      <Pager data={jobs} page={page} setPage={setPage} /></Card>}
    {state === 'ready' && selectedJob && id === 'OP07' && <Card title={`Job ${selectedJob.id}`}><p><Badge value={selectedJob.status} /> · {selectedJob.jobKind}</p><dl className="mo-detail">
      {([['Nguồn',`${selectedJob.sourceType} · ${selectedJob.sourceId}`],['Policy',selectedJob.policyVersionId],['Correlation ID',selectedJob.correlationId],['Lần thử',`${selectedJob.attemptCount}/4`],['Lần tiếp theo',time(selectedJob.nextAttemptAt,jobs?.timezone ?? 'UTC')],['Mã lỗi',selectedJob.lastErrorCode ?? 'Không có']] as const).map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl><h3>Lịch sử lần thử</h3><Timeline items={selectedJob.attempts.map((attempt) => `#${attempt.attemptNo} · ${attempt.outcome} · ${attempt.errorCode ?? 'Không có mã lỗi'} · ${time(attempt.startedAt,jobs?.timezone ?? 'UTC')}`)} />
      <h3>Audit liên quan</h3>{jobAudit ? <Timeline items={jobAudit.map((row) => `${time(row.createdAt,jobs?.timezone ?? 'UTC')} · ${row.eventType ?? 'Không có loại sự kiện'}`)} /> : !jobAuditError && <p>Đang kiểm tra quyền xem audit…</p>}{jobAuditError && <p role="status">{jobAuditError}</p>}
      {selectedJob.retryEligible ? <form onSubmit={(event) => { event.preventDefault(); void retry(selectedJob) }}><label>Lý do retry<textarea required maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><button disabled={busy || !reason.trim()}>{busy ? 'Đang gửi…' : 'Xác nhận retry'}</button></form>
        : <p>Máy chủ không cho phép retry trong trạng thái hiện tại. Thiếu dữ liệu, chờ duyệt, hết lượt hoặc đã có tác động đều phải xử lý theo quy trình gốc.</p>}</Card>}
  </div>
}
