import { useState } from 'react'
import { Badge, Card, Empty, Filters, Heading, Metrics, ReviewAction, Table, Timeline } from '../ManagementPrimitives.tsx'
import { retryEligible } from '../ManagementTypes.ts'
import type { ScreenProps } from '../ManagementTypes.ts'

export function JobsScreen({ data, canReview }: ScreenProps) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [selected, setSelected] = useState('')
  const rows = data.jobs.filter((j) => (!status || j.status === status) && `${j.id} ${j.kind} ${j.source} ${j.correlationId}`.toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN')))
  const job = rows.find((j) => j.id === selected)
  return <><Heading title="Quản lý job và retry" detail="Theo dõi xử lý nền và khóa chống lặp" />
    <Metrics items={['READY', 'RUNNING', 'FAILED'].map((s, i) => ({ label: ['Đang chờ', 'Đang chạy', 'Thất bại'][i], value: data.jobs.filter((j) => j.status === s).length, detail: 'Trong tập dữ liệu hiện tại' }))} />
    <Filters {...{ query, setQuery, status, setStatus }} statuses={['READY', 'RUNNING', 'FAILED', 'NEEDS_INFORMATION', 'PENDING_APPROVAL', 'COMPLETED']} />
    <Card title="Danh sách job">{rows.length ? <Table caption="Tác vụ và số lần thử" columns={['Job / nguồn', 'Policy', 'Lần thử', 'Correlation ID', 'Trạng thái', 'Thao tác']} rows={rows.map((j) => ({ id: j.id, cells: [<><strong>{j.id} · {j.kind}</strong><small>{j.source}</small></>, j.policy, `${j.attemptCount}/4`, j.correlationId, <Badge key="status" value={j.status} />, <button key="detail" aria-expanded={j.id === selected} onClick={() => setSelected(j.id === selected ? '' : j.id)}>Xem job</button>] }))} /> : <Empty filtered={!!(query || status)} />}</Card>
    <Card title="Quy tắc retry"><p>Tối đa 3 lần retry sau lần chạy đầu; giãn cách 1 / 5 / 15 phút. Giữ nguyên policy và root chống lặp.</p><p>Cần bổ sung dữ liệu phải xử lý nguyên nhân trước khi chạy lại. Chờ phê duyệt không được bỏ qua bước duyệt.</p><p>Hết 4 lần: giữ lịch sử, không reset counter hoặc mở chu kỳ phục hồi tự động.</p></Card>
    {job && <Card title={`${job.kind} · ${job.id}`} detail={`Nguồn: ${job.source} · ${job.policy}`}><Badge value={job.status} /><p className={job.error ? 'mo-warning' : undefined}>Lý do: {job.error ?? 'Không có lỗi được ghi nhận.'}</p><dl className="mo-detail"><div><dt>Correlation ID</dt><dd>{job.correlationId}</dd></div><div><dt>Root chống lặp</dt><dd>{job.operationKey}</dd></div><div><dt>Lần chạy đã dùng</dt><dd>{job.attemptCount}/4</dd></div></dl><h3>Lịch sử lần thử (mẫu)</h3><Timeline items={job.attempts} />{canReview && retryEligible(job) ? <ReviewAction label="Xem lại yêu cầu retry" warning="Kiểm tra và bổ sung dữ liệu trước khi chạy lại. Máy chủ kiểm quyền job.retry, quyền nghiệp vụ hiện hành và root; chưa gửi hoặc requeue trong Preview." /> : <p>{job.attemptCount >= 4 ? 'Đã hết lượt. Phục hồi thủ công sau exhaustion chưa được phê duyệt kỹ thuật.' : 'Không có thao tác retry khả dụng cho quyền và trạng thái hiện tại.'}</p>}</Card>}
  </>
}
