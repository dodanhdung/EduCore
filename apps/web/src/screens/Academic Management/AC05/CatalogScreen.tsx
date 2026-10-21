import { useState } from 'react'
import type { AcademicMoreData } from '../AcademicTypes.ts'
import { Header, Card, Metrics, Tabs, Field, Select, Empty } from '../AcademicMorePrimitives.tsx'

export function CatalogScreen({ data, preview }: { data?: AcademicMoreData; preview: boolean }) {
  const [tab, setTab] = useState('Môn học')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Tất cả trạng thái')
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [order, setOrder] = useState('01')
  const [attempted, setAttempted] = useState(false)
  const rows = (data?.catalog ?? []).filter((row) => row.kind === tab && (!query || `${row.code} ${row.name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi'))) && (status === 'Tất cả trạng thái' || row.status === status))
  return <div className="academic-page"><Header title="Danh mục môn & trình độ" subtitle={`Quản lý dữ liệu nền của đào tạo${preview ? ' · Dữ liệu mẫu' : ''}`} action={preview ? 'Thêm danh mục' : undefined} onAction={() => { setEditing(true); setCode(''); setName(''); setOrder('01'); setAttempted(false) }} />
    <Tabs items={['Môn học', 'Trình độ']} value={tab} onChange={(value) => { setTab(value); setEditing(false) }} label="Loại danh mục" />
    {preview && <Metrics items={data?.catalogMetrics ?? []} />}
    <Card title="Tìm kiếm và lọc" hint="Chỉ hiển thị dữ liệu trong phạm vi được cấp."><div className="academic-filters"><Field label="Tìm mã hoặc tên" value={query} onChange={setQuery} placeholder="Nhập mã / tên danh mục…" /><Select label="Loại" value={tab} onChange={setTab} options={['Môn học', 'Trình độ']} /><Select label="Trạng thái" value={status} onChange={setStatus} options={['Tất cả trạng thái', 'Đang hoạt động', 'Đã ẩn']} /><button className="academic-primary" onClick={() => undefined}>Áp dụng</button></div></Card>
    <Card title={tab} hint={preview ? 'Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.' : 'Danh mục sẽ được tải sau khi kết nối API.'}>{!rows.length ? <Empty preview={preview} /> : <div className="academic-table-scroll"><table className="academic-table"><thead><tr><th>MÃ</th><th>TÊN {tab.toLocaleUpperCase('vi')}</th><th>THỨ TỰ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{rows.map((row) => <tr key={row.code}><th scope="row">{row.code}</th><td>{row.name}</td><td>{row.order}</td><td>{row.status}</td><td><button className="academic-link" onClick={() => { setCode(row.code); setName(row.name); setOrder(row.order); setEditing(true); setAttempted(false) }}>Chỉnh sửa</button></td></tr>)}</tbody></table></div>}</Card>
    <div className="academic-detail-grid"><Card title="Thêm hoặc chỉnh sửa" hint="Biểu mẫu chỉ thể hiện giao diện; lưu danh mục chờ API.">{editing ? <div className="academic-form"><div className="academic-fields"><Field label={`Mã ${tab.toLocaleLowerCase('vi')}`} value={code} onChange={setCode} error={attempted && !code.trim()} /><Field label={`Tên ${tab.toLocaleLowerCase('vi')}`} value={name} onChange={setName} error={attempted && !name.trim()} /></div><Field label="Thứ tự hiển thị" value={order} onChange={setOrder} error={attempted && !/^\d+$/.test(order)} />{attempted && (!code.trim() || !name.trim() || !/^\d+$/.test(order)) && <p role="alert" className="academic-error">Vui lòng nhập mã, tên và thứ tự hợp lệ.</p>}<div className="academic-form-actions"><button onClick={() => setEditing(false)}>Hủy</button><button className="academic-primary" onClick={() => setAttempted(true)} disabled={!!code.trim() && !!name.trim() && /^\d+$/.test(order)}>Lưu danh mục · Chờ API</button></div></div> : <p className="academic-hint">Chọn “Thêm danh mục” hoặc “Chỉnh sửa” để mở biểu mẫu.</p>}</Card><Card title="Trước khi lưu"><p className="academic-hint">Mã không được trùng trong tenant. Danh mục đã có khóa/lớp tham chiếu chỉ nên ẩn, không xóa cứng.</p></Card></div>
  </div>
}
