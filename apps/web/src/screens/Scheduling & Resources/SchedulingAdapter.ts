import { tenantLocalDate } from './SchedulingDates.ts'
import type { ResourceBlock, ScheduleRoom, ScheduleSession, SchedulingData } from './SchedulingTypes.ts'
import type { ScheduleConflict } from './SC04/ConflictPanel.tsx'

export type ApiSession = { id: string; classId: string; className: string; teacherId: string; teacherName: string; roomId: string | null; deliveryMode: 'ONSITE' | 'ONLINE'; startsAt: string; endsAt: string; status: ScheduleSession['status']; revision: number; seriesId: string | null; timeZone?: string }
export type ApiRoom = { id: string; code: string; name: string; capacity: number; active: boolean; location: string | null }
export type ApiBusy = { id: string; resourceId: string; roomId?: string | null; resourceKind: 'ROOM' | 'TEACHER' | 'STUDENT'; startsAt: string; endsAt: string; status: ResourceBlock['status']; reason: string }
export type ApiChoice = { id: string; name: string; capacity?: number; enrollmentCount?: number; kind?: 'ROOM' | 'TEACHER' | 'STUDENT' }
export type ApiChoices = { timeZone: string; classes: ApiChoice[]; teachers: ApiChoice[]; rooms: ApiChoice[]; resources: ApiChoice[]; assignments: { classId: string; teacherId: string; validFrom: string; validTo: string | null }[] }
export type ApiCaps = { scheduleCreate: boolean; scheduleConfirm: boolean; scheduleUpdate: boolean; scheduleCancel: boolean; roomManage: boolean; resourceManage: boolean }
export type ApiPreview = { ready: boolean; sessionIds: string[]; conflicts: { sessionId: string; kind: string }[]; reserved: false; asOf: string }

export function conflictsFromServer(result: ApiPreview | null | undefined): ScheduleConflict[] {
  return result?.conflicts.map((item, index) => ({
    id: `${item.sessionId}:${item.kind}:${index}`,
    source: item.kind.toLowerCase().includes('room') ? 'room' : item.kind.toLowerCase().includes('teacher') ? 'teacher' : item.kind.toLowerCase().includes('capacity') ? 'capacity' : item.kind.toLowerCase().includes('student') ? 'student' : item.kind.toLowerCase().includes('busy') || item.kind.toLowerCase().includes('unavailability') ? 'unavailability' : 'unknown',
    affectedSession: item.sessionId,
    resource: item.kind,
    reason: 'Chi tiết tài nguyên và thời gian chưa được máy chủ cung cấp.',
  })) ?? []
}

function localTime(iso: string, timeZone: string): string {
  try { return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso)) }
  catch { return '' }
}
export function sessionView(session: ApiSession, timeZone: string): ScheduleSession {
  return { id: session.id, startsAt: session.startsAt, date: tenantLocalDate(timeZone, new Date(session.startsAt)) ?? '', start: localTime(session.startsAt, timeZone), end: localTime(session.endsAt, timeZone), classId: session.classId, className: session.className, teacherId: session.teacherId, teacherName: session.teacherName, roomId: session.roomId ?? '', deliveryMode: session.deliveryMode, status: session.status, revision: session.revision, seriesId: session.seriesId }
}
export function roomView(room: ApiRoom): ScheduleRoom {
  return { id: room.id, code: room.code, name: room.name, location: room.location ?? '', capacity: room.capacity, status: room.active ? 'ACTIVE' : 'INACTIVE' }
}
export function busyView(block: ApiBusy, timeZone: string, resourceName: string): ResourceBlock {
  return { id: block.id, resourceId: block.resourceId, roomId: block.roomId, resourceKind: block.resourceKind, resourceName, date: tenantLocalDate(timeZone, new Date(block.startsAt)) ?? '', start: localTime(block.startsAt, timeZone), end: localTime(block.endsAt, timeZone), reason: block.reason, status: block.status }
}
export function schedulingView(timeZone: string, sessions: ApiSession[] = [], rooms: ApiRoom[] = [], blocks: ApiBusy[] = [], choices?: ApiChoices, resources: ApiChoice[] = []): SchedulingData {
  const resourceNames = new Map(resources.map((resource) => [resource.id, resource.name]))
  return { sessions: sessions.map((item) => sessionView(item, timeZone)), rooms: rooms.length ? rooms.map(roomView) : choices?.rooms.map((item) => ({ id: item.id, name: item.name, location: '', capacity: item.capacity ?? 0, status: 'ACTIVE' as const })) ?? [], blocks: blocks.map((item) => busyView(item, timeZone, resourceNames.get(item.resourceId) ?? item.resourceKind)), classes: choices?.classes.map((item) => ({ id: item.id, name: item.name, enrollmentCount: item.enrollmentCount ?? 0 })), teachers: choices?.teachers.map((item) => ({ id: item.id, name: item.name })), resources: resources.filter((item): item is ApiChoice & { kind: 'ROOM' | 'TEACHER' | 'STUDENT' } => !!item.kind).map((item) => ({ id: item.id, name: item.name, kind: item.kind })), assignments: choices?.assignments }
}

// Convert a tenant wall-clock value to an instant, then verify that it round-trips.
// This also rejects nonexistent wall-clock times during DST transitions.
export function localInstant(date: string, time: string, timeZone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time) || !tenantLocalDate(timeZone)) return null
  const base = Date.parse(`${date}T${time}:00Z`)
  if (!Number.isFinite(base)) return null
  let instant = base
  for (let pass = 0; pass < 3; pass++) {
    const actualDate = tenantLocalDate(timeZone, new Date(instant))
    if (!actualDate) return null
    const actual = Date.parse(`${actualDate}T${localTime(new Date(instant).toISOString(), timeZone)}:00Z`)
    instant += base - actual
  }
  return tenantLocalDate(timeZone, new Date(instant)) === date && localTime(new Date(instant).toISOString(), timeZone) === time ? new Date(instant).toISOString() : null
}

export function futureSessionStart(startsAt: string | undefined, timeZone: string | undefined, now: Date | undefined): boolean {
  if (!now || !startsAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(startsAt) || !tenantLocalDate(timeZone, now)) return false
  const instant = Date.parse(startsAt)
  return Number.isFinite(instant) && instant > now.getTime() && tenantLocalDate(timeZone, new Date(instant)) !== null
}

export function apiWeekday(weekdays: readonly number[]): number | null {
  if (weekdays.length !== 1 || !Number.isInteger(weekdays[0]) || weekdays[0] < 0 || weekdays[0] > 6) return null
  return weekdays[0] === 0 ? 7 : weekdays[0]
}
