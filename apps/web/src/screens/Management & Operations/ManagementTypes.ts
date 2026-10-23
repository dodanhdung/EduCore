import { createContext, useContext } from 'react'

export const ManagementPreviewContext = createContext(false)
export const useManagementPreview = () => useContext(ManagementPreviewContext)

export const managementIds = ['G01', 'OP01', 'OP02', 'OP03', 'OP04', 'OP05', 'OP06', 'OP07'] as const
export type ManagementId = typeof managementIds[number]
export type ViewState = 'ready' | 'loading' | 'empty' | 'unauthenticated' | 'forbidden' | 'not-found' | 'conflict' | 'invalid' | 'error'
export type Assignment = { id: string; role: string; scope: 'TENANT' | 'CLASS' | 'STUDENT'; scopeId?: string; status: 'ACTIVE' | 'REVOKED' }
export type Member = { id: string; tenantId: string; name: string; email: string; status: 'ACTIVE' | 'PENDING_ACTIVATION' | 'DISABLED'; assignments: Assignment[]; history: string[]; protectedManager?: boolean }
export type Relationship = { id: string; tenantId: string; parent: string; parentId?: string; student: string; studentId?: string; evidence: string; status: 'PENDING_VERIFICATION' | 'ACTIVE' | 'INACTIVE'; verifiedBy?: string; verifiedAt?: string }
export type WorkflowStatus = 'PENDING_APPROVAL' | 'NEEDS_INFORMATION' | 'APPROVED' | 'COMPLETED' | 'REJECTED'
export type Approval = { id: string; tenantId: string; title: string; category: string; target: string; requester: string; createdAt: string; status: WorkflowStatus; reason: string; evidence: string; policy: string; correlationId: string; execution: 'NOT_STARTED' | 'FAILED' | 'COMPLETED'; executionError?: string; selfApproved?: boolean; history: string[]; receipt?: string }
export type AuditEvent = { id: string; tenantId: string; action: string; target: string; actor: string; at: string; result: string; reason: string; policy: string; correlationId: string; safeProjection?: { target: string; actor: string; reason: string } }
export type Job = { id: string; tenantId: string; kind: string; source: string; policy: string; status: 'READY' | 'RUNNING' | 'FAILED' | 'NEEDS_INFORMATION' | 'PENDING_APPROVAL' | 'COMPLETED'; attemptCount: number; correlationId: string; operationKey: string; error?: string; attempts: string[]; hasEffectReceipt?: boolean; remediationEvidence?: string }
export type ManagementData = { tenantId: string; tenantName: string; timezone: string; asOf: string; scope: string; dashboard: { students: number | null; classes: number | null; outstandingVnd: string | null }; members: Member[]; relationships: Relationship[]; approvals: Approval[]; audit: AuditEvent[]; jobs: Job[]; sessions: { id: string; name: string; time: string; teacher: string; room: string; status: string }[]; receivables: { id: string; student: string; amountVnd: string; note: string }[] }
export type ScreenProps = { data: ManagementData; selectedId?: string; canReview: boolean; open?: (screen: string, recordId?: string) => void }

export const labels: Record<string, string> = {
  ACTIVE: 'Đang hiệu lực', PENDING_ACTIVATION: 'Chờ kích hoạt', DISABLED: 'Đã khóa', REVOKED: 'Đã thu hồi', INACTIVE: 'Đã thu hồi', PENDING_VERIFICATION: 'Chờ xác minh',
  PENDING_APPROVAL: 'Chờ phê duyệt', NEEDS_INFORMATION: 'Cần bổ sung', APPROVED: 'Đã duyệt · chờ thực thi', COMPLETED: 'Đã hoàn thành', REJECTED: 'Đã từ chối', FAILED: 'Thất bại', READY: 'Đang chờ', RUNNING: 'Đang chạy', NOT_STARTED: 'Chưa thực thi',
  TENANT: 'Trung tâm', CLASS: 'Lớp', STUDENT: 'Học sinh',
  EXECUTION_FAILED: 'Thực thi thất bại',
}
export const money = (value: string | null) => value === null ? 'Chưa có quyền xem' : `${BigInt(value).toLocaleString('vi-VN')} ₫`
export const dateTime = (value: string, timezone: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
export function retryCandidate(job: Job) { return ['FAILED', 'NEEDS_INFORMATION'].includes(job.status) && job.attemptCount >= 1 && job.attemptCount < 4 && !job.hasEffectReceipt }
export function retryReadyForReview(job: Job) { return retryCandidate(job) && job.status === 'FAILED' && !!job.remediationEvidence?.trim() }
/** Compatibility for existing callers: candidate only; never authorization. */
export const retryEligible = retryCandidate
export function roleValidation(values: Record<string, string>, assignments: Assignment[]) {
  if (!values.role || !values.scope || !values.reason?.trim()) return 'Chọn role, phạm vi và nhập lý do.'
  if (values.scope !== 'TENANT' && !values.scopeId?.trim()) return 'Nhập mã lớp hoặc học sinh cho phạm vi đã chọn.'
  if (assignments.some((a) => a.status === 'ACTIVE' && a.role === values.role && a.scope === values.scope && (a.scopeId ?? '') === (values.scope === 'TENANT' ? '' : values.scopeId))) return 'Role và phạm vi này đã có hiệu lực.'
  return undefined
}
