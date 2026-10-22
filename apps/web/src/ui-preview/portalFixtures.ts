import type { PortalData } from '../screens/Role Portals/PortalTypes.ts'
import { assignmentFixtures } from './assignmentFixtures.ts'
import { billingFixtures } from './billingFixtures.ts'
import { schedulingFixtures } from './schedulingFixtures.ts'
import { attendanceFixtures } from './attendanceFixtures.ts'
import type { SchedulingData, PersonalScheduleScope } from '../screens/Scheduling & Resources/SchedulingTypes.ts'
import type { AttendanceData } from '../screens/Attendance & Leave/AttendanceTypes.ts'

// Explicit verified relationships for UI Preview only. These are not production grants.
export const portalFixtures: PortalData = {
  sampleNow: '2026-10-17T07:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh',
  teacherId: 'teacher-mai', teacherName: 'Cô Mai Nguyễn', studentId: 'student-minh-anh', studentName: 'Trần Minh Anh',
  links: [
    { studentId: 'student-minh-anh', name: 'Trần Minh Anh', status: 'VERIFIED' },
    { studentId: 'student-hai-dang', name: 'Nguyễn Hải Đăng', status: 'VERIFIED' },
    { studentId: 'student-revoked', name: 'Học sinh đã thu hồi', status: 'REVOKED' },
    { studentId: 'student-unverified', name: 'Học sinh chưa xác minh', status: 'UNVERIFIED' },
  ],
  sessions: [
    { id: 'portal-session-toan-8a-17', studentIds: ['student-minh-anh'], teacherId: 'teacher-mai', classId: 'class-toan-8a', className: 'Toán 8A', startsAt: '2026-10-17T08:00:00+07:00', endsAt: '2026-10-17T09:30:00+07:00', room: 'P.201', status: 'CONFIRMED', attendance: 'CONFIRMED' },
    { id: 'portal-session-toan-8b-17', studentIds: ['student-minh-anh'], teacherId: 'teacher-mai', classId: 'class-toan-8b', className: 'Toán 8B', startsAt: '2026-10-17T14:00:00+07:00', endsAt: '2026-10-17T15:30:00+07:00', room: 'P.102', status: 'CONFIRMED', attendance: 'PENDING' },
    { id: 'portal-session-toan-8a-18', studentIds: ['student-minh-anh'], teacherId: 'teacher-mai', classId: 'class-toan-8a', className: 'Toán 8A', startsAt: '2026-10-18T18:00:00+07:00', endsAt: '2026-10-18T19:30:00+07:00', room: 'P.201', status: 'CONFIRMED', attendance: 'NOT_DUE' },
    { id: 'portal-session-cancelled', studentIds: ['student-minh-anh'], teacherId: 'teacher-mai', classId: 'class-toan-8a', className: 'Toán 8A', startsAt: '2026-10-19T18:00:00+07:00', endsAt: '2026-10-19T19:30:00+07:00', room: 'P.201', status: 'CANCELLED', attendance: 'NOT_DUE' },
    { id: 'portal-session-eng-18', studentIds: ['student-hai-dang'], teacherId: 'teacher-other', classId: 'class-eng-b2', className: 'Tiếng Anh B2', startsAt: '2026-10-18T18:00:00+07:00', endsAt: '2026-10-18T19:30:00+07:00', room: 'P.301', status: 'CONFIRMED', attendance: 'NOT_DUE' },
  ],
  assignments: assignmentFixtures,
  activeClasses: { 'student-minh-anh': [{ id: 'class-toan-8a', name: 'Toán 8A' }, { id: 'class-toan-8b', name: 'Toán 8B' }], 'student-hai-dang': [{ id: 'class-eng-b2', name: 'Tiếng Anh B2' }] },
  leaveRequests: [{ id: 'portal-leave-minh-anh', studentId: 'student-minh-anh', status: 'PENDING', sessionId: 'portal-session-toan-8a-18' }],
  notices: [{ id: 'portal-notice-minh-anh', recipientId: 'student-minh-anh', text: 'Bài tập chương 3 đã được giao.', occurredAt: '2026-10-16T09:00:00+07:00' }, { id: 'portal-notice-hai-dang', recipientId: 'student-hai-dang', text: 'Hóa đơn tháng 09 đã phát hành.', occurredAt: '2026-10-03T09:00:00+07:00' }],
  invoices: billingFixtures.invoices,
  wallets: billingFixtures.wallets,
}

export function portalScenario(state: string | null): PortalData {
  const base = portalFixtures
  if (state === 'loading') return base
  if (state === 'day-off') return { ...base, sampleNow: '2026-10-20T07:00:00+07:00' }
  if (state === 'no-sessions') return { ...base, sessions: [] }
  if (state === 'no-students') return { ...base, sessions: base.sessions.map((item) => item.teacherId === base.teacherId ? { ...item, studentIds: [] } : item) }
  if (state === 'attendance-pending') return { ...base, sessions: base.sessions.map((item) => item.teacherId === base.teacherId ? { ...item, attendance: 'PENDING' as const } : item) }
  if (state === 'overdue-grading') return { ...base, sampleNow: '2026-10-22T12:00:00+07:00' }
  if (state === 'no-assignments') return { ...base, assignments: { ...base.assignments, assignments: [], submissions: [] } }
  if (state === 'draft-grade') return { ...base, assignments: { ...base.assignments, submissions: base.assignments.submissions.map((item) => item.id === 'submission-minh-anh' ? { ...item, grade: { status: 'DRAFT' as const, score: 7.5, feedback: 'Nháp nội bộ, không công bố.' } } : item) } }
  if (state === 'cancelled') return { ...base, sessions: base.sessions.filter((item) => item.status === 'CANCELLED' || item.startsAt < base.sampleNow) }
  if (state === 'one-child') return { ...base, links: base.links.filter((item) => item.studentId === 'student-minh-anh') }
  if (state === 'no-links') return { ...base, links: [] }
  if (state === 'revoked') return { ...base, links: base.links.map((item) => item.studentId === 'student-minh-anh' ? { ...item, status: 'REVOKED' as const } : item) }
  if (state === 'no-activity') return { ...base, sessions: [], assignments: { ...base.assignments, assignments: [], submissions: [] }, notices: [], invoices: [] }
  if (state === 'no-enrollment') return { ...base, activeClasses: { ...base.activeClasses, 'student-minh-anh': [] } }
  if (state === 'incomplete') return { ...base, activeClasses: { ...base.activeClasses, 'student-minh-anh': [] }, sessions: [], notices: [] }
  if (state === 'no-invoices') return { ...base, invoices: [] }
  if (state === 'zero-wallet') return { ...base, wallets: base.wallets.map((item) => item.studentId === 'student-hai-dang' ? { ...item, availableVnd: '0', transactions: [] } : item) }
  return base
}

export const portalSchedulingData: SchedulingData = {
  ...schedulingFixtures,
  sessions: [...schedulingFixtures.sessions, ...portalFixtures.sessions.map((item) => ({
    id: item.id, date: item.startsAt.slice(0, 10), start: item.startsAt.slice(11, 16), end: item.endsAt.slice(11, 16),
    classId: item.classId, className: item.className, teacherId: item.teacherId,
    teacherName: item.teacherId === portalFixtures.teacherId ? portalFixtures.teacherName : 'Giáo viên lớp',
    roomId: item.room, status: item.status,
  }))],
  classes: [...(schedulingFixtures.classes ?? []), { id: 'class-toan-8a', name: 'Toán 8A', enrollmentCount: 1 }, { id: 'class-toan-8b', name: 'Toán 8B', enrollmentCount: 1 }, { id: 'class-eng-b2', name: 'Tiếng Anh B2', enrollmentCount: 1 }],
  attendees: { ...schedulingFixtures.attendees, ...Object.fromEntries(portalFixtures.sessions.map((item) => [item.id, item.studentIds.map((id) => ({ id, name: portalFixtures.links.find((child) => child.studentId === id)?.name ?? id, enrolledAt: '2026-09-01' }))])) },
}

export function portalScheduleScope(role: 'teacher' | 'student'): PersonalScheduleScope {
  return role === 'teacher'
    ? { mode: 'teacher', label: portalFixtures.teacherName, allowedSessionIds: portalFixtures.sessions.filter((item) => item.teacherId === portalFixtures.teacherId).map((item) => item.id) }
    : { mode: 'student', label: portalFixtures.studentName, allowedSessionIds: portalFixtures.sessions.filter((item) => item.studentIds.includes(portalFixtures.studentId)).map((item) => item.id) }
}

export const portalAttendanceData: AttendanceData = {
  ...attendanceFixtures,
  sampleNow: portalFixtures.sampleNow,
  sessions: [...attendanceFixtures.sessions, ...portalFixtures.sessions.filter((item) => item.status === 'CONFIRMED').map((item) => ({
    id: item.id, classId: item.classId, className: item.className, date: item.startsAt.slice(0, 10), start: item.startsAt.slice(11, 16), end: item.endsAt.slice(11, 16), teacherName: item.teacherId === portalFixtures.teacherId ? portalFixtures.teacherName : 'Giáo viên lớp', expectedCount: item.studentIds.length,
    phase: item.attendance === 'CONFIRMED' ? 'FINALIZED' as const : item.attendance === 'LOCKED' ? 'LOCKED' as const : 'DRAFT' as const,
  }))],
  students: [...attendanceFixtures.students, ...portalFixtures.links.filter((item) => item.status === 'VERIFIED').map((item) => ({ id: item.studentId, name: item.name, enrollmentId: `PORTAL-${item.studentId}`, classId: portalFixtures.activeClasses[item.studentId]?.[0]?.id ?? '' }))],
  rosters: { ...attendanceFixtures.rosters, ...Object.fromEntries(portalFixtures.sessions.map((item) => [item.id, item.studentIds])) },
  records: { ...attendanceFixtures.records, ...Object.fromEntries(portalFixtures.sessions.map((item) => [item.id, item.attendance === 'CONFIRMED' ? item.studentIds.map((studentId) => ({ studentId, status: 'ATTENDED' as const })) : []])) },
  linkedChildIds: portalFixtures.links.filter((item) => item.status === 'VERIFIED').map((item) => item.studentId),
  ownStudentId: portalFixtures.studentId,
}
