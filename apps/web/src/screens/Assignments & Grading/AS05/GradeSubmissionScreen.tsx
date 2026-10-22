import { useState } from 'react'
import type { Assignment, AssignmentData, Submission } from '../AssignmentTypes.ts'
import { submissionFor, validScore } from '../AssignmentTypes.ts'
import { Badge, Button, Card, Dialog, Notice, Page, State } from '../AssignmentPrimitives.tsx'

export function GradeSubmissionScreen({ data, selectedId, state, onBack }: { data?: AssignmentData; selectedId?: string; state?: string; onBack?: () => void }) {
  const submission = submissionFor(data, selectedId)
  const assignment = data?.assignments.find((item) => item.id === submission?.assignmentId && item.teacherId === data.teacherId)
  if (!data) return <Page title="Chấm điểm & phản hồi"><State kind="empty" /></Page>
  if (!submission || !assignment || !assignment.recipientIds.includes(submission.studentId)) return <Page title="Chấm điểm & phản hồi"><State kind="not-found" /></Page>
  return <GradingForm key={submission.id} submission={submission} assignment={assignment} state={state} onBack={onBack} />
}

function GradingForm({ submission, assignment, state, onBack }: { submission: Submission; assignment: Assignment; state?: string; onBack?: () => void }) {
  const [version, setVersion] = useState<number | undefined>(undefined)
  const [score, setScore] = useState(submission?.grade?.score.toString() ?? '')
  const [feedback, setFeedback] = useState(submission?.grade?.feedback ?? '')
  const [reason, setReason] = useState(''), [dialog, setDialog] = useState(false), [message, setMessage] = useState(''), [validated, setValidated] = useState(false)
  const chosen = submission.versions.find((item) => item.number === version) ?? submission.versions.at(-1)!
  const published = submission.grade?.status === 'PUBLISHED' || state === 'published' || state === 'correction'
  const invalid = !validScore(score)
  const readOnly = state === 'read-only'
  const open = () => { setValidated(true); if (!invalid && !readOnly) setDialog(true) }
  return <Page title="Chấm điểm & phản hồi" subtitle={`Bài nộp v${chosen.number} của ${submission.studentName} · ${assignment.title} · ${assignment.className}`} action={<Button onClick={onBack} secondary>Hàng chờ chấm</Button>}>
    <Card title="Bài nộp và lịch sử phiên bản" subtitle={`Bản mới nhất: v${submission.versions.at(-1)?.number} · Chọn một phiên bản để xem`}><div className="as-actions">{submission.versions.map((item) => <Button key={item.number} secondary={chosen.number !== item.number} onClick={() => setVersion(item.number)}>v{item.number}{item.number === submission.versions.at(-1)?.number ? ' · hiện tại' : ''}</Button>)}</div><p>Phiên bản v{chosen.number} · Nộp {new Date(chosen.submittedAt).toLocaleString('vi-VN')} {chosen.late && <Badge tone="warning">Nộp muộn</Badge>}</p><ul className="as-list">{chosen.files.map((file) => <li key={file.name}>{file.name} · {file.size} <span className="as-muted">Xem trước / tải tệp: PENDING_API, cần endpoint có quyền.</span></li>)}</ul>{!chosen.files.length && <p className="as-error">Phiên bản này thiếu tệp hoặc tệp không thể truy cập. Cần kiểm tra trên dịch vụ.</p>}</Card>
    <Card title="Điểm và phản hồi" subtitle="Điểm từ 0 đến 10, tối đa một chữ số thập phân."><Badge tone={published ? 'success' : submission.grade?.status === 'DRAFT' || state === 'draft' ? 'warning' : 'info'}>{published ? 'Điểm đã công bố' : submission.grade?.status === 'DRAFT' || state === 'draft' ? 'Nháp điểm' : 'Chưa chấm'}</Badge><div className="as-grid two"><label className="as-field">Điểm *<input type="number" min="0" max="10" step="0.1" value={score} disabled={readOnly} onChange={(e) => setScore(e.target.value)} aria-invalid={validated && invalid} />{validated && invalid && <span className="as-error" role="alert">Điểm phải từ 0 đến 10 và theo bước 0,1.</span>}</label><label className="as-field">Phản hồi giáo viên<textarea value={feedback} disabled={readOnly} onChange={(e) => setFeedback(e.target.value)} /></label></div>{published && <label className="as-field">Lý do điều chỉnh điểm đã công bố<textarea value={reason} disabled={readOnly} onChange={(e) => setReason(e.target.value)} placeholder="Cần phê duyệt và lưu vết kiểm toán" /></label>}</Card>
    <Notice>{published ? 'Điều chỉnh điểm đã công bố cần lý do và quy trình được phê duyệt. Không thay đổi kết quả ở màn hình này.' : 'Nháp điểm chỉ giáo viên được xem. Công bố điểm cần hành động có thẩm quyền và API.'}</Notice>
    {state === 'missing-file' && <p className="as-error" role="alert">Tệp bài nộp không thể truy cập. Cần kiểm tra quyền và trạng thái tệp trên dịch vụ.</p>}
    <div className="as-actions"><Button secondary disabled={readOnly} onClick={() => { setValidated(true); if (!invalid) setMessage('PENDING_API: Chưa lưu nháp điểm.') }}>Lưu nháp điểm</Button><Button onClick={open} disabled={readOnly || published && !reason.trim()}>{published ? 'Yêu cầu điều chỉnh' : 'Công bố điểm'}</Button></div>{message && <Notice>{message}</Notice>}
    {dialog && <Dialog title={published ? 'Xác nhận yêu cầu điều chỉnh' : 'Xác nhận công bố điểm'} onClose={() => setDialog(false)}><p>{submission.studentName} · v{chosen.number} · {score}/10</p><p>{feedback || 'Chưa có phản hồi.'}</p><Notice>Đây chỉ là bước xem lại. PENDING_API: không có điểm nào được lưu hoặc công bố tại đây.</Notice><div className="as-actions"><Button onClick={() => { setDialog(false); setMessage('PENDING_API: Chưa lưu hoặc công bố điểm.') }}>Xác nhận yêu cầu</Button></div></Dialog>}
  </Page>
}
