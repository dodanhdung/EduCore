export type AttendanceStatus = 'ATTENDED' | 'EXCUSED' | 'UNEXCUSED'
export type AttendancePhase = 'DRAFT' | 'PARTIAL' | 'FINALIZED' | 'LOCKED'
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFORMATION'

export type AttendanceSession = {
  id: string; classId: string; className: string; date: string; start: string; end: string;
  teacherName: string; expectedCount: number; phase: AttendancePhase; invoiceId?: string;
  lockReason?: string; lockAt?: string
}
export type AttendanceStudent = { id: string; name: string; enrollmentId: string; classId: string }
export type AttendanceRecord = { studentId: string; status?: AttendanceStatus; note?: string }
export type LeaveRequest = {
  id: string; studentId: string; sessionId: string; reason: string; submittedAt: string;
  status: LeaveStatus; late: boolean; decisionReason?: string
}
export type Correction = {
  id: string; sessionId: string; studentId: string; original: AttendanceStatus;
  proposed: AttendanceStatus; reason: string; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  actor?: string; occurredAt?: string
}
export type AttendanceData = {
  sessions: AttendanceSession[]; students: AttendanceStudent[];
  rosters: Record<string, string[]>; records: Record<string, AttendanceRecord[]>;
  leaveRequests: LeaveRequest[]; corrections: Correction[];
  linkedChildIds: string[]; ownStudentId?: string; timeZone: string; sampleNow: string
}
export type AttendanceRole = 'teacher' | 'student' | 'parent' | 'staff'
