import { DataTable, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../../shared/ui/SharedUI.tsx'
import { PortalLink } from '../PortalPrimitives.tsx'
import { sectionMessage } from '../PortalTypes.ts'
import type { PortalSession } from '../PortalTypes.ts'
import type { TeacherHomeModel } from './TeacherHomeViewModel.ts'
import styles from './TeacherHomeView.module.css'

function metric(value: number | null, partial = false) { return value === null ? { kind: partial ? 'partial' as const : 'unavailable' as const }
  : { kind: 'available' as const, display: value.toLocaleString('vi-VN') } }
function format(value: string, zone: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
function hour(value: string, zone: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function attendanceLabel(row: PortalSession, model: TeacherHomeModel) {
  return sectionMessage(model.attendanceState, 'điểm danh')
    ?? (row.attendance === 'CONFIRMED' ? 'Đã xác nhận điểm danh'
      : row.attendance === 'PENDING' ? 'Chưa xác nhận điểm danh'
        : row.attendance === 'LOCKED' ? 'Điểm danh đã khóa' : 'Chưa đến giờ')
}
function attendanceTone(row: PortalSession) {
  return row.attendance === 'CONFIRMED' ? 'success' as const
    : row.attendance === 'PENDING' ? 'warning' as const : 'neutral' as const
}

/** Task-first PO01 presentation shared by live and fixture adapters. */
export function TeacherHomeView({ model, navigate, path }: {
  model: TeacherHomeModel; navigate: (path: string) => void; path: (id: string, recordId?: string) => string
}) {
  const sessionPath = (row: PortalSession) => {
    const attendance = model.attendanceState === undefined || model.attendanceState === 'ready'
    const attendancePath = attendance && row.attendance === 'PENDING' ? path('AT02', row.id) : ''
    if (attendancePath) return { to: attendancePath, label: 'Điểm danh' }
    const schedulePath = path('SC05', row.id)
    return schedulePath ? { to: schedulePath, label: 'Xem buổi học' } : null
  }
  const action = path('AT01')
  return <div className={'portal-page ' + styles.root} data-screen-id="PO01"><PageLayout
    header={<PageHeader title="Trang chủ giáo viên"
      description={model.teacherName + ' · ' + format(model.asOf, model.timeZone) + ' (' + model.timeZone + ')' + (model.sample ? ' · Dữ liệu mẫu — UI Preview' : '')}
      action={action ? <span className={styles.primaryAction}><PortalLink to={action} navigate={navigate}>Điểm danh nhanh</PortalLink></span> : undefined} />}>
    <section className={styles.metrics} aria-label="Tóm tắt công việc giáo viên">
      <div className="portal-kpi"><MetricCard label="Buổi dạy hôm nay" value={metric(model.todayCount, model.partialCalendar)} detail="Lịch trong phạm vi được phân công" /></div>
      <div className="portal-kpi"><MetricCard label="Chưa xác nhận điểm danh" value={metric(model.pendingCount, model.partialAttendance)}
        detail={sectionMessage(model.attendanceState, 'điểm danh') ?? 'Các buổi dạy hôm nay'} /></div>
      <div className="portal-kpi"><MetricCard label="Bài cần chấm" value={metric(model.gradingCount, model.partialGrading)}
        detail={sectionMessage(model.gradingState, 'hàng chờ chấm') ?? 'Bài nộp trong hàng chờ được cấp'} /></div>
    </section>
    <section className={styles.panel}><h2>Lịch dạy hôm nay</h2>
      {model.partialCalendar && <p role="status">Danh sách đang giới hạn ở các mục đầu tiên. Mở lịch dạy để xem thêm.</p>}
      <DataTable caption="Lịch dạy hôm nay" rows={model.today} rowKey={row => row.id}
        empty={<ResourceState kind={model.partialCalendar ? 'partial' : 'empty'}
          title={model.partialCalendar ? 'Chưa thấy buổi hôm nay trong phần lịch đã tải' : 'Hôm nay không có buổi dạy được phân công'} />}
        columns={[
          { key: 'class', header: 'Lớp / môn', cell: row => <strong>{row.className}</strong> },
          { key: 'time', header: 'Thời gian', cell: row => <time dateTime={row.startsAt}>{hour(row.startsAt, model.timeZone) + ' – ' + hour(row.endsAt, model.timeZone)}</time> },
          { key: 'room', header: 'Phòng', cell: row => row.room || 'Phòng chưa cập nhật' },
          { key: 'attendance', header: 'Điểm danh', cell: row => <StatusBadge domain="attendance" label={attendanceLabel(row, model)} tone={attendanceTone(row)} /> },
          { key: 'action', header: 'Thao tác', cell: row => {
            const target = sessionPath(row)
            return target ? <PortalLink to={target.to} navigate={navigate}>{target.label}</PortalLink> : '—'
          } },
        ]} />
      <div className={styles.mobileRows}>{model.today.map(row => {
        const target = sessionPath(row)
        return <article key={row.id}><h3>{row.className}</h3>
          <p>{hour(row.startsAt, model.timeZone) + ' – ' + hour(row.endsAt, model.timeZone)} · {row.room || 'Phòng chưa cập nhật'}</p>
          <StatusBadge domain="attendance" label={attendanceLabel(row, model)} tone={attendanceTone(row)} />
          {target && <PortalLink to={target.to} navigate={navigate}>{target.label}</PortalLink>}
        </article>
      })}</div>
      {path('SC06') && model.today.length === 0 && <PortalLink to={path('SC06')} navigate={navigate}>Xem lịch dạy</PortalLink>}
    </section>
    <section className={styles.panel}><h2>Công việc cần xử lý</h2><p>Chỉ các lớp trong phạm vi được phân công.</p>
      <div className={styles.actions}>{path('AS04') && <PortalLink to={path('AS04')} navigate={navigate}>Mở hàng chờ chấm</PortalLink>}
        {path('AS01') && <PortalLink to={path('AS01')} navigate={navigate}>Xem bài tập đã giao</PortalLink>}
        {path('SC06') && <PortalLink to={path('SC06')} navigate={navigate}>Xem lịch dạy</PortalLink>}</div>
    </section>
    <p className={styles.notice}>Điểm danh chỉ có thể chỉnh theo quyền và thời hạn khóa; lớp ngoài phân công không hiển thị.</p>
    <div className={styles.secondary}>
      <section className={styles.panel}><h2>Buổi dạy sắp tới</h2>{model.upcoming.length
        ? <ul>{model.upcoming.slice(0, 3).map(row => <li key={row.id}><strong>{row.className}</strong> · {format(row.startsAt, model.timeZone)}
          {path('SC05', row.id) && <PortalLink to={path('SC05', row.id)} navigate={navigate}>Chi tiết</PortalLink>}</li>)}</ul>
        : <ResourceState kind={model.partialCalendar ? 'partial' : 'empty'} title="Chưa thấy buổi dạy sắp tới" />}</section>
      <section className={styles.panel}><h2>Bài tập và chấm điểm</h2>
        {model.assignmentsDraft === null || model.assignmentsPublished === null
          ? <p role="status">{sectionMessage(model.teachingState, 'bài tập') ?? 'Chưa đủ dữ liệu bài tập.'}</p>
          : <p>{model.assignmentsDraft} bản nháp · {model.assignmentsPublished} bài đã giao</p>}
        {model.gradingCount === null
          ? <p role="status">{sectionMessage(model.gradingState, 'hàng chờ chấm') ?? 'Chưa đủ dữ liệu hàng chờ chấm.'}</p>
          : model.gradingCount === 0 ? <ResourceState kind="empty" title="Không có bài nộp đang chờ chấm" />
            : <p>{model.gradingCount} bài nộp đang chờ chấm.</p>}
      </section>
    </div>
  </PageLayout></div>
}
