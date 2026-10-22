import { useState } from 'react'
import type { StudentWallet, WalletTopUp } from '../BillingTypes.ts'
import { BillingBadge, MoneyVnd, PendingNotice } from '../BillingPrimitives.tsx'
import '../BillingScreens.css'

export function TopUpReversalDialog({ wallet, topUp, canManage, reconciliationBlocked = false, executionFeedback, onClose }: { wallet: StudentWallet; topUp: WalletTopUp; canManage: boolean; reconciliationBlocked?: boolean; executionFeedback?: 'PENDING' | 'FAILED'; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [step, setStep] = useState<'form' | 'review' | 'pending'>('form')
  const enough = BigInt(wallet.availableVnd) >= BigInt(topUp.amountVnd)
  const eligible = canManage && topUp.status === 'COMPLETED' && enough && !reconciliationBlocked && !executionFeedback
  if (!canManage) return <div className="billing-dialog-backdrop" data-screen-id="BL11"><section className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="reversal-title"><h2 id="reversal-title">Đảo nạp ví sai</h2><p role="alert" className="billing-error">Không có financial permission và student-tenant scope để xem hoặc yêu cầu đảo TOP_UP này.</p><div className="billing-actions"><button className="billing-button billing-button-secondary" onClick={onClose}>Đóng</button></div></section></div>
  return <div className="billing-dialog-backdrop" data-screen-id="BL11"><section className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="reversal-title">
    <h2 id="reversal-title">Đảo nạp ví sai</h2><p className="billing-muted">{topUp.id} · {wallet.studentName} · TOP_UP gốc giữ nguyên</p>
    <div className="billing-operation-summary"><p>Số tiền gốc, đảo toàn phần: <strong><MoneyVnd value={topUp.amountVnd} /></strong></p><p>Số dư ví khả dụng: <strong><MoneyVnd value={wallet.availableVnd} /></strong></p><p>Nguồn nhận: {topUp.source === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} · {topUp.receivedAt}</p><p>Biên nhận: {topUp.receiptRef} · {topUp.evidence}</p></div>
    {topUp.status === 'REVERSED' && <p role="alert" className="billing-error">TOP_UP này đã được đảo ngày {topUp.reversedAt}. Không gửi lại.</p>}
    {reconciliationBlocked && <p role="alert" className="billing-error">Nguồn thu legacy / mixed đang chờ chính sách đối soát. Không thực hiện đảo hoặc tự chuyển khoản cũ vào ví.</p>}
    {executionFeedback === 'PENDING' && <PendingNotice>Đảo TOP_UP đang chờ receipt máy chủ; giao dịch gốc và số dư hiện tại giữ nguyên trong preview.</PendingNotice>}
    {executionFeedback === 'FAILED' && <p role="alert" className="billing-error">Thực thi đảo TOP_UP thất bại. Chưa có giao dịch bù hoàn tất; cần đối soát trước khi thử lại.</p>}
    {!enough && <p role="alert" className="billing-error">Không đủ số dư ví để đảo toàn phần. Chuyển đối soát; không đảo Payment hợp lệ để bù.</p>}
    {step === 'form' ? <div className="billing-form-grid"><label className="billing-field-wide">Lý do đảo<textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><label className="billing-field-wide">Chứng cứ / tham chiếu<input value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label></div> : step === 'review' ? <div className="billing-review-list"><p><BillingBadge tone="warning">Đảo toàn phần</BillingBadge> <MoneyVnd value={topUp.amountVnd} /></p><p><strong>Lý do:</strong> {reason}</p><p><strong>Chứng cứ:</strong> {evidence}</p><p>Máy chủ phải kiểm tra lại số dư, permission và lịch sử; chỉ append giao dịch bù sau commit thành công.</p></div> : <PendingNotice>PENDING_API: chờ receipt/audit đảo TOP_UP. Số dư và lịch sử trong preview không đổi.</PendingNotice>}
    <p className="billing-muted">TOP_UP gốc luôn giữ trong lịch sử; chỉ receipt đảo hoàn tất mới tạo giao dịch bù. Nếu thiếu số dư hoặc kết quả chưa rõ, chuyển đối soát thủ công.</p>
    <p className="billing-muted">NEEDS_DECISION: đảo Payment WALLET là workflow riêng, chưa có route, biểu mẫu hoặc hành động thực thi được duyệt.</p>
    <div className="billing-actions"><button className="billing-button billing-button-secondary" onClick={step === 'review' ? () => setStep('form') : onClose}>{step === 'review' ? 'Sửa' : 'Đóng'}</button>{step === 'form' && <button className="billing-button" disabled={!eligible || !reason.trim() || !evidence.trim()} onClick={() => setStep('review')}>Rà soát đảo TOP_UP</button>}{step === 'review' && <button className="billing-button" onClick={() => setStep('pending')}>Xác nhận yêu cầu</button>}</div>
  </section></div>
}
