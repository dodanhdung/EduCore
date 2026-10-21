export type SessionStatus = 'CONFIRMED' | 'DRAFT' | 'CANCELLED'
export type ScheduleSession = {
  id: string
  date: string
  start: string
  end: string
  classId: string
  className: string
  teacherId: string
  teacherName: string
  roomId: string
  status: SessionStatus
}
export type ScheduleRoom = { id: string; name: string; location: string; capacity: number; status: 'ACTIVE' | 'INACTIVE' }
export type ResourceBlock = { id: string; resourceId: string; resourceName: string; date: string; start: string; end: string; reason: string; status: 'CONFIRMED' | 'CANCELLED' }
export type ScheduleClass = { id: string; name: string; enrollmentCount: number }
export type ScheduleAttendee = { id: string; name: string; enrolledAt: string }
export type SessionHistoryEvent = { id: string; occurredAt: string; description: string }
export type SchedulingData = { sessions: ScheduleSession[]; rooms: ScheduleRoom[]; blocks: ResourceBlock[]; classes?: ScheduleClass[]; attendees?: Record<string, ScheduleAttendee[]>; historyBySessionId?: Record<string, SessionHistoryEvent[]> }
export type SchedulingState = 'ready' | 'loading' | 'error'
export type PersonalScheduleScope = {
  mode: 'teacher' | 'student' | 'parent'
  label: string
  allowedSessionIds: string[]
  children?: { id: string; name: string; allowedSessionIds: string[] }[]
}
