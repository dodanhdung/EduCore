import { useEffect, useState, useSyncExternalStore } from 'react'
import { ApiClient } from './api.ts'
import { resolveRoute, SessionController } from './auth.ts'
import type { AuthState, Tenant } from './auth.ts'
import type { ScreenRoute } from './routes.ts'
import { tenantPath } from './routes.ts'
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

function AppShell({ route, tenant, navigate, onLogout, children }: {
  route: ScreenRoute; tenant: Tenant; navigate: (path: string) => void;
  onLogout: () => void; children: React.ReactNode
}) {
  const profile = tenantPath(tenant.id, '/me')
  return <div className="app-shell">
    <aside className="sidebar"><div className="wordmark">EduCore</div>
      <div className="sidebar-caption">Không gian trung tâm</div>
      <nav aria-label="Điều hướng chính"><Link to={profile} navigate={navigate} active={route.id === 'AU05'}>Tài khoản</Link></nav>
      <p className="sidebar-note">Các mục nghiệp vụ sẽ xuất hiện khi có hợp đồng quyền hiệu lực và màn hình được triển khai.</p>
    </aside>
    <div className="shell-body">
      <header className="topbar"><span className="mobile-brand wordmark">EduCore</span>
        <div className="tenant-context"><span className="eyebrow">Trung tâm đang chọn</span><strong>{tenant.name}</strong></div>
        <div className="top-actions"><Link to="/select-tenant" navigate={navigate}>Đổi trung tâm</Link><button onClick={onLogout}>Đăng xuất</button></div>
      </header>
      <main className="content"><p className="breadcrumb">{tenant.name} / {route.name}</p>{children}</main>
      <nav className="mobile-nav" aria-label="Điều hướng di động"><Link to={profile} navigate={navigate} active={route.id === 'AU05'}>Tài khoản</Link></nav>
    </div>
  </div>
}

export function AppView({ state, path, navigate, onLogout }: { state: AuthState; path: string; navigate: (path: string) => void; onLogout: () => void }) {
  const result = resolveRoute(path, state)
  if (result.kind === 'not-found') return <StatePage code="404" title="Không tìm thấy trang" detail="Đường dẫn này chưa có trong ứng dụng." navigate={navigate} />
  if (result.kind === 'public') return <PublicLayout route={result.route} navigate={navigate} />
  if (result.kind === 'checking') return <StatePage code="Đang kiểm tra" title="Đang kiểm tra phiên" detail="Vui lòng chờ trong giây lát." navigate={navigate} />
  if (result.kind === 'unauthenticated') return <StatePage code="Chưa đăng nhập" title="Cần đăng nhập" detail="Phiên không còn sẵn có trên trình duyệt này." navigate={navigate} to="/login" />
  if (result.kind === 'tenant-selection') return <PublicLayout route={result.route} navigate={navigate} />
  if (result.kind === 'forbidden') return <StatePage code="403" title="Không đủ quyền" detail="Không thể hiển thị nội dung ở phạm vi này." navigate={navigate} />
  const session = state.status === 'authenticated' ? state.session : null
  const tenant = session?.principal.allowedTenants.find((item) => item.id === result.tenantId)
  if (!tenant) return <StatePage code="403" title="Không đủ quyền" detail="Trung tâm này không thuộc phạm vi phiên hiện tại." navigate={navigate} />
  return <AppShell route={result.route} tenant={tenant} navigate={navigate} onLogout={onLogout}>
    <ScreenPlaceholder route={result.route} />
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
