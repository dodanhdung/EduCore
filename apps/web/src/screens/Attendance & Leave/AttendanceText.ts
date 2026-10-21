import type { AttendancePhase, AttendanceStatus, LeaveStatus } from './AttendanceTypes.ts'

export const attendanceLabels: Record<AttendanceStatus, string> = { ATTENDED: 'Có mặt', EXCUSED: 'Nghỉ có phép', UNEXCUSED: 'Vắng không phép' }
export const phaseLabels: Record<AttendancePhase, string> = { DRAFT: 'Bản nháp', PARTIAL: 'Chưa xác nhận', FINALIZED: 'Đã xác nhận', LOCKED: 'Đã khóa' }
export const leaveLabels: Record<LeaveStatus, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Bị từ chối', NEEDS_INFORMATION: 'Cần bổ sung' }
export function formatAttendanceDate(date: string) {
  const [year, month, day] = date.split('-'); return year && month && day ? `${day}/${month}/${year}` : date
}
export function formatAttendanceInstant(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
