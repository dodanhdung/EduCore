import { useState } from 'react'
import type { AcademicMoreData } from '../AcademicTypes.ts'
import { Header, Card, Metrics, Field, Select, Empty } from '../AcademicMorePrimitives.tsx'

export function CourseScreen({ data, preview }: { data?: AcademicMoreData; preview: boolean }) {
  const [query, setQuery] = useState('')
  const [subject, setSubject] = useState('Tất cả môn')
  const [level, setLevel] = useState('Tất cả trình độ')
  const [editing, setEditing] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [formSubject, setFormSubject] = useState('Tiếng Anh')
  const [formLevel, setFormLevel] = useState('B2')
  const [attempted, setAttempted] = useState(false)
  const rows = (data?.courses ?? []).filter((row) => `${row.code} ${row.name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')) && (subject === 'Tất cả môn' || row.subject === subject) && (level === 'Tất cả trình độ' || row.level === level))
  return <div className="academic-page"><Header title="Danh sách khóa học" subtitle={`Khóa học theo môn và trình độ${preview ? ' · Dữ liệu mẫu' : ''}`} action={preview ? 'Tạo khóa học' : undefined} onAction={() => { setEditing(true); setCode(''); setName(''); setAttempted(false) }} />
    {preview && <Metrics items={data?.courseMetrics ?? []} />}
    <Card title="Tìm kiếm và lọc" hint="Chỉ hiển thị dữ liệu trong phạm vi được cấp."><div className="academic-filters"><Field label="Tìm khóa học" value={query} onChange={setQuery} placeholder="Mã hoặc tên khóa…" /><Select label="Môn" value={subject} onChange={setSubject} options={['Tất cả môn', ...new Set((data?.courses ?? []).map((row) => row.subject))]} /><Select label="Trình độ" value={level} onChange={setLevel} options={['Tất cả trình độ', ...new Set((data?.courses ?? []).map((row) => row.level))]} /></div></Card>
    <Card title="Khóa học" hint={preview ? 'Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.' : 'Khóa học sẽ được tải sau khi kết nối API.'}>{!rows.length ? <Empty preview={preview} /> : <div className="academic-table-scroll"><table className="academic-table"><thead><tr><th>MÃ / TÊN KHÓA</th><th>MÔN</th><th>TRÌNH ĐỘ</th><th>TRẠNG THÁI</th><th>THAO TÁC</th></tr></thead><tbody>{rows.map((row) => <tr key={row.code}><th scope="row">{row.code} · {row.name}</th><td>{row.subject}</td><td>{row.level}</td><td>{row.status}</td><td><button className="academic-link" onClick={() => { setCode(row.code); setName(row.name); setFormSubject(row.subject); setFormLevel(row.level); setEditing(true); setAttempted(false) }}>Xem khóa</button></td></tr>)}</tbody></table></div>}</Card>
    <div className="academic-detail-grid"><Card title="Thông tin khóa học" hint="Biểu mẫu theo quyền quản lý; lưu khóa học chờ API.">{editing ? <div className="academic-form"><div className="academic-fields"><Field label="Mã khóa" value={code} onChange={setCode} error={attempted && !code.trim()} /><Field label="Tên khóa" value={name} onChange={setName} error={attempted && !name.trim()} /><Select label="Môn" value={formSubject} onChange={setFormSubject} options={[...new Set((data?.courses ?? []).map((row) => row.subject))]} /><Select label="Trình độ" value={formLevel} onChange={setFormLevel} options={[...new Set((data?.courses ?? []).map((row) => row.level))]} /></div><Field label="Mô tả" value={description} onChange={setDescription} placeholder="Nội dung khóa học…" />{attempted && (!code.trim() || !name.trim()) && <p role="alert" className="academic-error">Vui lòng nhập mã và tên khóa.</p>}<div className="academic-form-actions"><button onClick={() => setEditing(false)}>Hủy</button><button onClick={() => setAttempted(true)}>Kiểm tra biểu mẫu</button><button className="academic-primary" disabled>Lưu khóa học · Chờ API</button></div></div> : <p className="academic-hint">Chọn “Tạo khóa học” hoặc “Xem khóa” để mở biểu mẫu.</p>}</Card><Card title="Điều kiện dữ liệu"><p className="academic-hint">Môn hoặc trình độ đã ẩn không thể chọn cho khóa mới. Không xóa khóa đã có lớp để giữ lịch sử đào tạo.</p></Card></div>
  </div>
}
