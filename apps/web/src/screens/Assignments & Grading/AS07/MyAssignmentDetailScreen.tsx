import { useState } from 'react'
import type { AssignmentData } from '../AssignmentTypes.ts'
import { assignmentFor, validateSelection } from '../AssignmentTypes.ts'
import { Badge, Button, Card, Notice, Page, State } from '../AssignmentPrimitives.tsx'

export function MyAssignmentDetailScreen({ data, selectedId, studentId, state, onBack }: { data?: AssignmentData; selectedId?: string; studentId?: string; state?: string; onBack?: () => void }) {
  const [files, setFiles] = useState<File[]>([]), [errors, setErrors] = useState<string[]>(state === 'upload-error' ? ['Tệp .zip không được hỗ trợ. Chọn PDF, DOCX, JPG hoặc PNG.'] : []), [message, setMessage] = useState('')
  if (!data) return <Page title="Chi tiết & nộp bài"><State kind="empty" /></Page>
  const item = assignmentFor(data, selectedId)
  if (!item || !studentId || !item.recipientIds.includes(studentId) || item.status === 'DRAFT') return <Page title="Chi tiết & nộp bài"><State kind="not-found" /></Page>
  const submission = data.submissions.find((sub) => sub.assignmentId === item.id && sub.studentId === studentId)
  const publishedGrade = submission?.grade?.status === 'PUBLISHED' ? submission.grade : undefined
  const expired = state === 'expired', closed = state === 'closed' || !!publishedGrade || item.status === 'CLOSED', late = state === 'late'
  const choose = (incoming: File[]) => { const result = validateSelection(files, incoming); setFiles(result.files); setErrors(result.errors); setMessage('') }
  return <Page title="Chi tiết & nộp bài" subtitle={`${item.title} · ${item.className} · ${item.teacherName}`} action={<Button onClick={onBack} secondary>Bài tập của tôi</Button>}>
    <Card title={item.title} subtitle={`Hạn nộp ${new Date(item.deadline).toLocaleString('vi-VN')} · Ưu tiên ${item.priority}/5`}><p>{item.description}</p><div className="as-actions"><Badge tone={submission ? 'success' : 'warning'}>{submission ? `Đã nộp v${submission.versions.at(-1)?.number}` : 'Chưa nộp'}</Badge>{late && <Badge tone="warning">Nộp muộn trong cửa sổ mẫu</Badge>}{expired && <Badge tone="warning">Hết hạn nộp bài</Badge>}{closed && <Badge tone="muted">Chỉ xem</Badge>}</div>{item.attachmentNames?.length ? <p>Tài liệu tham khảo: {item.attachmentNames.join(', ')} · tải tệp PENDING_API</p> : null}</Card>
    {publishedGrade && <Card title="Kết quả đã công bố"><strong>{publishedGrade.score}/10</strong><p>{publishedGrade.feedback}</p></Card>}
    {!publishedGrade && submission?.grade?.status === 'DRAFT' && <Notice>Chưa có kết quả được công bố.</Notice>}
    {expired ? <Notice>Cửa sổ nộp bài đã hết hạn theo trạng thái mẫu. Backend quyết định điều kiện thật.</Notice> : late ? <Notice>Bài nộp sau hạn được đánh dấu nộp muộn. Quyền nộp do backend xác nhận trong cửa sổ bảy ngày đã duyệt.</Notice> : null}
    <Card title="Tệp bài làm" subtitle="Tối đa 5 tệp · 10 MB/tệp · PDF, DOCX, JPG, PNG."><label className="as-field">Chọn tệp<input type="file" multiple accept=".pdf,.docx,.jpg,.png,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png" disabled={closed || expired} onChange={(e) => { choose([...e.target.files ?? []]); e.target.value = '' }} /></label>{errors.length > 0 && <div role="alert" aria-live="assertive">{errors.map((error) => <p className="as-error" key={error}>{error}</p>)}</div>}{files.length ? <ul className="as-list">{files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB <button className="as-link" onClick={() => { setFiles(files.filter((item) => item !== file)); setErrors([]) }} aria-label={`Bỏ tệp ${file.name}`}>Bỏ tệp</button></li>)}</ul> : <p>Chưa chọn tệp. Chọn tệp không đồng nghĩa đã tải lên hoặc nộp bài.</p>}<div className="as-actions"><Button disabled={closed || expired || !files.length} onClick={() => setMessage('PENDING_API: Tệp chưa được tải lên và chưa tạo phiên bản nộp mới.')}>{submission ? 'Nộp phiên bản mới' : 'Nộp bài'}</Button></div>{message && <Notice>{message}</Notice>}</Card>
    <Card title="Lịch sử bài nộp">{submission?.versions.length ? <ul className="as-list">{[...submission.versions].reverse().map((version) => <li key={version.number}><strong>v{version.number}</strong> · {new Date(version.submittedAt).toLocaleString('vi-VN')} · {version.files.length} tệp {version.late && <Badge tone="warning">Nộp muộn</Badge>}<div>{version.files.map((file) => <span key={file.name}>{file.name} · {file.size}<br /></span>)}</div></li>)}</ul> : <p>Chưa có phiên bản nộp bài.</p>}</Card>
    <Notice>NEEDS_SLICE_REVIEW: Q-11 và Detailed Design chưa thống nhất thời điểm khóa nộp lại khi có điểm nháp. Preview không xác nhận quyền nộp lại.</Notice>
  </Page>
}
