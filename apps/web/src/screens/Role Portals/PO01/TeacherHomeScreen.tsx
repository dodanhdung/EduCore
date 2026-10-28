import { sectionMessage } from '../PortalTypes.ts'
import type { PortalData } from '../PortalTypes.ts'
import { PortalCard, PortalLink, PortalPage, PortalState } from '../PortalPrimitives.tsx'
import { EmptyState, Skeleton } from '../../Authentication & Shared/BatchPrimitives.tsx'
import { Table } from '../../Management & Operations/ManagementPrimitives.tsx'

export function TeacherHomeScreen({ data, teacherId, navigate, path, production = false, incomplete = false, state = 'ready' }: { data?: PortalData; teacherId?: string; navigate: (path: string) => void; path: (id: string, recordId?: string) => string; production?: boolean; incomplete?: boolean; state?: 'ready' | 'loading' | 'forbidden' }) {
  if (state === 'forbidden') return <PortalState title="Không có quyền xem">Cần quyền giáo viên và phạm vi lớp được phân công.</PortalState>
  if (state === 'loading') return <Skeleton label="Đang tải dữ liệu giảng dạy" metrics />
  if (!data || !teacherId) return <PortalState title="Đang chờ dữ liệu giảng dạy">Chờ API trả các buổi và bài tập trong phạm vi phân công của giáo viên.</PortalState>
  const sessions = data.sessions.filter((item) => item.teacherId === teacherId && item.status === 'CONFIRMED').sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(data.sampleNow))
  const todays = sessions.filter((item) => new Intl.DateTimeFormat('en-CA', { timeZone: data.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(item.startsAt)) === today)
  const assignments = data.assignments.assignments.filter((item) => item.teacherId === teacherId)
  const awaiting = data.assignments.submissions.filter((item) =>
    (production || assignments.some((assignment) => assignment.id === item.assignmentId && assignment.status !== 'DRAFT'))
    && item.versions.length && !item.grade)
  const attendanceState = data.sectionStates?.attendance
  const teachingState = data.sectionStates?.teaching
  const gradingState = data.sectionStates?.grading
  const format = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  const count = (value: number) => incomplete ? 'Chưa đủ dữ liệu' : value
  const upcoming = sessions.filter(item => item.startsAt > data.sampleNow)
  return <PortalPage screenId="PO01" title="Trang chủ giáo viên" detail={`${data.teacherName} · ${format(data.sampleNow)} (${data.timeZone})`} action={path('AT01') ? <PortalLink to={path('AT01')} navigate={navigate}>Điểm danh nhanh</PortalLink> : undefined}>
    <div className="portal-grid"><div className="portal-card portal-kpi"><span>Buổi dạy hôm nay</span><strong>{count(todays.length)}</strong><small>Lịch trong phạm vi được phân công</small></div><div className="portal-card portal-kpi"><span>Chưa xác nhận điểm danh</span><strong>{sectionMessage(attendanceState, 'điểm danh') ?? count(todays.filter((item) => item.attendance === 'PENDING').length)}</strong><small>Các buổi dạy hôm nay</small></div><div className="portal-card portal-kpi"><span>Bài cần chấm</span><strong>{sectionMessage(gradingState, 'hàng chờ chấm') ?? count(awaiting.length)}</strong><small>Bài nộp đang chờ chấm</small></div></div>
    <PortalCard title="Lịch dạy hôm nay">{todays.length ? <div className="management"><Table caption="Lịch dạy hôm nay" columns={['Lớp', 'Thời gian', 'Phòng', 'Điểm danh', 'Thao tác']} rows={todays.map(item => ({ id: item.id, cells: [
      <strong key="class">{item.className}</strong>, <time key="time" dateTime={item.startsAt}>{new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(item.startsAt))} – {new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(item.endsAt))}</time>, item.room,
      <span className="portal-badge" key="status">{sectionMessage(attendanceState, 'điểm danh') ?? (item.attendance === 'CONFIRMED' ? 'Đã xác nhận điểm danh' : item.attendance === 'PENDING' ? 'Chưa xác nhận điểm danh' : item.attendance === 'LOCKED' ? 'Điểm danh đã khóa' : 'Chưa đến giờ')}</span>,
      <PortalLink key="action" to={path((!attendanceState || attendanceState === 'ready') && item.attendance === 'PENDING' ? 'AT02' : 'SC05', item.id)} navigate={navigate}>{(!attendanceState || attendanceState === 'ready') && item.attendance === 'PENDING' ? 'Điểm danh' : 'Xem buổi học'}</PortalLink>,
    ] }))} /></div> : <EmptyState title={incomplete ? 'Chưa có buổi hôm nay trong phần lịch đã tải' : 'Hôm nay không có buổi dạy được phân công'} detail="Xem lịch dạy để kiểm tra các buổi tiếp theo.">{path('SC06') && <PortalLink to={path('SC06')} navigate={navigate}>Xem lịch dạy</PortalLink>}</EmptyState>}</PortalCard>
    {!production && todays.length > 0 && todays.every((item) => item.studentIds.length === 0) && <p className="portal-notice">Các buổi hôm nay chưa có học sinh trong danh sách được cung cấp.</p>}
    <div className="portal-grid two"><PortalCard title="Buổi dạy sắp tới">{upcoming.length ? <ul className="portal-list">{upcoming.slice(0, 3).map((item) => <li key={item.id}><div><h3>{item.className}</h3><small>{format(item.startsAt)}</small></div><PortalLink to={path('SC05', item.id)} navigate={navigate}>Chi tiết</PortalLink></li>)}</ul> : <EmptyState title="Chưa có buổi dạy sắp tới" detail={incomplete ? 'Danh sách mới tải một phần. Mở lịch dạy để xem thêm.' : 'Các buổi được phân công tiếp theo sẽ hiển thị tại đây.'} />}</PortalCard><PortalCard title="Bài tập và chấm điểm"><p>{sectionMessage(teachingState, 'bài tập') ?? `${assignments.filter((item) => item.status === 'DRAFT').length} bản nháp · ${assignments.filter((item) => item.status === 'PUBLISHED').length} bài đã giao`}</p>
      {sectionMessage(gradingState, 'hàng chờ chấm') ? <p role="status">{sectionMessage(gradingState, 'hàng chờ chấm')}</p> : !awaiting.length && !incomplete ? <EmptyState title="Không có bài nộp đang chờ chấm" detail="Bài nộp mới trong lớp phụ trách sẽ xuất hiện ở hàng chờ chấm." /> : <p>{incomplete ? 'Đang hiển thị một phần hàng chờ chấm.' : `${awaiting.length} bài nộp đang chờ chấm.`}</p>}
      <div className="portal-actions"><PortalLink to={path('AS04')} navigate={navigate}>Mở hàng chờ chấm</PortalLink><PortalLink to={path('AS01')} navigate={navigate}>Xem bài tập đã giao</PortalLink></div></PortalCard></div>
    <PortalCard title="Thao tác nhanh" hint="Công việc trong phạm vi lớp phụ trách"><div className="portal-actions"><PortalLink to={path('AT01')} navigate={navigate}>Danh sách điểm danh</PortalLink><PortalLink to={path('SC06')} navigate={navigate}>Xem lịch dạy</PortalLink>{assignments.find((item) => item.status === 'PUBLISHED') && <PortalLink to={path('AS03', assignments.find((item) => item.status === 'PUBLISHED')!.id)} navigate={navigate}>Chi tiết bài tập</PortalLink>}</div></PortalCard>
    {!production && <p className="portal-notice">Điểm danh chỉ có thể chỉnh theo quyền và thời hạn khóa. Mọi thao tác ghi dữ liệu đang chờ API.</p>}
  </PortalPage>
}
