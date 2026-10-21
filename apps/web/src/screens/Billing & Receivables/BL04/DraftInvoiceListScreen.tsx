import { useState } from 'react'
import type { BillingData, BillingDraft } from '../BillingTypes.ts'
import { BillingBadge, BillingCard, BillingHeading, BillingMetrics, BillingState, MoneyVnd } from '../BillingPrimitives.tsx'
import '../BillingScreens.css'

const draftLabel = { DRAFT: 'Dự thảo', NEEDS_INFORMATION: 'Cần bổ sung dữ liệu', FAILED: 'Lần tính thất bại' }

export function DraftInvoiceListScreen({ data, preview = false, onOpenDraft }: { data?: BillingData; preview?: boolean; onOpenDraft?: (id: string) => void }) {
  const [period, setPeriod] = useState('ALL')
  const [status, setStatus] = useState<BillingDraft['status'] | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const drafts = data?.drafts ?? []
  const visible = drafts.filter((item) => (period === 'ALL' || item.period === period) && (status === 'ALL' || item.status === status) && `${item.id} ${item.studentName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
  const pageSize = 3
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pages)
  const shown = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  return <div className="billing-page" data-screen-id="BL04">
    <BillingHeading title="Hóa đơn dự thảo" subtitle={preview ? 'Chưa phát hành · Dữ liệu mẫu — UI Preview' : 'Dự thảo trong phạm vi được cấp quyền'} />
    {!data ? <BillingState title="Chưa có dữ liệu dự thảo">Chờ API tải dự thảo và quyền xem hiện hành. Chưa có hóa đơn nào được phát hành từ màn hình này.</BillingState> : <>
      <BillingMetrics items={[{ label: 'Dự thảo', value: String(drafts.filter((item) => item.status === 'DRAFT').length).padStart(2, '0'), hint: 'Chưa có số hóa đơn phát hành' }, { label: 'Cần bổ sung', value: String(drafts.filter((item) => item.status === 'NEEDS_INFORMATION' || item.status === 'FAILED').length).padStart(2, '0'), hint: 'Điểm danh, đơn giá hoặc lần tính' }, { label: 'Tổng dự kiến', value: <MoneyVnd value={data.draftEstimatedTotalVnd} />, hint: 'Chỉ gồm draft đủ dữ liệu · không phải công nợ' }]} />
      <BillingCard title="Bộ lọc theo kỳ" hint="Chỉ hiện học sinh và dự thảo được cấp quyền."><div className="billing-filters"><label>Kỳ học phí<select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }}><option value="ALL">Tất cả kỳ</option>{[...new Set(drafts.map((item) => item.period))].map((value) => <option value={value} key={value}>{value.slice(5, 7)}/{value.slice(0, 4)}</option>)}</select></label><label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }}><option value="ALL">Tất cả</option>{Object.entries(draftLabel).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Tìm học sinh<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Tên hoặc mã học sinh" /></label></div></BillingCard>
      <BillingCard title="Danh sách dự thảo" hint="Dữ liệu mẫu · Số tiền chỉ hiển thị khi snapshot đã đủ nguồn.">{shown.length ? <><div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>MÃ DỰ THẢO / HỌC SINH</th><th>KỲ</th><th>TRƯỚC ƯU ĐÃI</th><th>ƯU ĐÃI</th><th>DỰ KIẾN</th><th>GEN / POLICY</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td>{item.id}<small className="billing-cell-sub">{item.studentName}</small></td><td>{item.period.slice(5, 7)}/{item.period.slice(0, 4)}</td><td>{item.grossVnd === undefined ? 'Chưa xác định' : <MoneyVnd value={item.grossVnd} />}</td><td>{item.discountVnd === undefined ? 'Chưa xác định' : <MoneyVnd value={item.discountVnd} />}</td><td>{item.netVnd === undefined ? 'Chưa xác định' : <MoneyVnd value={item.netVnd} />}</td><td>{item.generationId} · {item.policyVersion}</td><td><BillingBadge tone={item.status === 'DRAFT' ? 'info' : 'warning'}>{draftLabel[item.status]}</BillingBadge></td><td><button type="button" className="billing-link" onClick={() => onOpenDraft?.(item.id)}>Rà soát</button></td></tr>)}</tbody></table></div><div className="billing-pagination"><span>Trang {currentPage}/{pages} · {visible.length} kết quả</span><div><button type="button" className="billing-button billing-button-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trước</button><button type="button" className="billing-button billing-button-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div></div></> : <BillingState title={drafts.length ? 'Không có kết quả phù hợp' : 'Chưa có dự thảo'}>{drafts.length ? 'Thử kỳ, trạng thái hoặc từ khóa khác.' : 'Dự thảo chỉ xuất hiện sau lần tính có nguồn hợp lệ.'}</BillingState>}</BillingCard>
      <BillingCard title="Phát hành có kiểm soát"><p className="billing-muted">Dự thảo không phải khoản phải thu. Chỉ mở từng dự thảo để kiểm tra nguồn, policy và quyền trước khi phát hành. P0 không phát hành hàng loạt hoặc tự phát hành.</p></BillingCard>
    </>}
  </div>
}
