import type { AssignmentData } from '../Assignments & Grading/AssignmentTypes.ts'
import type { BillingInvoice, StudentWallet } from '../Billing & Receivables/BillingTypes.ts'

export type PortalSession = { id: string; studentIds: string[]; teacherId: string; classId: string; className: string; startsAt: string; endsAt: string; room: string; status: 'CONFIRMED' | 'CANCELLED'; attendance: 'CONFIRMED' | 'PENDING' | 'LOCKED' | 'NOT_DUE' }
export type ChildLink = { studentId: string; name: string; status: 'VERIFIED' | 'REVOKED' | 'INACTIVE' | 'UNVERIFIED' }
export type PortalNotice = { id: string; recipientId: string; text: string; occurredAt: string }
export type PortalData = {
  sampleNow: string; timeZone: string; teacherId: string; teacherName: string; studentId: string; studentName: string;
  sessions: PortalSession[]; assignments: AssignmentData; links: ChildLink[];
  activeClasses: Record<string, { id: string; name: string }[]>;
  leaveRequests: { id: string; studentId: string; status: string; sessionId: string }[];
  notices: PortalNotice[]; invoices: BillingInvoice[]; wallets: StudentWallet[];
}

export function verifiedChildren(data: PortalData) { return data.links.filter((link) => link.status === 'VERIFIED') }
export function authorizedChild(data: PortalData, id: string | null | undefined) { return id ? verifiedChildren(data).find((link) => link.studentId === id) : undefined }
export function studentVisibleAssignments(data: PortalData, studentId: string) {
  return data.assignments.assignments.filter((item) => item.status !== 'DRAFT' && item.recipientIds.includes(studentId))
}
export function publishedResult(data: PortalData, assignmentId: string, studentId: string) {
  const submission = data.assignments.submissions.find((item) => item.assignmentId === assignmentId && item.studentId === studentId)
  return submission?.grade?.status === 'PUBLISHED' ? submission.grade : undefined
}
