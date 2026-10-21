import { useEffect, useState, useSyncExternalStore } from 'react'
import { ApiClient } from './api.ts'
import { resolveRoute, SessionController } from './auth.ts'
import type { AuthState, Tenant } from './auth.ts'
import type { ScreenRoute } from './routes.ts'
import { tenantPath } from './routes.ts'
import { LoginScreen } from './screens/Authentication & Shared/AU01/LoginScreen.tsx'
import { TenantSelectionScreen } from './screens/Authentication & Shared/AU02/TenantSelectionScreen.tsx'
import { RecoveryRequestScreen } from './screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx'
import { ResetPasswordScreen } from './screens/Authentication & Shared/AU04/ResetPasswordScreen.tsx'
import { ProfileScreen } from './screens/Authentication & Shared/AU05/ProfileScreen.tsx'
import { ActivationScreen } from './screens/Authentication & Shared/AU06/ActivationScreen.tsx'
import { NotificationScreen } from './screens/Authentication & Shared/GL01/NotificationScreen.tsx'
import { ErrorScreen } from './screens/Authentication & Shared/GL02/ErrorScreen.tsx'
import { AcademicScreen } from './screens/Academic Management/AcademicScreens.tsx'
import type { AcademicId } from './screens/Academic Management/AcademicScreens.tsx'
import { AcademicMoreScreen } from './screens/Academic Management/AcademicMoreScreens.tsx'
import type { MoreId } from './screens/Academic Management/AcademicMoreScreens.tsx'
import './App.css'

const sessions = new SessionController(new ApiClient(import.meta.env.VITE_API_BASE_URL ?? ''))

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

export function AppShell({ route, tenant, navigate, onLogout, children, preview = false, previewNavigation }: {
  route: ScreenRoute; tenant: Tenant; navigate: (path: string) => void;
  onLogout: () => void; children: React.ReactNode; preview?: boolean; previewNavigation?: React.ReactNode
}) {
  const profile = tenantPath(tenant.id, '/me')
  return <div className="app-shell">
    <aside className="sidebar"><div className="wordmark">EduCore</div>
      <div className="sidebar-caption">Không gian trung tâm</div>
      <nav aria-label="Điều hướng chính">{preview ? previewNavigation : <Link to={profile} navigate={navigate} active={route.id === 'AU05'}>Tài khoản</Link>}</nav>
      <p className="sidebar-note">Các mục nghiệp vụ sẽ xuất hiện khi có hợp đồng quyền hiệu lực và màn hình được triển khai.</p>
    </aside>
    <div className="shell-body">
      <header className="topbar"><span className="mobile-brand wordmark">EduCore</span>
        <div className="tenant-context"><span className="eyebrow">Trung tâm đang chọn</span><strong>{tenant.name}</strong></div>
        {!preview && <div className="top-actions"><Link to="/select-tenant" navigate={navigate}>Đổi trung tâm</Link><button onClick={onLogout}>Đăng xuất</button></div>}
      </header>
      <main className="content"><p className="breadcrumb">{tenant.name} / {route.name}</p>{children}</main>
      <nav className="mobile-nav" aria-label="Điều hướng di động">{preview ? previewNavigation : <Link to={profile} navigate={navigate} active={route.id === 'AU05'}>Tài khoản</Link>}</nav>
    </div>
  </div>
}

export function AppView({ state, path, navigate, onLogout }: { state: AuthState; path: string; navigate: (path: string) => void; onLogout: () => void }) {
  const result = resolveRoute(path, state)
  if (result.kind === 'not-found') return <ErrorScreen code="404" navigate={navigate} />
  if (result.kind === 'public') {
    if (result.route.id === 'AU01') return <LoginScreen navigate={navigate} />
    if (result.route.id === 'AU03') return <RecoveryRequestScreen navigate={navigate} />
    if (result.route.id === 'AU04') return <ResetPasswordScreen navigate={navigate} />
    if (result.route.id === 'AU06') return <ActivationScreen navigate={navigate} />
    return <PublicLayout route={result.route} navigate={navigate} />
  }
  if (result.kind === 'checking') return <StatePage code="Đang kiểm tra" title="Đang kiểm tra phiên" detail="Vui lòng chờ trong giây lát." navigate={navigate} />
  if (result.kind === 'unauthenticated') return <StatePage code="Chưa đăng nhập" title="Cần đăng nhập" detail="Phiên không còn sẵn có trên trình duyệt này." navigate={navigate} to="/login" />
  if (result.kind === 'tenant-selection') return <TenantSelectionScreen tenants={state.status === 'authenticated' ? state.session.principal.allowedTenants : []} onSelect={(id) => sessions.selectTenant(id)} navigate={navigate} />
  if (result.kind === 'forbidden') return <ErrorScreen code="403" navigate={navigate} />
  const session = state.status === 'authenticated' ? state.session : null
  const tenant = session?.principal.allowedTenants.find((item) => item.id === result.tenantId)
  if (!tenant) return <ErrorScreen code="403" navigate={navigate} />
  const screen = result.route.id === 'AU05'
    ? <ProfileScreen session={session!} tenant={tenant} onLogout={onLogout} />
    : result.route.id === 'GL01' ? <NotificationScreen /> : (['AC01', 'AC02', 'AC03', 'AC04'] as string[]).includes(result.route.id)
      ? <AcademicScreen id={result.route.id as AcademicId} tenantId={tenant.id} navigate={navigate} selectedId={result.params.studentId ?? result.params.teacherId} />
      : (['AC05', 'AC06', 'AC07', 'AC08'] as string[]).includes(result.route.id)
        ? <AcademicMoreScreen id={result.route.id as MoreId} tenantId={tenant.id} navigate={navigate} selectedId={result.params.classId} />
      : <ScreenPlaceholder route={result.route} />
  return <AppShell route={result.route} tenant={tenant} navigate={navigate} onLogout={onLogout}>
    {screen}
  </AppShell>
}

export default function App() {
  const state = useSyncExternalStore(sessions.subscribe, sessions.getSnapshot)
  const { path, navigate } = usePath()
  useEffect(() => { sessions.finishInitialCheck() }, [])
  useEffect(() => {
    if (state.status !== 'authenticated') return
    const remaining = state.session.expiresAt - Date.now()
    if (remaining <= 0) { sessions.expire(); return }
    const timer = window.setTimeout(() => sessions.expire(), remaining)
    return () => window.clearTimeout(timer)
  }, [state])
  return <AppView state={state} path={path} navigate={navigate} onLogout={() => { void sessions.logout(); navigate('/login') }} />
}
