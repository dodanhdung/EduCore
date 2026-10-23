import type { ManagementData, ViewState } from '../screens/Management & Operations/ManagementTypes.ts'

const tenantId = 'demo-hcm-01'
export const managementFixtures: ManagementData = {
  tenantId, tenantName: 'EduCore Quận 1', timezone: 'Asia/Ho_Chi_Minh', asOf: '2026-10-24T03:00:00Z', scope: 'Trung tâm Quận 1 · dữ liệu mẫu',
  dashboard: { students: 1248, classes: 46, outstandingVnd: '84500000' },
  members: [
    { id: 'MB-001', tenantId, name: 'Nguyễn Văn An', email: 'an.nguyen@educore.vn', status: 'ACTIVE', protectedManager: true, assignments: [{ id: 'RA-001', role: 'Manager', scope: 'TENANT', status: 'ACTIVE' }], history: ['17/10/2026 · Kích hoạt thành viên', '17/10/2026 · Gán Manager trong trung tâm'] },
    { id: 'MB-002', tenantId, name: 'Trần Minh Khoa', email: 'khoa.tran@educore.vn', status: 'ACTIVE', assignments: [{ id: 'RA-002', role: 'Academic Staff', scope: 'TENANT', status: 'ACTIVE' }, { id: 'RA-003', role: 'Teacher', scope: 'CLASS', scopeId: 'ENG-B2', status: 'ACTIVE' }], history: ['20/10/2026 · Gán Academic Staff', '21/10/2026 · Gán Teacher · lớp ENG-B2'] },
    { id: 'MB-031', tenantId, name: 'Lê Hoàng Yến', email: 'yen.le@educore.vn', status: 'PENDING_ACTIVATION', assignments: [{ id: 'RA-031', role: 'Teacher', scope: 'CLASS', scopeId: 'IELTS-03', status: 'ACTIVE' }, { id: 'RA-030', role: 'Academic Staff', scope: 'STUDENT', scopeId: 'ST-1028', status: 'REVOKED' }], history: ['23/10/2026 · Tạo membership bởi Nguyễn Văn An', '23/10/2026 · Chờ người dùng yêu cầu OTP kích hoạt'] },
    { id: 'MB-004', tenantId, name: 'Phạm Gia Hưng', email: 'hung.pham@educore.vn', status: 'DISABLED', assignments: [{ id: 'RA-004', role: 'Accountant', scope: 'TENANT', status: 'REVOKED' }], history: ['23/10/2026 · Khóa tài khoản và thu hồi quyền theo yêu cầu'] },
  ],
  relationships: [
    { id: 'REL-01', tenantId, parent: 'Nguyễn Thị Hạnh', parentId: 'P-1028', student: 'Nguyễn Minh Anh', studentId: 'ST-1028', status: 'ACTIVE', evidence: 'Hồ sơ nhập học #HS-1028', verifiedBy: 'Trần Minh Khoa', verifiedAt: '2026-10-22T02:30:00Z' },
    { id: 'REL-02', tenantId, parent: 'Trần Văn Phúc', parentId: 'P-014', student: 'Trần Bảo Ngọc', studentId: 'ST-014', status: 'PENDING_VERIFICATION', evidence: 'Giấy khai sinh #TL-014' },
    { id: 'REL-03', tenantId, parent: 'Lê Thị Mai', parentId: 'P-0884', student: 'Lê Quốc Bảo', studentId: 'ST-0884', status: 'ACTIVE', evidence: 'Hồ sơ nhập học #HS-0884', verifiedBy: 'Nguyễn Văn An', verifiedAt: '2026-10-21T03:00:00Z' },
    { id: 'REL-04', tenantId, parent: 'Phạm Minh Tuấn', parentId: 'P-019', student: 'Phạm Khánh Linh', studentId: 'ST-019', status: 'INACTIVE', evidence: 'Biên bản thu hồi #TL-019' },
  ],
  approvals: [
    { id: 'YC-24018', tenantId, title: 'Điều chỉnh hóa đơn', category: 'Tài chính', target: 'Invoice INV-0241 · ST-1028', requester: 'Phạm Gia Hưng', createdAt: '2026-10-24T02:30:00Z', status: 'PENDING_APPROVAL', reason: 'Điều chỉnh theo biên bản đối chiếu học phí.', evidence: 'Biên bản lớp học #BB-241; giảm 100.000 ₫, giữ hóa đơn gốc.', policy: 'Billing v1.3', correlationId: 'corr-84f1-c2e9', execution: 'NOT_STARTED', history: ['23/10 15:10 · Yêu cầu được tạo', '24/10 09:30 · Chờ quyết định'] },
    { id: 'YC-24017', tenantId, title: 'Hủy hóa đơn', category: 'Tài chính', target: 'Invoice INV-0240', requester: 'Phạm Gia Hưng', createdAt: '2026-10-23T09:12:00Z', status: 'NEEDS_INFORMATION', reason: 'Yêu cầu hủy chứng từ sai.', evidence: 'Cần bổ sung biên bản đối chiếu.', policy: 'Billing v1.3', correlationId: 'corr-98a2-d607', execution: 'NOT_STARTED', history: ['23/10 · Tạo yêu cầu', '24/10 · Yêu cầu bổ sung căn cứ'] },
    { id: 'YC-24016', tenantId, title: 'Điều chỉnh hóa đơn', category: 'Tài chính', target: 'Invoice INV-0239', requester: 'Lê Hoàng Yến', createdAt: '2026-10-22T03:45:00Z', status: 'APPROVED', reason: 'Đối chiếu lại số buổi.', evidence: 'Biên bản #BB-239', policy: 'Billing v1.3', correlationId: 'corr-5d30-e131', execution: 'NOT_STARTED', history: ['22/10 · Tạo yêu cầu', '23/10 · APPROVED · chưa thực thi'] },
    { id: 'YC-24015', tenantId, title: 'Điều chỉnh hóa đơn', category: 'Tài chính', target: 'Invoice INV-0238', requester: 'Phạm Gia Hưng', createdAt: '2026-10-20T07:06:00Z', status: 'COMPLETED', reason: 'Đã đối chiếu đủ căn cứ.', evidence: 'Biên bản #BB-238', policy: 'Billing v1.3', correlationId: 'corr-44b8-ae40', execution: 'COMPLETED', receipt: 'RCPT-238 · adjustment / signed release / wallet credit / audit committed (mẫu)', history: ['20/10 · Tạo yêu cầu', '21/10 · APPROVED', '21/10 · Effect, receipt, audit cùng commit · COMPLETED'] },
    { id: 'YC-24014', tenantId, title: 'Hủy hóa đơn', category: 'Tài chính', target: 'Invoice INV-0237', requester: 'Trần Minh Khoa', createdAt: '2026-10-19T03:00:00Z', status: 'REJECTED', reason: 'Chưa đủ căn cứ hủy.', evidence: 'Biên bản thiếu xác nhận.', policy: 'Billing v1.3', correlationId: 'corr-237', execution: 'NOT_STARTED', history: ['19/10 · Tạo yêu cầu', '20/10 · REJECTED · không thực thi'] },
  ],
  // Preview-only redacted projection. Production requires an independently reviewed server DTO.
  audit: [
    { id: 'AUD-1024', tenantId, action: 'MEMBER_ROLE_ASSIGNED', target: 'Membership MB-031', actor: 'Nguyễn Văn An', at: '2026-10-24T02:42:00Z', result: 'Thành công', reason: 'Cập nhật phạm vi lớp.', policy: 'IAM v1.1', correlationId: 'corr-84f1-c2e9' },
    { id: 'AUD-1023', tenantId, action: 'APPROVAL_REQUESTED', target: 'Invoice INV-0241', actor: 'Phạm Gia Hưng', at: '2026-10-24T02:30:00Z', result: 'Chờ duyệt', reason: 'Đối chiếu học phí.', policy: 'Billing v1.3', correlationId: 'corr-84f1-c2e9' },
    { id: 'AUD-1022', tenantId, action: 'WALLET_PAYMENT_APPLIED', target: 'Invoice INV-0240', actor: 'Phạm Gia Hưng', at: '2026-10-24T01:51:00Z', result: 'Thành công', reason: 'Trả hóa đơn bằng ví theo xác nhận.', policy: 'Billing v1.3', correlationId: 'corr-98a2-d607' },
    { id: 'AUD-1021', tenantId, action: 'MEMBER_ACCESS_DENIED', target: 'Membership MB-099', actor: 'Lê Hoàng Yến', at: '2026-10-23T10:10:00Z', result: 'Thất bại', reason: 'Không đủ quyền.', policy: 'IAM v1.1', correlationId: 'corr-denied' },
  ].map((a) => ({ ...a, safeProjection: { target: a.target, actor: a.actor, reason: a.reason } })),
  jobs: [
    { id: 'JB-2417', tenantId, kind: 'Lập hóa đơn', source: 'Billing', policy: 'Billing v1.3', status: 'FAILED', attemptCount: 2, correlationId: 'corr-84f1-c2e9', operationKey: 'billing-root-2417', error: 'Xung đột dữ liệu đầu vào; kiểm tra điều kiện trước khi chạy lại.', attempts: ['Lần 1 · Lỗi khóa tạm thời', 'Lần 2 · Thất bại khi kiểm tra nguồn'] },
    { id: 'JB-2416', tenantId, kind: 'Kiểm tra lịch', source: 'Scheduling', policy: 'Scheduling v1.1', status: 'COMPLETED', attemptCount: 1, correlationId: 'corr-98a2-d607', operationKey: 'schedule-root-2416', hasEffectReceipt: true, attempts: ['Lần 1 · COMPLETED'] },
    { id: 'JB-2415', tenantId, kind: 'Kiểm tra lịch', source: 'Scheduling', policy: 'Scheduling v1.1', status: 'RUNNING', attemptCount: 1, correlationId: 'corr-5d30-e131', operationKey: 'schedule-root-2415', attempts: ['Lần 1 · Đang chạy'] },
    { id: 'JB-2414', tenantId, kind: 'Lập hóa đơn', source: 'Billing', policy: 'Billing v1.3', status: 'NEEDS_INFORMATION', attemptCount: 3, correlationId: 'corr-44b8-ae40', operationKey: 'billing-root-2414', error: 'Thiếu điểm danh đã xác nhận.', attempts: ['Lần 1–3 · Dừng chờ bổ sung dữ liệu'] },
    { id: 'JB-2413', tenantId, kind: 'Lập hóa đơn', source: 'Billing', policy: 'Billing v1.3', status: 'FAILED', attemptCount: 4, correlationId: 'corr-exhausted', operationKey: 'billing-root-2413', error: 'ATTEMPTS_EXHAUSTED', attempts: ['Lần 1 · Lỗi tạm thời', 'Retry 1 sau 1 phút', 'Retry 2 sau 5 phút', 'Retry 3 sau 15 phút · Hết lượt'] },
    { id: 'JB-2412', tenantId, kind: 'Kiểm tra lịch', source: 'Scheduling', policy: 'Scheduling v1.1', status: 'READY', attemptCount: 0, correlationId: 'corr-queued', operationKey: 'schedule-root-2412', attempts: [] },
    { id: 'JB-2411', tenantId, kind: 'Lập hóa đơn', source: 'Billing', policy: 'Billing v1.3', status: 'PENDING_APPROVAL', attemptCount: 1, correlationId: 'corr-approval', operationKey: 'billing-root-2411', attempts: ['Lần 1 · Chờ phê duyệt'] },
  ],
  sessions: [
    { id: 'SE-01', name: 'Tiếng Anh Giao Tiếp B2', time: '18:00–19:30', teacher: 'Thầy David Trần', room: '201 · Tầng 2', status: 'Đang chuẩn bị' },
    { id: 'SE-02', name: 'IELTS Master 6.5+', time: '18:30–20:30', teacher: 'Cô Mai Phương', room: '302 · Tầng 3', status: 'Sắp diễn ra' },
    { id: 'SE-03', name: 'Lập trình Scratch', time: '17:30–19:00', teacher: 'Thầy Quốc Bảo', room: 'Lab 1 · Tầng 1', status: 'Đang diễn ra' },
  ],
  receivables: [
    { id: 'INV-01', student: 'Trần Minh Khoa', amountVnd: '4200000', note: 'IELTS Master · Quá hạn 5 ngày' },
    { id: 'INV-02', student: 'Lê Hoàng Yến Nhi', amountVnd: '3500000', note: 'Giao tiếp B2 · Quá hạn 3 ngày' },
  ],
}

export function managementScenario(value: string | null): { data: ManagementData; state: ViewState } {
  const data = structuredClone(managementFixtures)
  const states: ViewState[] = ['loading', 'unauthenticated', 'forbidden', 'not-found', 'conflict', 'invalid', 'error']
  const state = states.includes(value as ViewState) ? value as ViewState : 'ready'
  if (value === 'empty') { data.dashboard = { students: 0, classes: 0, outstandingVnd: '0' }; for (const key of ['members', 'relationships', 'approvals', 'audit', 'jobs', 'sessions', 'receivables'] as const) data[key] = [] }
  if (value === 'partial') data.dashboard.outstandingVnd = null
  if (value === 'failed' || value === 'approved' || value === 'self-approved') {
    data.approvals[0].status = 'APPROVED'
    data.approvals[0].history.push('24/10 · APPROVED · Chưa hoàn tất')
    if (value === 'failed') { data.approvals[0].execution = 'FAILED'; data.approvals[0].executionError = 'Dữ liệu nguồn đã thay đổi'; data.approvals[0].history.push('24/10 · Thực thi thất bại; giữ quyết định') }
    if (value === 'self-approved') { data.approvals[0].selfApproved = true; data.approvals[0].history.push('24/10 · SELF_APPROVED · Lý do: chỉ một Manager đủ quyền') }
  }
  return { data, state }
}
