import { useState } from 'react'
import type { AssignmentData } from '../AssignmentTypes.ts'
import { studentAssignments } from '../AssignmentTypes.ts'
import { Badge, Button, Card, Notice, Page, State } from '../AssignmentPrimitives.tsx'

export function MyAssignmentsScreen({ data, studentId, state = 'ready', preview = false, onOpen }: { data?: AssignmentData; studentId?: string; state?: 'ready' | 'loading' | 'error'; preview?: boolean; onOpen?: (id: string) => void }) {
  const [search, setSearch] = useState(''), [filter, setFilter] = useState('all')
  if (state !== 'ready') return <Page title="Bài tập của tôi"><State kind={state} /></Page>
  if (!data || !studentId) return <Page title="Bài tập của tôi"><State kind="empty" /></Page>
  const scoped = studentAssignments(data, studentId)
  const view = scoped.map((item) => { const submission = data.submissions.find((sub) => sub.assignmentId === item.id && sub.studentId === studentId); return { item, submission, publishedGrade: submission?.grade?.status === 'PUBLISHED' ? submission.grade : undefined, dueToday: !!data.sampleNow && item.deadline.slice(0, 10) === data.sampleNow.slice(0, 10), overdue: !!data.sampleNow && new Date(item.deadline).getTime() < new Date(data.sampleNow).getTime() && !submission } })
  const rows = view.filter(({ item, submission, publishedGrade, overdue }) => `${item.title} ${item.className}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) && (filter === 'all' || filter === 'submitted' && !!submission || filter === 'not-submitted' && !submission || filter === 'graded' && !!publishedGrade || filter === 'overdue' && overdue))
  return <Page title="Bài tập của tôi" subtitle={`Chỉ bài tập đã giao cho học sinh được chọn${preview ? ' · Dữ liệu mẫu trong UI Preview' : ''}`}>
    <div className="as-stats"><div className="as-stat info"><span>ĐANG THỰC HIỆN</span><strong>{view.filter((row) => !row.publishedGrade).length}</strong></div><div className="as-stat warning"><span>CHƯA NỘP</span><strong>{view.filter((row) => !row.submission).length}</strong></div><div className="as-stat success"><span>ĐÃ CÓ ĐIỂM</span><strong>{view.filter((row) => row.publishedGrade).length}</strong></div></div>
    <Card title="Việc cần làm" subtitle="Chỉ điểm đã công bố mới hiển thị."><div className="as-grid two"><label className="as-field">Tìm bài tập<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm bài tập..." /></label><label className="as-field">Trạng thái<select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Tất cả</option><option value="not-submitted">Chưa nộp</option><option value="submitted">Đã nộp</option><option value="overdue">Quá hạn</option><option value="graded">Đã có điểm</option></select></label></div></Card>
    {rows.length ? <div className="as-grid">{rows.map(({ item, submission, publishedGrade, dueToday, overdue }) => <article className="as-student-card" key={item.id}><h3>{item.title}</h3><p>{item.className} · {item.teacherName}</p><p>{dueToday ? 'Hạn hôm nay · ' : 'Hạn '}{new Date(item.deadline).toLocaleString('vi-VN')} · Ưu tiên {item.priority}/5</p><Badge tone={publishedGrade ? 'success' : submission ? 'info' : 'warning'}>{publishedGrade ? `Điểm đã công bố ${publishedGrade.score}/10` : submission?.versions.at(-1)?.late ? 'Nộp muộn' : submission ? `Đã nộp v${submission.versions.at(-1)?.number}` : overdue ? 'Quá hạn' : 'Chưa nộp'}</Badge><div className="as-actions"><Button onClick={() => onOpen?.(item.id)}>Xem bài</Button></div></article>)}</div> : <Card><p>Không có bài tập phù hợp.</p></Card>}
    <Notice>Không hiển thị điểm nháp. Danh sách thật cần được lọc và cấp quyền theo học sinh trên backend.</Notice>
  </Page>
}
