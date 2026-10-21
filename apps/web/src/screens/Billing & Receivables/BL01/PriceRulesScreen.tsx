import { useState } from 'react'
import type { BillingData, PriceRule } from '../BillingTypes.ts'
import { BillingBadge, BillingCard, BillingHeading, BillingMetrics, BillingState, MoneyVnd, PendingNotice } from '../BillingPrimitives.tsx'
import '../BillingScreens.css'

const scopeLabel = { SESSION: 'Buổi học', CLASS: 'Lớp học', COURSE: 'Khóa học' }
const statusLabel = { ACTIVE: 'Hiệu lực', INACTIVE: 'Ngừng hiệu lực', HISTORICAL: 'Lịch sử', OVERLAP: 'Chồng lấn' }

export function PriceRulesScreen({ data, preview = false }: { data?: BillingData; preview?: boolean }) {
  const [scope, setScope] = useState<PriceRule['scope'] | 'ALL'>('ALL')
  const [status, setStatus] = useState<PriceRule['status'] | 'ALL'>('ALL')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<PriceRule | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ scope: 'CLASS', target: '', amountVnd: '', from: '', to: '' })
  const [checked, setChecked] = useState(false)
  const [notice, setNotice] = useState('')
  const rules = data?.priceRules ?? []
  const visible = rules.filter((rule) => (scope === 'ALL' || rule.scope === scope) && (status === 'ALL' || rule.status === status) && `${rule.target} ${rule.id}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
  const amountValid = /^\d+$/.test(form.amountVnd) && BigInt(form.amountVnd || '0') > 0n
  function validate() {
    setChecked(true)
    return Boolean(form.target.trim() && amountValid && form.from && (!form.to || form.to > form.from))
  }

  return <div className="billing-page" data-screen-id="BL01">
    <BillingHeading title="Bảng đơn giá học phí" subtitle={preview ? 'Chính sách giá · Hiệu lực theo tenant · Dữ liệu mẫu — UI Preview' : 'Chính sách giá trong phạm vi được cấp quyền'} action={<button className="billing-button" type="button" onClick={() => { setCreating(true); setSelected(null); setChecked(false); setNotice('') }}>Tạo đơn giá</button>} />
    {!data ? <BillingState title="Chưa có dữ liệu đơn giá">Chờ API và quyền hiệu lực để tải PriceRule. Chưa thể tạo hoặc sửa quy tắc giá.</BillingState> : <>
      <BillingMetrics items={[{ label: 'Quy tắc đang hiệu lực', value: String(rules.filter((r) => r.status === 'ACTIVE').length).padStart(2, '0'), hint: 'Theo dữ liệu mẫu trong tenant' }, { label: 'Thiếu đơn giá', value: data.priceMissingCount.padStart(2, '0'), hint: 'Cần xử lý trước khi tính phí' }, { label: 'Ngày hiệu lực gần nhất', value: data.latestPriceEffectiveDate, hint: 'Dữ liệu mẫu' }]} />
      <BillingCard title="Thứ tự chọn đơn giá"><p className="billing-muted">Theo ngày bắt đầu buổi tại múi giờ tenant đã cố định: giá buổi → lớp → khóa. Cửa sổ hiệu lực [từ, đến); chồng lấn thì dừng tính phí.</p><p className="billing-muted">Tạo draft muộn không đổi ngày áp giá. Hóa đơn đã phát hành giữ nguyên.</p></BillingCard>
      <BillingCard title="Quy tắc đơn giá" hint="Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.">
        <div className="billing-filters"><label>Tìm đối tượng<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tên lớp, buổi hoặc mã" /></label><label>Phạm vi<select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="ALL">Tất cả</option>{Object.entries(scopeLabel).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label><label>Trạng thái<select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="ALL">Tất cả</option>{Object.entries(statusLabel).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label></div>
        {visible.length ? <div className="billing-table-wrap"><table className="billing-table"><thead><tr><th>PHẠM VI</th><th>ĐỐI TƯỢNG</th><th>ĐƠN GIÁ / BUỔI</th><th>HIỆU LỰC [TỪ, ĐẾN)</th><th>POLICY</th><th>TRẠNG THÁI</th><th>CHI TIẾT</th></tr></thead><tbody>{visible.map((rule) => <tr key={rule.id}><td>{scopeLabel[rule.scope]}</td><td>{rule.target}</td><td><MoneyVnd value={rule.amountVnd} /></td><td>{rule.effectiveFrom}{rule.effectiveTo ? ` → ${rule.effectiveTo}` : ' → ∞'}</td><td>{rule.policy}</td><td><BillingBadge tone={rule.status === 'ACTIVE' ? 'success' : rule.status === 'OVERLAP' ? 'danger' : 'info'}>{statusLabel[rule.status]}</BillingBadge></td><td><button className="billing-link" type="button" onClick={() => { setSelected(rule); setCreating(false); setNotice('') }}>Xem</button></td></tr>)}</tbody></table></div> : <BillingState title="Không có quy tắc phù hợp">Thử từ khóa hoặc bộ lọc khác.</BillingState>}
      </BillingCard>
      <BillingCard title="Thiết lập đơn giá mới" hint="Kiểm tra cửa sổ hiệu lực trước khi lưu; không hồi tố buổi đã bắt đầu."><div className="billing-actions"><button className="billing-button billing-button-secondary" type="button" onClick={() => { setCreating(true); setSelected(null); setChecked(false) }}>Mở biểu mẫu</button></div></BillingCard>
    </>}
    {(creating || selected) && <div className="billing-dialog-backdrop"><div className="billing-dialog" role="dialog" aria-modal="true" aria-labelledby="price-dialog-title"><h2 id="price-dialog-title">{selected ? 'Phiên bản đơn giá' : 'Tạo quy tắc giá'}</h2>{selected ? <><div className="billing-detail-grid"><div><small>Phạm vi</small><strong>{scopeLabel[selected.scope]}</strong></div><div><small>Đối tượng</small><strong>{selected.target}</strong></div><div><small>Đơn giá</small><strong><MoneyVnd value={selected.amountVnd} /></strong></div><div><small>Hiệu lực</small><strong>{selected.effectiveFrom} → {selected.effectiveTo ?? '∞'}</strong></div><div><small>Policy</small><strong>{selected.policy}</strong></div><div><small>Trạng thái</small><strong>{statusLabel[selected.status]}</strong></div></div><p className="billing-muted">Phiên bản lịch sử và hóa đơn ISSUED chỉ đọc. Chỉnh sửa quy tắc cần API và kiểm tra lại nguồn.</p></> : <><div className="billing-form-grid"><label>Phạm vi<select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}><option value="SESSION">Buổi học</option><option value="CLASS">Lớp học</option><option value="COURSE">Khóa học</option></select></label><label>Đối tượng<input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} /></label><label>Đơn giá VND<input inputMode="numeric" value={form.amountVnd} onChange={(e) => setForm({ ...form, amountVnd: e.target.value.replace(/\D/g, '') })} /></label><label>Hiệu lực từ<input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label><label>Hiệu lực đến (không gồm)<input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label></div>{checked && !validateFields(form.target, amountValid, form.from, form.to) && <p className="billing-error" role="alert">Cần đối tượng, đơn giá dương và khoảng ngày hợp lệ.</p>}<p className="billing-muted">Kiểm tra chồng lấn và hồi tố phải do API xác nhận trước khi lưu.</p><div className="billing-actions"><button className="billing-button billing-button-secondary" type="button" onClick={() => { if (validate()) setNotice('Biểu mẫu hợp lệ tại máy. Cần API để kiểm tra chồng lấn; chưa lưu đơn giá.') }}>Kiểm tra quy tắc</button><button className="billing-button" type="button" onClick={() => { if (validate()) setNotice('PENDING_API: chưa lưu phiên bản mới. Cần kiểm tra quyền, chồng lấn và ngày bắt đầu buổi trên máy chủ.') }}>Lưu phiên bản mới</button></div>{notice && <PendingNotice>{notice}</PendingNotice>}</>}<div className="billing-actions"><button className="billing-button billing-button-secondary" type="button" onClick={() => { setCreating(false); setSelected(null) }}>Đóng</button></div></div></div>}
  </div>
}

function validateFields(target: string, amountValid: boolean, from: string, to: string) { return Boolean(target.trim() && amountValid && from && (!to || to > from)) }
