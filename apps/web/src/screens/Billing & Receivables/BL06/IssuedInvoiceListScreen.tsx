import { useState } from 'react'
import type { BillingData } from '../BillingTypes.ts'
import { BillingBadge, BillingCard, BillingHeading, BillingMetrics, BillingState, MoneyVnd } from '../BillingPrimitives.tsx'
import { invoiceStatus } from '../invoiceStatus.ts'
import '../BillingScreens.css'

export function IssuedInvoiceListScreen({ data, preview = false, onOpenInvoice }: { data?: BillingData; preview?: boolean; onOpenInvoice?: (id: string) => void }) {
  const [period, setPeriod] = useState('ALL')
  const [status, setStatus] = useState('ALL')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const invoices = data?.invoices ?? []
  const visible = invoices.filter((item) => (period === 'ALL' || item.period === period) && (status === 'ALL' || (status === 'OVERDUE' ? item.status === 'ISSUED' && item.overdue : status === 'CANCELLED' ? item.status === 'CANCELLED' : item.status === 'ISSUED' && item.settlement === status)) && `${item.number} ${item.studentName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
  const pageSize = 3
  const pages = Math.max(1, Math.ceil(visible.length / pageSize))
  const currentPage = Math.min(page, pages)
  const shown = visible.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  return <div className="billing-page" data-screen-id="BL06">
    <BillingHeading title="Hóa đơn đã phát hành" subtitle={preview ? 'Snapshot phát hành · Dữ liệu mẫu — UI Preview' : 'Hóa đơn trong phạm vi được cấp quyền'} />
    {!data ? <BillingState title="Chưa có dữ liệu hóa đơn">Chờ API tải hóa đơn đã phát hành và quyền xem hiện hành.</BillingState> : <>
      <BillingMetrics items={[{ label: 'Đã phát hành', value: String(invoices.filter((item) => item.status === 'ISSUED').length).padStart(2, '0'), hint: 'Hóa đơn vẫn giữ snapshot gốc' }, { label: 'Còn phải thu', value: <MoneyVnd value={data.issuedOutstandingTotalVnd} />, hint: 'Nghĩa vụ sau điều chỉnh trừ phân bổ' }, { label: 'Quá hạn', value: String(invoices.filter((item) => item.status === 'ISSUED' && item.overdue && item.outstandingVnd !== '0').length).padStart(2, '0'), hint: 'Theo hạn từ máy chủ' }]} />
      <BillingCard title="Lọc hóa đơn"><div className="billing-filters"><label>Kỳ học phí<select value={period} onChange={(event) => { setPeriod(event.target.value); setPage(1) }}><option value="ALL">Tất cả kỳ</option>{[...new Set(invoices.map((item) => item.period))].map((value) => <option value={value} key={value}>{value.slice(5, 7)}/{value.slice(0, 4)}</option>)}</select></label><label>Trạng thái<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option value="ALL">Tất cả</option><option value="UNPAID">Chưa thanh toán</option><option value="PARTIAL">Một phần</option><option value="SETTLED">Đã tất toán</option><option value="OVERDUE">Quá hạn</option><option value="CANCELLED">Đã hủy</option></select></label><label>Tìm hóa đơn<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Số hóa đơn hoặc học sinh" /></label></div></BillingCard>
      <BillingCard title="Danh sách hóa đơn" hint="Số dư ví chưa phân bổ không tự giảm công nợ.">{shown.length ? <><div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>SỐ HÓA ĐƠN / HỌC SINH</th><th>KỲ</th><th>PHÁT HÀNH</th><th>HẠN</th><th>NGHĨA VỤ</th><th>ĐÃ PHÂN BỔ</th><th>CÒN PHẢI THU</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{shown.map((item) => { const state = invoiceStatus(item); return <tr key={item.id}><td>{item.number}<small className="billing-cell-sub">{item.studentName}</small></td><td>{item.period.slice(5, 7)}/{item.period.slice(0, 4)}</td><td>{item.issuedAt}</td><td>{item.dueAt}</td><td><MoneyVnd value={item.adjustedObligationVnd} /></td><td><MoneyVnd value={item.allocatedVnd} /></td><td><MoneyVnd value={item.outstandingVnd} /></td><td><BillingBadge tone={state.tone}>{state.label}</BillingBadge></td><td><button type="button" className="billing-link" onClick={() => onOpenInvoice?.(item.id)}>Chi tiết</button></td></tr> })}</tbody></table></div><div className="billing-pagination"><span>Trang {currentPage}/{pages} · {visible.length} kết quả</span><div><button className="billing-button billing-button-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Trước</button><button className="billing-button billing-button-secondary" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Sau</button></div></div></> : <BillingState title={invoices.length ? 'Không có kết quả phù hợp' : 'Chưa có hóa đơn'}>{invoices.length ? 'Thử bộ lọc hoặc từ khóa khác.' : 'Hóa đơn xuất hiện sau khi phát hành thành công trên máy chủ.'}</BillingState>}</BillingCard>
    </>}
  </div>
}
