import type { PortalData, PortalSession, PortalSectionState } from '../PortalTypes.ts'

export type TeacherHomeModel = {
  teacherName: string; timeZone: string; asOf: string; sample: boolean;
  today: PortalSession[]; upcoming: PortalSession[];
  todayCount: number | null; pendingCount: number | null; gradingCount: number | null;
  attendanceState?: PortalSectionState; teachingState?: PortalSectionState; gradingState?: PortalSectionState;
  assignmentsDraft: number | null; assignmentsPublished: number | null;
  partialCalendar: boolean; partialAttendance: boolean; partialGrading: boolean
}
function localDate(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
}
function normalize(data: PortalData, teacherId: string, production: boolean, incomplete: boolean): TeacherHomeModel {
  const complete = data.completeness ?? { calendar: !incomplete, attendance: !incomplete, grading: !incomplete }
  const sessions = data.sessions.filter(row => row.teacherId === teacherId && row.status === 'CONFIRMED')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const today = sessions.filter(row => localDate(row.startsAt, data.timeZone) === localDate(data.sampleNow, data.timeZone))
  const assigned = data.assignments.assignments.filter(row => row.teacherId === teacherId)
  const awaiting = data.assignments.submissions.filter(row => production
    ? row.versions.length > 0 && !row.grade
    : assigned.some(a => a.id === row.assignmentId && a.status !== 'DRAFT') && row.versions.length > 0 && !row.grade)
  const attendanceReady = !data.sectionStates?.attendance || data.sectionStates.attendance === 'ready'
  const gradingReady = !data.sectionStates?.grading || data.sectionStates.grading === 'ready'
  const teachingReady = !data.sectionStates?.teaching || data.sectionStates.teaching === 'ready'
  return {
    teacherName: data.teacherName, timeZone: data.timeZone, asOf: data.sampleNow, sample: !production,
    today, upcoming: sessions.filter(row => row.startsAt > data.sampleNow),
    todayCount: complete.calendar ? today.length : null,
    pendingCount: complete.calendar && complete.attendance && attendanceReady
      ? today.filter(row => row.attendance === 'PENDING').length : null,
    gradingCount: complete.grading && gradingReady ? awaiting.length : null,
    attendanceState: data.sectionStates?.attendance, teachingState: data.sectionStates?.teaching,
    gradingState: data.sectionStates?.grading,
    assignmentsDraft: teachingReady ? assigned.filter(row => row.status === 'DRAFT').length : null,
    assignmentsPublished: teachingReady ? assigned.filter(row => row.status === 'PUBLISHED').length : null,
    partialCalendar: !complete.calendar,
    partialAttendance: attendanceReady && (!complete.calendar || !complete.attendance),
    partialGrading: gradingReady && !complete.grading,
  }
}
export function fromTeacherLive(data: PortalData, teacherId: string, incomplete: boolean) {
  return normalize(data, teacherId, true, incomplete)
}
export function fromTeacherFixture(data: PortalData, teacherId: string) {
  return normalize(data, teacherId, false, false)
}
