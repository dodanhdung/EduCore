import { useEffect, useRef } from 'react'
import { formatDate } from '../SchedulingDates.ts'

export type ConflictSource = 'teacher' | 'room' | 'student' | 'unavailability' | 'capacity' | 'unknown'
export type ScheduleConflict = {
  id: string
  source: ConflictSource
  date?: string
  start?: string
  end?: string
  affectedSession: string
  resource: string
  reason: string
}

const sourceLabel: Record<ConflictSource, string> = {
  teacher: 'Trùng giáo viên', room: 'Trùng phòng', student: 'Trùng học sinh',
  unavailability: 'Lịch bận tài nguyên', capacity: 'Vượt sức chứa', unknown: 'Xung đột từ máy chủ',
}
export function ConflictPanel({ conflicts, checkedCount, race = false, preview = true, available = true, ready, onClose, onEdit }: {
  conflicts: readonly ScheduleConflict[]; checkedCount: number; race?: boolean; preview?: boolean; available?: boolean; ready?: boolean; onClose: () => void; onEdit: () => void
}) {
  const sheetRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement instanceof window.HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'
    sheetRef.current?.querySelector<HTMLElement>('button')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return }
      if (event.key !== 'Tab' || !sheetRef.current) return
      const items = [...sheetRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])')]
      if (!items.length) return
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); previousFocus?.focus() }
  }, [onClose])
  return <div className="scheduling-overlay scheduling-sheet-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="scheduling-conflict-title" className="scheduling-sheet">
      <div className="scheduling-dialog-head"><div><h2 id="scheduling-conflict-title">Xung đột lịch học</h2><p className="scheduling-hint">SC04 · {checkedCount} buổi · {preview ? 'Dữ liệu minh họa' : 'Kết quả từ máy chủ'}</p></div><button type="button" aria-label="Đóng panel xung đột" onClick={onClose}>Đóng</button></div>
      <div className={`scheduling-conflict-count${!available || ready === false || conflicts.length ? ' scheduling-conflict-blocked' : ''}`} role="status">{!available ? 'Chưa thể kiểm tra xung đột · chặn xác nhận' : race ? 'Dữ liệu vừa thay đổi · chặn xác nhận' : conflicts.length ? `${conflicts.length} vấn đề · chặn xác nhận` : ready === false ? 'Có điều kiện chưa đạt · chặn xác nhận' : preview ? 'Không phát hiện xung đột trong dữ liệu minh họa' : 'Không phát hiện xung đột tại thời điểm kiểm tra'}</div>
      <p className="scheduling-hint">{conflicts.length ? 'Các buổi và tài nguyên bị ảnh hưởng được liệt kê bên dưới.' : 'Kết quả xem trước chưa giữ chỗ. Máy chủ phải kiểm tra lại toàn chuỗi khi xác nhận.'}</p>
      {conflicts.map((conflict) => <article className="scheduling-conflict-item" key={conflict.id}><h3>{conflict.affectedSession}{conflict.date && conflict.start && conflict.end ? ` · ${formatDate(conflict.date)}, ${conflict.start}–${conflict.end}` : ''}</h3><span className="scheduling-conflict-source">{sourceLabel[conflict.source]}</span><p>{conflict.resource}</p><p>{conflict.reason}</p></article>)}
      <div className="scheduling-conflict-item"><h3>{conflicts.length ? race ? 'Xác nhận bị từ chối' : 'Chuỗi chưa thể xác nhận' : 'Cần kiểm tra khi xác nhận'}</h3><p className="scheduling-hint">{conflicts.length ? 'Không buổi nào trong chuỗi được xác nhận; bản nháp không giữ tài nguyên.' : 'Chưa buổi nào được xác nhận. Kết quả xem trước không giữ chỗ; máy chủ kiểm tra lại khi xác nhận.'}</p></div>
      <div className="scheduling-form-actions"><button type="button" className="scheduling-primary" onClick={onEdit}>Quay lại chỉnh sửa</button><button type="button" disabled aria-label="Xác nhận lịch đang chờ API">Xác nhận cả chuỗi</button></div>
    </section>
  </div>
}
