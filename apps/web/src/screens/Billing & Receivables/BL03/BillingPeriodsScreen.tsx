import { useState } from 'react'
import type { BillingData } from '../BillingTypes.ts'
import { BillingState, PendingNotice } from '../BillingPrimitives.tsx'
import { BillingPeriodsView } from './BillingPeriodsView.tsx'
import { fromPeriodFixture } from './BillingPeriodsViewModel.ts'
import '../BillingScreens.css'

/** DEV fixture adapter. No preview mutation is reported as server success. */
export function BillingPeriodsScreen({ data, preview = false, initialPeriodId, onOpenDrafts }: {
  data?: BillingData; preview?: boolean; initialPeriodId?: string; onOpenDrafts?: (periodId: string) => void
}) {
  const [periodId, setPeriodId] = useState(initialPeriodId ?? data?.periods[0]?.id ?? '')
  const [generationId, setGenerationId] = useState<string | undefined>()
  const [review, setReview] = useState(false)
  const [reason, setReason] = useState('')
  const [notice, setNotice] = useState('')
  const selectedId = periodId || (initialPeriodId === undefined ? data?.periods[0]?.id ?? '' : '')
  const period = data?.periods.find(row => row.id === selectedId)
  const generations = (data?.generations ?? []).filter(row => row.period === selectedId)
  const generation = generationId ? generations.find(row => row.id === generationId)
    : generations.find(row => row.current) ?? generations[0]
  const canRecompute = Boolean(period?.ready && generation?.status === 'COMPLETED' && generation.current)
  if (!data || !period) return <div className="billing-page" data-screen-id="BL03">
    <BillingState title={data?.periods.length && initialPeriodId ? 'Không tìm thấy kỳ học phí' : 'Chưa có dữ liệu kỳ học phí'}>
      {data?.periods.length && initialPeriodId ? 'Mã kỳ được yêu cầu không thuộc tập dữ liệu được phép xem.' : 'Chờ dữ liệu kỳ và generation.'}
    </BillingState></div>
  return <div className="billing-page" data-screen-id="BL03"><BillingPeriodsView
    model={fromPeriodFixture(data, selectedId, preview)}
    action={<button className="billing-button" type="button" disabled>Tạo lần tính</button>}
    onSelectPeriod={value => { setPeriodId(value); setGenerationId(undefined); setReview(false); setReason(''); setNotice('') }}
    selectedGenerationId={generationId}
    onSelectGeneration={id => { setGenerationId(id); setReview(false); setReason(''); setNotice('') }}
    generationForm={<p className="billing-muted">{preview ? 'Dữ liệu mẫu: ' : ''}Trạng thái nguồn của kỳ là {period.attendance}. Thao tác tạo dự thảo cần API và quyền hiệu lực.</p>}
    currentActions={<div className="billing-actions">
      <button className="billing-button" type="button" disabled={!canRecompute} onClick={() => { setReason(''); setReview(true); setNotice('') }}>Tính lại hóa đơn nháp</button>
      {generation?.status === 'FAILED' && <button className="billing-button billing-button-secondary" type="button" onClick={() => setNotice('PENDING_API: retry cùng generation chưa được gửi.')}>Thử lại lần tính</button>}
      {generation?.status === 'COMPLETED' && <button className="billing-button billing-button-secondary" type="button" disabled={!onOpenDrafts} onClick={() => onOpenDrafts?.(period.id)}>Xem dự thảo</button>}
    </div>} />
    {notice && <PendingNotice>{notice}</PendingNotice>}
    {review && <div className="billing-dialog-backdrop"><div className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="recompute-title">
      <h2 id="recompute-title">Xác nhận tính lại DRAFT</h2>
      <p>Generation kỳ vọng: <strong>{generation?.id}</strong>. Kết quả mới chỉ có sau khi máy chủ kiểm tra nguồn và tạo generation mới.</p>
      <label>Lý do tính lại<textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Nêu nguồn thay đổi và lý do" /></label>
      {!reason.trim() && <p className="billing-error">Cần nhập lý do trước khi tiếp tục.</p>}
      <div className="billing-actions"><button className="billing-button billing-button-secondary" type="button" onClick={() => { setReview(false); setReason('') }}>Hủy</button>
        <button className="billing-button" type="button" disabled={!reason.trim()} onClick={() => { setReview(false); setNotice('PENDING_API: chưa tính lại. Chưa tạo generation hoặc thay đổi draft.') }}>Xem yêu cầu tính lại</button></div>
    </div></div>}
  </div>
}
