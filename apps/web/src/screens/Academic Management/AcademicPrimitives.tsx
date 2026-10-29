import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { AcademicId } from './AcademicTypes.ts'

const titles: Record<AcademicId, string> = {
  AC01: 'Danh sách học sinh', AC02: 'Chi tiết học sinh', AC03: 'Danh sách giáo viên', AC04: 'Chi tiết giáo viên & phân công',
}

export function PageHeader({ id, subtitle, action }: { id: AcademicId; subtitle: string; action?: () => void }) {
  return <header className="academic-heading"><div><h1>{titles[id]}</h1><p>{subtitle}</p></div>
    {action && <button className="academic-primary" onClick={action}>{id === 'AC01' || id === 'AC03' ? 'Tạo hồ sơ' : 'Chỉnh sửa hồ sơ'}</button>}
  </header>
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="academic-card"><h2>{title}</h2>{hint && <p className="academic-hint">{hint}</p>}{children}</section>
}

export function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="academic-field"><span>{label}</span><div>{value}</div></div>
}

export function EditDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [attempted, setAttempted] = useState(false)
  const dialog = useRef<HTMLDivElement | null>(null)
  const previous = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  useEffect(() => () => { if (previous.current?.isConnected) previous.current.focus() }, [])
  function onKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
    if (event.key !== 'Tab') return
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? [])]
    if (!items.length) return
    if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items[items.length - 1].focus() }
    else if (!event.shiftKey && document.activeElement === items[items.length - 1]) { event.preventDefault(); items[0].focus() }
  }
  return <div className="academic-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <div className="academic-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="academic-dialog-title" onKeyDown={onKeys}>
      <div className="academic-dialog-head"><h2 id="academic-dialog-title">{title}</h2><button onClick={onClose} aria-label="Đóng hộp thoại">×</button></div>
      <p className="academic-hint">Biểu mẫu xem trước. Thao tác lưu đang chờ API và quyền hiệu lực.</p>
      <label className="academic-field"><span>Họ và tên</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} aria-invalid={attempted && !name.trim()} aria-describedby={attempted && !name.trim() ? 'academic-name-error' : undefined} /></label>
      {attempted && !name.trim() && <p className="academic-error" id="academic-name-error">Vui lòng nhập họ và tên.</p>}
      {attempted && !!name.trim() && <p role="status" className="academic-hint">Biểu mẫu hợp lệ. Lưu hồ sơ sẽ khả dụng sau khi kết nối API.</p>}
      <div className="academic-dialog-actions"><button onClick={onClose}>Hủy</button><button onClick={() => setAttempted(true)}>Kiểm tra biểu mẫu</button><button className="academic-primary" disabled>Lưu · Chờ API</button></div>
    </div>
  </div>
}
