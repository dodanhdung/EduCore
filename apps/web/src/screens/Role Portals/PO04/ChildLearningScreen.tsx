import { useState } from 'react'
import type { PortalData } from '../PortalTypes.ts'
import { authorizedChild, publishedResult, studentVisibleAssignments } from '../PortalTypes.ts'
import { PortalCard, PortalLink, PortalPage, PortalState } from '../PortalPrimitives.tsx'

type Tab = 'classes' | 'schedule' | 'assignments' | 'leave'
export function ChildLearningScreen({ data, studentId, navigate, path, onOpenAssignment, state = 'ready' }: { data?: PortalData; studentId?: string; navigate: (path: string) => void; path: (id: string, recordId?: string) => string; onOpenAssignment?: (assignmentId: string, studentId: string) => void; state?: 'ready' | 'loading' | 'forbidden' }) {
  const [tab, setTab] = useState<Tab>('classes')
  if (state === 'forbidden') return <PortalState title="Không có quyền xem">Không thể xem dữ liệu học tập của học sinh này.</PortalState>
  if (state === 'loading' || !data) return <PortalState title="Đang chờ dữ liệu học tập">Chờ API trả liên kết và thông tin trong phạm vi được cấp.</PortalState>
  const child = authorizedChild(data, studentId)
  if (!child) return <PortalState title="Không thể xem thông tin học tập">Mã học sinh thiếu, không hợp lệ, hoặc liên kết phụ huynh không còn hiệu lực.</PortalState>
  const classes = data.activeClasses[child.studentId] ?? []
  const sessions = data.sessions.filter((item) => item.studentIds.includes(child.studentId) && item.status === 'CONFIRMED' && item.startsAt >= data.sampleNow)
  const assignments = studentVisibleAssignments(data, child.studentId)
  const leaves = data.leaveRequests.filter((item) => item.studentId === child.studentId)
  return <PortalPage title="Thông tin học tập của con" detail={`${child.name} · Liên kết phụ huynh đã xác minh · Chỉ xem`}>
    <PortalCard title={child.name}><p>{classes.length ? `Lớp đang hoạt động: ${classes.map((item) => item.name).join(', ')}` : 'Chưa có lớp đang hoạt động.'}</p></PortalCard>
    <div className="portal-tabs" role="tablist" aria-label="Thông tin học tập">{([['classes', 'Lớp học'], ['schedule', 'Lịch học'], ['assignments', 'Bài tập & điểm'], ['leave', 'Đơn nghỉ']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>{label}</button>)}</div>
    {tab === 'classes' && <PortalCard title="Lớp đang học">{data.availability?.schedule === false ? <p>Chưa có quyền xem lớp học.</p> : classes.length ? <ul className="portal-list">{classes.map((item) => <li key={item.id}>{item.name}</li>)}</ul> : <p>Chưa có ghi danh đang hoạt động.</p>}</PortalCard>}
    {tab === 'schedule' && <PortalCard title="Lịch học sắp tới">{data.availability?.schedule === false ? <p>Chưa có quyền xem lịch học.</p> : sessions.length ? <ul className="portal-list">{sessions.map((item) => <li key={item.id}>{item.className} · {new Intl.DateTimeFormat('vi-VN', { timeZone: data.timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.startsAt))}<PortalLink to={path('SC05', item.id)} navigate={navigate}>Xem buổi học</PortalLink></li>)}</ul> : <p>Chưa có buổi học sắp tới.</p>}</PortalCard>}
    {tab === 'assignments' && <PortalCard title="Bài tập và điểm đã công bố">{data.availability?.assignments === false ? <p>Chưa có quyền xem bài tập.</p> : assignments.length ? <ul className="portal-list">{assignments.map((item) => { const grade = publishedResult(data, item.id, child.studentId); return <li key={item.id}><div><h3>{item.title}</h3><small>{data.availability?.grades === false ? 'Chưa có quyền xem điểm' : grade ? `Điểm đã công bố: ${grade.score.toLocaleString('vi-VN')}` : 'Chưa có điểm công bố'}</small></div>{onOpenAssignment ? <button className="portal-link" type="button" onClick={() => onOpenAssignment(item.id, child.studentId)}>Xem bài tập</button> : <span className="portal-pending">Chi tiết: chờ xác thực phạm vi xem</span>}</li> })}</ul> : <p>Chưa có bài tập được giao.</p>}</PortalCard>}
    {tab === 'leave' && <PortalCard title="Lịch sử đơn nghỉ">{data.availability?.leave === false ? <p>Chưa có quyền xem đơn nghỉ.</p> : leaves.length ? <ul className="portal-list">{leaves.map((item) => <li key={item.id}>{item.sessionId} · {item.status}</li>)}</ul> : <p>Chưa có đơn nghỉ.</p>}</PortalCard>}
  </PortalPage>
}
