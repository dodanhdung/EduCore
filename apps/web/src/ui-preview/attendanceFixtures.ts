import type { AttendanceData } from '../screens/Attendance & Leave/AttendanceTypes.ts'
import { academicFixtures } from './academicFixtures.ts'
import { schedulingFixtures } from './schedulingFixtures.ts'

// Chỉ UI Preview import file này. Quan hệ lớp/học sinh lấy theo Academic; buổi lấy theo Scheduling.
const sessionIds = ['session-eng-19', 'session-ielts-20', 'session-eng-21', 'session-jp-23', 'session-eng-26']
const scheduled = schedulingFixtures.sessions.filter((item) => sessionIds.includes(item.id))
export const attendanceFixtures: AttendanceData = {
  sampleNow: '2026-10-21T08:00:00+07:00', timeZone: 'Asia/Ho_Chi_Minh',
  sessions: scheduled.map((item) => ({ id: item.id, classId: item.classId, className: schedulingFixtures.classes?.find((entry) => entry.id === item.classId)?.name ?? item.className, date: item.date, start: item.start, end: item.end, teacherName: item.teacherName, expectedCount: 1, phase: item.id === 'session-ielts-20' ? 'LOCKED' as const : item.id === 'session-eng-26' || item.id === 'session-jp-23' ? 'DRAFT' as const : 'PARTIAL' as const, ...(item.id === 'session-ielts-20' ? { lockReason: 'Dữ liệu đã dùng phát hành hóa đơn nội bộ (dữ liệu mẫu).', invoiceId: 'INV-DEMO-20' } : {}) })),
  students: academicFixtures.students.filter((item) => ['HS-1028', 'HS-1031', 'HS-1042'].includes(item.id)).map((item) => ({ id: item.id, name: item.name, enrollmentId: `EN-${item.id}`, classId: item.activeClasses[0]?.id ?? '' })),
  rosters: { 'session-eng-19': ['HS-1031'], 'session-ielts-20': ['HS-1028'], 'session-eng-21': ['HS-1031'], 'session-jp-23': ['HS-1042'], 'session-eng-26': ['HS-1031'] },
  records: {
    'session-eng-19': [{ studentId: 'HS-1031', status: 'ATTENDED' }],
    'session-ielts-20': [{ studentId: 'HS-1028', status: 'UNEXCUSED', note: 'Kết quả gốc · Dữ liệu mẫu' }],
    'session-eng-21': [{ studentId: 'HS-1031', status: 'ATTENDED' }],
    'session-jp-23': [],
    'session-eng-26': [],
  },
  leaveRequests: [
    { id: 'leave-01', studentId: 'HS-1031', sessionId: 'session-eng-26', reason: 'Khám bệnh theo lịch hẹn.', submittedAt: '2026-10-20T09:00:00+07:00', status: 'APPROVED', late: false },
    { id: 'leave-02', studentId: 'HS-1031', sessionId: 'session-eng-21', reason: 'Bị sốt.', submittedAt: '2026-10-21T06:30:00+07:00', status: 'PENDING', late: true },
    { id: 'leave-03', studentId: 'HS-1028', sessionId: 'session-ielts-20', reason: 'Bận việc gia đình.', submittedAt: '2026-10-18T09:00:00+07:00', status: 'REJECTED', late: false, decisionReason: 'Chưa đủ căn cứ xác nhận.' },
    { id: 'leave-04', studentId: 'HS-1042', sessionId: 'session-jp-23', reason: 'Xin nghỉ để khám bệnh.', submittedAt: '2026-10-21T08:00:00+07:00', status: 'NEEDS_INFORMATION', late: false },
    { id: 'leave-05', studentId: 'HS-1028', sessionId: 'session-ielts-20', reason: 'Xin nghỉ vì việc gia đình.', submittedAt: '2026-10-18T08:00:00+07:00', status: 'PENDING', late: false },
  ],
  corrections: [
    { id: 'correction-01', sessionId: 'session-ielts-20', studentId: 'HS-1028', original: 'UNEXCUSED', proposed: 'ATTENDED', reason: 'Có bằng chứng dự học, dữ liệu mẫu.', status: 'REJECTED', actor: 'Nhân sự học vụ mẫu', occurredAt: '2026-10-21T03:00:00Z' },
    { id: 'correction-02', sessionId: 'session-eng-19', studentId: 'HS-1031', original: 'UNEXCUSED', proposed: 'ATTENDED', reason: 'Đã đối chiếu danh sách dự học, dữ liệu mẫu.', status: 'APPROVED', actor: 'Nhân sự học vụ mẫu', occurredAt: '2026-10-21T04:00:00Z' },
  ],
  linkedChildIds: ['HS-1031'], ownStudentId: 'HS-1031',
}
