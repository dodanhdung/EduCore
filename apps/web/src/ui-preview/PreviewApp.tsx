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
import type { WalletFeedback } from '../screens/Billing & Receivables/BL08/WalletOperationDialogs.tsx'
import { AcademicMoreScreen } from '../screens/Academic Management/AcademicMoreScreens.tsx'
import type { MoreId } from '../screens/Academic Management/AcademicMoreScreens.tsx'
import { AppShell } from '../App.tsx'
import { routes } from '../routes.ts'
import './preview.css'

type PreviewScreenId = 'AU02' | 'AU05' | 'GL01' | AcademicId | MoreId | 'AC09' | 'SC01' | 'SC02' | 'SC03' | 'SC05' | 'SC06' | 'AT01' | 'AT02' | 'AT03' | 'AT04' | 'AT05' | 'BL01' | 'BL02' | 'BL03' | 'BL04' | 'BL05' | 'BL06' | 'BL07' | 'BL08' | 'BL09' | 'BL10' | 'BL11'

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

export function PreviewApp({ screenId }: { screenId: string }) {
  const [selectedTenantId, setSelectedTenantId] = useState(sampleTenants[0].id)
  if (!(['AU02', 'AU05', 'GL01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09', 'SC01', 'SC02', 'SC03', 'SC05', 'SC06', 'AT01', 'AT02', 'AT03', 'AT04', 'AT05', 'BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL08', 'BL09', 'BL10', 'BL11'] as string[]).includes(screenId)) {
    return <main className="ui-preview"><p role="alert">Màn hình preview không hợp lệ.</p></main>
  }

  const id = screenId as PreviewScreenId
  const selectedTenant = sampleTenants.find((tenant) => tenant.id === selectedTenantId) ?? sampleTenants[0]
  const navigate = (path: string) => { window.location.assign(path) }
  const query = new URLSearchParams(window.location.search)
  const previewState = query.get('state')
  const conflictSet = previewState === 'one' || previewState === 'race' ? schedulingConflictFixtures[previewState] : previewState === 'conflict' ? schedulingConflictFixtures.many : []
  const personalRole = query.get('role') === 'parent' || query.get('role') === 'student' ? query.get('role') as 'parent' | 'student' : 'teacher'
  const personalScope = previewState === 'empty' ? { ...personalScheduleScopes[personalRole], allowedSessionIds: [], children: personalScheduleScopes[personalRole].children?.map((child) => ({ ...child, allowedSessionIds: [] })) } : personalScheduleScopes[personalRole]
  const selectedId = id === 'AC02' ? (query.get('studentId') ?? academicFixtures.students[0].id)
    : id === 'AC04' ? (query.get('teacherId') ?? academicFixtures.teachers[0].id)
      : (query.get('classId') ?? academicMoreFixtures.classes[0].code)
  const attendanceRole = query.get('role') === 'parent' || query.get('role') === 'student' || query.get('role') === 'staff' ? query.get('role') as 'parent' | 'student' | 'staff' : 'teacher'
  const attendanceState = previewState === 'loading' || previewState === 'forbidden' || previewState === 'error' ? previewState : 'ready'
  const attendanceData = previewState === 'empty' ? { ...attendanceFixtures, sessions: [], leaveRequests: [] } : previewState === 'finalized' || previewState === 'approved' ? { ...attendanceFixtures, sampleNow: previewState === 'approved' ? '2026-10-21T12:00:00+07:00' : attendanceFixtures.sampleNow, sessions: attendanceFixtures.sessions.map((item) => item.id === 'session-eng-19' ? { ...item, phase: previewState === 'approved' ? 'LOCKED' as const : 'FINALIZED' as const, ...(previewState === 'approved' ? { lockReason: 'Đã quá 48 giờ từ cuối buổi (dữ liệu mẫu).' } : {}) } : item) } : attendanceFixtures
  const leaveFormData = previewState === 'duplicate' ? attendanceFixtures : { ...attendanceFixtures, sampleNow: previewState === 'late' ? '2026-10-26T10:00:00+07:00' : attendanceFixtures.sampleNow, leaveRequests: attendanceFixtures.leaveRequests.filter((item) => item.id !== 'leave-01') }
  const attendanceSessionId = query.get('sessionId') ?? (previewState === 'approved' ? 'session-eng-19' : id === 'AT05' || previewState === 'locked' ? 'session-ielts-20' : previewState === 'finalized' ? 'session-eng-19' : previewState === 'draft' ? 'session-eng-26' : 'session-eng-21')
  const billingReadOnly = query.get('role') === 'parent' || query.get('role') === 'student'
  const billingScoped = billingReadOnly ? { ...billingFixtures, invoices: billingFixtures.invoices.filter((item) => item.studentId === 'student-hai-dang'), wallets: billingFixtures.wallets.filter((item) => item.studentId === 'student-hai-dang'), legacyReconciliations: [], issuedOutstandingTotalVnd: '2150000', overdueOutstandingTotalVnd: '2150000', legacyReconciliationVnd: '0', verifiedCashTotalVnd: '2200000', allocatedTotalVnd: '1000000' } : billingFixtures
  const billingPaymentFeedback = ['duplicate', 'concurrent', 'unknown', 'forbidden'].includes(previewState ?? '') ? previewState as WalletFeedback : undefined

  return <main className={`ui-preview${id.startsWith('AC') || id.startsWith('SC') || id.startsWith('AT') || id.startsWith('BL') ? ' ui-preview-academic' : ''}${id.startsWith('AT') ? ' ui-preview-attendance' : ''}${id.startsWith('BL') ? ' ui-preview-billing' : ''}`}>
    <header className="ui-preview-banner">
      <div>
        <strong>Dữ liệu mẫu — UI Preview</strong>
        <span>Chỉ để xem giao diện · Không gọi API · Không tạo phiên đăng nhập</span>
      </div>
      <nav aria-label="Chọn màn hình preview">
        {(['AU02', 'AU05', 'GL01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09', 'SC01', 'SC02', 'SC03', 'SC05', 'SC06', 'AT01', 'AT02', 'AT03', 'AT04', 'AT05', 'BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL08', 'BL09', 'BL10', 'BL11'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}
        <a href="/__ui-preview/SC03?state=conflict" aria-current={id === 'SC03' && previewState === 'conflict' ? 'page' : undefined}>SC04</a>
      </nav>
    </header>
    {id.startsWith('SC') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của lịch">
      {id === 'SC01' && <a href="/__ui-preview/SC01?state=empty">Lịch trống</a>}
      {id === 'SC03' && <><a href="/__ui-preview/SC03?state=single">Một buổi</a><a href="/__ui-preview/SC03?state=zero">Không xung đột</a><a href="/__ui-preview/SC03?state=one">Một xung đột</a><a href="/__ui-preview/SC03?state=conflict">Nhiều xung đột</a><a href="/__ui-preview/SC03?state=race">Xung đột lúc xác nhận</a></>}
      {id === 'SC05' && <><a href="/__ui-preview/SC05?state=cancelled">Buổi đã hủy</a><a href="/__ui-preview/SC05?state=read-only">Chỉ xem</a></>}
      {id === 'SC06' && <><a href="/__ui-preview/SC06?role=teacher">Giáo viên</a><a href="/__ui-preview/SC06?role=student">Học viên</a><a href="/__ui-preview/SC06?role=parent">Phụ huynh</a><a href="/__ui-preview/SC06?state=empty">Lịch trống</a></>}
    </nav>}
    {id.startsWith('AT') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của điểm danh và nghỉ học">
      <a href="/__ui-preview/AT01?state=empty">Danh sách rỗng</a><a href="/__ui-preview/AT01?state=loading">Đang tải</a><a href="/__ui-preview/AT01?state=forbidden">Không có quyền</a>
      <a href="/__ui-preview/AT02?state=draft">Bản nháp</a><a href="/__ui-preview/AT02?state=finalized">Đã xác nhận</a><a href="/__ui-preview/AT02?state=locked">Đã khóa</a><a href="/__ui-preview/AT05">Correction bị từ chối</a><a href="/__ui-preview/AT05?state=approved">Correction đã duyệt</a>
      <a href="/__ui-preview/AT03?role=parent">Phụ huynh</a><a href="/__ui-preview/AT03?role=student">Học sinh</a><a href="/__ui-preview/AT03?state=late">Nộp muộn</a><a href="/__ui-preview/AT03?state=duplicate">Đơn trùng</a><a href="/__ui-preview/AT03?state=forbidden">Không có quyền</a>
      <a href="/__ui-preview/AT04?role=staff">Nhân sự học vụ</a><a href="/__ui-preview/AT04?role=parent">Đơn phụ huynh</a><a href="/__ui-preview/AT04?role=student">Đơn học sinh</a>
    </nav>}
    {id.startsWith('BL') && <nav className="ui-preview-variants" aria-label="Trạng thái mẫu của học phí"><a href="/__ui-preview/BL01">Đơn giá</a><a href="/__ui-preview/BL02">Ưu đãi</a><a href="/__ui-preview/BL03">Kỳ 09/2026</a><a href="/__ui-preview/BL04">Dự thảo</a><a href="/__ui-preview/BL05?draftId=D-0926-002">Generation cũ</a><a href="/__ui-preview/BL06">Đã phát hành</a><a href="/__ui-preview/BL07?invoiceId=invoice-hai-dang-0926&amp;role=parent">Phụ huynh</a><a href="/__ui-preview/BL08?mode=payment">Trả ví</a><a href="/__ui-preview/BL08?mode=topup">Nạp ví</a><a href="/__ui-preview/BL08?mode=payment&amp;state=duplicate">Payment trùng</a><a href="/__ui-preview/BL08?mode=payment&amp;state=concurrent">Dữ liệu đổi</a><a href="/__ui-preview/BL09">Công nợ & ví</a><a href="/__ui-preview/BL09?state=empty">Không còn nợ</a><a href="/__ui-preview/BL10">Điều chỉnh</a><a href="/__ui-preview/BL10?invoiceId=invoice-thao-vy-0926">Legacy chặn</a><a href="/__ui-preview/BL11">Đảo TOP_UP</a><a href="/__ui-preview/BL11?state=insufficient">Ví thiếu</a><a href="/__ui-preview/BL11?state=already">Đã đảo</a></nav>}
    <div className="ui-preview-content">
      {id === 'AU02' && <TenantSelectionScreen
        tenants={sampleTenants}
        onSelect={async (tenantId) => { setSelectedTenantId(tenantId) }}
        navigate={() => undefined}
      />}
      {id === 'AU05' && <ProfileScreen session={sampleSession} tenant={selectedTenant} onLogout={() => undefined} />}
      {id === 'GL01' && <NotificationScreen items={sampleNotifications} />}
      {id.startsWith('AC') && <AppShell route={routes.find((route) => route.id === (id === 'AC09' ? 'AC08' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08', 'AC09'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {(['AC01', 'AC02', 'AC03', 'AC04'] as string[]).includes(id)
          ? <AcademicScreen id={id as AcademicId} data={academicFixtures} preview tenantId={selectedTenant.id} navigate={navigate} selectedId={selectedId} pathForDetail={(detailId, personId) => `/__ui-preview/${detailId}?${detailId === 'AC02' ? 'studentId' : 'teacherId'}=${encodeURIComponent(personId)}`} />
          : <AcademicMoreScreen id={(id === 'AC09' ? 'AC08' : id) as MoreId} data={academicMoreFixtures} preview tenantId={selectedTenant.id} navigate={navigate} selectedId={selectedId} initialSheet={id === 'AC09'} pathForDetail={(detailId, classId) => `/__ui-preview/${detailId}?classId=${encodeURIComponent(classId)}`} pathForStudent={(studentId) => `/__ui-preview/AC02?studentId=${encodeURIComponent(studentId)}`} />}
      </AppShell>}
      {id.startsWith('SC') && <AppShell route={routes.find((route) => route.id === id)!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={<>{(['SC01', 'SC02', 'SC03', 'SC05', 'SC06'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{({ SC01: 'Lịch học', SC02: 'Phòng & tài nguyên', SC03: 'Tạo lịch', SC05: 'Chi tiết buổi', SC06: 'Lịch cá nhân' })[item]}</a>)}<a href="/__ui-preview/SC03?state=conflict">Xung đột mẫu</a></>}>
        {id === 'SC01' && <CentralScheduleScreen data={previewState === 'empty' ? { ...schedulingFixtures, sessions: [] } : schedulingFixtures} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} preview {...schedulingPreviewClock} onCreate={() => navigate('/__ui-preview/SC03')} onOpenSession={(sessionId) => navigate(`/__ui-preview/SC05?sessionId=${encodeURIComponent(sessionId)}`)} />}
        {id === 'SC02' && <ResourcesScreen data={schedulingFixtures} state={previewState === 'loading' || previewState === 'error' ? previewState : 'ready'} preview timeZone={schedulingPreviewClock.timeZone} initialRoomId={query.get('roomId') ?? 'P.302'} />}
        {id === 'SC03' && <CreateScheduleScreen data={schedulingFixtures} preview timeZone={schedulingPreviewClock.timeZone} conflicts={conflictSet} race={previewState === 'race'} initialConflictOpen={['conflict', 'one', 'zero', 'race'].includes(previewState ?? '')} initialRepeat={previewState === 'single' ? 'SINGLE' : 'WEEKLY'} />}
        {id === 'SC05' && <SessionDetailScreen data={schedulingFixtures} selectedId={query.get('sessionId') ?? (previewState === 'cancelled' ? 'session-cancelled-21' : 'session-eng-26')} preview canEdit={previewState !== 'read-only'} {...schedulingPreviewClock} conflicts={conflictSet} onBack={() => navigate('/__ui-preview/SC01')} onOpenStudent={(studentId) => navigate(`/__ui-preview/AC02?studentId=${encodeURIComponent(studentId)}`)} />}
        {id === 'SC06' && <PersonalScheduleScreen data={schedulingFixtures} scope={personalScope} preview {...schedulingPreviewClock} initialChildId={query.get('childId') ?? undefined} onOpenSession={(sessionId) => navigate(`/__ui-preview/SC05?sessionId=${encodeURIComponent(sessionId)}`)} />}
      </AppShell>}
      {id.startsWith('AT') && <AppShell route={routes.find((route) => route.id === (id === 'AT05' ? 'AT02' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['AT01', 'AT02', 'AT03', 'AT04'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {id === 'AT01' && <AttendanceSessionListScreen data={attendanceData} preview state={attendanceState} onOpenSession={(sessionId) => navigate(`/__ui-preview/AT02?sessionId=${encodeURIComponent(sessionId)}`)} />}
        {(id === 'AT02' || id === 'AT05') && <AttendanceSheetScreen data={attendanceData} sessionId={attendanceSessionId} preview canEdit={attendanceRole === 'teacher' || attendanceRole === 'staff'} initialCorrection={id === 'AT05'} onBack={() => navigate('/__ui-preview/AT01')} />}
        {id === 'AT03' && <LeaveRequestFormScreen data={leaveFormData} role={attendanceRole === 'teacher' || attendanceRole === 'staff' ? 'parent' : attendanceRole} preview state={attendanceState} onViewRequests={() => navigate('/__ui-preview/AT04?role=parent')} />}
        {id === 'AT04' && <LeaveRequestListScreen data={attendanceData} role={attendanceRole === 'teacher' ? 'staff' : attendanceRole} preview canReview={attendanceRole === 'staff' || attendanceRole === 'teacher'} canApproveLate={false} state={attendanceState} onCreate={() => navigate('/__ui-preview/AT03?role=parent')} />}
      </AppShell>}
      {id.startsWith('BL') && <AppShell route={routes.find((route) => route.id === (id === 'BL08' ? query.get('mode') === 'topup' ? 'BL09' : 'BL07' : id === 'BL11' ? 'BL09' : id))!} tenant={selectedTenant} navigate={navigate} onLogout={() => undefined} preview previewNavigation={(['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL08', 'BL09', 'BL10', 'BL11'] as const).map((item) => <a key={item} href={`/__ui-preview/${item}`} aria-current={id === item ? 'page' : undefined}>{item}</a>)}>
        {id === 'BL01' && <PriceRulesScreen data={billingFixtures} preview />}
        {id === 'BL02' && <SiblingDiscountScreen data={billingFixtures} preview />}
        {id === 'BL03' && <BillingPeriodsScreen data={billingFixtures} preview initialPeriodId={query.get('period') ?? undefined} />}
        {id === 'BL04' && <DraftInvoiceListScreen data={previewState === 'empty' ? { ...billingFixtures, drafts: [], draftEstimatedTotalVnd: '0' } : billingFixtures} preview onOpenDraft={(draftId) => navigate(`/__ui-preview/BL05?draftId=${encodeURIComponent(draftId)}`)} />}
        {id === 'BL05' && <DraftInvoiceReviewScreen data={billingFixtures} selectedId={query.get('draftId') ?? billingFixtures.drafts[0].id} preview canIssue onBack={() => navigate('/__ui-preview/BL04')} />}
        {id === 'BL06' && <IssuedInvoiceListScreen data={previewState === 'empty' ? { ...billingFixtures, invoices: [], issuedOutstandingTotalVnd: '0' } : billingFixtures} preview onOpenInvoice={(invoiceId) => navigate(`/__ui-preview/BL07?invoiceId=${encodeURIComponent(invoiceId)}`)} />}
        {(id === 'BL07' || id === 'BL08' && query.get('mode') !== 'topup') && <InvoiceDetailScreen data={billingScoped} selectedId={query.get('invoiceId') ?? billingFixtures.invoices[0].id} preview canManage={!billingReadOnly} initialPaymentOpen={id === 'BL08'} paymentFeedback={billingPaymentFeedback} onOpenAdjustment={(invoiceId) => navigate(`/__ui-preview/BL10?invoiceId=${encodeURIComponent(invoiceId)}`)} onBack={() => navigate('/__ui-preview/BL06')} />}
        {(id === 'BL09' || id === 'BL11' || id === 'BL08' && query.get('mode') === 'topup') && <ReceivablesWalletScreen data={previewState === 'empty' ? { ...billingScoped, invoices: [], issuedOutstandingTotalVnd: '0', overdueOutstandingTotalVnd: '0' } : previewState === 'insufficient' ? { ...billingScoped, wallets: billingScoped.wallets.map((item) => item.studentId === 'student-hai-dang' ? { ...item, availableVnd: '300000' } : item) } : billingScoped} preview canManage={!billingReadOnly} initialStudentId={query.get('studentId') ?? undefined} initialTopUpOpen={id === 'BL08'} initialReversalOpen={id === 'BL11'} initialTopUpId={query.get('topUpId') ?? (previewState === 'already' ? 'TOP-2026-OLD' : undefined)} topUpFeedback={billingPaymentFeedback} onOpenInvoice={(invoiceId) => navigate(`/__ui-preview/BL07?invoiceId=${encodeURIComponent(invoiceId)}`)} />}
        {id === 'BL10' && <InvoiceAdjustmentScreen data={billingScoped} selectedId={query.get('invoiceId') ?? billingFixtures.invoices[0].id} preview canRequest={!billingReadOnly} onBack={() => navigate(`/__ui-preview/BL07?invoiceId=${encodeURIComponent(query.get('invoiceId') ?? billingFixtures.invoices[0].id)}`)} />}
      </AppShell>}
    </div>
  </main>
}
