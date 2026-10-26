import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { tenantPath } from '../../routes.ts'
import { BillingBadge, BillingCard, BillingHeading, BillingState } from './BillingPrimitives.tsx'
import './BillingScreens.css'

type Id = 'BL01' | 'BL02' | 'BL03' | 'BL04' | 'BL05' | 'BL06' | 'BL07'
type Page<T> = { items: T[]; page: number; pageSize: number; total: number; asOf: string }
type Rule = { id: string; scope: string; targetId: string; amountVnd: string; effectiveFrom: string; effectiveTo: string | null; policyVersionId: string }
type PriceTarget = { id: string; scope: string; label: string }
type Sibling = { id: string; studentAName: string; studentBName: string; verifiedAt: string; revokedAt: string | null; evidenceNote: string | null; eligible: boolean }
type Period = { id: string; monthStart: string; monthEnd: string; status: string; timezone: string; draftCount: number; issuedCount: number; generations: { id: string; runId: string; studentId: string; status: string; createdAt: string; reason: string; missing: string[]; invoiceId: string | null; current: boolean }[] }
type Student = { id: string; name: string; code: string }
type InvoiceRow = { id: string; studentId: string; studentName: string; period: string; status: string; settlement: string | null; overdue: boolean; number: string | null; totalVnd: string; netObligationVnd: string | null; allocatedVnd: string | null; outstandingVnd: string | null; issuedAt: string | null; dueAt: string | null; generationId: string; currentGenerationId: string; latestGenerationId: string }
type SourceLine = { participantId: string; sessionId: string; sourceBusinessDate: string; timezone: string; sourceStatus: string; units: number; priceRuleId: string; priceScope: string; priceEffectiveFrom: string; priceEffectiveTo: string | null; unitPriceVnd: string }
type Generation = { id: string; number: number; status: string; reason: string; createdAt: string; inputHash: string; result: { source?: { missing?: string[] } } }
type Detail = { id: string; studentId: string; studentName: string; periodId: string; period: string; status: string; number: string | null; issuedAt: string | null; dueAt: string | null; grossVnd: string; discountVnd: string; totalVnd: string; policyVersionId: string; canIssue: boolean; currentGenerationId: string; latestGenerationId: string; snapshot: { id?: string; source?: { timezone: string; sibling: boolean; siblingEvidence: unknown[]; lines: SourceLine[]; missing: string[] }; appliedGenerationId?: string }; generationHistory: Generation[]; lines: { id: string; source: SourceLine; amountVnd: string }[]; payments: { id: string; amountVnd: string; method: string; paidAt: string; reversed: boolean; allocations: { id: string; kind: string; amountVnd: string; allocatedAt: string }[] }[]; adjustments: { id: string; kind: string; deltaVnd: string; status: string; appliedAt: string | null; approvalRequestId: string }[] }
type Receivable = { originalTotalVnd: string; netObligationVnd: string; netAllocatedVnd: string; outstandingVnd: string; status: string }
type GenerationResult = { id: string; invoiceId: string | null; status: string; source: { missing: string[] } }

const names: Record<Id, string> = { BL01: 'Bảng đơn giá học phí', BL02: 'Ưu đãi anh/chị/em', BL03: 'Kỳ học phí và lần tính', BL04: 'Hóa đơn dự thảo', BL05: 'Rà soát dự thảo', BL06: 'Hóa đơn đã phát hành', BL07: 'Chi tiết hóa đơn' }
const money = (value: string) => `${new Intl.NumberFormat('vi-VN').format(BigInt(value))} ₫`
const moneyOr = (value: string | undefined) => value && /^-?(0|[1-9]\d*)$/.test(value) ? money(value) : '—'
const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—'
function rememberedPayment(key: string): { key: string; body: { amountVnd: string; reason: string; confirmed: true } } | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(key) ?? 'null')
    return typeof value?.key === 'string' && typeof value?.body?.amountVnd === 'string' ? value : null
  } catch { return null }
}

export function BillingProduction({ id, tenantId, token, selectedId, api, navigate }: {
  id: Id; tenantId: string; token: string; selectedId?: string; api: ApiClient; navigate: (path: string) => void
}) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<unknown>()
  const [students, setStudents] = useState<Student[]>([])
  const [priceTargets, setPriceTargets] = useState<PriceTarget[]>([])
  const [priceScope, setPriceScope] = useState('COURSE')
  const [priceTarget, setPriceTarget] = useState('')
  const [priceAmount, setPriceAmount] = useState('')
  const [priceFrom, setPriceFrom] = useState('')
  const [priceTo, setPriceTo] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [newMonth, setNewMonth] = useState('')
  const [selectedStudent, setSelectedStudent] = useState('')
  const [reason, setReason] = useState('')
  const [recomputeReason, setRecomputeReason] = useState('')
  const [recomputeConfirmed, setRecomputeConfirmed] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [receivable, setReceivable] = useState<Receivable | null>(null)
  const [wallet, setWallet] = useState<{ balanceVnd: string; canTopUp: boolean } | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const paymentStorageKey = `educore:wallet-payment:${tenantId}:${selectedId ?? ''}`
  const initialPaymentPending = rememberedPayment(paymentStorageKey)
  const paymentPending = useRef(initialPaymentPending)
  const [paymentAwaiting, setPaymentAwaiting] = useState(Boolean(initialPaymentPending))
  const pendingKey = useRef<string | null>(null)
  const path = id === 'BL01' ? '/billing/price-rules' : id === 'BL02' ? '/billing/sibling-evidence'
    : id === 'BL03' ? '/billing/periods' : id === 'BL04' ? '/billing/drafts'
      : id === 'BL05' ? `/billing/drafts/${encodeURIComponent(selectedId ?? '')}`
        : id === 'BL06' ? '/billing/invoices' : `/billing/invoices/${encodeURIComponent(selectedId ?? '')}`
  const list = id !== 'BL05' && id !== 'BL07'
  const read = useCallback(<T,>(suffix: string) => api.learning<T>(tenantId, suffix, token), [api, tenantId, token])
  const write = <T,>(suffix: string, body: unknown, key: string) => api.learning<T>(tenantId, suffix, token,
    { method: 'POST', body, idempotencyKey: key })
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true); setError(''); setData(undefined); setReceivable(null); setWallet(null)
    const query = list ? `?page=${page}&pageSize=20` : ''
    Promise.all([read<unknown>(path + query),
      id === 'BL03' ? read<Page<Student>>('/billing/students?pageSize=100') : Promise.resolve(null),
      id === 'BL01' ? read<Page<PriceTarget>>('/billing/price-targets?pageSize=100') : Promise.resolve(null)])
      .then(async ([value, studentPage, targets]) => {
        if (abort.signal.aborted) return
        setData(value)
        if (studentPage) setStudents((studentPage as Page<Student>).items)
        if (targets) setPriceTargets(targets.items)
        if (id === 'BL07' && selectedId) {
          try {
            const value = await read<Receivable>(`/billing/invoices/${encodeURIComponent(selectedId)}/receivable`)
            if (!abort.signal.aborted) setReceivable(value)
          } catch { if (!abort.signal.aborted) setReceivable(null) }
          const invoice = value as Detail
          try {
            const account = await read<{ balanceVnd: string; canTopUp: boolean }>(`/finance/students/${encodeURIComponent(invoice.studentId)}`)
            if (!abort.signal.aborted) setWallet(account)
          } catch { if (!abort.signal.aborted) setWallet(null) }
        }
      }).catch((cause) => { if (!abort.signal.aborted) setError(safeErrorMessage(cause)) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
  }, [id, selectedId, path, page, revision, read, list])

  async function act(suffix: string, body: unknown, next?: (value: GenerationResult | { id: string }) => void) {
    setWorking(true); setError('')
    const isPayment = suffix.endsWith('/wallet-payments')
    const prior = isPayment ? paymentPending.current : null
    const key = prior?.key ?? pendingKey.current ?? crypto.randomUUID()
    const payload = prior?.body ?? body
    pendingKey.current = key
    if (isPayment && !prior) {
      paymentPending.current = { key, body: payload as { amountVnd: string; reason: string; confirmed: true } }
      setPaymentAwaiting(true)
      try { window.sessionStorage.setItem(paymentStorageKey, JSON.stringify(paymentPending.current)) } catch { /* in-memory key remains */ }
    }
    try {
      const value = await write<GenerationResult | { id: string }>(suffix, payload, key)
      pendingKey.current = null
      if (isPayment) { paymentPending.current = null; setPaymentAwaiting(false); try { window.sessionStorage.removeItem(paymentStorageKey) } catch { /* no-op */ } }
      setReason(''); setConfirmed(false); setRevision((old) => old + 1)
      next?.(value)
    } catch (cause) {
      if (isPayment && cause instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(cause.status)) {
        paymentPending.current = null; pendingKey.current = null; setPaymentAwaiting(false)
        try { window.sessionStorage.removeItem(paymentStorageKey) } catch { /* no-op */ }
      }
      setError(isPayment && !(cause instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(cause.status))
        ? 'Payment result needs receipt reconciliation with the original key.' : safeErrorMessage(cause))
    }
    finally { setWorking(false) }
  }
  async function checkPaymentReceipt() {
    const operation = paymentPending.current
    if (!operation) return
    const invoice = data as Detail | undefined
    if (!invoice?.studentId) { setError('Payment target is unavailable. Keep the original operation key.'); return }
    try {
      const outcome = await read<{ status: string }>(`/finance/students/${encodeURIComponent(invoice.studentId)}/outcomes/PAY/${encodeURIComponent(operation.key)}`)
      if (outcome.status === 'COMMITTED') {
        paymentPending.current = null; pendingKey.current = null
        setPaymentAwaiting(false)
        try { window.sessionStorage.removeItem(paymentStorageKey) } catch { /* no-op */ }
        setError(''); setRevision((n) => n + 1)
      } else setError('No committed payment receipt is visible yet. Keep the same operation key.')
    } catch { setError('Receipt lookup is unavailable. Keep the same operation key.') }
  }
  const nextPage = (value: number) => { setPage(value); setData(undefined) }
  const pageControls = (value: Page<unknown>) => <div className="billing-pagination"><span>Trang {value.page} · {value.total} kết quả</span><div>
    <button className="billing-button billing-button-secondary" disabled={value.page <= 1} onClick={() => nextPage(value.page - 1)}>Trước</button>
    <button className="billing-button billing-button-secondary" disabled={value.page * value.pageSize >= value.total} onClick={() => nextPage(value.page + 1)}>Sau</button>
  </div></div>
  const pageData = data as Page<Rule & Sibling & Period & InvoiceRow> | undefined
  const detail = data as Detail | undefined
  const go = (suffix: string) => navigate(tenantPath(tenantId, suffix))
  return <div className="billing-page" data-screen-id={id}>
    <BillingHeading title={names[id]} subtitle="Dữ liệu và quyền được kiểm tra trên máy chủ" />
    {loading && <BillingState title="Đang tải">Đang lấy dữ liệu học phí.</BillingState>}
    {error && <BillingState title="Không thể hoàn tất" alert>{error}</BillingState>}
    {!loading && !error && !data && <BillingState title="Chưa có dữ liệu">Không nhận được dữ liệu từ máy chủ.</BillingState>}
    {!loading && pageData && id === 'BL01' && <BillingCard title="Quy tắc giá" hint="Ưu tiên buổi → lớp → khóa; cửa sổ hiệu lực [từ, đến).">
      {pageData.items.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Phạm vi</th><th>Đối tượng</th><th>Đơn giá</th><th>Hiệu lực</th><th>Policy</th></tr></thead><tbody>{pageData.items.map((rule) =>
        <tr key={rule.id}><td>{rule.scope}</td><td>{rule.targetId}</td><td>{money(rule.amountVnd)}</td><td>{rule.effectiveFrom} → {rule.effectiveTo ?? '∞'}</td><td>{rule.policyVersionId}</td></tr>)}</tbody></table></div> : <BillingState title="Chưa có quy tắc giá">Cần cấu hình giá trước khi tính phí.</BillingState>}
      {pageControls(pageData)}
    </BillingCard>}
    {!loading && pageData && id === 'BL01' && <BillingCard title="Tạo đơn giá" hint="Chỉ áp dụng từ ngày địa phương hiện tại hoặc tương lai; máy chủ chặn chồng lấn và bảo vệ lịch sử.">
      <div className="billing-form-grid"><label>Phạm vi<select value={priceScope} onChange={(e) => { setPriceScope(e.target.value); setPriceTarget('') }}><option value="COURSE">Khóa</option><option value="CLASS">Lớp</option><option value="SESSION">Buổi</option></select></label>
        <label>Đối tượng<select value={priceTarget} onChange={(e) => setPriceTarget(e.target.value)}><option value="">Chọn đối tượng</option>{priceTargets.filter((target) => target.scope === priceScope).map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select></label>
        <label>Đơn giá VND<input inputMode="numeric" value={priceAmount} onChange={(e) => setPriceAmount(e.target.value.replace(/\D/g, ''))} /></label>
        <label>Hiệu lực từ<input type="date" value={priceFrom} onChange={(e) => setPriceFrom(e.target.value)} /></label>
        <label>Hiệu lực đến (không gồm)<input type="date" value={priceTo} onChange={(e) => setPriceTo(e.target.value)} /></label></div>
      <label>Lý do<textarea value={reason} onChange={(e) => { setReason(e.target.value); pendingKey.current = null }} /></label>
      <button className="billing-button" disabled={working || !priceTarget || !priceAmount || !priceFrom || !reason.trim() || Boolean(priceTo && priceTo <= priceFrom)}
        onClick={() => act('/billing/price-rules', { scope: priceScope, targetId: priceTarget, amountVnd: priceAmount,
          effectiveFrom: priceFrom, effectiveTo: priceTo || null, reason })}>Lưu đơn giá</button>
    </BillingCard>}
    {!loading && pageData && id === 'BL02' && <BillingCard title="Bằng chứng anh/chị/em" hint="Liên kết phụ huynh không tự xác lập ưu đãi.">
      {pageData.items.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Học sinh</th><th>Bằng chứng</th><th>Điều kiện hiện tại</th><th>Ghi chú</th></tr></thead><tbody>{pageData.items.map((entry) =>
        <tr key={entry.id}><td>{entry.studentAName} · {entry.studentBName}</td><td>{entry.revokedAt ? 'Đã thu hồi' : 'Đã xác minh'}</td><td>{entry.eligible ? 'Đủ điều kiện 10%' : 'Chưa đủ điều kiện'}</td><td>{entry.evidenceNote ?? '—'}</td></tr>)}</tbody></table></div> : <BillingState title="Chưa có bằng chứng">Không suy ra điều kiện từ tên hoặc liên kết phụ huynh.</BillingState>}
      <p className="billing-muted">Xác minh mới cần nghiệp vụ và quyền riêng đã được phê duyệt; màn hình hiện chỉ đọc.</p>{pageControls(pageData)}
    </BillingCard>}
    {!loading && pageData && id === 'BL03' && <><BillingCard title="Kỳ học phí" hint="Tháng tính theo ngày bắt đầu buổi trong timezone tenant đã đóng băng.">
      {pageData.items.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Kỳ</th><th>Trạng thái</th><th>Timezone</th><th>Dự thảo</th><th>Đã phát hành</th></tr></thead><tbody>{pageData.items.map((entry) =>
        <tr key={entry.id}><td>{entry.monthStart}</td><td>{entry.status}</td><td>{entry.timezone}</td><td>{entry.draftCount}</td><td>{entry.issuedCount}</td></tr>)}</tbody></table></div> : <BillingState title="Chưa có kỳ">Kỳ cần được tạo theo quy trình nguồn đã duyệt.</BillingState>}{pageControls(pageData)}</BillingCard>
      <BillingCard title="Tính dự thảo G1" hint="Máy chủ xác minh điểm danh, giá và nguồn; thiếu dữ liệu trả NEEDS_INFORMATION."><div className="billing-form-grid">
        <label>Kỳ<select value={selectedPeriod} onChange={(e) => setSelectedPeriod(e.target.value)}><option value="">Chọn kỳ</option>{pageData.items.map((entry) => <option key={entry.id} value={entry.id}>{entry.monthStart}</option>)}</select></label>
        <label>Học sinh<select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)}><option value="">Chọn học sinh</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.code}</option>)}</select></label></div>
        <label>Lý do tính<textarea value={reason} onChange={(e) => { setReason(e.target.value); pendingKey.current = null }} /></label>
        <button className="billing-button" disabled={!selectedPeriod || !selectedStudent || !reason.trim() || working} onClick={() => act(`/billing/periods/${selectedPeriod}/students/${selectedStudent}/generations`, { reason }, (value) => {
          const generation = value as GenerationResult; setResult(generation)
          if (generation.status === 'DRAFT' && generation.invoiceId) go(`/finance/drafts/${generation.invoiceId}`)
        })}>Tạo dự thảo</button>
        {result?.status === 'NEEDS_INFORMATION' && <BillingState title="NEEDS_INFORMATION" alert>{result.source.missing.join(', ')}</BillingState>}
      </BillingCard><BillingCard title="Lịch sử generation" hint="NEEDS_INFORMATION giữ lý do thiếu nguồn; generation cũ không bị xóa.">
        {pageData.items.flatMap((period) => period.generations.map((generation) => ({ period, generation }))).length ?
          <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Kỳ / học sinh</th><th>Generation</th><th>Trạng thái</th><th>Thời điểm</th><th>Lý do / thiếu nguồn</th><th>Dự thảo</th></tr></thead><tbody>
            {pageData.items.flatMap((period) => period.generations.map((generation) => ({ period, generation }))).map(({ period, generation }) => <tr key={generation.id}>
              <td>{period.monthStart}<small className="billing-cell-sub">{generation.studentId}</small></td><td>{generation.id}{generation.current ? ' · hiện tại' : ''}</td><td>{generation.status}</td><td>{date(generation.createdAt)}</td><td>{generation.missing?.length ? generation.missing.join(', ') : generation.reason}</td><td>{generation.invoiceId && <button className="billing-link" onClick={() => go(`/finance/drafts/${generation.invoiceId}`)}>Xem</button>}</td>
            </tr>)}</tbody></table></div> : <BillingState title="Chưa có generation">Nguồn chưa được tính cho các kỳ trong trang này.</BillingState>}
      </BillingCard><BillingCard title="Mở kỳ tháng" hint="Chỉ mở sau khi timezone tenant đã được đóng băng bởi nguồn hợp lệ.">
        <label>Tháng<input type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} /></label>
        <label>Lý do<textarea value={reason} onChange={(e) => { setReason(e.target.value); pendingKey.current = null }} /></label>
        <button className="billing-button billing-button-secondary" disabled={working || !/^\d{4}-\d{2}$/.test(newMonth) || !reason.trim()}
          onClick={() => act('/billing/periods', { monthStart: `${newMonth}-01`, reason }, (value) => setSelectedPeriod(value.id))}>Mở kỳ</button>
      </BillingCard><button className="billing-button billing-button-secondary" onClick={() => go('/finance/drafts')}>Xem dự thảo và tính lại G2</button></>}
    {!loading && pageData && (id === 'BL04' || id === 'BL06') && <BillingCard title={names[id]}>
      {pageData.items.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Hóa đơn</th><th>Học sinh</th><th>Kỳ</th><th>{id === 'BL04' ? 'Dự kiến' : 'Nghĩa vụ hiện tại'}</th>{id === 'BL06' && <><th>Đã phân bổ</th><th>Còn phải thu</th><th>Hạn</th></>}<th>Trạng thái</th><th>Chi tiết</th></tr></thead><tbody>{pageData.items.map((entry) =>
        <tr key={entry.id}><td>{entry.number ?? entry.id}</td><td>{entry.studentName}</td><td>{entry.period}</td><td>{money(id === 'BL04' ? entry.totalVnd : entry.netObligationVnd ?? entry.totalVnd)}</td>{id === 'BL06' && <><td>{entry.allocatedVnd === null ? '—' : money(entry.allocatedVnd)}</td><td>{entry.outstandingVnd === null ? '—' : money(entry.outstandingVnd)}</td><td>{date(entry.dueAt)}</td></>}<td><BillingBadge tone={entry.overdue ? 'warning' : entry.generationId === entry.currentGenerationId && entry.currentGenerationId === entry.latestGenerationId ? 'info' : 'warning'}>{id === 'BL06' ? `${entry.status} · ${entry.settlement ?? '—'}${entry.overdue ? ' · quá hạn' : ''}` : entry.status}</BillingBadge></td><td><button className="billing-link" onClick={() => go(id === 'BL04' ? `/finance/drafts/${entry.id}` : `/finance/invoices/${entry.id}`)}>Xem</button></td></tr>)}</tbody></table></div> : <BillingState title="Chưa có hóa đơn">Danh sách hiện trống.</BillingState>}{pageControls(pageData)}
    </BillingCard>}
    {!loading && detail && (id === 'BL05' || id === 'BL07') && <>
      <BillingCard title={`${detail.studentName} · ${detail.period}`} hint={`Policy ${detail.policyVersionId} · Generation ${detail.snapshot.id ?? 'không có'}`}>
        <p>Trạng thái: <strong>{detail.status}</strong> · Số hóa đơn: {detail.number ?? 'Chưa phát hành'}</p>
        <p>Phát hành: {date(detail.issuedAt)} · Hạn: {date(detail.dueAt)}</p>
        <p>Trước ưu đãi: <strong>{money(detail.grossVnd)}</strong> · Ưu đãi: <strong>{money(detail.discountVnd)}</strong> · Tổng: <strong>{money(detail.totalVnd)}</strong></p>
        <p>Ưu đãi anh/chị/em tại generation: {detail.snapshot.source ? detail.snapshot.source.sibling ? 'Đã xác minh' : 'Không áp dụng' : 'Chưa có snapshot nguồn'} · Múi giờ nguồn: {detail.snapshot.source?.timezone ?? '—'}</p>
      </BillingCard>
      <BillingCard title="Nguồn và đơn giá đã lưu" hint="Ngày nguồn và giá được chốt trong snapshot; không dùng ngày phát hành để áp giá.">
        {detail.lines.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Buổi</th><th>Ngày nguồn</th><th>Điểm danh</th><th>Đơn vị</th><th>PriceRule</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{detail.lines.map((line) => <tr key={line.id}>
          <td>{line.source.sessionId ?? '—'}</td><td>{line.source.sourceBusinessDate ?? '—'}</td><td>{line.source.sourceStatus ?? '—'}</td><td>{line.source.units ?? '—'}</td><td>{line.source.priceRuleId ?? '—'}<small className="billing-cell-sub">{line.source.priceScope ?? '—'} · [{line.source.priceEffectiveFrom ?? '—'}, {line.source.priceEffectiveTo ?? '∞'})</small></td><td>{moneyOr(line.source.unitPriceVnd)}</td><td>{money(line.amountVnd)}</td>
        </tr>)}</tbody></table></div> : <BillingState title="Thiếu dòng nguồn" alert>Không thể xác nhận hóa đơn khi snapshot chưa đầy đủ.</BillingState>}
      </BillingCard>
      {id === 'BL05' && <BillingCard title="Phát hành thủ công">
        {detail.currentGenerationId !== detail.snapshot.id || detail.latestGenerationId !== detail.snapshot.id ? <BillingState title="Generation đã cũ" alert>Tải lại và tính lại dự thảo trước khi phát hành.</BillingState> : null}
        <label>Lý do xác nhận<textarea value={reason} onChange={(e) => { setReason(e.target.value); pendingKey.current = null }} /></label>
        <label className="billing-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Tôi đã rà soát snapshot và xác nhận phát hành</label>
        <button className="billing-button" disabled={working || !detail.canIssue || !confirmed || !reason.trim() || !detail.lines.length || !detail.snapshot.source || detail.currentGenerationId !== detail.snapshot.id || detail.latestGenerationId !== detail.snapshot.id} onClick={() => act(`/billing/drafts/${detail.id}/issue`, { reason, confirmed: true, expectedGenerationId: detail.snapshot.id }, () => go(`/finance/invoices/${detail.id}`))}>Phát hành</button>
        {!detail.canIssue && <p className="billing-muted">Tài khoản hiện tại không có quyền phát hành hóa đơn.</p>}
        <h3>Lịch sử generation</h3><ul>{detail.generationHistory.map((generation) => <li key={generation.id}>{generation.number} · {generation.status} · {date(generation.createdAt)} · {generation.reason}</li>)}</ul>
      </BillingCard>}
      {id === 'BL05' && <BillingCard title="Tính lại dự thảo G2" hint="Tạo generation mới có lý do; giữ snapshot và lịch sử cũ.">
        <p>Generation hiện áp dụng: {detail.currentGenerationId} · Generation gần nhất: {detail.latestGenerationId}</p>
        <label>Lý do tính lại<textarea value={recomputeReason} onChange={(e) => { setRecomputeReason(e.target.value); pendingKey.current = null }} /></label>
        <label className="billing-check"><input type="checkbox" checked={recomputeConfirmed} onChange={(e) => setRecomputeConfirmed(e.target.checked)} /> Tôi xác nhận tạo generation mới cho dự thảo này</label>
        <button className="billing-button billing-button-secondary" disabled={working || !recomputeConfirmed || !recomputeReason.trim() || detail.status !== 'DRAFT'}
          onClick={() => act(`/billing/periods/${detail.periodId}/students/${detail.studentId}/recomputations`,
            { reason: recomputeReason, expectedBase: detail.latestGenerationId, expectedApplied: detail.currentGenerationId },
            (value) => { setRecomputeConfirmed(false); setRecomputeReason(''); setResult(value as GenerationResult) })}>Tính lại G2</button>
        {result?.status === 'NEEDS_INFORMATION' && <BillingState title="NEEDS_INFORMATION" alert>{result.source.missing.join(', ')}</BillingState>}
      </BillingCard>}
      {id === 'BL07' && <BillingCard title="Công nợ hiện tại" hint="Số dư ví chưa phân bổ không làm giảm công nợ.">
        {receivable ? <p>Nghĩa vụ sau điều chỉnh: <strong>{money(receivable.netObligationVnd)}</strong> · Đã phân bổ: <strong>{money(receivable.netAllocatedVnd)}</strong> · Còn phải thu: <strong>{money(receivable.outstandingVnd)}</strong></p> : <BillingState title="Chưa có số liệu công nợ">Không hiển thị số phải thu suy đoán từ ví hoặc snapshot gốc.</BillingState>}
      </BillingCard>}
      {id === 'BL07' && <BillingCard title="BL08 · Thanh toán rõ ràng từ ví">
        {paymentAwaiting && <><p role="alert">Có Payment đang chờ đối soát biên nhận cùng khóa gốc.</p>
          <button className="billing-button billing-button-secondary" onClick={() => void checkPaymentReceipt()}>Kiểm tra biên nhận Payment</button></>}
        {wallet?.canTopUp && receivable && detail.status === 'ISSUED' && BigInt(receivable.outstandingVnd) > 0n ? <>
          <p>Ví khả dụng: {money(wallet.balanceVnd)} · Còn thu: {money(receivable.outstandingVnd)}</p>
          <label>Số tiền VND<input inputMode="numeric" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /></label>
          <label>Lý do / tham chiếu<input value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <label className="billing-check"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> Xác nhận thanh toán hóa đơn này từ ví</label>
          <button className="billing-button" disabled={working || paymentAwaiting || !/^[1-9]\d*$/.test(paymentAmount) || !reason.trim() || !confirmed ||
            BigInt(paymentAmount || '0') > BigInt(wallet.balanceVnd) || BigInt(paymentAmount || '0') > BigInt(receivable.outstandingVnd)}
            onClick={() => act(`/invoices/${detail.id}/wallet-payments`, { amountVnd: paymentAmount, reason, confirmed: true }, () => setPaymentAmount(''))}>Thanh toán từ ví</button>
        </> : <p>Thanh toán ví chỉ mở cho nhân sự có quyền hiện hành trên hóa đơn ISSUED còn công nợ.</p>}
        <button className="billing-button billing-button-secondary" onClick={() => go('/finance/receivables')}>Mở ví và công nợ</button>
        {detail.status === 'ISSUED' && <button className="billing-button billing-button-secondary" onClick={() => go(`/finance/invoices/${detail.id}/adjust`)}>Yêu cầu điều chỉnh hoặc hủy</button>}
      </BillingCard>}
      {id === 'BL07' && <BillingCard title="Lịch sử phân bổ và điều chỉnh">
        {detail.payments.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>Khoản thu</th><th>Ngày</th><th>Nguồn</th><th>Số tiền</th><th>Phân bổ</th><th>Trạng thái</th></tr></thead><tbody>{detail.payments.map((payment) => <tr key={payment.id}><td>{payment.id}</td><td>{date(payment.paidAt)}</td><td>{payment.method}</td><td>{money(payment.amountVnd)}</td><td>{payment.allocations.map((allocation) => <div key={allocation.id}>{allocation.kind}: {money(allocation.amountVnd)}</div>)}</td><td>{payment.reversed ? 'Đã đảo' : 'Đã ghi nhận'}</td></tr>)}</tbody></table></div> : <BillingState title="Chưa có khoản thu">Không suy ra thanh toán từ số dư ví.</BillingState>}
        {detail.adjustments.length > 0 && <ul>{detail.adjustments.map((adjustment) => <li key={adjustment.id}>{adjustment.kind} · {money(adjustment.deltaVnd)} · {adjustment.status} · {date(adjustment.appliedAt)} · {adjustment.approvalRequestId}</li>)}</ul>}
      </BillingCard>}
    </>}
  </div>
}
