import { useEffect, useState } from 'react'
import type { Assignment, AssignmentData } from '../AssignmentTypes.ts'
import { Button, Card, Dialog, Notice, Page, State } from '../AssignmentPrimitives.tsx'

type EditorProps = { data?: AssignmentData; selectedId?: string; initialState?: string; preview?: boolean; onBack?: () => void }

export function AssignmentEditorScreen({ data, selectedId, initialState, preview = false, onBack }: EditorProps) {
  const selected = selectedId ? data?.assignments.find((item) => item.id === selectedId && item.teacherId === data.teacherId) : undefined
  if (selectedId && !selected) return <Page title="Chỉnh sửa bài tập"><State kind="not-found" /></Page>
  return <EditorForm key={selectedId ?? 'create'} data={data} selected={selected} initialState={initialState} preview={preview} onBack={onBack} />
}

function EditorForm({ data, selected, initialState, preview, onBack }: { data?: AssignmentData; selected?: Assignment; initialState?: string; preview: boolean; onBack?: () => void }) {
  const classes = [...new Map((data?.assignments.filter((item) => item.teacherId === data.teacherId) ?? []).map((item) => [item.classId, item.className])).entries()]
  const [title, setTitle] = useState(selected?.title ?? '')
  const [description, setDescription] = useState(selected?.description ?? '')
  const [classId, setClassId] = useState(selected?.classId ?? '')
  const [deadline, setDeadline] = useState(selected?.deadline.slice(0, 16) ?? '')
  const [priority, setPriority] = useState(selected?.priority.toString() ?? '')
  const [files, setFiles] = useState<File[]>([])
  const [review, setReview] = useState(false), [dirty, setDirty] = useState(false)
  const [showErrors, setShowErrors] = useState(initialState === 'validation'), [message, setMessage] = useState('')
  const roster = classId ? data?.classRosters?.[classId] : undefined
  const className = classes.find(([id]) => id === classId)?.[1]
  const locked = !!selected && selected.status === 'PUBLISHED' && !!data?.submissions.some((item) => item.assignmentId === selected.id)
  const errors = { title: !title.trim(), description: !description.trim(), classId: !classId, deadline: !deadline, priority: !/^[1-5]$/.test(priority) }
  const valid = !Object.values(errors).some(Boolean)
  useEffect(() => {
    if (!dirty) return
    const before = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', before)
    return () => window.removeEventListener('beforeunload', before)
  }, [dirty])
  const reviewPublish = () => { setShowErrors(true); if (valid && !locked) setReview(true) }
  const saveDraft = () => { setShowErrors(true); if (valid && !locked) setMessage('PENDING_API: Chưa lưu bản nháp. Kết nối dịch vụ nghiệp vụ để hoàn tất.') }
  return <Page title={selected ? 'Chỉnh sửa bài tập' : 'Tạo & giao bài tập'} subtitle="Lưu nháp và xuất bản là hai thao tác riêng." action={<Button onClick={reviewPublish} disabled={locked}>Xem lại trước khi xuất bản</Button>}>
    {locked && <Notice>Bài đã giao có bài nộp. Chỉnh sửa và rút ngắn hạn nộp cần biện pháp bảo vệ được phê duyệt. PENDING_API.</Notice>}
    <Card title="Nội dung và thời hạn">
      <div className="as-grid two">
        <label className="as-field">Tiêu đề *<input value={title} disabled={locked} onChange={(e) => { setTitle(e.target.value); setDirty(true) }} aria-invalid={showErrors && errors.title} />{showErrors && errors.title && <span className="as-error">Cần nhập tiêu đề.</span>}</label>
        <label className="as-field">Lớp phụ trách *<select value={classId} disabled={locked} onChange={(e) => { setClassId(e.target.value); setDirty(true) }} aria-invalid={showErrors && errors.classId}><option value="">Chọn lớp</option>{classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>{showErrors && errors.classId && <span className="as-error">Cần chọn lớp.</span>}</label>
      </div>
      <label className="as-field">Mô tả & yêu cầu *<textarea value={description} disabled={locked} onChange={(e) => { setDescription(e.target.value); setDirty(true) }} aria-invalid={showErrors && errors.description} />{showErrors && errors.description && <span className="as-error">Cần nhập mô tả.</span>}</label>
      <div className="as-grid two">
        <label className="as-field">Hạn nộp *<input type="datetime-local" value={deadline} disabled={locked} onChange={(e) => { setDeadline(e.target.value); setDirty(true) }} aria-invalid={showErrors && errors.deadline} />{showErrors && errors.deadline && <span className="as-error">Cần nhập hạn nộp.</span>}</label>
        <label className="as-field">Độ ưu tiên *<input type="number" min="1" max="5" step="1" value={priority} disabled={locked} onChange={(e) => { setPriority(e.target.value); setDirty(true) }} aria-invalid={showErrors && errors.priority} />{showErrors && errors.priority && <span className="as-error">Ưu tiên phải từ 1 đến 5.</span>}</label>
      </div>
    </Card>
    <Card title="Kiểm tra đối tượng nhận" subtitle="Phạm vi người nhận cuối cùng do backend xác nhận.">
      <p>{!classId ? 'Chọn lớp để kiểm tra danh sách người nhận.' : roster ? `${roster.studentIds.length} học sinh trong ${className ?? classId} (danh sách lớp${preview ? ' mẫu' : ''}, chưa xác nhận phát hành)` : 'Chưa có danh sách người nhận được xác minh cho lớp này.'}</p>
      <label className="as-field">Tài liệu tham khảo<input type="file" multiple disabled={locked} onChange={(e) => { setFiles([...e.target.files ?? []]); setDirty(true) }} /></label>
      {files.length > 0 && <ul className="as-list">{files.map((file) => <li key={`${file.name}-${file.lastModified}`}>{file.name}</li>)}</ul>}
    </Card>
    <div className="as-actions"><Button secondary onClick={saveDraft} disabled={locked}>Lưu bản nháp</Button><Button onClick={reviewPublish} disabled={locked}>Xem lại và xuất bản</Button>{onBack && <Button secondary onClick={() => { if (!dirty || window.confirm('Bỏ các thay đổi chưa lưu?')) onBack() }}>Quay lại</Button>}</div>
    {message && <Notice>{message}</Notice>}
    {review && <Dialog title="Xác nhận xuất bản bài tập" onClose={() => setReview(false)}>
      <p><strong>{title}</strong> · {className ?? classId} · {roster ? `${roster.studentIds.length} người nhận theo danh sách lớp` : 'Chưa xác minh danh sách người nhận'}</p>
      <p>Hạn nộp: {deadline.replace('T', ' ')} · Ưu tiên {priority}/5</p>
      <Notice>Chỉ backend mới có thể xác nhận người nhận, xuất bản và tạo thông báo in-app. PENDING_API.</Notice>
      <div className="as-actions"><Button onClick={() => { setReview(false); setMessage('PENDING_API: Chưa xuất bản bài tập hoặc gửi thông báo.') }}>Xác nhận yêu cầu xuất bản</Button></div>
    </Dialog>}
  </Page>
}
