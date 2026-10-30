export type SessionStatus = 'CONFIRMED' | 'DRAFT' | 'COMPLETED' | 'CANCELLED'
export type ScheduleSession = {
  id: string
  startsAt?: string
  date: string
  start: string
  end: string
  classId: string
  className: string
  teacherId: string
  teacherName: string
  roomId: string
  status: SessionStatus
  revision?: number
  seriesId?: string | null
  deliveryMode?: 'ONSITE' | 'ONLINE'
}
export type ScheduleRoom = { id: string; code?: string; name: string; location: string; capacity: number; status: 'ACTIVE' | 'INACTIVE' }
export type ResourceBlock = { id: string; resourceId: string; roomId?: string | null; resourceKind?: 'ROOM' | 'TEACHER' | 'STUDENT'; resourceName: string; date: string; start: string; end: string; reason: string; status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED' }
export type ScheduleClass = { id: string; name: string; enrollmentCount: number }
export type ScheduleAttendee = { id: string; name: string; enrolledAt: string }
export type SessionHistoryEvent = { id: string; occurredAt: string; description: string }
export type SchedulingData = { sessions: ScheduleSession[]; rooms: ScheduleRoom[]; blocks: ResourceBlock[]; classes?: ScheduleClass[]; teachers?: { id: string; name: string }[]; resources?: { id: string; name: string; kind: 'ROOM' | 'TEACHER' | 'STUDENT' }[]; assignments?: { classId: string; teacherId: string; validFrom: string; validTo: string | null }[]; attendees?: Record<string, ScheduleAttendee[]>; historyBySessionId?: Record<string, SessionHistoryEvent[]> }
export type SchedulingState = 'ready' | 'loading' | 'error'
export type PersonalScheduleScope = {
  mode: 'teacher' | 'student' | 'parent'
  label: string
  allowedSessionIds: string[]
  children?: { id: string; name: string; allowedSessionIds: string[] }[]
}
