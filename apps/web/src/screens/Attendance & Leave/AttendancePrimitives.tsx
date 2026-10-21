import type { ReactNode } from 'react'
import type { AttendancePhase, AttendanceStatus, LeaveStatus } from './AttendanceTypes.ts'
import { attendanceLabels, leaveLabels, phaseLabels } from './AttendanceText.ts'

export function AttendanceCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="attendance-card"><div className="attendance-card-heading"><h2>{title}</h2>{hint && <p>{hint}</p>}</div>{children}</section>
}
export function AttendanceBadge({ value, label }: { value: string; label?: string }) {
  return <span className={`attendance-badge attendance-badge-${value.toLowerCase()}`}>{label ?? phaseLabels[value as AttendancePhase] ?? leaveLabels[value as LeaveStatus] ?? attendanceLabels[value as AttendanceStatus] ?? value}</span>
}
export function AttendancePending({ children }: { children?: ReactNode }) {
  return <p className="attendance-pending" role="status">{children ?? 'Chờ kết nối API có thẩm quyền. Dữ liệu trên màn hình chưa được lưu hoặc thay đổi.'}</p>
}
export function AttendanceState({ title, children, alert = false }: { title: string; children: ReactNode; alert?: boolean }) {
  return <div className="attendance-state" role={alert ? 'alert' : 'status'}><strong>{title}</strong><p>{children}</p></div>
}
export function AttendanceHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <header className="attendance-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>
}
