import type { ReactNode } from 'react'
import type { SessionStatus } from './SchedulingTypes.ts'

export function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="scheduling-card"><h2>{title}</h2>{hint && <p className="scheduling-hint">{hint}</p>}{children}</section>
}
export function StatusBadge({ status }: { status: SessionStatus | 'ACTIVE' | 'INACTIVE' }) {
  const label = { CONFIRMED: 'Đã xác nhận', DRAFT: 'Bản nháp', CANCELLED: 'Đã hủy', ACTIVE: 'Hoạt động', INACTIVE: 'Tạm ngưng' }[status]
  return <span className={`scheduling-badge scheduling-badge-${status.toLowerCase()}`}>{label}</span>
}
export function PendingAction({ children }: { children: ReactNode }) {
  return <p className="scheduling-pending" role="status">{children} Chức năng này đang chờ kết nối API có thẩm quyền; dữ liệu mẫu chưa được thay đổi.</p>
}
