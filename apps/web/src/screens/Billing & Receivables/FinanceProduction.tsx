import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { tenantPath } from '../../routes.ts'
import { BillingCard, BillingHeading, BillingState } from './BillingPrimitives.tsx'
import './BillingScreens.css'

type Id = 'BL09' | 'BL10' | 'OP04' | 'OP05'
type Page<T> = { items: T[]; total: number; page: number; pageSize: number }
type Student = { id: string; name: string; code: string }
type Transaction = { id: string; kind: string; amountVnd: string; createdAt: string; receiptReference: string | null; fundingMethod: string | null; evidence: string | null; reversedTopUpId: string | null; paymentId: string | null }
type Invoice = { id: string; number: string | null; status: string; originalTotalVnd: string; netObligationVnd: string; netAllocatedVnd: string; outstandingVnd: string; canOpenDetail: boolean; legacyMixed: boolean }
type Wallet = { studentId: string; studentName: string; balanceVnd: string; verifiedCashVnd: string; walletDebitsVnd: string; internalCreditsVnd: string; reversedTopUpsVnd: string; canTopUp: boolean; canReverse: boolean; transactions: Transaction[]; asOf: string }
type Receivables = { studentId: string; invoices: Invoice[]; asOf: string }
type Detail = { id: string; studentId: string; studentName: string; number: string | null; status: string; totalVnd: string; payments: unknown[]; adjustments: { id: string; kind: string; deltaVnd: string; status: string; approvalRequestId: string }[] }
type Receivable = { netObligationVnd: string; netAllocatedVnd: string; outstandingVnd: string }
type RequestPreview = Receivable & { invoiceId: string; studentId: string; status: string; originalTotalVnd: string; canRequestAdjustment: boolean; canRequestCancellation: boolean; policyAvailability: 'AVAILABLE' | 'BLOCKED_LEGACY_MIXED'; asOf: string }
type Approval = { id: string; operationType: string; targetType: string; targetId: string; studentId: string; status: string; reason: string; requesterMembershipId: string; createdAt: string; decidedAt: string | null; deltaVnd: string | null; canDecide: boolean; canExecute: boolean; decisions: { decision: string; reason: string; decidedAt: string; selfApproved: boolean }[]; executionReceipt: { id: string; status: string; refundVnd: string } | null }
type Pending = { path: string; body: object; key: string; studentId?: string; uncertain?: boolean }
const positive = (value: string) => /^[1-9]\d*$/.test(value) && BigInt(value) <= 9223372036854775807n
function storedPending(tenantId: string): Pending | null {
  try {
    const raw = window.sessionStorage.getItem(`educore:finance:${tenantId}`)
    if (!raw) return null
    const value = JSON.parse(raw) as Pending
    return typeof value.path === 'string' && typeof value.key === 'string' && value.body && typeof value.body === 'object'
      ? { ...value, uncertain: true } : null
  } catch { return null }
}
function savePending(tenantId: string, value: Pending | null) {
  try {
    if (value) window.sessionStorage.setItem(`educore:finance:${tenantId}`, JSON.stringify(value))
    else window.sessionStorage.removeItem(`educore:finance:${tenantId}`)
  } catch { /* The in-memory key still prevents a new operation in this mounted view. */ }
}
export function FinanceProduction({ id, tenantId, token, selectedId, api, navigate }: {
  id: Id; tenantId: string; token: string; selectedId?: string; api: ApiClient; navigate: (path: string) => void
}) {
  const [students, setStudents] = useState<Student[]>([])
  const [studentPage, setStudentPage] = useState(1)
  const [studentTotal, setStudentTotal] = useState(0)
  const [studentId, setStudentId] = useState('')
  const [wallet, setWallet] = useState<Wallet | null>(null)
  const [receivables, setReceivables] = useState<Receivables | null>(null)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [receivable, setReceivable] = useState<Receivable | null>(null)
  const [legacyBlocked, setLegacyBlocked] = useState(false)
  const [adjustRights, setAdjustRights] = useState<{ canAdjust: boolean; canCancel: boolean } | null>(null)
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [approvalPage, setApprovalPage] = useState(1)
  const [approvalTotal, setApprovalTotal] = useState(0)
  const [approval, setApproval] = useState<Approval | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => storedPending(tenantId)
    ? 'A financial operation awaits receipt reconciliation. Check its original operation key.' : '')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<'CASH' | 'BANK_TRANSFER'>('BANK_TRANSFER')
  const [receiptReference, setReceiptReference] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reason, setReason] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [reversalId, setReversalId] = useState('')
  const [kind, setKind] = useState<'ADJUSTMENT' | 'CANCELLATION'>('ADJUSTMENT')
  const [targetVnd, setTargetVnd] = useState('')
  const [decision, setDecision] = useState<'APPROVE' | 'REJECT' | 'REQUEST_INFO'>('APPROVE')
  const pending = useRef<Pending | null>(storedPending(tenantId))
  const read = useCallback(<T,>(path: string, signal?: AbortSignal) => api.learning<T>(tenantId, path, token, { signal }), [api, tenantId, token])
  const go = (path: string) => navigate(tenantPath(tenantId, path))
  const operationFor = (path: string) => path.endsWith('/top-ups') ? 'TOP_UP'
    : path.endsWith('/wallet-payments') ? 'PAY'
      : path.endsWith('/adjustment-requests') ? 'ADJUST_REQUEST'
        : path.endsWith('/cancellation-requests') ? 'CANCEL_REQUEST'
          : path.endsWith('/reversal-requests') ? 'REVERSE_TOP_UP_REQUEST'
            : path.endsWith('/execute') ? 'EXECUTE_APPROVAL' : null
  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    async function load() {
      setLoading(true); if (!pending.current) setError('')
      try {
        if (id === 'BL09') {
          const page = await read<Page<Student>>(`/finance/students?page=${studentPage}&pageSize=100`, signal)
          if (signal.aborted) return
          setStudents(page.items)
          setStudentTotal(page.total)
          const current = page.items.some((student) => student.id === studentId) ? studentId : (page.items[0]?.id ?? '')
          setStudentId(current)
          setWallet(current ? await read<Wallet>(`/finance/students/${encodeURIComponent(current)}`, signal) : null)
          setReceivables(null)
          if (current) {
            try { setReceivables(await read<Receivables>(`/finance/students/${encodeURIComponent(current)}/receivables`, signal)) }
            catch (cause) { if (!(cause instanceof ApiError && cause.status === 403)) throw cause }
          }
        } else if (id === 'BL10') {
          if (!selectedId) throw new ApiError(404, 'NOT_FOUND')
          const invoice = await read<Detail>(`/billing/invoices/${encodeURIComponent(selectedId)}`, signal)
          setDetail(invoice); setLegacyBlocked(false); setReceivable(null); setAdjustRights(null)
          const preview = await read<RequestPreview>(`/finance/invoices/${encodeURIComponent(selectedId)}/request-preview`, signal)
          if (preview.invoiceId !== invoice.id || preview.studentId !== invoice.studentId) throw new ApiError(502, 'INVALID_PREVIEW')
          setReceivable(preview)
          setLegacyBlocked(preview.policyAvailability !== 'AVAILABLE')
          setAdjustRights({ canAdjust: preview.canRequestAdjustment, canCancel: preview.canRequestCancellation })
        } else if (id === 'OP04') {
          const page = await read<Page<Approval>>(`/approvals?page=${approvalPage}&pageSize=100`, signal)
          setApprovals(page.items); setApprovalTotal(page.total)
        } else {
          if (!selectedId) throw new ApiError(404, 'NOT_FOUND')
          setApproval(await read<Approval>(`/approvals/${encodeURIComponent(selectedId)}`, signal))
        }
      } catch (cause) { if (!signal.aborted) setError(safeErrorMessage(cause)) }
      finally { if (!signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [approvalPage, id, read, revision, selectedId, studentId, studentPage])

  async function submit(path: string, body: object, success: string) {
    if (busy) return
    const operation = pending.current ?? { path, body, key: crypto.randomUUID(),
      studentId: wallet?.studentId ?? detail?.studentId ?? approval?.studentId ?? '' }
    if (pending.current && pending.current.path !== path) { setError('Resolve the pending operation before another financial action.'); return }
    if (pending.current?.uncertain) { await reconcile(pending.current); return }
    pending.current = operation
    savePending(tenantId, operation)
    setBusy(true); setError(''); setMessage('')
    try {
      const result = await api.learning<{ id: string; status?: string }>(tenantId, operation.path, token,
        { method: 'POST', body: operation.body, idempotencyKey: operation.key })
      pending.current = null
      savePending(tenantId, null)
      setConfirmed(false); setReason(''); setAmount(''); setEvidence(''); setReceiptReference('')
      setMessage(success)
      setRevision((n) => n + 1)
      if (path.includes('requests') && result.id) go(`/approvals/${encodeURIComponent(result.id)}`)
    } catch (cause) {
      if (cause instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(cause.status)) {
        if (operation.uncertain) { setError(safeErrorMessage(cause)); await reconcile(operation) }
        else { pending.current = null; savePending(tenantId, null); setError(safeErrorMessage(cause)) }
      }
      else {
        operation.uncertain = true; savePending(tenantId, operation)
        setError('The result is unknown. Check the server receipt for this same operation key before retrying.')
        await reconcile(operation)
      }
    } finally { setBusy(false) }
  }
  async function reconcile(operation = pending.current) {
    if (!operation) return
    const decisionPath = /^\/approvals\/([^/]+)\/decisions$/.exec(operation.path)
    if (decisionPath) {
      const body = operation.body as { decision?: string; reason?: string }
      if (!['APPROVE', 'REJECT', 'REQUEST_INFO'].includes(body.decision ?? '') || !body.reason?.trim()) {
        setError('The original decision payload cannot be verified. Keep the operation key for review.'); return
      }
      try {
        const outcome = await api.learning<{ status: string; approvalId?: string; decision?: string; decisionStatus?: string }>(
          tenantId, `/approvals/${encodeURIComponent(decisionPath[1])}/decision-outcomes`, token,
          { method: 'POST', body: { key: operation.key, decision: body.decision, reason: body.reason } })
        if (outcome.status === 'COMMITTED' && outcome.approvalId === decisionPath[1] && outcome.decision === body.decision) {
          pending.current = null; savePending(tenantId, null)
          setError(''); setMessage('The server confirms the decision. Execution remains a separate action.')
          setRevision((n) => n + 1)
        } else setError('No matching committed decision receipt is visible yet. Keep the original operation key.')
      } catch { setError('Decision receipt lookup is unavailable or conflicts with the original payload. Keep the original key.') }
      return
    }
    const kind = operationFor(operation.path)
    if (!kind || !operation.studentId) { setError('The operation target cannot be verified. Keep the original key for review.'); return }
    try {
      const outcome = await read<{ status: string; receipt?: { id: string } }>(
        `/finance/students/${encodeURIComponent(operation.studentId)}/outcomes/${kind}/${encodeURIComponent(operation.key)}`)
      if (outcome.status === 'COMMITTED') {
        pending.current = null
        savePending(tenantId, null)
        setError(''); setMessage('The server confirms this operation committed.')
        setRevision((n) => n + 1)
        if (operation.path.includes('requests') && outcome.receipt?.id) go(`/approvals/${encodeURIComponent(outcome.receipt.id)}`)
      } else setError('No committed receipt is visible yet. Keep this operation key and reconcile again before any retry.')
    } catch { setError('Receipt lookup is unavailable. Keep this operation key for reconciliation.') }
  }
  const money = (value: string) => `${new Intl.NumberFormat('vi-VN').format(BigInt(value))} ₫`
  const date = (value: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—'
  const selectedTopUp = wallet?.transactions.find((tx) => tx.id === reversalId && tx.kind === 'TOP_UP')
  const reversed = new Set(wallet?.transactions.filter((tx) => tx.reversedTopUpId).map((tx) => tx.reversedTopUpId) ?? [])
  return <div className="billing-page" data-screen-id={id}>
    <BillingHeading title={{ BL09: 'Công nợ, ví và khoản thu', BL10: 'Yêu cầu điều chỉnh hoặc hủy hóa đơn', OP04: 'Phê duyệt tài chính', OP05: 'Chi tiết phê duyệt' }[id]}
      subtitle="Dữ liệu và quyền hiện hành từ máy chủ" />
    {loading && <BillingState title="Đang tải">Đang đọc dữ liệu tài chính.</BillingState>}
    {error && <BillingState title="Không thể hoàn tất" alert>{error}</BillingState>}
    {error && pending.current && <button className="billing-button billing-button-secondary" disabled={busy}
      onClick={() => void reconcile()}>Kiểm tra biên nhận cùng khóa</button>}
    {message && <p role="status" className="billing-inline-info">{message}</p>}
    {!loading && id === 'BL09' && <>
      <BillingCard title="Học sinh trong phạm vi được cấp">
        {students.length ? <select aria-label="Học sinh" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
          {students.map((student) => <option key={student.id} value={student.id}>{student.name} · {student.code}</option>)}</select>
          : <BillingState title="Không có học sinh">Không có học sinh tài chính trong phạm vi hiện hành.</BillingState>}
        <p>Trang {studentPage} · {studentTotal} học sinh</p>
        <button disabled={studentPage <= 1} onClick={() => setStudentPage((page) => page - 1)}>Trước</button>
        <button disabled={studentPage * 100 >= studentTotal} onClick={() => setStudentPage((page) => page + 1)}>Sau</button>
      </BillingCard>
      {wallet && <>
        <BillingCard title={`Ví của ${wallet.studentName}`} hint={`Cập nhật ${date(wallet.asOf)} · số dư chưa phân bổ không giảm công nợ`}>
          <p>Số dư khả dụng: <strong>{money(wallet.balanceVnd)}</strong></p>
          <p>Tiền đã nhận và xác minh: {money(wallet.verifiedCashVnd)} · Ví đã trả hóa đơn: {money(wallet.walletDebitsVnd)}</p>
          <p>Ghi có nội bộ sau điều chỉnh/hủy: {money(wallet.internalCreditsVnd)} · TOP_UP đã đảo: {money(wallet.reversedTopUpsVnd)}</p>
          <p>TOP_UP là tiền đã nhận và xác minh; chỉ WALLET Payment mới phân bổ cho hóa đơn.</p>
        </BillingCard>
        {wallet.canTopUp && <BillingCard title="BL08 · Nạp ví thủ công">
          <div className="billing-form-grid"><label>Số tiền VND<input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label>Phương thức<select value={method} onChange={(e) => setMethod(e.target.value as typeof method)}><option>CASH</option><option>BANK_TRANSFER</option></select></label>
            <label>Tham chiếu biên nhận<input value={receiptReference} onChange={(e) => setReceiptReference(e.target.value)} /></label>
            <label>Chứng cứ đã kiểm tra<input value={evidence} onChange={(e) => setEvidence(e.target.value)} /></label>
            <label>Lý do<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <label className="billing-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Tôi đã xác minh biên nhận và xác nhận nạp ví</label></div>
          <button className="billing-button" disabled={busy || !positive(amount) || !receiptReference.trim() || !evidence.trim() || !reason.trim() || !confirmed}
            onClick={() => void submit(`/students/${wallet.studentId}/wallet/top-ups`, { amountVnd: amount, method, receiptReference, evidence, reason, confirmed: true }, 'Đã ghi nhận TOP_UP theo biên nhận máy chủ.')}>Ghi nhận TOP_UP</button>
        </BillingCard>}
        <BillingCard title="Lịch sử ví" hint="Giao dịch gốc và giao dịch bù được giữ riêng">
          {wallet.transactions.length ? <ul>{wallet.transactions.map((tx) => <li key={tx.id}>
            {tx.kind} · {money(tx.amountVnd)} · {date(tx.createdAt)} · {tx.receiptReference ?? tx.paymentId ?? tx.reversedTopUpId ?? tx.id}
            {tx.kind === 'TOP_UP' && wallet.canReverse && !reversed.has(tx.id) && <button onClick={() => setReversalId(tx.id)}>Yêu cầu đảo</button>}
          </li>)}</ul> : <BillingState title="Chưa có giao dịch">Ví chưa ghi nhận giao dịch.</BillingState>}
        </BillingCard>
        {selectedTopUp && wallet.canReverse && <BillingCard title="BL11 · Yêu cầu đảo TOP_UP toàn phần">
          <p>Biên nhận: {selectedTopUp.receiptReference} · {selectedTopUp.fundingMethod} · {money(selectedTopUp.amountVnd)}</p>
          <p>Chứng cứ nguồn: {selectedTopUp.evidence}</p><p>Số dư khả dụng: {money(wallet.balanceVnd)}</p>
          {BigInt(wallet.balanceVnd) < BigInt(selectedTopUp.amountVnd) && <BillingState title="Không đủ số dư" alert>Không đảo Payment khác để bù.</BillingState>}
          <label>Lý do đảo<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <label className="billing-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Xác nhận yêu cầu đảo toàn bộ TOP_UP này</label>
          <button className="billing-button" disabled={busy || !confirmed || !reason.trim() || BigInt(wallet.balanceVnd) < BigInt(selectedTopUp.amountVnd)}
            onClick={() => void submit(`/wallet/top-ups/${selectedTopUp.id}/reversal-requests`, { reason, confirmed: true }, 'Đã tạo yêu cầu đảo, chờ duyệt và thực thi riêng.')}>Gửi yêu cầu đảo</button>
        </BillingCard>}
        {receivables && <BillingCard title="Hóa đơn và công nợ">
          {receivables.invoices.length ? <ul>{receivables.invoices.map((invoice) => <li key={invoice.id}>
            {invoice.canOpenDetail ? <button onClick={() => go(`/finance/invoices/${invoice.id}`)}>{invoice.number ?? invoice.id}</button>
              : <span>{invoice.number ?? invoice.id}</span>} · {invoice.status}
            <p>Nghĩa vụ gốc {money(invoice.originalTotalVnd)} · Nghĩa vụ hiện hành {money(invoice.netObligationVnd)} · Phân bổ ròng {money(invoice.netAllocatedVnd)} · Còn thu {money(invoice.outstandingVnd)}</p>
            {invoice.legacyMixed && <p role="alert">NEEDS_DECISION: lịch sử legacy hoặc mixed; không tự chuyển nguồn.</p>}
          </li>)}</ul> : <BillingState title="Chưa có hóa đơn">Chưa có nghĩa vụ đã phát hành.</BillingState>}
        </BillingCard>}
      </>}
    </>}
    {!loading && id === 'BL10' && detail && <>
      <BillingCard title="Hóa đơn đã phát hành · chỉ đọc"><p>{detail.number} · {detail.studentName} · {detail.status}</p>
        <p>Gốc {money(detail.totalVnd)}{receivable && <> · Hiện hành {money(receivable.netObligationVnd)} · Đã phân bổ {money(receivable.netAllocatedVnd)} · Còn thu {money(receivable.outstandingVnd)}</>}</p>
        {detail.adjustments.map((a) => <p key={a.id}>{a.kind} {money(a.deltaVnd)} · {a.status} · <button onClick={() => go(`/approvals/${a.approvalRequestId}`)}>Phê duyệt</button></p>)}
      </BillingCard>
      {legacyBlocked && <BillingState title="NEEDS_DECISION · legacy hoặc mixed" alert>Chính sách đối soát nguồn cũ chưa được duyệt. Không gửi yêu cầu có thể thực thi để ghi có ví.</BillingState>}
      {!adjustRights && !legacyBlocked && <BillingState title="Chỉ xem" alert>Quyền yêu cầu thay đổi tài chính chưa được xác nhận.</BillingState>}
      {adjustRights && !adjustRights.canAdjust && !adjustRights.canCancel && !legacyBlocked &&
        <BillingState title="Chỉ xem">Tài khoản hiện tại không có quyền gửi yêu cầu điều chỉnh hoặc hủy hóa đơn này.</BillingState>}
      <BillingCard title="BL10 · Đề nghị thay đổi" hint="Yêu cầu không sửa hóa đơn hay ví trước khi duyệt và thực thi">
        <label>Loại<select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="ADJUSTMENT">Điều chỉnh</option><option value="CANCELLATION">Hủy</option></select></label>
        {kind === 'ADJUSTMENT' && <label>Nghĩa vụ mới VND<input inputMode="numeric" value={targetVnd} onChange={(e) => setTargetVnd(e.target.value)} /></label>}
        {kind === 'ADJUSTMENT' && receivable && /^(0|[1-9]\d*)$/.test(targetVnd) && <p>Delta đề nghị: {money((BigInt(targetVnd) - BigInt(receivable.netObligationVnd)).toString())}. Tăng nghĩa vụ không tự trừ ví.</p>}
        <label>Lý do<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label className="billing-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Tôi xác nhận gửi yêu cầu duyệt thủ công</label>
        <button className="billing-button" disabled={busy || detail.status !== 'ISSUED' || !receivable || legacyBlocked ||
          !adjustRights || !(kind === 'CANCELLATION' ? adjustRights.canCancel : adjustRights.canAdjust) ||
          !confirmed || !reason.trim() || (kind === 'ADJUSTMENT' && (!/^(0|[1-9]\d*)$/.test(targetVnd) ||
            BigInt(targetVnd) === BigInt(receivable?.netObligationVnd ?? '0') || BigInt(targetVnd) > 9223372036854775807n))}
          onClick={() => {
            const path = kind === 'CANCELLATION' ? 'cancellation-requests' : 'adjustment-requests'
            const body = kind === 'CANCELLATION' ? { reason } : { reason, amountDeltaVnd: (BigInt(targetVnd) - BigInt(receivable!.netObligationVnd)).toString() }
            void submit(`/invoices/${detail.id}/${path}`, body, 'Đã tạo yêu cầu; hóa đơn và ví chưa đổi.')
          }}>Gửi yêu cầu</button>
      </BillingCard>
    </>}
    {!loading && id === 'OP04' && <BillingCard title="Yêu cầu tài chính trong phạm vi được cấp">
      {approvals.length ? <ul>{approvals.map((item) => <li key={item.id}>
        <button onClick={() => go(`/approvals/${item.id}`)}>{item.operationType} · {item.targetType} {item.targetId}</button>
        <p>{item.status} · {item.reason} · Người gửi {item.requesterMembershipId} · {date(item.createdAt)}</p>
      </li>)}</ul> : <BillingState title="Không có yêu cầu">Không có yêu cầu tài chính trong phạm vi hiện hành.</BillingState>}
      <p>Trang {approvalPage} · {approvalTotal} yêu cầu</p>
      <button disabled={approvalPage <= 1} onClick={() => setApprovalPage((page) => page - 1)}>Trước</button>
      <button disabled={approvalPage * 100 >= approvalTotal} onClick={() => setApprovalPage((page) => page + 1)}>Sau</button>
    </BillingCard>}
    {!loading && id === 'OP05' && approval && <>
      <BillingCard title={`${approval.operationType} · ${approval.targetType} ${approval.targetId}`}>
        <p>Trạng thái: <strong>{approval.status}</strong> · Người gửi {approval.requesterMembershipId}</p>
        <p>Lý do: {approval.reason} · Tạo {date(approval.createdAt)} · Quyết định {date(approval.decidedAt)}</p>
        {approval.deltaVnd && <p>Delta đề nghị: {money(approval.deltaVnd)}</p>}
        {approval.decisions.map((d, index) => <p key={index}>{d.decision} · {d.reason} · {date(d.decidedAt)} {d.selfApproved && '· SELF_APPROVED'}</p>)}
        {approval.executionReceipt && <p role="status">Biên nhận thực thi: {approval.executionReceipt.id} · {approval.executionReceipt.status} · Ghi có nội bộ {money(approval.executionReceipt.refundVnd)}</p>}
        {approval.status === 'APPROVED' && !approval.executionReceipt && <p>APPROVED đã lưu; chưa có tác động tài chính hoàn tất.</p>}
      </BillingCard>
      {(approval.status === 'PENDING_APPROVAL' && approval.canDecide || approval.status === 'APPROVED' && approval.canExecute) && <BillingCard title={approval.status === 'APPROVED' ? 'Thực thi riêng' : 'Quyết định thủ công'}>
        {approval.status === 'PENDING_APPROVAL' && <label>Quyết định<select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}><option value="APPROVE">Phê duyệt</option><option value="REJECT">Từ chối</option><option value="REQUEST_INFO">Yêu cầu bổ sung</option></select></label>}
        <label>Lý do<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        <label className="billing-check"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> Xác nhận thao tác tài chính này</label>
        <button className="billing-button" disabled={busy || !reason.trim() || !confirmed}
          onClick={() => void submit(`/approvals/${approval.id}/${approval.status === 'APPROVED' ? 'execute' : 'decisions'}`,
            approval.status === 'APPROVED' ? { reason } : { reason, decision },
            approval.status === 'APPROVED' ? 'Đã thực thi theo biên nhận máy chủ.' : 'Đã lưu quyết định; cần thực thi riêng sau APPROVED.')}
        >{approval.status === 'APPROVED' ? 'Thực thi đã duyệt' : 'Lưu quyết định'}</button>
      </BillingCard>}
      {approval.targetType === 'Invoice' && <button className="billing-button billing-button-secondary" onClick={() => go(`/finance/invoices/${approval.targetId}`)}>Mở hóa đơn</button>}
      <button className="billing-button billing-button-secondary" onClick={() => go('/approvals')}>Về danh sách</button>
    </>}
  </div>
}
