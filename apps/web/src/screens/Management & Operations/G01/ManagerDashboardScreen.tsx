import { Badge, Card, Empty, Heading, Metrics, Table, Timeline } from '../ManagementPrimitives.tsx'
import { dateTime, money, useManagementPreview } from '../ManagementTypes.ts'
import type { ScreenProps } from '../ManagementTypes.ts'
import studentsIcon from '../assets/active-students.svg'
import classesIcon from '../assets/active-classes.svg'
import receivablesIcon from '../assets/receivables.svg'

export function ManagerDashboardScreen({ data, open, production = false }: ScreenProps & { production?: boolean }) {
  const preview = useManagementPreview()
  return <><Heading title="Tổng quan quản lý" detail={`${data.tenantName} · ${preview || production ? data.scope : 'Phạm vi được cấp'} · ${dateTime(data.asOf, data.timezone)} (${data.timezone})`} />
    <Metrics items={[
      { label: 'Học viên đang theo học', value: data.dashboard.students?.toLocaleString('vi-VN') ?? 'Chưa có quyền xem', detail: 'Học sinh duy nhất có ghi danh ACTIVE', icon: studentsIcon, open: open && (() => open('AC01')) },
      { label: 'Lớp học đang hoạt động', value: data.dashboard.classes?.toLocaleString('vi-VN') ?? 'Chưa có quyền xem', detail: 'Lớp có trạng thái ACTIVE', icon: classesIcon, open: open && (() => open('AC07')) },
      { label: 'Công nợ học phí chưa thu', value: money(data.dashboard.outstandingVnd), detail: 'Số dư phải thu từ hóa đơn ISSUED', icon: receivablesIcon, open: open && (() => open('BL09')) },
    ]} />
    {!production && <div className="mo-split"><Card title="Lớp học diễn ra hôm nay" detail={preview ? 'Lịch trong phạm vi dữ liệu mẫu; không phải chỉ số phân tích.' : 'Lịch trong phạm vi được cấp; không phải chỉ số phân tích.'}>{data.sessions.length ? <Table caption="Lịch lớp hôm nay" columns={['Lớp học', 'Khung giờ', 'Giáo viên', 'Phòng', 'Trạng thái']} rows={data.sessions.map((s) => ({ id: s.id, cells: [<strong key="name">{s.name}</strong>, s.time, s.teacher, s.room, <Badge key="status" value={s.status} />] }))} /> : <Empty />}{open && <button key="open" onClick={() => open('SC01')}>Xem lịch trung tâm</button>}</Card>
      <div className="mo-stack"><Card title="Công nợ cần xem" detail="Các khoản phải thu từ hóa đơn đã phát hành.">{data.receivables.length ? data.receivables.map((r) => <article className="mo-inset" key={r.id}><strong>{r.student}</strong><p>{r.note}</p><b>{money(r.amountVnd)}</b>{open && <button className="mo-link" onClick={() => open('BL09')}>Xem công nợ</button>}</article>) : <Empty />}</Card><Card title="Hoạt động gần đây"><Timeline items={data.audit.slice(0, 3).map((a) => `${dateTime(a.at, data.timezone)} · ${a.safeProjection?.actor ?? 'Chi tiết chưa khả dụng'} · ${a.action}`)} />{open && <button key="open" onClick={() => open('OP06')}>Xem nhật ký vận hành →</button>}</Card></div></div>}
  </>
}
