import { useState } from 'react'
import type { AcademicMoreData } from '../AcademicTypes.ts'
import { Header, Card, Metrics, Field, Select, Empty } from '../AcademicMorePrimitives.tsx'

export function ClassListScreen({ data, preview, navigate, tenantId, pathForDetail }: { data?: AcademicMoreData; preview: boolean; navigate: (path: string) => void; tenantId: string; pathForDetail?: (id: 'AC08', classId: string) => string }) {
  const [query, setQuery] = useState('')
  const [course, setCourse] = useState('Tất cả khóa')
  const [status, setStatus] = useState('Tất cả trạng thái')
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const [draftCode, setDraftCode] = useState('')
  const [draftName, setDraftName] = useState('')
  const [attempted, setAttempted] = useState(false)
  const rows = (data?.classes ?? []).filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) && (course === 'Tất cả khóa' || row.course === course) && (status === 'Tất cả trạng thái' || row.status === status))
  const shown = rows.slice((page - 1) * 4, page * 4)
  return <div className="academic-page"><Header title="Danh sách lớp học" subtitle={`Sức chứa, giáo viên và tình trạng lớp${preview ? ' · Dữ liệu mẫu' : ''}`} action={preview ? 'Tạo lớp học' : undefined} onAction={() => { setCreating(true); setAttempted(false); setDraftCode(''); setDraftName('') }} />
    {preview && <Metrics items={data?.classMetrics ?? []} />}
    <Card title="Tìm kiếm và lọc" hint="Chỉ hiển thị dữ liệu trong phạm vi được cấp."><div className="academic-filters"><Field label="Tìm lớp" value={query} onChange={(value) => { setQuery(value); setPage(1) }} placeholder="Mã hoặc tên lớp…" /><Select label="Khóa học" value={course} onChange={(value) => { setCourse(value); setPage(1) }} options={['Tất cả khóa', ...new Set((data?.classes ?? []).map((row) => row.course))]} /><Select label="Trạng thái" value={status} onChange={(value) => { setStatus(value); setPage(1) }} options={['Tất cả trạng thái', 'Đang hoạt động', 'Dự kiến mở', 'Đã hoàn thành']} /><button className="academic-primary" onClick={() => setPage(1)}>Áp dụng</button></div></Card>
    <Card title="Lớp học" hint={preview ? 'Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.' : 'Lớp học sẽ được tải sau khi kết nối API.'}>{!rows.length ? <Empty preview={preview} /> : <div className="academic-table-scroll"><table className="academic-table"><thead><tr><th>MÃ / LỚP</th><th>KHÓA · GIÁO VIÊN</th><th>SĨ SỐ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{shown.map((row) => <tr key={row.code}><th scope="row">{row.code} · {row.name}</th><td>{row.course} · {row.teacher}</td><td>{row.capacity}</td><td>{row.status}</td><td><button className="academic-link" onClick={() => navigate(pathForDetail?.('AC08', row.code) ?? `/app/${encodeURIComponent(tenantId)}/classes/${encodeURIComponent(row.code)}`)}>Xem lớp</button></td></tr>)}</tbody></table></div>}</Card>
    {preview && <div className="academic-pagination"><span>Hiển thị {shown.length} trong {rows.length} dữ liệu mẫu · 20 dòng / trang</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button disabled={page * 4 >= rows.length} onClick={() => setPage(page + 1)}>Sau</button></div></div>}
    <Card title="Quản lý lớp"><p className="academic-hint">Ghi danh chỉ khi còn chỗ và điều kiện trình độ/lịch phù hợp. Lớp đầy cần chặn xác nhận ghi danh; hồ sơ lịch sử vẫn đọc được khi lớp hoàn thành.</p></Card>
    {creating && <div className="academic-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreating(false) }}><div className="academic-dialog" role="dialog" aria-modal="true" aria-labelledby="class-dialog-title" onKeyDown={(event) => { if (event.key === 'Escape') setCreating(false) }}><div className="academic-dialog-head"><h2 id="class-dialog-title">Tạo lớp học</h2><button aria-label="Đóng hộp thoại" onClick={() => setCreating(false)}>×</button></div><p className="academic-hint">Biểu mẫu dữ liệu mẫu. Tạo lớp cần API và quyền hiệu lực.</p><div className="academic-form"><Field label="Mã lớp" value={draftCode} onChange={setDraftCode} error={attempted && !draftCode.trim()} /><Field label="Tên lớp" value={draftName} onChange={setDraftName} error={attempted && !draftName.trim()} /></div>{attempted && (!draftCode.trim() || !draftName.trim()) && <p role="alert" className="academic-error">Vui lòng nhập mã và tên lớp.</p>}<div className="academic-dialog-actions"><button onClick={() => setCreating(false)}>Hủy</button><button className="academic-primary" onClick={() => setAttempted(true)} disabled={!!draftCode.trim() && !!draftName.trim()}>Tạo lớp · Chờ API</button></div></div></div>}
  </div>
}
