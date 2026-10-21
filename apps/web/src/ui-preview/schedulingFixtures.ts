import type { PersonalScheduleScope, SchedulingData } from '../screens/Scheduling & Resources/SchedulingTypes.ts'
import type { ScheduleConflict } from '../screens/Scheduling & Resources/SC04/ConflictPanel.tsx'

// Dữ liệu minh họa chỉ được import bởi UI Preview trong môi trường phát triển.
export const schedulingFixtures: SchedulingData = {
  sessions: [
    { id: 'session-eng-19', date: '2026-10-19', start: '18:00', end: '19:30', classId: 'ENG-B2', className: 'ENG-B2', teacherId: 'GV-018', teacherName: 'Đặng Văn Trần', roomId: 'P.201', status: 'CONFIRMED' },
    { id: 'session-ielts-20', date: '2026-10-20', start: '18:30', end: '20:30', classId: 'IELTS-03', className: 'IELTS-03', teacherId: 'GV-023', teacherName: 'Mai Phương', roomId: 'P.302', status: 'CONFIRMED' },
    { id: 'session-math-21', date: '2026-10-21', start: '17:00', end: '18:30', classId: 'MATH-01', className: 'Toán tư duy', teacherId: 'GV-044', teacherName: 'Bích Thảo', roomId: 'P.205', status: 'CONFIRMED' },
    { id: 'session-eng-21', date: '2026-10-21', start: '18:00', end: '19:30', classId: 'ENG-B2', className: 'ENG-B2', teacherId: 'GV-018', teacherName: 'Đặng Văn Trần', roomId: 'P.201', status: 'CONFIRMED' },
    { id: 'session-ielts-22', date: '2026-10-22', start: '18:30', end: '20:30', classId: 'IELTS-03', className: 'IELTS-03', teacherId: 'GV-023', teacherName: 'Mai Phương', roomId: 'P.302', status: 'DRAFT' },
    { id: 'session-jp-23', date: '2026-10-23', start: '18:30', end: '20:00', classId: 'JP-N4', className: 'Nhật N4', teacherId: 'GV-031', teacherName: 'Kenji Sato', roomId: 'P.104', status: 'CONFIRMED' },
    { id: 'session-cancelled-21', date: '2026-10-21', start: '19:30', end: '21:00', classId: 'OLD-01', className: 'Lớp cũ đã hủy', teacherId: 'GV-018', teacherName: 'Đặng Văn Trần', roomId: 'P.301', status: 'CANCELLED' },
    { id: 'session-eng-26', date: '2026-10-26', start: '18:00', end: '19:30', classId: 'ENG-B2', className: 'ENG-B2', teacherId: 'GV-018', teacherName: 'Đặng Văn Trần', roomId: 'P.201', status: 'CONFIRMED' },
    { id: 'session-eng-c1-23', date: '2026-10-23', start: '17:00', end: '18:30', classId: 'ENG-C1', className: 'ENG-C1', teacherId: 'GV-018', teacherName: 'Đặng Văn Trần', roomId: 'P.304', status: 'DRAFT' },
  ],
  rooms: [
    { id: 'P.201', name: 'Phòng Giao tiếp', location: 'Tầng 2 · Quận 1', capacity: 20, status: 'ACTIVE' },
    { id: 'P.302', name: 'Phòng IELTS', location: 'Tầng 3 · Quận 1', capacity: 18, status: 'ACTIVE' },
    { id: 'P.104', name: 'Phòng Nhật ngữ', location: 'Tầng 1 · Quận 1', capacity: 12, status: 'ACTIVE' },
    { id: 'P.301', name: 'Phòng đa năng', location: 'Tầng 3 · Quận 1', capacity: 24, status: 'INACTIVE' },
    { id: 'P.205', name: 'Phòng Toán', location: 'Tầng 2 · Quận 1', capacity: 16, status: 'ACTIVE' },
    { id: 'P.304', name: 'Phòng Giao tiếp C1', location: 'Tầng 3 · Quận 1', capacity: 24, status: 'ACTIVE' },
  ],
  classes: [
    { id: 'ENG-B2', name: 'Tiếng Anh Giao Tiếp B2', enrollmentCount: 18 },
    { id: 'IELTS-03', name: 'IELTS Foundation', enrollmentCount: 16 },
    { id: 'MATH-01', name: 'Toán tư duy', enrollmentCount: 14 },
    { id: 'JP-N4', name: 'Nhật ngữ N4', enrollmentCount: 10 },
    { id: 'ENG-C1', name: 'Giao tiếp C1', enrollmentCount: 26 },
  ],
  attendees: {
    'session-eng-19': [
      { id: 'HS-1028', name: 'Nguyễn Minh Anh', enrolledAt: '2026-09-01' },
      { id: 'HS-1031', name: 'Trần Bảo Ngọc', enrolledAt: '2026-09-15' },
      { id: 'HS-1042', name: 'Phạm Khánh Linh', enrolledAt: '2026-10-01' },
    ],
    'session-eng-26': [
      { id: 'HS-1028', name: 'Nguyễn Minh Anh', enrolledAt: '2026-09-01' },
      { id: 'HS-1031', name: 'Trần Bảo Ngọc', enrolledAt: '2026-09-15' },
      { id: 'HS-1042', name: 'Phạm Khánh Linh', enrolledAt: '2026-10-01' },
    ],
  },
  blocks: [
    { id: 'block-room-302', resourceId: 'P.302', resourceName: 'P.302 · Phòng IELTS', date: '2026-10-21', start: '08:00', end: '12:00', reason: 'Bảo trì thiết bị', status: 'CONFIRMED' },
    { id: 'block-teacher-018', resourceId: 'GV-018', resourceName: 'Đặng Văn Trần', date: '2026-10-22', start: '17:00', end: '19:00', reason: 'Không khả dụng', status: 'CONFIRMED' },
    { id: 'block-room-201', resourceId: 'P.201', resourceName: 'P.201 · Phòng Giao tiếp', date: '2026-10-23', start: '14:00', end: '16:00', reason: 'Đặt phòng đã hủy', status: 'CANCELLED' },
  ],
}

export const schedulingConflictFixtures: Record<'one' | 'many' | 'race', ScheduleConflict[]> = {
  one: [{ id: 'conflict-room-1', source: 'room', date: '2026-10-30', start: '17:00', end: '18:30', affectedSession: 'Buổi 02', resource: 'ENG-C1 · Phòng P.304', reason: 'Phòng P.304 đã có lớp JPN-N4 từ 17:30–19:00.' }],
  many: [
    { id: 'conflict-room-1', source: 'room', date: '2026-10-30', start: '17:00', end: '18:30', affectedSession: 'Buổi 02', resource: 'ENG-C1 · Phòng P.304', reason: 'Phòng P.304 đã có lớp JPN-N4 từ 17:30–19:00.' },
    { id: 'conflict-teacher-2', source: 'teacher', date: '2026-11-06', start: '17:00', end: '18:30', affectedSession: 'Buổi 03', resource: 'ENG-C1 · Đặng Văn Trần', reason: 'Giáo viên có lịch bận đã xác nhận từ 16:30–18:00.' },
    { id: 'conflict-capacity-3', source: 'capacity', date: '2026-10-30', start: '17:00', end: '18:30', affectedSession: 'Kiểm tra sức chứa lớp', resource: 'Lớp 26 học sinh · Phòng P.304 có 24 chỗ', reason: 'Không thể xác nhận buổi học nếu số người vượt sức chứa.' },
    { id: 'conflict-student-4', source: 'student', date: '2026-11-06', start: '17:00', end: '18:30', affectedSession: 'Buổi 03', resource: 'Học sinh trong ENG-C1', reason: 'Một học sinh đã có buổi khác giao giờ; chi tiết phải theo phạm vi được cấp quyền.' },
    { id: 'conflict-block-5', source: 'unavailability', date: '2026-11-06', start: '17:00', end: '18:30', affectedSession: 'Buổi 03', resource: 'Giáo viên Đặng Văn Trần', reason: 'Lịch bận đã xác nhận giao với giờ dự kiến.' },
  ],
  race: [{ id: 'conflict-race-1', source: 'room', date: '2026-10-30', start: '17:00', end: '18:30', affectedSession: 'Buổi 02', resource: 'ENG-C1 · Phòng P.304', reason: 'Một người khác vừa xác nhận phòng P.304 cho lớp JPN-N4 từ 17:30–19:00.' }],
}

export const personalScheduleScopes: Record<'teacher' | 'student' | 'parent', PersonalScheduleScope> = {
  teacher: { mode: 'teacher', label: 'Giáo viên Đặng Văn Trần', allowedSessionIds: ['session-eng-19', 'session-eng-21', 'session-eng-c1-23', 'session-eng-26', 'session-cancelled-21'] },
  student: { mode: 'student', label: 'Học viên Nguyễn Minh Khôi', allowedSessionIds: ['session-eng-19', 'session-eng-21', 'session-eng-26'] },
  parent: { mode: 'parent', label: 'Phụ huynh Nguyễn Thị Mai', allowedSessionIds: [], children: [
    { id: 'child-minh-khoi', name: 'Nguyễn Minh Khôi · ENG-B2', allowedSessionIds: ['session-eng-19', 'session-eng-21', 'session-eng-26'] },
    { id: 'child-minh-an', name: 'Nguyễn Minh An · JP-N4', allowedSessionIds: ['session-jp-23'] },
  ] },
}
