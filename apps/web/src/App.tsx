import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ApiClient } from './api.ts'
import { createNavigationReader } from './navigation.ts'
import { landingPath, navigationRoutes, resolveRoute, SessionController } from './auth.ts'
import type { AuthState } from './auth.ts'
import type { ScreenRoute } from './routes.ts'
import { AppShell } from './shared/shell/AppShell.tsx'
import { matchRoute, tenantPath } from './routes.ts'
import { LoginScreen } from './screens/Authentication & Shared/AU01/LoginScreen.tsx'
import { TenantSelectionScreen } from './screens/Authentication & Shared/AU02/TenantSelectionScreen.tsx'
import { RecoveryRequestScreen } from './screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx'
import { ResetPasswordScreen } from './screens/Authentication & Shared/AU04/ResetPasswordScreen.tsx'
import { ProfileScreen } from './screens/Authentication & Shared/AU05/ProfileScreen.tsx'
import { ActivationScreen } from './screens/Authentication & Shared/AU06/ActivationScreen.tsx'
import { NotificationProduction } from './screens/Authentication & Shared/GL01/NotificationProduction.tsx'
import { ErrorScreen } from './screens/Authentication & Shared/GL02/ErrorScreen.tsx'
import type { AcademicId } from './screens/Academic Management/AcademicScreens.tsx'
import { AcademicProduction } from './screens/Academic Management/AcademicProduction.tsx'
import { SchedulingAttendanceProduction } from './screens/Scheduling & Resources/SchedulingAttendanceProduction.tsx'
import { SchedulingProduction } from './screens/Scheduling & Resources/SchedulingProduction.tsx'
import { BillingProduction } from './screens/Billing & Receivables/BillingProduction.tsx'
import { FinanceProduction } from './screens/Billing & Receivables/FinanceProduction.tsx'
import { AssignmentsProduction } from './screens/Assignments & Grading/AssignmentsProduction.tsx'
import { PortalProduction } from './screens/Role Portals/PortalProduction.tsx'
import { DashboardProduction } from './screens/Management & Operations/G01/DashboardProduction.tsx'
import './App.css'
import { ManagementScreen } from './screens/Management & Operations/ManagementScreens.tsx'
import { ProductionManagement } from './screens/Management & Operations/ProductionManagement.tsx'
import { OperationsProduction } from './screens/Management & Operations/OperationsProduction.tsx'
import { managementIds } from './screens/Management & Operations/ManagementTypes.ts'
import type { ManagementId } from './screens/Management & Operations/ManagementTypes.ts'

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
const sessions = new SessionController(api, createNavigationReader(api))

function usePath() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const navigate = (next: string) => {
    window.history.pushState(null, '', next)
    setPath(window.location.pathname)
  }
  return { path, navigate }
}

function Link({ to, navigate, children, active }: { to: string; navigate: (path: string) => void; children: React.ReactNode; active?: boolean }) {
  return <a href={to} aria-current={active ? 'page' : undefined} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); navigate(to)
  }}>{children}</a>
}

function ScreenPlaceholder({ route }: { route: ScreenRoute }) {
  return <section className="panel placeholder" aria-labelledby="screen-title">
    <span className="eyebrow">{route.id} · P0</span>
    <h1 id="screen-title">{route.name}</h1>
    <p className="status">Chưa triển khai</p>
    <p>Đây là vị trí dự kiến cho màn hình. Nội dung và thao tác sẽ được bổ sung sau khi duyệt riêng màn hình này.</p>
  </section>
}

function StatePage({ code, title, detail, navigate, to }: { code: string; title: string; detail: string; navigate: (path: string) => void; to?: string }) {
  return <section className="panel state-page" role={code === 'Đang kiểm tra' ? 'status' : undefined}>
    <span className="eyebrow">{code}</span><h1>{title}</h1><p>{detail}</p>
    {to && <Link to={to} navigate={navigate}>Quay về đăng nhập</Link>}
  </section>
}

function PublicLayout({ route, navigate }: { route: ScreenRoute; navigate: (path: string) => void }) {
  return <div className="public-layout">
    <header className="public-header"><span className="wordmark">EduCore</span><span>Nền tảng quản lý trung tâm</span></header>
    <main><ScreenPlaceholder route={route} />
      <nav className="public-links" aria-label="Truy cập công khai">
        <Link to="/login" navigate={navigate}>Đăng nhập</Link>
        <Link to="/forgot-password" navigate={navigate}>Quên mật khẩu</Link>
        <Link to="/activate-account" navigate={navigate}>Kích hoạt tài khoản</Link>
      </nav>
    </main>
  </div>
}

export { AppShell } from './shared/shell/AppShell.tsx'

export function AppView({ state, path, navigate, onLogout, controller = sessions }: { state: AuthState; path: string; navigate: (path: string) => void; onLogout: () => void; controller?: SessionController }) {
  const [portalChild, setPortalChild] = useState<{ tenantId: string; viewerId: string; studentId: string } | null>(null)
  const result = resolveRoute(path, state)
  if (result.kind === 'not-found') return <ErrorScreen code="404" navigate={navigate} />
  if (result.kind === 'public') {
    if (result.route.id === 'AU01') return <>
      {state.status === 'unauthenticated' && state.reason && <p className="session-notice" role="status">{state.reason === 'logout-unconfirmed'
        ? 'Đã đăng xuất trên trình duyệt này. Chưa xác nhận được việc thu hồi phiên trên máy chủ.'
        : state.reason === 'logged-out' ? 'Bạn đã đăng xuất.' : state.reason === 'unavailable'
          ? 'Không thể xác minh phiên. Vui lòng đăng nhập lại khi kết nối ổn định.'
          : 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.'}</p>}
      <LoginScreen navigate={navigate} onSubmit={async (email, password) => {
        if (await controller.login(email, password)) navigate('/select-tenant')
      }} />
    </>
    if (result.route.id === 'AU03') return <RecoveryRequestScreen navigate={navigate} onRequest={(email, signal) => api.requestPasswordResetOtp(email, signal)} />
    if (result.route.id === 'AU04') return <ResetPasswordScreen navigate={navigate} onReset={(email, otp, password, signal) => api.completePasswordReset(email, otp, password, signal)} />
    if (result.route.id === 'AU06') return <ActivationScreen navigate={navigate}
      onRequest={(email, signal) => api.requestActivationOtp(email, signal)}
      onActivate={(email, otp, password, signal) => api.completeActivation(email, otp, password, signal)} />
    return <PublicLayout route={result.route} navigate={navigate} />
  }
  if (result.kind === 'checking') return <StatePage code="Đang kiểm tra" title="Đang kiểm tra phiên" detail="Vui lòng chờ trong giây lát." navigate={navigate} />
  if (result.kind === 'unauthenticated') return <StatePage code="Chưa đăng nhập" title="Cần đăng nhập" detail="Phiên đăng nhập chưa có, đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại." navigate={navigate} to="/login" />
  if (result.kind === 'tenant-selection') return <><TenantSelectionScreen tenants={state.status === 'authenticated' ? state.session.principal.allowedTenants : []} onSelect={async (id) => {
    if (!await controller.selectTenant(id)) return false
    const next = controller.getSnapshot()
    return next.status === 'authenticated' ? landingPath(next.session) : false
  }} navigate={navigate} /><button className="tenant-logout" onClick={onLogout}>Đăng xuất</button></>
  if (result.kind === 'forbidden') return <ErrorScreen code="403" navigate={navigate} />
  const session = state.status === 'authenticated' ? state.session : null
  const tenant = session?.principal.allowedTenants.find((item) => item.id === result.tenantId)
  if (!tenant) return <ErrorScreen code="403" navigate={navigate} />
  const screen = result.route.id === 'AU05'
    ? <ProfileScreen session={session!} tenant={tenant} onLogout={onLogout} />
    : result.route.id === 'GL01' ? <NotificationProduction key={tenant.id} tenantId={tenant.id} token={session!.accessToken} /> : (['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08'] as string[]).includes(result.route.id)
      ? <AcademicProduction key={`${tenant.id}:${result.route.id}:${result.params.studentId ?? result.params.teacherId ?? result.params.classId ?? ''}`}
          id={result.route.id as AcademicId} tenantId={tenant.id} token={session!.accessToken} navigate={navigate}
          allowed={session!.navigation?.screenIds ?? []}
          selectedId={result.params.studentId ?? result.params.teacherId ?? result.params.classId} />
      : (['SC01', 'SC02', 'SC03', 'SC05', 'SC06'] as string[]).includes(result.route.id)
        ? <SchedulingProduction key={`${tenant.id}:${result.route.id}:${result.params.sessionId ?? ''}`}
          id={result.route.id as 'SC01' | 'SC02' | 'SC03' | 'SC05' | 'SC06'}
          tenantId={tenant.id} token={session!.accessToken} selectedId={result.params.sessionId} navigate={navigate}
          allowed={session!.navigation?.screenIds ?? []} />
      : (['AT01', 'AT02', 'AT03', 'AT04'] as string[]).includes(result.route.id)
        ? <SchedulingAttendanceProduction key={`${tenant.id}:${result.route.id}:${result.params.sessionId ?? ''}`}
          id={result.route.id as 'AT01' | 'AT02' | 'AT03' | 'AT04'}
          tenantId={tenant.id} token={session!.accessToken} selectedId={result.params.sessionId} navigate={navigate} />
      : (['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07'] as string[]).includes(result.route.id)
        ? <BillingProduction key={`${tenant.id}:${result.route.id}:${result.params.draftId ?? result.params.invoiceId ?? ''}`}
            id={result.route.id as 'BL01' | 'BL02' | 'BL03' | 'BL04' | 'BL05' | 'BL06' | 'BL07'}
            tenantId={tenant.id} token={session!.accessToken} selectedId={result.params.draftId ?? result.params.invoiceId}
            api={api} navigate={navigate} />
      : (['BL09', 'BL10', 'OP04', 'OP05'] as string[]).includes(result.route.id)
        ? <FinanceProduction key={`${tenant.id}:${result.route.id}:${result.params.invoiceId ?? result.params.requestId ?? ''}`}
            id={result.route.id as 'BL09' | 'BL10' | 'OP04' | 'OP05'} tenantId={tenant.id}
            token={session!.accessToken} selectedId={result.params.invoiceId ?? result.params.requestId}
            api={api} navigate={navigate} />
      : (['AS01', 'AS02', 'AS03', 'AS04', 'AS05', 'AS06', 'AS07'] as string[]).includes(result.route.id)
        ? <AssignmentsProduction key={`${tenant.id}:${result.route.id}:${result.params.assignmentId ?? result.params.submissionId ?? ''}`}
          id={result.route.id as 'AS01' | 'AS02' | 'AS03' | 'AS04' | 'AS05' | 'AS06' | 'AS07'} tenantId={tenant.id}
          token={session!.accessToken} selectedId={result.params.assignmentId ?? result.params.submissionId} allowed={session!.navigation?.screenIds ?? []} navigate={navigate} />
      : result.route.id === 'G01' ? <DashboardProduction key={`${tenant.id}:${session!.accessToken}`} tenantId={tenant.id} token={session!.accessToken}
          onUnauthorized={() => controller.expire('access-revoked')} />
      : (['PO01', 'PO02', 'PO03', 'PO04', 'PO05'] as string[]).includes(result.route.id)
        ? <PortalProduction key={`${tenant.id}:${session!.accessToken}:${result.route.id}:${result.params.studentId ?? ''}`}
            id={result.route.id as 'PO01' | 'PO02' | 'PO03' | 'PO04' | 'PO05'} tenantId={tenant.id}
            token={session!.accessToken} viewerId={session!.principal.id} selectedId={result.params.studentId}
            initialChildId={portalChild?.tenantId === tenant.id && portalChild.viewerId === session!.principal.id ? portalChild.studentId : undefined}
            onChooseChild={studentId => setPortalChild({ tenantId: tenant.id, viewerId: session!.principal.id, studentId })}
            allowed={session!.navigation?.screenIds ?? []} navigate={navigate} />
      : (['OP06', 'OP07'] as string[]).includes(result.route.id)
        ? <OperationsProduction key={`${tenant.id}:${result.route.id}`} id={result.route.id as 'OP06' | 'OP07'} tenantId={tenant.id} token={session!.accessToken} />
      : (managementIds as readonly string[]).includes(result.route.id) ? ['OP01', 'OP02', 'OP03'].includes(result.route.id)
        ? <ProductionManagement key={`${tenant.id}:${result.route.id}:${result.params.membershipId ?? ''}`} id={result.route.id as ManagementId} tenantId={tenant.id} selectedId={result.params.membershipId} session={session!}
          open={(screen, recordId) => navigate(screen === 'OP01' ? tenantPath(tenant.id, '/settings/members')
            : tenantPath(tenant.id, `/settings/members/${encodeURIComponent(recordId ?? '')}`))} />
        : <ManagementScreen id={result.route.id as ManagementId} tenantId={tenant.id} selectedId={result.params.membershipId ?? result.params.requestId} />
      : <ScreenPlaceholder route={result.route} />
  return <AppShell route={result.route} tenant={tenant} navigate={navigate} onLogout={onLogout} navigation={navigationRoutes(session!)}>
    {screen}
  </AppShell>
}

export default function App({ controller = sessions }: { controller?: SessionController } = {}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { path, navigate } = usePath()
  const financeRefreshPath = useRef<string | null>(null)
  useEffect(() => { controller.finishInitialCheck() }, [controller])
  useEffect(() => {
    if (matchRoute(path)?.route.id !== 'BL10') { financeRefreshPath.current = null; return }
    if (state.status !== 'authenticated' || state.session.navigation?.screenIds.includes('BL10')
      || financeRefreshPath.current === path) return
    // An invoice issued after login can make BL10 newly eligible. Refresh
    // server evidence once for this route; the screen stays forbidden until
    // the new navigation response authorizes it.
    financeRefreshPath.current = path
    void controller.revalidate(false).catch(() => {})
  }, [path, state, controller])
  useEffect(() => {
    if (state.status !== 'authenticated' || !state.session.navigation) return
    const evidence = state.session.navigation
    const timer = window.setTimeout(() => controller.expireNavigation(evidence), Math.max(0, evidence.validUntil - Date.now()))
    return () => window.clearTimeout(timer)
  }, [state, controller])
  useEffect(() => {
    if (state.status !== 'authenticated') return
    const remaining = state.session.expiresAt - Date.now()
    if (remaining <= 0) { controller.expire(); return }
    const timer = window.setTimeout(() => {
      const current = controller.getSnapshot()
      if (current.status !== 'authenticated') return
      const refresh = current.session.expiresAt - Date.now() <= 60_000
      void controller.revalidate(refresh).catch(() => { /* Controller already failed closed. */ })
    }, Math.max(0, Math.min(60_000, remaining - 60_000)))
    const expiry = window.setTimeout(() => controller.expire(), remaining)
    return () => { window.clearTimeout(timer); window.clearTimeout(expiry) }
  }, [state, controller])
  useEffect(() => {
    const check = () => {
      const current = controller.getSnapshot()
      if (current.status === 'authenticated') void controller.revalidate(current.session.expiresAt - Date.now() <= 60_000).catch(() => {})
    }
    window.addEventListener('focus', check)
    return () => window.removeEventListener('focus', check)
  }, [controller])
  return <AppView state={state} path={path} navigate={navigate} controller={controller} onLogout={() => { void controller.logout(); navigate('/login') }} />
}
