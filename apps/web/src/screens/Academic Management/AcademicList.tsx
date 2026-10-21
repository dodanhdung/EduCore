import { useMemo, useState } from 'react'
import type { AcademicId, AcademicPerson, Metric } from './AcademicTypes.ts'
import { PageHeader, Section, EditDialog } from './AcademicPrimitives.tsx'

export function ListScreen({ id, rows, metrics, preview, navigate, tenantId, pathForDetail }: { id: 'AC01' | 'AC03'; rows: AcademicPerson[]; metrics?: Metric[]; preview: boolean; navigate: (path: string) => void; tenantId: string; pathForDetail?: (id: AcademicId, personId: string) => string }) {
  const student = id === 'AC01'
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState('')
  const [subject, setSubject] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => rows.filter((row) => `${row.id} ${row.name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) && (!level || row.level === level) && (!subject || row.subject === subject)), [rows, query, level, subject])
  const pageSize = 4
  const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize))
  const shown = filtered.slice((Math.min(page, lastPage) - 1) * pageSize, Math.min(page, lastPage) * pageSize)
  const update = (setter: (value: string) => void, value: string) => { setter(value); setPage(1) }
  const detail = student ? 'students' : 'teachers'
  return <div className="academic-page">
    <PageHeader id={id} subtitle={`${student ? 'Hồ sơ học sinh trong tenant' : 'Hồ sơ và năng lực giảng dạy'}${preview ? ' · Dữ liệu mẫu' : ''}`} action={preview ? () => setShowDialog(true) : undefined} />
    {preview && <div className="academic-metrics">{(metrics ?? []).map(([label, value, note]) => <div className="academic-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>}
    <Section title="Tìm kiếm và lọc" hint="Chỉ hiển thị dữ liệu trong phạm vi được cấp."><div className="academic-filters">
      <label className="academic-field"><span>{student ? 'Tìm học sinh' : 'Tìm giáo viên'}</span><input value={query} onChange={(event) => update(setQuery, event.target.value)} placeholder={`Tên hoặc mã ${student ? 'học sinh' : 'giáo viên'}…`} /></label>
      <label className="academic-field"><span>{student ? 'Lớp' : 'Môn dạy'}</span><select value={subject} onChange={(event) => update(setSubject, event.target.value)}><option value="">{student ? 'Tất cả lớp' : 'Tất cả môn'}</option>{[...new Set(rows.map((row) => row.subject))].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="academic-field"><span>Trình độ</span><select value={level} onChange={(event) => update(setLevel, event.target.value)}><option value="">Tất cả trình độ</option>{[...new Set(rows.map((row) => row.level))].map((value) => <option key={value}>{value}</option>)}</select></label>
      <button className="academic-primary" onClick={() => setPage(1)}>Áp dụng</button>
    </div></Section>
    <Section title={student ? 'Học sinh' : 'Giáo viên'} hint={preview ? 'Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.' : 'Dữ liệu sẽ được tải từ API sau khi tích hợp.'}>
      {!preview ? <p role="status" className="academic-empty">Đang chờ kết nối API danh sách và quyền truy cập.</p> : filtered.length === 0 ? <p role="status" className="academic-empty">Không tìm thấy hồ sơ phù hợp.</p> : <div className="academic-table-scroll"><table className="academic-table"><thead><tr><th>MÃ / HỌ TÊN</th><th>{student ? 'LỚP ĐANG HỌC' : 'NĂNG LỰC'}</th><th>{student ? 'TRÌNH ĐỘ' : 'LỚP PHỤ TRÁCH'}</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{shown.map((row) => <tr key={row.id}><th scope="row">{row.id} · {row.name}</th><td>{row.subject}</td><td>{student ? row.level : row.classes}</td><td>{row.status}</td><td><button className="academic-link" onClick={() => navigate(pathForDetail?.(student ? 'AC02' : 'AC04', row.id) ?? `/app/${encodeURIComponent(tenantId)}/${detail}/${encodeURIComponent(row.id)}`)}>{student ? 'Xem hồ sơ' : 'Xem chi tiết'}</button></td></tr>)}</tbody></table></div>}
    </Section>
    {preview && <div className="academic-pagination"><span>Hiển thị {shown.length ? (Math.min(page, lastPage) - 1) * pageSize + 1 : 0}–{Math.min(Math.min(page, lastPage) * pageSize, filtered.length)} trong dữ liệu mẫu · 20 dòng / trang</span><div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button><button disabled={page >= lastPage} onClick={() => setPage(page + 1)}>Sau</button></div></div>}
    <Section title={student ? 'Truy cập hồ sơ' : 'Hồ sơ và tài khoản'}><p className="academic-hint">{student ? 'Cột liên hệ chỉ hiển thị khi người dùng có permission phù hợp.' : 'Hồ sơ giáo viên có thể tồn tại trước membership đăng nhập.'}</p><p className="academic-hint">{student ? 'Hồ sơ học sinh có thể được tạo trước tài khoản đăng nhập. Mã học sinh phải duy nhất.' : 'Phân công lớp cần kiểm tra năng lực, lịch và quyền thao tác.'}</p></Section>
    {showDialog && <EditDialog title={student ? 'Tạo hồ sơ học sinh' : 'Tạo hồ sơ giáo viên'} onClose={() => setShowDialog(false)} />}
  </div>
}
