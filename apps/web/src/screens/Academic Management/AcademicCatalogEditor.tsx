import { useEffect, useRef, useState } from 'react'
import type { AcademicCatalogModel } from './AcademicCatalogModel.ts'
import { completeChoices, editorError } from './AcademicCatalogModel.ts'
import type { Editor, EditorKind } from './AcademicCatalogViews.tsx'
import styles from './AcademicCatalogViews.module.css'

const names: Record<EditorKind, string> = { subject: 'môn học', level: 'trình độ', course: 'khóa học', class: 'lớp học' }
export function AcademicCatalogEditor({ editor, model, busy, error, onClose, onSave }: { editor: Editor; model: AcademicCatalogModel; busy?: boolean; error?: string; onClose: () => void; onSave?: (editor: Editor) => void }) {
  const [draft, setDraft] = useState(editor)
  const [attempted, setAttempted] = useState(false)
  const dialog = useRef<HTMLDivElement>(null)
  const creating = !draft.target
  const choicesReady = draft.kind === 'course' && creating ? model.kind === 'AC06' && completeChoices(model.choices.subjects) && completeChoices(model.choices.levels)
    : draft.kind === 'class' && creating ? model.kind === 'AC07' && completeChoices(model.courses) : true
  const issue = attempted ? editorError(draft) : null
  useEffect(() => { dialog.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus() }, [])
  const set = (key: string, value: string) => setDraft(current => ({ ...current, values: { ...current.values, [key]: value } }))
  const field = (key: string, label: string, type = 'text') => <label key={key}>{label}<input type={type} value={draft.values[key] ?? ''} onChange={e => set(key, e.target.value)} disabled={busy} /></label>
  const select = (key: string, label: string, choices: { id: string; code: string; name: string }[]) => <label key={key}>{label}<select value={draft.values[key] ?? ''} onChange={e => set(key, e.target.value)} disabled={busy || !choicesReady}><option value="">Chọn…</option>{choices.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
  const subjects = model.kind === 'AC06' ? model.choices.subjects?.items.filter(item => item.active) ?? [] : []
  const levels = model.kind === 'AC06' ? model.choices.levels?.items.filter(item => item.active) ?? [] : []
  const courses = model.kind === 'AC07' ? model.courses?.items.filter(item => item.status === 'ACTIVE') ?? [] : []
  function keys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose(); return }
    if (event.key !== 'Tab') return
    const elements = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)') ?? [])]
    if (!elements.length) return
    if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus() }
    else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0].focus() }
  }
  return <div className={styles.editorOverlay} onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}><div className={styles.editorDialog} ref={dialog} role="dialog" aria-modal="true" aria-label={`${creating ? 'Tạo' : 'Chỉnh sửa'} ${names[draft.kind]}`} onKeyDown={keys}>
    <div className={styles.editorHead}><h2>{creating ? 'Tạo' : 'Chỉnh sửa'} {names[draft.kind]}</h2><button type="button" disabled={busy} aria-label="Đóng hộp thoại" onClick={onClose}>×</button></div>
    <p className={styles.note}>{onSave ? 'Lưu theo quyền hiện hành; máy chủ kiểm tra tham chiếu và xung đột.' : 'Dữ liệu mẫu — biểu mẫu không ghi vào máy chủ.'}</p>
    {!choicesReady && <p role="status" className={styles.error}>Danh sách lựa chọn chưa đầy đủ hoặc chưa được cấp; chưa thể tạo bản ghi.</p>}
    <div className={styles.editorFields}>{creating && field('code', 'Mã')}{field('name', 'Tên')}
      {draft.kind === 'level' && field('sortOrder', 'Thứ tự', 'number')}
      {(draft.kind === 'subject' || draft.kind === 'level') && !creating && <label>Trạng thái<select value={draft.values.active} onChange={e => set('active', e.target.value)} disabled={busy}><option value="true">Đang hoạt động</option><option value="false">Đã ẩn</option></select></label>}
      {draft.kind === 'course' && creating && <>{select('subjectId', 'Môn học', subjects)}{select('levelId', 'Trình độ', levels)}</>}
      {draft.kind === 'course' && <label>Mô tả<textarea value={draft.values.description} onChange={e => set('description', e.target.value)} disabled={busy} /></label>}
      {draft.kind === 'class' && creating && <>{select('courseId', 'Khóa học', courses)}{field('capacity', 'Sức chứa', 'number')}{field('startDate', 'Ngày bắt đầu', 'date')}{field('endDate', 'Ngày kết thúc', 'date')}</>}
      <label>Lý do<textarea value={draft.values.reason} onChange={e => set('reason', e.target.value)} disabled={busy} /></label></div>
    {(issue || error) && <p role="alert" className={styles.error}>{issue || error}</p>}
    <div className={`${styles.editorActions} academic-form-actions`}><button type="button" disabled={busy} onClick={onClose}>Hủy</button><button type="button" className={styles.primary} disabled={busy || !choicesReady} onClick={() => { setAttempted(true); if (!editorError(draft)) onSave?.(draft) }}>{onSave ? busy ? 'Đang lưu…' : 'Lưu' : 'Kiểm tra biểu mẫu'}</button></div>
  </div></div>
}
