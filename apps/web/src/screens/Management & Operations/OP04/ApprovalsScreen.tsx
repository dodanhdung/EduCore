import { useState } from 'react'
import { Badge, Card, Empty, Filters, Heading, Metrics, Table } from '../ManagementPrimitives.tsx'
import { dateTime, labels } from '../ManagementTypes.ts'
import type { ScreenProps } from '../ManagementTypes.ts'

export function ApprovalsScreen({ data, open }: ScreenProps) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [category, setCategory] = useState('')
  const statuses = ['PENDING_APPROVAL', 'NEEDS_INFORMATION', 'APPROVED', 'COMPLETED', 'REJECTED', 'EXECUTION_FAILED']
  const rows = data.approvals.filter((a) => (!status || (status === 'EXECUTION_FAILED' ? a.execution === 'FAILED' : a.status === status)) && (!category || a.category === category) && `${a.id} ${a.title} ${a.requester} ${a.target}`.toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN')))
  return <><Heading title="Danh sách phê duyệt" detail="Yêu cầu trong phạm vi được phân quyền" />
    <Metrics items={['PENDING_APPROVAL', 'NEEDS_INFORMATION', 'APPROVED'].map((s) => ({ label: labels[s], value: data.approvals.filter((a) => a.status === s).length, detail: s === 'APPROVED' ? 'APPROVED chưa COMPLETED' : 'Trong tập dữ liệu hiện tại' }))} />
    <Filters {...{ query, setQuery, status, setStatus }} statuses={statuses}><label>Nghiệp vụ<select value={category} onChange={(e) => setCategory(e.target.value)}><option value="">Tất cả</option><option>Tài chính</option><option>Học vụ</option></select></label>{category && <button onClick={() => setCategory('')}>Xóa lọc nghiệp vụ</button>}</Filters>
    <nav className="mo-tabs" aria-label="Trạng thái phê duyệt">{statuses.map((s) => <button key={s} aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)}>{s === 'EXECUTION_FAILED' ? 'Thực thi thất bại' : labels[s]}</button>)}</nav>
    <Card title="Danh sách phê duyệt" detail="Quyết định và kết quả thực thi được theo dõi riêng.">{rows.length ? <Table caption="Yêu cầu phê duyệt" columns={['Yêu cầu', 'Loại / phạm vi', 'Người gửi', 'Thời điểm', 'Trạng thái', 'Thao tác']} rows={rows.map((a) => ({ id: a.id, cells: [<strong key="name">{a.id} · {a.title}</strong>, <>{a.category}<small>{a.target}</small></>, a.requester, dateTime(a.createdAt, data.timezone), <><Badge value={a.status} />{a.execution === 'FAILED' && <small className="mo-warning">Thực thi thất bại · quyết định được giữ</small>}</>, open && <button key="open" onClick={() => open('OP05', a.id)}>Xem yêu cầu</button>] }))} /> : <Empty filtered={!!(query || status || category)} />}</Card>
  </>
}
