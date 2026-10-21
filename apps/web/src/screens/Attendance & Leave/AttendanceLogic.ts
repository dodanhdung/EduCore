import type { AttendanceData, AttendanceSession, AttendanceStatus, LeaveRequest } from './AttendanceTypes.ts'

export function sessionById(data: AttendanceData | undefined, id: string | undefined): AttendanceSession | undefined {
  return data?.sessions.find((session) => session.id === id)
}
export function approvedLeave(data: AttendanceData, sessionId: string, studentId: string): LeaveRequest | undefined {
  return data.leaveRequests.find((request) => request.sessionId === sessionId && request.studentId === studentId && request.status === 'APPROVED')
}
export function canChooseStatus(status: AttendanceStatus, hasApprovedLeave: boolean): boolean {
  return status !== 'EXCUSED' || hasApprovedLeave
}
export function leaveHoursBefore(session: AttendanceSession, submittedAt: string, timeZone: string): number {
  // Preview fixtures use local wall-clock dates in the tenant timezone. The server remains authoritative.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, timeZoneName: 'shortOffset' }).formatToParts(new Date(submittedAt))
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  const minutes = offset ? (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3] ?? 0)) : 0
  const start = Date.parse(`${session.date}T${session.start}:00Z`) - minutes * 60000
  return (start - Date.parse(submittedAt)) / 3600000
}
export function scopedRequests(data: AttendanceData, role: 'student' | 'parent' | 'staff' | 'teacher') {
  if (role === 'parent') return data.leaveRequests.filter((request) => data.linkedChildIds.includes(request.studentId))
  if (role === 'student') return data.leaveRequests.filter((request) => request.studentId === data.ownStudentId)
  return role === 'staff' ? data.leaveRequests : []
}
