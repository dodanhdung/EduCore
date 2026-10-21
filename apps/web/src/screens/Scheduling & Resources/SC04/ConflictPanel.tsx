import { formatDate } from '../SchedulingDates.ts'

export type ConflictSource = 'teacher' | 'room' | 'student' | 'unavailability' | 'capacity'
export type ScheduleConflict = {
  id: string
  source: ConflictSource
  date: string
  start: string
  end: string
  affectedSession: string
  resource: string
  reason: string
}

const sourceLabel: Record<ConflictSource, string> = {
  teacher: 'Trùng giáo viên', room: 'Trùng phòng', student: 'Trùng học sinh',
  unavailability: 'Lịch bận tài nguyên', capacity: 'Vượt sức chứa',
}

export function ConflictPanel({ conflicts, checkedCount, race = false, onClose, onEdit }: {
  conflicts: readonly ScheduleConflict[]; checkedCount: number; race?: boolean; onClose: () => void; onEdit: () => void
}) {
  return <div className="scheduling-overlay scheduling-sheet-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="scheduling-conflict-title" className="scheduling-sheet">
      <div className="scheduling-dialog-head"><div><h2 id="scheduling-conflict-title">Xung đột lịch học</h2><p className="scheduling-hint">SC04 · {checkedCount} buổi · Dữ liệu minh họa</p></div><button type="button" aria-label="Đóng panel xung đột" onClick={onClose}>Đóng</button></div>
      <div className={`scheduling-conflict-count${conflicts.length ? ' scheduling-conflict-blocked' : ''}`} role="status">{race ? 'Dữ liệu vừa thay đổi · chặn xác nhận' : conflicts.length ? `${conflicts.length} vấn đề · chặn xác nhận` : 'Không phát hiện xung đột trong dữ liệu minh họa'}</div>
      <p className="scheduling-hint">{conflicts.length ? 'Các buổi và tài nguyên bị ảnh hưởng được liệt kê bên dưới.' : 'Kết quả xem trước chưa giữ chỗ. Máy chủ phải kiểm tra lại toàn chuỗi khi xác nhận.'}</p>
      {conflicts.map((conflict) => <article className="scheduling-conflict-item" key={conflict.id}><h3>{conflict.affectedSession} · {formatDate(conflict.date)}, {conflict.start}–{conflict.end}</h3><span className="scheduling-conflict-source">{sourceLabel[conflict.source]}</span><p>{conflict.resource}</p><p>{conflict.reason}</p></article>)}
      <div className="scheduling-conflict-item"><h3>{conflicts.length ? race ? 'Xác nhận bị từ chối' : 'Chuỗi chưa thể xác nhận' : 'Cần kiểm tra trên máy chủ'}</h3><p className="scheduling-hint">{conflicts.length ? 'Không buổi nào trong chuỗi được tạo hoặc giữ tài nguyên.' : 'Dữ liệu mẫu không chứng minh quyền, sức chứa hoặc tính khả dụng. Chưa buổi nào được xác nhận.'}</p></div>
      <div className="scheduling-form-actions"><button type="button" className="scheduling-primary" onClick={onEdit}>Quay lại chỉnh sửa</button><button type="button" disabled aria-label="Xác nhận lịch đang chờ API">Xác nhận cả chuỗi</button></div>
    </section>
  </div>
}
