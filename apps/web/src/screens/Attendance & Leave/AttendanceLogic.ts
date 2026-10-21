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
type UnresolvedTime = { kind: 'unresolved'; reason: 'invalid-local-time' | 'invalid-time-zone' | 'nonexistent-local-time' | 'ambiguous-local-time' | 'invalid-submitted-at' }
type SessionStart = { kind: 'resolved'; instantMs: number } | UnresolvedTime
export type LeaveTiming = { kind: 'resolved'; instantMs: number; hours: number } | UnresolvedTime

/** Resolve a tenant wall-clock session start without using the host timezone. */
export function sessionStartInstant(session: Pick<AttendanceSession, 'date' | 'start'>, timeZone: string): SessionStart {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(session.date)
  const time = /^(\d{2}):(\d{2})$/.exec(session.start)
  if (!date || !time) return { kind: 'unresolved', reason: 'invalid-local-time' }
  const [year, month, day, hour, minute] = [Number(date[1]), Number(date[2]), Number(date[3]), Number(time[1]), Number(time[2])]
  const wall = new Date(0)
  wall.setUTCFullYear(year, month - 1, day)
  wall.setUTCHours(hour, minute, 0, 0)
  if (wall.getUTCFullYear() !== year || wall.getUTCMonth() !== month - 1 || wall.getUTCDate() !== day || wall.getUTCHours() !== hour || wall.getUTCMinutes() !== minute) return { kind: 'unresolved', reason: 'invalid-local-time' }
  if (!timeZone || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timeZone)) return { kind: 'unresolved', reason: 'invalid-time-zone' }
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'shortOffset' })
  } catch (error) {
    if (error instanceof RangeError) return { kind: 'unresolved', reason: 'invalid-time-zone' }
    throw error
  }
  const localParts = (instantMs: number) => formatter.formatToParts(new Date(instantMs))
  const value = (parts: Intl.DateTimeFormatPart[], type: string) => parts.find((part) => part.type === type)?.value
  const offsets = new Set<number>()
  // Every possible UTC instant is within 14 hours of its local wall time. Sampling
  // adjacent offset regimes catches DST transitions without assuming one offset.
  for (let hours = -36; hours <= 36; hours++) {
    const label = value(localParts(wall.getTime() + hours * 3600000), 'timeZoneName')
    const match = /^GMT(?:(\+|-)(\d{1,2})(?::(\d{2}))?)?$/.exec(label ?? '')
    if (!match) return { kind: 'unresolved', reason: 'invalid-time-zone' }
    offsets.add(match[1] ? (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0)
  }
  const matches: number[] = []
  for (const offset of offsets) {
    const instantMs = wall.getTime() - offset * 60000
    const parts = localParts(instantMs)
    if (Number(value(parts, 'year')) === year && Number(value(parts, 'month')) === month && Number(value(parts, 'day')) === day && Number(value(parts, 'hour')) === hour && Number(value(parts, 'minute')) === minute) matches.push(instantMs)
  }
  if (!matches.length) return { kind: 'unresolved', reason: 'nonexistent-local-time' }
  if (matches.length > 1) return { kind: 'unresolved', reason: 'ambiguous-local-time' }
  return { kind: 'resolved', instantMs: matches[0] }
}

export function leaveHoursBefore(session: AttendanceSession, submittedAt: string, timeZone: string): LeaveTiming {
  const start = sessionStartInstant(session, timeZone)
  if (start.kind === 'unresolved') return start
  // Date.parse accepts offset-free strings in the host timezone; reject those.
  if (!/T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(submittedAt)) return { kind: 'unresolved', reason: 'invalid-submitted-at' }
  const submittedMs = Date.parse(submittedAt)
  if (!Number.isFinite(submittedMs)) return { kind: 'unresolved', reason: 'invalid-submitted-at' }
  return { kind: 'resolved', instantMs: start.instantMs, hours: (start.instantMs - submittedMs) / 3600000 }
}
export function scopedRequests(data: AttendanceData, role: 'student' | 'parent' | 'staff' | 'teacher') {
  if (role === 'parent') return data.leaveRequests.filter((request) => data.linkedChildIds.includes(request.studentId))
  if (role === 'student') return data.leaveRequests.filter((request) => request.studentId === data.ownStudentId)
  return role === 'staff' ? data.leaveRequests : []
}
