import { useState } from 'react'
import type { Session, Tenant } from '../auth.ts'
import { TenantSelectionScreen } from '../screens/Authentication & Shared/AU02/TenantSelectionScreen.tsx'
import { ProfileScreen } from '../screens/Authentication & Shared/AU05/ProfileScreen.tsx'
import { NotificationScreen } from '../screens/Authentication & Shared/GL01/NotificationScreen.tsx'
import { AcademicScreen } from '../screens/Academic Management/AcademicScreens.tsx'
import type { AcademicId } from '../screens/Academic Management/AcademicScreens.tsx'
import { academicFixtures } from './academicFixtures.ts'
import { academicMoreFixtures } from './academicMoreFixtures.ts'
import { personalScheduleScopes, schedulingConflictFixtures, schedulingFixtures, schedulingPreviewClock } from './schedulingFixtures.ts'
import { CentralScheduleScreen } from '../screens/Scheduling & Resources/SC01/CentralScheduleScreen.tsx'
import { ResourcesScreen } from '../screens/Scheduling & Resources/SC02/ResourcesScreen.tsx'
import { CreateScheduleScreen } from '../screens/Scheduling & Resources/SC03/CreateScheduleScreen.tsx'
import { SessionDetailScreen } from '../screens/Scheduling & Resources/SC05/SessionDetailScreen.tsx'
import { PersonalScheduleScreen } from '../screens/Scheduling & Resources/SC06/PersonalScheduleScreen.tsx'
import { AttendanceSessionListScreen } from '../screens/Attendance & Leave/AT01/AttendanceSessionListScreen.tsx'
import { AttendanceSheetScreen } from '../screens/Attendance & Leave/AT02/AttendanceSheetScreen.tsx'
import { LeaveRequestFormScreen } from '../screens/Attendance & Leave/AT03/LeaveRequestFormScreen.tsx'
import { LeaveRequestListScreen } from '../screens/Attendance & Leave/AT04/LeaveRequestListScreen.tsx'
import { attendanceFixtures } from './attendanceFixtures.ts'
import { billingFixtures } from './billingFixtures.ts'
import { PriceRulesScreen } from '../screens/Billing & Receivables/BL01/PriceRulesScreen.tsx'
import { SiblingDiscountScreen } from '../screens/Billing & Receivables/BL02/SiblingDiscountScreen.tsx'
import { BillingPeriodsScreen } from '../screens/Billing & Receivables/BL03/BillingPeriodsScreen.tsx'
import { DraftInvoiceListScreen } from '../screens/Billing & Receivables/BL04/DraftInvoiceListScreen.tsx'
import { DraftInvoiceReviewScreen } from '../screens/Billing & Receivables/BL05/DraftInvoiceReviewScreen.tsx'
import { IssuedInvoiceListScreen } from '../screens/Billing & Receivables/BL06/IssuedInvoiceListScreen.tsx'
import { InvoiceDetailScreen } from '../screens/Billing & Receivables/BL07/InvoiceDetailScreen.tsx'
import { ReceivablesWalletScreen } from '../screens/Billing & Receivables/BL09/ReceivablesWalletScreen.tsx'
import { InvoiceAdjustmentScreen } from '../screens/Billing & Receivables/BL10/InvoiceAdjustmentScreen.tsx'
import { TeacherAssignmentListScreen } from '../screens/Assignments & Grading/AS01/TeacherAssignmentListScreen.tsx'
import { AssignmentEditorScreen } from '../screens/Assignments & Grading/AS02/AssignmentEditorScreen.tsx'
import { AssignmentDetailScreen } from '../screens/Assignments & Grading/AS03/AssignmentDetailScreen.tsx'
import { GradingQueueScreen } from '../screens/Assignments & Grading/AS04/GradingQueueScreen.tsx'
import { GradeSubmissionScreen } from '../screens/Assignments & Grading/AS05/GradeSubmissionScreen.tsx'
import { MyAssignmentsScreen } from '../screens/Assignments & Grading/AS06/MyAssignmentsScreen.tsx'
import { MyAssignmentDetailScreen, ParentAssignmentDetailScreen } from '../screens/Assignments & Grading/AS07/MyAssignmentDetailScreen.tsx'
import { assignmentFixtures } from './assignmentFixtures.ts'
import { portalAttendanceData, portalFixtures, portalScenario, portalScheduleScope, portalSchedulingData } from './portalFixtures.ts'
import { TeacherHomeScreen } from '../screens/Role Portals/PO01/TeacherHomeScreen.tsx'
import { StudentHomeScreen } from '../screens/Role Portals/PO02/StudentHomeScreen.tsx'
import { ParentHomeScreen } from '../screens/Role Portals/PO03/ParentHomeScreen.tsx'
import { ChildLearningScreen } from '../screens/Role Portals/PO04/ChildLearningScreen.tsx'
import { MyBillingScreen } from '../screens/Role Portals/PO05/MyBillingScreen.tsx'
import { portalPreviewPath } from '../screens/Role Portals/PortalNavigation.ts'
import { authorizedChild } from '../screens/Role Portals/PortalTypes.ts'
import { TopUpReversalDialog } from '../screens/Billing & Receivables/BL11/TopUpReversalDialog.tsx'
import type { WalletFeedback } from '../screens/Billing & Receivables/BL08/WalletOperationDialogs.tsx'
import { AcademicMoreScreen } from '../screens/Academic Management/AcademicMoreScreens.tsx'
import { AcademicCatalogStatusView } from '../screens/Academic Management/AcademicCatalogViews.tsx'
import type { MoreId } from '../screens/Academic Management/AcademicMoreScreens.tsx'
import { AppShell } from '../App.tsx'
import { routes } from '../routes.ts'
import './preview.css'
import { ManagementScreen } from '../screens/Management & Operations/ManagementScreens.tsx'
import { managementIds } from '../screens/Management & Operations/ManagementTypes.ts'
import type { ManagementId } from '../screens/Management & Operations/ManagementTypes.ts'
import { managementScenario } from './managementFixtures.ts'

type PreviewScreenId = ManagementId | 'AU02' | 'AU05' | 'GL01' | AcademicId | MoreId | 'AC09' | 'SC01' | 'SC02' | 'SC03' | 'SC05' | 'SC06' | 'AT01' | 'AT02' | 'AT03' | 'AT04' | 'AT05' | 'BL01' | 'BL02' | 'BL03' | 'BL04' | 'BL05' | 'BL06' | 'BL07' | 'BL08' | 'BL09' | 'BL10' | 'BL11' | 'AS01' | 'AS02' | 'AS03' | 'AS04' | 'AS05' | 'AS06' | 'AS07' | 'PO01' | 'PO02' | 'PO03' | 'PO04' | 'PO05'

const sampleTenants: Tenant[] = [
  { id: 'demo-hcm-01', name: 'EduCore Quận 1' },
  { id: 'demo-hn-01', name: 'EduCore Cầu Giấy' },
]

const sampleSession: Session = {
  accessToken: 'PREVIEW_ONLY',
  csrfToken: 'PREVIEW_ONLY',
  expiresAt: new Date('2026-10-22T17:00:00+07:00').getTime(),
  tenantEpoch: 1,
  principal: {
    id: 'user-demo-001',
    sessionId: 'session-demo-001',
    tenantId: sampleTenants[0].id,
    allowedTenants: sampleTenants,
  },
}

const sampleNotifications = [
  {
    id: 'notice-demo-001',
    title: 'Lịch học đã được cập nhật',
    body: 'Buổi học Toán lớp 6A được chuyển sang 16:00, thứ Hai, ngày 26/10.',
    createdAt: '2026-10-20T08:30:00+07:00',
    read: false,
  },
  {
    id: 'notice-demo-002',
    title: 'Bài tập mới được giao',
    body: 'Bài tập “Phân số cơ bản” cần hoàn thành trước ngày 30/10.',
    createdAt: '2026-10-19T14:15:00+07:00',
    read: false,
  },
  {
    id: 'notice-demo-003',
    title: 'Chào mừng bạn đến với EduCore',
    body: 'Đây là thông báo mẫu đã đọc để xem trạng thái trong danh sách.',
    createdAt: '2026-10-17T09:00:00+07:00',
    read: true,
  },
]

export function PreviewApp({ screenId, navigation }: { screenId: string; navigation?: (path: string) => void }) {
  const [selectedTenantId, setSelectedTenantId] = useState(sampleTenants[0].id)
  if (!(['AU02', 'AU05', 'GL01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09', 'SC01', 'SC02', 'SC03', 'SC05', 'SC06', 'AT01', 'AT02', 'AT03', 'AT04', 'AT05', 'BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL08', 'BL09', 'BL10', 'BL11', 'AS01', 'AS02', 'AS03', 'AS04', 'AS05', 'AS06', 'AS07', 'PO01', 'PO02', 'PO03', 'PO04', 'PO05', ...managementIds] as string[]).includes(screenId)) {
    return <main className="ui-preview"><p role="alert">Màn hình preview không hợp lệ.</p></main>
  }

  const id = screenId as PreviewScreenId
  const selectedTenant = sampleTenants.find((tenant) => tenant.id === selectedTenantId) ?? sampleTenants[0]
  const navigate = navigation ?? ((path: string) => { window.location.assign(path) })
  const query = new URLSearchParams(window.location.search)
  const previewState = query.get('state')
  const conflictSet = previewState === 'one' || previewState === 'race' ? schedulingConflictFixtures[previewState] : previewState === 'conflict' ? schedulingConflictFixtures.many : []
  const personalRole = query.get('role') === 'parent' || query.get('role') === 'student' ? query.get('role') as 'parent' | 'student' : 'teacher'
  const personalScope = query.get('source') === 'portal' && personalRole !== 'parent' ? portalScheduleScope(personalRole) : previewState === 'empty' ? { ...personalScheduleScopes[personalRole], allowedSessionIds: [], children: personalScheduleScopes[personalRole].children?.map((child) => ({ ...child, allowedSessionIds: [] })) } : personalScheduleScopes[personalRole]
  const selectedId = id === 'AC02' ? (query.get('studentId') ?? academicFixtures.students[0].id)
    : id === 'AC04' ? (query.get('teacherId') ?? academicFixtures.teachers[0].id)
      : (query.get('classId') ?? academicMoreFixtures.classes[0].code)
  const attendanceRole = query.get('role') === 'parent' || query.get('role') === 'student' || query.get('role') === 'staff' ? query.get('role') as 'parent' | 'student' | 'staff' : 'teacher'
  const portalData = portalScenario(previewState)
  const attendanceState = previewState === 'loading' || previewState === 'forbidden' || previewState === 'error' ? previewState : 'ready'
  const attendanceData = query.get('source') === 'portal' ? portalAttendanceData : previewState === 'empty' ? { ...attendanceFixtures, sessions: [], leaveRequests: [] } : previewState === 'finalized' || previewState === 'approved' ? { ...attendanceFixtures, sampleNow: previewState === 'approved' ? '2026-10-21T12:00:00+07:00' : attendanceFixtures.sampleNow, sessions: attendanceFixtures.sessions.map((item) => item.id === 'session-eng-19' ? { ...item, phase: previewState === 'approved' ? 'LOCKED' as const : 'FINALIZED' as const, ...(previewState === 'approved' ? { lockReason: 'Đã quá 48 giờ từ cuối buổi (dữ liệu mẫu).' } : {}) } : item) } : attendanceFixtures
  const portalChildId = query.get('source') === 'portal' ? authorizedChild(portalData, query.get('studentId'))?.studentId : undefined
  const leaveFormData = query.get('source') === 'portal' ? { ...portalAttendanceData, linkedChildIds: portalChildId && portalAttendanceData.linkedChildIds.includes(portalChildId) ? [portalChildId] : [] } : previewState === 'duplicate' ? attendanceFixtures : { ...attendanceFixtures, sampleNow: previewState === 'late' ? '2026-10-26T10:00:00+07:00' : attendanceFixtures.sampleNow, leaveRequests: attendanceFixtures.leaveRequests.filter((item) => item.id !== 'leave-01') }
  const attendanceSessionId = query.get('sessionId') ?? (previewState === 'approved' ? 'session-eng-19' : id === 'AT05' || previewState === 'locked' ? 'session-ielts-20' : previewState === 'finalized' ? 'session-eng-19' : previewState === 'draft' ? 'session-eng-26' : 'session-eng-21')
  const billingReadOnly = query.get('source') === 'portal' || query.get('role') === 'parent' || query.get('role') === 'student'
  const portalBillingStudentId = query.get('source') === 'portal' ? query.get('role') === 'student' && query.get('studentId') === 'student-hai-dang' ? 'student-hai-dang' : query.get('role') === 'parent' ? portalChildId : undefined : undefined
  const learnerStudentId = billingReadOnly ? query.get('source') === 'portal' ? portalBillingStudentId : 'student-hai-dang' : undefined
  const scopedInvoices = billingFixtures.invoices.filter((item) => item.studentId === learnerStudentId && item.status === 'ISSUED')
  const scopedTotal = (field: 'outstandingVnd' | 'allocatedVnd' | 'verifiedCashReceivedVnd', overdueOnly = false) => scopedInvoices.filter((item) => !overdueOnly || item.overdue).reduce((sum, item) => sum + BigInt(item[field]), 0n).toString()
  const billingScoped = billingReadOnly ? { ...billingFixtures, invoices: scopedInvoices, wallets: billingFixtures.wallets.filter((item) => item.studentId === learnerStudentId), legacyReconciliations: [], issuedOutstandingTotalVnd: scopedTotal('outstandingVnd'), overdueOutstandingTotalVnd: scopedTotal('outstandingVnd', true), legacyReconciliationVnd: '0', verifiedCashTotalVnd: scopedTotal('verifiedCashReceivedVnd'), allocatedTotalVnd: scopedTotal('allocatedVnd') } : billingFixtures
  const billingPaymentFeedback = ['duplicate', 'concurrent', 'unknown', 'forbidden'].includes(previewState ?? '') ? previewState as WalletFeedback : undefined
  const adjustmentVariant = previewState === 'pending' ? { decision: 'PENDING_APPROVAL' as const, execution: 'NOT_STARTED' as const, note: 'Đã gửi, đang chờ người có quyền xét duyệt.' }
    : previewState === 'rejected' ? { decision: 'REJECTED' as const, execution: 'NOT_STARTED' as const, note: 'Người duyệt từ chối vì chứng cứ chưa đủ.' }
      : previewState === 'failed' ? { decision: 'APPROVED' as const, execution: 'FAILED' as const, note: 'Lệnh thực thi lỗi; quyết định được giữ để đối soát.' }
        : previewState === 'completed-credit' ? { decision: 'APPROVED' as const, execution: 'COMPLETED' as const, note: 'Đã điều chỉnh nghĩa vụ và ghi credit ví theo receipt.', walletCreditVnd: '100000' }
          : undefined
  const billingAdjustmentData = adjustmentVariant ? { ...billingScoped, invoices: billingScoped.invoices.map((invoice) => invoice.id !== 'invoice-hai-dang-0926' ? invoice : { ...invoice, ...(previewState === 'completed-credit' ? { adjustedObligationVnd: '900000', allocatedVnd: '900000', outstandingVnd: '0', walletAvailableVnd: '1300000', settlement: 'SETTLED' as const } : {}), adjustments: [{ id: 'ADJ-PREVIEW-014', kind: 'ADJUSTMENT' as const, occurredAt: '2026-10-16', ...adjustmentVariant }] }), wallets: previewState === 'completed-credit' ? billingScoped.wallets.map((wallet) => wallet.studentId !== 'student-hai-dang' ? wallet : { ...wallet, availableVnd: '1300000', transactions: [...wallet.transactions, { id: 'WT-PREVIEW-CREDIT', occurredAt: '2026-10-16', kind: 'INTERNAL_REFUND' as const, signedAmountVnd: '100000', sourceRef: 'ADJ-PREVIEW-014', invoiceNumber: 'INV-2026-00001', status: 'COMPLETED' as const }] }) : billingScoped.wallets } : billingScoped
  const adjustmentStateQuery = ['pending', 'rejected', 'failed', 'completed-credit', 'stale'].includes(previewState ?? '') ? `&state=${encodeURIComponent(previewState!)}` : ''

  const assignmentData = previewState === 'empty' ? { ...assignmentFixtures, assignments: [], submissions: [] } : previewState === 'overdue' ? { ...assignmentFixtures, sampleNow: '2026-10-22T12:00:00+07:00' } : assignmentFixtures
  const studentId = query.get('studentId') ?? assignmentFixtures.studentId!
  const portalPath = (target: string, recordId?: string) => target === 'SC06' ? `/__ui-preview/SC06?source=portal&role=${id === 'PO01' ? 'teacher' : 'student'}` : target === 'AT03' ? `/__ui-preview/AT03?source=portal&role=${id === 'PO03' ? 'parent' : 'student'}${recordId ? `&studentId=${encodeURIComponent(recordId)}` : ''}` : target === 'AT02' ? `${portalPreviewPath(target, recordId)}&source=portal` : target === 'SC05' ? `${portalPreviewPath(target, recordId)}&source=portal` : portalPreviewPath(target, recordId)
  return <main className={`ui-preview${(managementIds as readonly string[]).includes(id) || id.startsWith('AC') || id.startsWith('SC') || id.startsWith('AT') || id.startsWith('BL') || id.startsWith('AS') || id.startsWith('PO') ? ' ui-preview-academic' : ''}${['AC01', 'AC02', 'AC03', 'AC04'].includes(id) ? ' ui-preview-person' : ''}${['AC05', 'AC06', 'AC07', 'AC08', 'AC09'].includes(id) ? ' ui-preview-catalog' : ''}${id.startsWith('AT') ? ' ui-preview-attendance' : ''}${id.startsWith('BL') ? ' ui-preview-billing' : ''}${id.startsWith('AS') ? ' ui-preview-assignments' : ''}${(managementIds as readonly string[]).includes(id) ? ' ui-preview-management' : ''}`}>
    <header className="ui-preview-banner">
      <div>
        <strong>Dữ liệu mẫu — UI Preview</strong>
        <span>Chỉ để xem giao diện · Không gọi API · Không tạo phiên đăng nhập</span>
      </div>
      <nav aria-label="Chọn màn hình preview">
        {(['AU02', 'AU05', 'GL01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09', 'SC01', 'SC02', 'SC03', 'SC05', 'SC06', 'AT01', 'AT02', 'AT03', 'AT04', 'AT05', 'BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL08', 'BL09', 'BL10', 'BL11', 'AS01', 'AS02', 'AS03', 'AS04', 'AS05', 'AS06', 'AS07', 'PO01', 'PO02', 'PO03', 'PO04', 'PO05', ...managementIds] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}
        <a href="/__ui-preview/SC03?state=conflict" aria-current={id === 'SC03' && previewState === 'conflict' ? 'page' : undefined}>SC04</a>
      </nav>
    </header>
    {id.startsWith('SC') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của lịch">
      {id === 'SC01' && <a href="/__ui-preview/SC01?state=empty">Lịch trống</a>}
      {id === 'SC03' && <><a href="/__ui-preview/SC03?state=single">Một buổi</a><a href="/__ui-preview/SC03?state=zero">Không xung đột</a><a href="/__ui-preview/SC03?state=one">Một xung đột</a><a href="/__ui-preview/SC03?state=conflict">Nhiều xung đột</a><a href="/__ui-preview/SC03?state=race">Xung đột lúc xác nhận</a></>}
      {id === 'SC05' && <><a href="/__ui-preview/SC05?state=cancelled">Buổi đã hủy</a><a href="/__ui-preview/SC05?state=read-only">Chỉ xem</a></>}
      {id === 'SC06' && <><a href="/__ui-preview/SC06?role=teacher">Giáo viên</a><a href="/__ui-preview/SC06?role=student">Học viên</a><a href="/__ui-preview/SC06?role=parent">Phụ huynh</a><a href="/__ui-preview/SC06?state=empty">Lịch trống</a></>}
    </nav>}
    {['AC01', 'AC02', 'AC03', 'AC04'].includes(id) && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của hồ sơ học vụ">
      <a href="/__ui-preview/AC02?studentId=HS-1035">Học sinh chưa ghi danh</a>
      <a href="/__ui-preview/AC04?teacherId=GV-023">Giáo viên chưa phân công</a>
      <a href="/__ui-preview/AC02?studentId=HS-1028&amp;state=read-only">Hồ sơ học sinh chỉ xem</a>
      <a href="/__ui-preview/AC04?teacherId=GV-018&amp;state=read-only">Hồ sơ giáo viên chỉ xem</a>
    </nav>}
    {id.startsWith('AT') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của điểm danh và nghỉ học">
      <a href="/__ui-preview/AT01?state=empty">Danh sách rỗng</a><a href="/__ui-preview/AT01?state=loading">Đang tải</a><a href="/__ui-preview/AT01?state=forbidden">Không có quyền</a>
      <a href="/__ui-preview/AT02?state=draft">Bản nháp</a><a href="/__ui-preview/AT02?state=finalized">Đã xác nhận</a><a href="/__ui-preview/AT02?state=locked">Đã khóa</a><a href="/__ui-preview/AT05">Correction bị từ chối</a><a href="/__ui-preview/AT05?state=approved">Correction đã duyệt</a>
      <a href="/__ui-preview/AT03?role=parent">Phụ huynh</a><a href="/__ui-preview/AT03?role=student">Học sinh</a><a href="/__ui-preview/AT03?state=late">Nộp muộn</a><a href="/__ui-preview/AT03?state=duplicate">Đơn trùng</a><a href="/__ui-preview/AT03?state=forbidden">Không có quyền</a>
      <a href="/__ui-preview/AT04?role=staff">Nhân sự học vụ</a><a href="/__ui-preview/AT04?role=parent">Đơn phụ huynh</a><a href="/__ui-preview/AT04?role=student">Đơn học sinh</a>
    </nav>}
    {id.startsWith('BL') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của học phí"><a href="/__ui-preview/BL01">Đơn giá</a><a href="/__ui-preview/BL02">Ưu đãi</a><a href="/__ui-preview/BL03">Kỳ 09/2026</a><a href="/__ui-preview/BL04">Dự thảo</a><a href="/__ui-preview/BL05?draftId=D-0926-002">Generation cũ</a><a href="/__ui-preview/BL06">Đã phát hành</a><a href="/__ui-preview/BL07?invoiceId=invoice-hai-dang-0926&amp;role=parent">Phụ huynh</a><a href="/__ui-preview/BL08?mode=payment">Trả ví</a><a href="/__ui-preview/BL08?mode=topup">Nạp ví</a><a href="/__ui-preview/BL08?mode=payment&amp;state=duplicate">Payment trùng</a><a href="/__ui-preview/BL08?mode=payment&amp;state=concurrent">Dữ liệu đổi</a><a href="/__ui-preview/BL09">Công nợ & ví</a><a href="/__ui-preview/BL09?state=empty">Không còn nợ</a><a href="/__ui-preview/BL10">Điều chỉnh</a><a href="/__ui-preview/BL10?state=pending">Chờ duyệt</a><a href="/__ui-preview/BL10?state=rejected">Từ chối</a><a href="/__ui-preview/BL10?state=failed">Thực thi lỗi</a><a href="/__ui-preview/BL10?state=completed-credit">Đã credit ví</a><a href="/__ui-preview/BL10?state=stale">Payment đổi</a><a href="/__ui-preview/BL10?invoiceId=invoice-mai-an-0926">Hủy không credit</a><a href="/__ui-preview/BL10?invoiceId=invoice-thao-vy-0926">Legacy chặn</a><a href="/__ui-preview/BL11">Đảo TOP_UP</a><a href="/__ui-preview/BL11?state=insufficient">Ví thiếu</a><a href="/__ui-preview/BL11?state=already">Đã đảo</a><a href="/__ui-preview/BL11?state=forbidden">Không có quyền</a><a href="/__ui-preview/BL11?state=pending">Đang xử lý</a><a href="/__ui-preview/BL11?state=failed">Thực thi lỗi</a><a href="/__ui-preview/BL11?state=legacy">Legacy đối soát</a></nav>}
    {id.startsWith('AS') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu bài tập"><a href="/__ui-preview/AS01?state=empty">Danh sách rỗng</a><a href="/__ui-preview/AS01?state=loading">Đang tải</a><a href="/__ui-preview/AS01?state=error">Lỗi tải</a><a href="/__ui-preview/AS02?state=validation">Lỗi biểu mẫu</a><a href="/__ui-preview/AS02?assignmentId=assignment-chuong-3&amp;state=published">Bài đã giao</a><a href="/__ui-preview/AS03?state=empty">Chưa có bài nộp</a><a href="/__ui-preview/AS04?state=empty">Hàng chờ rỗng</a><a href="/__ui-preview/AS05?submissionId=submission-gia-han">Nháp điểm</a><a href="/__ui-preview/AS05?submissionId=submission-my-linh&amp;state=correction">Điều chỉnh</a><a href="/__ui-preview/AS06?state=empty">Học sinh rỗng</a><a href="/__ui-preview/AS07?state=late">Nộp muộn</a><a href="/__ui-preview/AS07?state=expired">Hết hạn</a><a href="/__ui-preview/AS07?assignmentId=assignment-dai-so&amp;state=closed">Đã chấm</a></nav>}
    {(id === 'AS06' || id === 'AS07' || id === 'AS05') && <nav className="ui-preview-variants" aria-label="Trạng thái bổ sung"><a href="/__ui-preview/AS06?state=overdue">Quá hạn</a><a href="/__ui-preview/AS07?state=upload-error">Lỗi tệp</a><a href="/__ui-preview/AS05?state=missing-file">Tệp không truy cập</a><a href="/__ui-preview/AS05?state=read-only">Chỉ xem</a></nav>}
    {id.startsWith('PO') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của cổng vai trò">{(['day-off', 'no-sessions', 'no-students', 'attendance-pending', 'overdue-grading', 'no-assignments', 'draft-grade', 'cancelled', 'one-child', 'no-links', 'revoked', 'no-activity', 'no-enrollment', 'incomplete', 'no-invoices', 'zero-wallet', 'loading', 'forbidden'] as const).map((item) => <a key={item} href={`/__ui-preview/${id}?state=${item}`}>{item}</a>)}<a href="/__ui-preview/PO05?role=student">Học sinh xem ví</a><a href="/__ui-preview/PO04?studentId=unknown">Con ngoài phạm vi</a><a href="/__ui-preview/PO05?studentId=unknown">Ví ngoài phạm vi</a></nav>}
    {(managementIds as readonly string[]).includes(id) && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu quản lý">{['empty', 'loading', 'unauthenticated', 'forbidden', 'not-found', 'conflict', 'invalid', 'error', 'partial', 'approved', 'failed', 'self-approved', 'read-only'].map((variant) => <a key={variant} href={`/__ui-preview/${id}?state=${variant}`}>{variant}</a>)}</nav>}
    <div className="ui-preview-content">
      {(managementIds as readonly string[]).includes(id) && <AppShell route={routes.find((route) => route.id === id)!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={managementIds.map((target) => <a key={target} href={`/__ui-preview/${target}`} aria-current={id === target ? 'page' : undefined}>{routes.find((route) => route.id === target)?.name}</a>)}>
        <ManagementScreen key={`${id}:${previewState ?? ''}`} id={id as ManagementId} tenantId={selectedTenant.id} preview {...managementScenario(previewState)} selectedId={query.get('recordId') ?? (id === 'OP02' ? 'MB-031' : id === 'OP05' ? 'YC-24018' : undefined)} canReview={previewState !== 'read-only'} open={(target, recordId) => navigate(`/__ui-preview/${target}${recordId ? '?recordId=' + encodeURIComponent(recordId) : ''}`)} />
      </AppShell>}
      {id === 'AU02' && <TenantSelectionScreen
        tenants={sampleTenants}
        onSelect={async (tenantId) => { setSelectedTenantId(tenantId) }}
        navigate={() => undefined}
      />}
      {id === 'AU05' && <ProfileScreen session={sampleSession} tenant={selectedTenant} onLogout={() => undefined} />}
      {id === 'GL01' && <NotificationScreen items={sampleNotifications} />}
      {id.startsWith('AC') && <AppShell route={routes.find((route) => route.id === (id === 'AC09' ? 'AC08' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {(['AC01', 'AC02', 'AC03', 'AC04'] as string[]).includes(id)
          ? <AcademicScreen id={id as AcademicId} data={academicFixtures} preview={previewState !== 'read-only'} tenantId={selectedTenant.id} navigate={navigate} selectedId={selectedId} pathForDetail={(detailId, personId) => `/__ui-preview/${detailId}?${detailId === 'AC02' ? 'studentId' : 'teacherId'}=${encodeURIComponent(personId)}`} />
          : previewState === 'forbidden' && id !== 'AC09' ? <AcademicCatalogStatusView id={id as MoreId} kind="forbidden" />
          : <AcademicMoreScreen id={(id === 'AC09' ? 'AC08' : id) as MoreId} data={previewState === 'empty' && id !== 'AC08' ? { ...academicMoreFixtures, catalog: [], courses: [], classes: [] } : academicMoreFixtures} preview={previewState !== 'read-only'} tenantId={selectedTenant.id} navigate={navigate} selectedId={selectedId} initialSheet={id === 'AC09'} pathForDetail={(detailId, classId) => `/__ui-preview/${detailId}?classId=${encodeURIComponent(classId)}`} pathForStudent={(studentId) => `/__ui-preview/AC02?studentId=${encodeURIComponent(studentId)}`} />}
      </AppShell>}
      {id.startsWith('SC') && <AppShell route={routes.find((route) => route.id === id)!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={<>{(['SC01', 'SC02', 'SC03', 'SC05', 'SC06'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{({ SC01: 'Lịch học', SC02: 'Phòng & tài nguyên', SC03: 'Tạo lịch', SC05: 'Chi tiết buổi', SC06: 'Lịch cá nhân' })[item]}</a>)}<a href="/__ui-preview/SC03?state=conflict">Xung đột mẫu</a></>}>
        {id === 'SC01' && <CentralScheduleScreen data={previewState === 'empty' ? { ...schedulingFixtures, sessions: [] } : schedulingFixtures} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} preview {...schedulingPreviewClock} onCreate={() => navigate('/__ui-preview/SC03')} onOpenSession={(sessionId) => navigate(`/__ui-preview/SC05?sessionId=${encodeURIComponent(sessionId)}`)} />}
        {id === 'SC02' && <ResourcesScreen data={schedulingFixtures} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} preview timeZone={schedulingPreviewClock.timeZone} initialRoomId={query.get('roomId') ?? 'P.302'} />}
        {id === 'SC03' && <CreateScheduleScreen data={schedulingFixtures} preview timeZone={schedulingPreviewClock.timeZone} conflicts={conflictSet} race={previewState === 'race'} initialConflictOpen={['conflict', 'one', 'zero', 'race'].includes(previewState ?? '')} initialRepeat={previewState === 'single' ? 'SINGLE' : 'WEEKLY'} />}
{id === 'SC05' && <SessionDetailScreen data={query.get('source') === 'portal' ? portalSchedulingData : schedulingFixtures} selectedId={query.get('sessionId') ?? (previewState === 'cancelled' ? 'session-cancelled-21' : 'session-eng-26')} preview canEdit={previewState !== 'read-only' && query.get('source') !== 'portal'} {...(query.get('source') === 'portal' ? { today: '2026-10-17', timeZone: 'Asia/Ho_Chi_Minh' } : schedulingPreviewClock)} now={previewState === 'same-day-past' ? new Date('2026-10-21T12:00:00Z') : schedulingPreviewClock.now} conflicts={conflictSet} onBack={() => navigate('/__ui-preview/SC01')} onOpenStudent={(studentId) => navigate(`/__ui-preview/AC02?studentId=${encodeURIComponent(studentId)}`)} />}
        {id === 'SC06' && <PersonalScheduleScreen data={query.get('source') === 'portal' ? portalSchedulingData : schedulingFixtures} scope={personalScope} preview {...(query.get('source') === 'portal' ? { today: '2026-10-17', timeZone: 'Asia/Ho_Chi_Minh' } : schedulingPreviewClock)} initialChildId={query.get('childId') ?? undefined} onOpenSession={(sessionId) => navigate(`/__ui-preview/SC05?sessionId=${encodeURIComponent(sessionId)}${query.get('source') === 'portal' ? '&source=portal' : ''}`)} />}
      </AppShell>}
      {id.startsWith('AT') && <AppShell route={routes.find((route) => route.id === (id === 'AT05' ? 'AT02' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['AT01', 'AT02', 'AT03', 'AT04'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {id === 'AT01' && <AttendanceSessionListScreen data={attendanceData} preview state={attendanceState} onOpenSession={(sessionId) => navigate(`/__ui-preview/AT02?sessionId=${encodeURIComponent(sessionId)}`)} />}
        {(id === 'AT02' || id === 'AT05') && <AttendanceSheetScreen data={attendanceData} sessionId={attendanceSessionId} preview canEdit={attendanceRole === 'teacher' || attendanceRole === 'staff'} initialCorrection={id === 'AT05'} onBack={() => navigate('/__ui-preview/AT01')} />}
        {id === 'AT03' && <LeaveRequestFormScreen key={query.get('source') === 'portal' ? portalChildId ?? 'unscoped' : 'standard'} data={leaveFormData} role={attendanceRole === 'teacher' || attendanceRole === 'staff' ? 'parent' : attendanceRole} preview state={attendanceState} initialStudentId={portalChildId} onViewRequests={() => navigate('/__ui-preview/AT04?role=parent')} />}
        {id === 'AT04' && <LeaveRequestListScreen data={attendanceData} role={attendanceRole === 'teacher' ? 'staff' : attendanceRole} preview canReview={attendanceRole === 'staff' || attendanceRole === 'teacher'} canApproveLate={false} state={attendanceState} onCreate={() => navigate('/__ui-preview/AT03?role=parent')} />}
      </AppShell>}
      {id.startsWith('BL') && <AppShell route={routes.find((route) => route.id === (id === 'BL08' ? query.get('mode') === 'topup' ? 'BL09' : 'BL07' : id === 'BL11' ? 'BL09' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL08', 'BL09', 'BL10', 'BL11'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {id === 'BL01' && <PriceRulesScreen data={billingFixtures} preview />}
        {id === 'BL02' && <SiblingDiscountScreen data={billingFixtures} preview />}
        {id === 'BL03' && <BillingPeriodsScreen data={billingFixtures} preview initialPeriodId={query.get('period') ?? undefined} onOpenDrafts={(periodId) => navigate(`/__ui-preview/BL04?period=${encodeURIComponent(periodId)}`)} />}
        {id === 'BL04' && <DraftInvoiceListScreen data={previewState === 'empty' ? { ...billingFixtures, drafts: [], draftEstimatedTotalVnd: '0' } : billingFixtures} preview initialPeriodId={query.get('period') ?? undefined} onOpenDraft={(draftId) => navigate(`/__ui-preview/BL05?draftId=${encodeURIComponent(draftId)}`)} />}
        {id === 'BL05' && <DraftInvoiceReviewScreen data={billingFixtures} selectedId={query.get('draftId') ?? billingFixtures.drafts[0].id} preview canIssue onBack={() => navigate('/__ui-preview/BL04')} />}
        {id === 'BL06' && <IssuedInvoiceListScreen data={previewState === 'empty' ? { ...billingFixtures, invoices: [], issuedOutstandingTotalVnd: '0' } : billingFixtures} preview onOpenInvoice={(invoiceId) => navigate(`/__ui-preview/BL07?invoiceId=${encodeURIComponent(invoiceId)}`)} />}
        {(id === 'BL07' || id === 'BL08' && query.get('mode') !== 'topup') && <InvoiceDetailScreen data={id === 'BL07' ? billingAdjustmentData : billingScoped} selectedId={query.get('invoiceId') ?? (billingReadOnly && query.get('source') === 'portal' ? undefined : billingFixtures.invoices[0].id)} preview canManage={!billingReadOnly} audience={billingReadOnly ? 'learner' : 'staff'} learnerStudentId={learnerStudentId} initialPaymentOpen={id === 'BL08'} paymentFeedback={billingPaymentFeedback} onOpenAdjustment={(invoiceId) => navigate(`/__ui-preview/BL10?invoiceId=${encodeURIComponent(invoiceId)}${adjustmentStateQuery}`)} onBack={() => navigate('/__ui-preview/BL06')} />}
        {(id === 'BL09' || id === 'BL11' && previewState !== 'forbidden' || id === 'BL08' && query.get('mode') === 'topup') && <ReceivablesWalletScreen data={previewState === 'empty' ? { ...billingScoped, invoices: [], issuedOutstandingTotalVnd: '0', overdueOutstandingTotalVnd: '0' } : previewState === 'insufficient' ? { ...billingScoped, wallets: billingScoped.wallets.map((item) => item.studentId === 'student-hai-dang' ? { ...item, availableVnd: '300000' } : item) } : billingScoped} preview canManage={!billingReadOnly} initialStudentId={query.get('studentId') ?? undefined} initialTopUpOpen={id === 'BL08'} initialReversalOpen={id === 'BL11'} initialTopUpId={query.get('topUpId') ?? (previewState === 'already' ? 'TOP-2026-OLD' : undefined)} topUpFeedback={billingPaymentFeedback} reversalFeedback={previewState === 'pending' ? 'PENDING' : previewState === 'failed' ? 'FAILED' : undefined} reversalReconciliationBlocked={id === 'BL11' && previewState === 'legacy'} onOpenInvoice={(invoiceId) => navigate(`/__ui-preview/BL07?invoiceId=${encodeURIComponent(invoiceId)}`)} />}
        {id === 'BL11' && previewState === 'forbidden' && <TopUpReversalDialog wallet={billingFixtures.wallets[0]} topUp={billingFixtures.wallets[0].topUps[0]} canManage={false} onClose={() => navigate('/__ui-preview/BL09')} />}
        {id === 'BL10' && <InvoiceAdjustmentScreen data={billingAdjustmentData} selectedId={query.get('invoiceId') ?? billingFixtures.invoices[0].id} preview canRequest={!billingReadOnly} stalePayment={previewState === 'stale'} onBack={() => navigate(`/__ui-preview/BL07?invoiceId=${encodeURIComponent(query.get('invoiceId') ?? billingFixtures.invoices[0].id)}${adjustmentStateQuery}`)} />}
      </AppShell>}
      {id.startsWith('AS') && <AppShell route={routes.find((route) => route.id === id)!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(id === 'AS06' || id === 'AS07' ? ['AS06', 'AS07'] : ['AS01', 'AS02', 'AS03', 'AS04', 'AS05']).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {id === 'AS01' && <TeacherAssignmentListScreen data={assignmentData} preview referenceTime={assignmentData.sampleNow} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} onCreate={() => navigate('/__ui-preview/AS02')} onOpen={(assignmentId) => navigate(`/__ui-preview/AS03?assignmentId=${encodeURIComponent(assignmentId)}`)} />}
        {id === 'AS02' && <AssignmentEditorScreen data={assignmentFixtures} preview selectedId={query.get('assignmentId') ?? undefined} initialState={previewState ?? undefined} onBack={() => navigate('/__ui-preview/AS01')} />}
        {id === 'AS03' && <AssignmentDetailScreen data={previewState === 'empty' ? { ...assignmentFixtures, submissions: [] } : assignmentFixtures} selectedId={query.get('assignmentId') ?? assignmentFixtures.assignments[0].id} onBack={() => navigate('/__ui-preview/AS01')} onGrade={(submissionId) => navigate(`/__ui-preview/AS05?submissionId=${encodeURIComponent(submissionId)}`)} />}
        {id === 'AS04' && <GradingQueueScreen data={previewState === 'empty' ? { ...assignmentFixtures, submissions: [] } : assignmentFixtures} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} onOpen={(submissionId) => navigate(`/__ui-preview/AS05?submissionId=${encodeURIComponent(submissionId)}`)} />}
        {id === 'AS05' && <GradeSubmissionScreen data={assignmentFixtures} selectedId={query.get('submissionId') ?? assignmentFixtures.submissions[0].id} state={previewState ?? undefined} onBack={() => navigate('/__ui-preview/AS04')} />}
        {id === 'AS06' && <MyAssignmentsScreen data={assignmentData} preview studentId={studentId} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} onOpen={(assignmentId) => navigate(`/__ui-preview/AS07?assignmentId=${encodeURIComponent(assignmentId)}&studentId=${encodeURIComponent(studentId)}`)} />}
        {id === 'AS07' && (query.get('source') === 'portal' ? <ParentAssignmentDetailScreen data={portalChildId ? { assignments: portalData.assignments.assignments.filter((item) => item.recipientIds.includes(portalChildId) && item.status !== 'DRAFT'), submissions: portalData.assignments.submissions.filter((item) => item.studentId === portalChildId) } : undefined} selectedId={query.get('assignmentId') ?? undefined} studentId={query.get('studentId') ?? undefined} scopedStudentId={portalChildId} onBack={() => navigate(`/__ui-preview/PO04?studentId=${encodeURIComponent(portalChildId ?? '')}`)} /> : <MyAssignmentDetailScreen data={assignmentFixtures} selectedId={query.get('assignmentId') ?? assignmentFixtures.assignments[0].id} studentId={studentId} state={previewState ?? undefined} onBack={() => navigate(`/__ui-preview/AS06?studentId=${encodeURIComponent(studentId)}`)} />)}
      </AppShell>}
      {id.startsWith('PO') && <AppShell route={routes.find((route) => route.id === id)!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['PO01', 'PO02', 'PO03', 'PO04', 'PO05'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {id === 'PO01' && <TeacherHomeScreen data={portalData} teacherId={portalFixtures.teacherId} navigate={navigate} path={portalPath} state={previewState === 'loading' || previewState === 'forbidden' ? previewState : 'ready'} />}
        {id === 'PO02' && <StudentHomeScreen data={portalData} studentId={portalFixtures.studentId} navigate={navigate} path={portalPath} state={previewState === 'loading' || previewState === 'forbidden' ? previewState : 'ready'} />}
        {id === 'PO03' && <ParentHomeScreen data={portalData} navigate={navigate} path={portalPath} viewerId="parent-demo" tenantId={selectedTenant.id} initialChildId={query.get('studentId') ?? (previewState === 'revoked' ? 'student-minh-anh' : undefined)} onOpenBilling={(childId) => navigate(`/__ui-preview/PO05?source=portal&studentId=${encodeURIComponent(childId)}`)} onOpenLeave={(childId) => navigate(`/__ui-preview/AT03?source=portal&role=parent&studentId=${encodeURIComponent(childId)}`)} state={previewState === 'loading' || previewState === 'forbidden' ? previewState : 'ready'} />}
        {id === 'PO04' && <ChildLearningScreen data={portalData} studentId={query.get('studentId') ?? (previewState === 'revoked' ? 'student-revoked' : 'student-minh-anh')} navigate={navigate} path={portalPath} onOpenAssignment={(assignmentId, childId) => navigate(`/__ui-preview/AS07?source=portal&assignmentId=${encodeURIComponent(assignmentId)}&studentId=${encodeURIComponent(childId)}`)} state={previewState === 'loading' || previewState === 'forbidden' ? previewState : 'ready'} />}
        {id === 'PO05' && <MyBillingScreen data={query.get('role') === 'student' ? { ...portalData, scope: { viewerId: 'student-demo', tenantId: selectedTenant.id }, studentId: 'student-hai-dang', studentName: 'Nguyễn Hải Đăng' } : portalData} mode={query.get('role') === 'student' ? 'student' : 'parent'} studentId={query.get('role') === 'student' ? 'student-hai-dang' : undefined} viewerId={query.get('role') === 'student' ? 'student-demo' : 'parent-demo'} tenantId={selectedTenant.id} initialChildId={query.get('studentId') ?? (query.get('source') === 'portal' ? '' : previewState === 'revoked' ? 'student-revoked' : 'student-hai-dang')} onOpenInvoice={(invoiceId, childId) => navigate(`/__ui-preview/BL07?source=portal&role=${query.get('role') === 'student' ? 'student' : 'parent'}&invoiceId=${encodeURIComponent(invoiceId)}&studentId=${encodeURIComponent(childId)}`)} state={previewState === 'loading' || previewState === 'forbidden' ? previewState : 'ready'} />}
      </AppShell>}
    </div>
  </main>
}
