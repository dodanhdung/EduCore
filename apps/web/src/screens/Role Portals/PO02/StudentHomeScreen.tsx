import type { PortalData } from '../PortalTypes.ts'
import { publishedResult, sectionMessage, studentVisibleAssignments } from '../PortalTypes.ts'
import { PortalCard, PortalLink, PortalPage, PortalState } from '../PortalPrimitives.tsx'

export function StudentHomeScreen({ data, studentId, navigate, path, state = 'ready' }: { data?: PortalData; studentId?: string; navigate: (path: string) => void; path: (id: string, recordId?: string) => string; state?: 'ready' | 'loading' | 'forbidden' }) {
  if (state === 'forbidden') return <PortalState title="Không có quyền xem">Không thể xem dữ liệu học sinh này.</PortalState>
  if (state === 'loading' || !data || !studentId) return <PortalState title="Đang chờ dữ liệu học tập">Chờ API trả lịch, bài tập và thông báo thuộc học sinh hiện tại.</PortalState>
  const sessions = data.sessions.filter((item) => item.studentIds.includes(studentId)).sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const upcoming = sessions.filter((item) => item.status === 'CONFIRMED' && item.startsAt >= data.sampleNow)
  const assignments = studentVisibleAssignments(data, studentId)
  const due = assignments.filter((item) => item.status === 'PUBLISHED' && item.deadline >= data.sampleNow).sort((a, b) => a.deadline.localeCompare(b.deadline))
  const results = assignments.map((item) => ({ item, grade: publishedResult(data, item.id, studentId) })).filter((row) => row.grade)
  const scheduleState = data.sectionStates?.schedule
  const assignmentsState = data.sectionStates?.assignments
  const notificationsState = data.sectionStates?.notifications
  const format = (value: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  return <PortalPage title="Trang chủ học sinh" detail={`${data.studentName} · Lịch và bài tập của tôi`}>
    <PortalCard title="Buổi học tiếp theo">{sectionMessage(scheduleState, 'lịch học') ? <p role="status">{sectionMessage(scheduleState, 'lịch học')}</p> : upcoming[0] ? <><h3>{upcoming[0].className}</h3><p>{format(upcoming[0].startsAt)} · {upcoming[0].room}</p><PortalLink to={path('SC06')} navigate={navigate}>Xem lịch cá nhân</PortalLink></> : <p>Chưa có buổi học sắp tới.</p>}</PortalCard>
    {sessions.some((item) => item.status === 'CANCELLED') && <p className="portal-notice">Có buổi học đã hủy trong lịch gần đây. <PortalLink to={path('SC06')} navigate={navigate}>Xem lịch</PortalLink></p>}
    <PortalCard title="Bài tập sắp hạn" hint="Chỉ hiển thị bài đã giao cho bạn.">{sectionMessage(assignmentsState, 'bài tập') ? <p role="status">{sectionMessage(assignmentsState, 'bài tập')}</p> : due.length ? <ul className="portal-list">{due.slice(0, 4).map((item) => { const submission = data.assignments.submissions.find((entry) => entry.assignmentId === item.id && entry.studentId === studentId); const grade = publishedResult(data, item.id, studentId); return <li key={item.id}><div><h3>{item.title} · {item.className}</h3><small>Hạn {format(item.deadline)} · {grade ? `Điểm đã công bố: ${grade.score.toLocaleString('vi-VN')}` : submission ? 'Đã nộp · Chưa có điểm công bố' : 'Chưa nộp'}</small></div><PortalLink to={path('AS07', item.id)} navigate={navigate}>Xem bài tập</PortalLink></li> })}</ul> : <p>Hiện chưa có bài tập sắp hạn.</p>}<PortalLink to={path('AS06')} navigate={navigate}>Xem bài tập của tôi</PortalLink></PortalCard>
    {results.length > 0 && <PortalCard title="Kết quả đã công bố"><ul className="portal-list">{results.slice(0, 3).map(({ item, grade }) => <li key={item.id}><div><h3>{item.title}</h3><small>Điểm đã công bố: {grade!.score.toLocaleString('vi-VN')}</small></div><PortalLink to={path('AS07', item.id)} navigate={navigate}>Chi tiết</PortalLink></li>)}</ul></PortalCard>}
    <PortalCard title="Thông báo trong ứng dụng">{sectionMessage(notificationsState, 'thông báo') ? <p role="status">{sectionMessage(notificationsState, 'thông báo')}</p> : data.notices.filter((item) => item.recipientId === studentId).length ? <ul className="portal-list">{data.notices.filter((item) => item.recipientId === studentId).slice(0, 3).map((item) => <li key={item.id}>{item.text}<small>{format(item.occurredAt)}</small></li>)}</ul> : <p>Chưa có thông báo.</p>}<PortalLink to={path('GL01')} navigate={navigate}>Xem thông báo</PortalLink></PortalCard>
    <div className="portal-actions"><PortalLink to={path('AT03')} navigate={navigate}>Gửi đơn nghỉ</PortalLink><PortalLink to={path('SC06')} navigate={navigate}>Lịch học</PortalLink></div>
  </PortalPage>
}
