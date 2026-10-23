import { useState } from 'react'
import { Card, Empty, Filters, Heading, Metrics, Table, Timeline } from '../ManagementPrimitives.tsx'
import { dateTime } from '../ManagementTypes.ts'
import type { ScreenProps } from '../ManagementTypes.ts'

export function AuditScreen({ data }: ScreenProps) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [actor, setActor] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [selected, setSelected] = useState('')
  const invalid = !!(from && to && from > to)
  const localDay = (at: string) => { const parts = new Intl.DateTimeFormat('en-CA', { timeZone: data.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at)); return ['year', 'month', 'day'].map((k) => parts.find((p) => p.type === k)?.value).join('-') }
  const rows = invalid ? [] : data.audit.filter((a) => (!status || a.result === status) && (!actor || a.actor === actor) && (!from || localDay(a.at) >= from) && (!to || localDay(a.at) <= to) && `${a.action} ${a.target} ${a.correlationId}`.toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN')))
  const event = rows.find((a) => a.id === selected)
  return <><Heading title="Tra cứu audit log" detail={`Lịch sử bất biến trong phạm vi trung tâm · ${data.timezone}`} />
    <Metrics items={[{ label: 'Sự kiện', value: data.audit.length, detail: 'Trong tập dữ liệu hiện tại' }, { label: 'Thao tác thất bại', value: data.audit.filter((a) => a.result === 'Thất bại').length, detail: 'Xem căn cứ và correlation ID' }, { label: 'Lưu giữ', value: '24 tháng', detail: 'Mốc baseline P0 · chỉ đọc' }]} />
    <Filters {...{ query, setQuery, status, setStatus }} statuses={['Thành công', 'Thất bại', 'Chờ duyệt']}><label>Người thực hiện<select value={actor} onChange={(e) => setActor(e.target.value)}><option value="">Tất cả người thực hiện</option>{[...new Set(data.audit.map((a) => a.actor))].map((a) => <option key={a}>{a}</option>)}</select></label><label>Từ ngày<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-invalid={invalid} aria-describedby={invalid ? 'audit-range-error' : undefined} /></label><label>Đến ngày<input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-invalid={invalid} aria-describedby={invalid ? 'audit-range-error' : undefined} /></label><button onClick={() => { setActor(''); setFrom(''); setTo(''); setSelected('') }}>Xóa lọc chi tiết</button></Filters>
    {invalid && <p role="alert" id="audit-range-error">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p>}
    <Card title="Nhật ký hệ thống">{rows.length ? <Table caption="Nhật ký chỉ đọc" columns={['Thời gian', 'Hành động', 'Đối tượng', 'Người thực hiện', 'Kết quả', 'Chi tiết']} rows={rows.map((a) => ({ id: a.id, cells: [dateTime(a.at, data.timezone), a.action, a.target, a.actor, a.result, <button key="detail" aria-expanded={a.id === selected} onClick={() => setSelected(a.id === selected ? '' : a.id)}>Xem sự kiện</button>] }))} /> : <Empty filtered={!!(query || status || actor || from || to)} />}</Card>
    <Card title="Bảo mật dữ liệu audit"><p>Chỉ đọc; không sửa hoặc xóa sự kiện. Không hiển thị OTP, mật khẩu, token, payload hoặc nội dung riêng tư.</p></Card>
    {event && <Card title={`Chi tiết sự kiện ${event.id}`}><dl className="mo-detail">{[['Hành động', event.action], ['Đối tượng', event.target], ['Người thực hiện', event.actor], ['Lý do', event.reason], ['Policy', event.policy], ['Correlation ID', event.correlationId]].map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl><h3>Chuỗi xử lý</h3><Timeline items={rows.filter((a) => a.correlationId === event.correlationId).map((a) => `${dateTime(a.at, data.timezone)} · ${a.action} · ${a.result}`)} /></Card>}
  </>
}
