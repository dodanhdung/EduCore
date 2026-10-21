import { useState } from 'react'
import type { BillingInvoice, StudentWallet } from '../BillingTypes.ts'
import { BillingBadge, MoneyVnd, PendingNotice } from '../BillingPrimitives.tsx'
import '../BillingScreens.css'

export type WalletFeedback = 'duplicate' | 'concurrent' | 'unknown' | 'forbidden'

const feedbackText = {
  duplicate: 'Biên nhận hoặc Payment đã tồn tại. Cần tra cứu bản ghi gốc; không gửi lại bằng khóa mới.',
  concurrent: 'Số dư hoặc công nợ đã thay đổi. Tải snapshot mới trước khi xác nhận.',
  unknown: 'Chưa rõ kết quả commit. Tra receipt và audit trên máy chủ trước khi thử lại.',
  forbidden: 'Không có quyền tài chính hiện hành trên học sinh và tenant này.',
}

function validPositiveVnd(value: string) { return /^\d+$/.test(value) && BigInt(value) > 0n }

export function TopUpDialog({ wallet, onClose, feedback }: { wallet: StudentWallet; onClose: () => void; feedback?: WalletFeedback }) {
  const [amount, setAmount] = useState('')
  const [source, setSource] = useState<'CASH' | 'BANK_TRANSFER'>('BANK_TRANSFER')
  const [receivedAt, setReceivedAt] = useState('')
  const [receiptRef, setReceiptRef] = useState('')
  const [evidence, setEvidence] = useState('')
  const [verified, setVerified] = useState(false)
  const [step, setStep] = useState<'form' | 'review' | 'pending'>('form')
  const ready = validPositiveVnd(amount) && receivedAt !== '' && receiptRef.trim() !== '' && evidence.trim() !== '' && verified && !feedback
  return <div className="billing-dialog-backdrop" data-screen-id="BL08"><section className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="topup-title">
    <h2 id="topup-title">Nạp ví học phí thủ công</h2><p className="billing-muted">{wallet.studentName} · {wallet.studentId} · không cần hóa đơn</p>
    <p className="billing-inline-info">Số dư hiện tại: <MoneyVnd value={wallet.availableVnd} /></p>
    {feedback && <p role="alert" className="billing-error">{feedbackText[feedback]}</p>}
    {step === 'form' ? <div className="billing-form-grid"><label>Số tiền VND<input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Ví dụ: 1000000" /></label><label>Nguồn tiền đã xác minh<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}><option value="BANK_TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option></select></label><label>Thời điểm nhận tiền<input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} /></label><label>Mã biên nhận<input value={receiptRef} onChange={(event) => setReceiptRef(event.target.value)} /></label><label className="billing-field-wide">Chứng cứ đối soát<textarea value={evidence} onChange={(event) => setEvidence(event.target.value)} /></label><label className="billing-check billing-field-wide"><input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} /> Tôi đã đối soát nguồn tiền ngoài hệ thống</label></div> : step === 'review' ? <div className="billing-review-list"><p><strong>Học sinh:</strong> {wallet.studentName}</p><p><strong>Số tiền:</strong> <MoneyVnd value={amount} /></p><p><strong>Nguồn:</strong> {source === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'}</p><p><strong>Nhận lúc:</strong> {receivedAt}</p><p><strong>Biên nhận:</strong> {receiptRef}</p><p><strong>Chứng cứ:</strong> {evidence}</p><p>TOP_UP chỉ tăng ví sau khi máy chủ xác nhận; không tạo Payment, doanh thu học phí hoặc tự giảm công nợ.</p></div> : <PendingNotice>PENDING_API: chờ kết quả TOP_UP từ máy chủ và tra cứu receipt. Không có số dư nào được thay đổi trong preview.</PendingNotice>}
    {step === 'form' && !validPositiveVnd(amount) && amount !== '' && <p role="alert" className="billing-error">Số tiền phải là số nguyên VND lớn hơn 0.</p>}
    <div className="billing-actions"><button className="billing-button billing-button-secondary" onClick={step === 'review' ? () => setStep('form') : onClose}>{step === 'review' ? 'Sửa' : 'Đóng'}</button>{step === 'form' && <button className="billing-button" disabled={!ready} onClick={() => setStep('review')}>Rà soát nạp ví</button>}{step === 'review' && <button className="billing-button" onClick={() => setStep('pending')}>Xác nhận yêu cầu</button>}</div>
  </section></div>
}

export function WalletPaymentDialog({ invoice, availableVnd, onClose, feedback }: { invoice: BillingInvoice; availableVnd: string; onClose: () => void; feedback?: WalletFeedback }) {
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [step, setStep] = useState<'form' | 'review' | 'pending'>('form')
  const positive = validPositiveVnd(amount)
  const eligible = invoice.status === 'ISSUED' && invoice.sourceType === 'PURE_WALLET' && BigInt(invoice.outstandingVnd) > 0n
  const tooMuchWallet = positive && BigInt(amount) > BigInt(availableVnd)
  const tooMuchDebt = positive && BigInt(amount) > BigInt(invoice.outstandingVnd)
  const ready = eligible && positive && !tooMuchWallet && !tooMuchDebt && !feedback
  return <div className="billing-dialog-backdrop" data-screen-id="BL08"><section className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="wallet-payment-title">
    <h2 id="wallet-payment-title">Trả hóa đơn bằng ví</h2><p className="billing-muted">{invoice.number} · {invoice.studentName}</p>
    <div className="billing-operation-summary"><p>Còn phải thu: <strong><MoneyVnd value={invoice.outstandingVnd} /></strong></p><p>Ví khả dụng: <strong><MoneyVnd value={availableVnd} /></strong></p></div>
    {!eligible && <p role="alert" className="billing-error">Chỉ hóa đơn ISSUED nguồn Wallet, còn công nợ, mới đủ điều kiện.</p>}
    {feedback && <p role="alert" className="billing-error">{feedbackText[feedback]}</p>}
    {step === 'form' ? <div className="billing-form-grid"><label>Số tiền VND<input inputMode="numeric" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Nhập số tiền rõ ràng" /></label><label>Mã tham chiếu nội bộ<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Tùy chọn" /></label></div> : step === 'review' ? <div className="billing-review-list"><p><strong>Invoice:</strong> {invoice.number}</p><p><strong>Số tiền yêu cầu:</strong> <MoneyVnd value={amount} /> <BillingBadge tone="info">{BigInt(amount) === BigInt(invoice.outstandingVnd) ? 'Thanh toán đủ' : 'Thanh toán một phần'}</BillingBadge></p><p><strong>Nguồn:</strong> WALLET của {invoice.studentName}</p><p><strong>Tham chiếu:</strong> {reference || 'Không nhập'}</p><p>Máy chủ kiểm tra lại số dư, công nợ, quyền và khóa chống trùng. Không tự giảm số tiền thành thanh toán một phần.</p></div> : <PendingNotice>PENDING_API: chờ receipt Payment WALLET. Nếu chưa rõ kết quả, tra cứu trên máy chủ trước khi thử lại; preview không ghi nợ ví.</PendingNotice>}
    {amount !== '' && !positive && <p role="alert" className="billing-error">Số tiền phải là số nguyên VND lớn hơn 0.</p>}{tooMuchWallet && <p role="alert" className="billing-error">Số tiền vượt số dư ví khả dụng.</p>}{tooMuchDebt && <p role="alert" className="billing-error">Số tiền vượt công nợ hóa đơn.</p>}
    <div className="billing-actions"><button className="billing-button billing-button-secondary" onClick={step === 'review' ? () => setStep('form') : onClose}>{step === 'review' ? 'Sửa' : 'Đóng'}</button>{step === 'form' && <button className="billing-button" disabled={!ready} onClick={() => setStep('review')}>Rà soát thanh toán</button>}{step === 'review' && <button className="billing-button" onClick={() => setStep('pending')}>Xác nhận yêu cầu</button>}</div>
  </section></div>
}
