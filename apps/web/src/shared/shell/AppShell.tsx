import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { Tenant } from '../../auth.ts'
import type { ScreenRoute } from '../../routes.ts'
import { tenantPath } from '../../routes.ts'
import { AssetIcon } from '../../assets/AssetIcon.tsx'
import type { AssetIconName } from '../../assets/AssetIcon.tsx'
import styles from './shell.module.css'

export type AppShellProps = {
  route: ScreenRoute
  tenant: Tenant
  navigate: (path: string) => void
  onLogout: () => void
  children: ReactNode
  preview?: boolean
  previewNavigation?: ReactNode
  navigation?: readonly ScreenRoute[]
}

const groups = [
  { label: 'Tổng quan', ids: /^(G01|PO)/ },
  { label: 'Học vụ', ids: /^(AC|SC|AT)/ },
  { label: 'Giảng dạy & học tập', ids: /^AS/ },
  { label: 'Học phí', ids: /^BL/ },
  { label: 'Quản trị & vận hành', ids: /^(OP|GL)/ },
]

const navLabels: Record<string, string> = {
  G01: 'Tổng quan', AC01: 'Học viên', AC03: 'Giáo viên', AC05: 'Môn & trình độ', AC06: 'Khóa học', AC07: 'Lớp học',
  SC01: 'Lịch trung tâm', SC02: 'Phòng & tài nguyên', SC03: 'Tạo lịch', SC06: 'Lịch cá nhân',
  AT01: 'Điểm danh', AT03: 'Gửi đơn nghỉ', AT04: 'Xử lý đơn nghỉ', AS01: 'Bài tập', AS02: 'Tạo bài tập', AS04: 'Chấm bài',
  BL01: 'Đơn giá học phí', BL02: 'Ưu đãi anh/chị/em', BL03: 'Kỳ học phí & lần tính', BL04: 'Hóa đơn dự thảo',
  BL06: 'Hóa đơn đã phát hành', BL09: 'Công nợ & ví', GL01: 'Thông báo', OP03: 'Liên kết phụ huynh',
  OP04: 'Phê duyệt', OP06: 'Nhật ký vận hành', OP07: 'Tác vụ hệ thống',
}

function icon(id: string): AssetIconName {
  return id === 'GL01' ? 'notifications' : /^BL/.test(id) ? 'finance' : /^AS|^PO/.test(id) ? 'teaching'
    : /^SC|^AT/.test(id) ? 'classes' : /^AC/.test(id) ? 'people' : /^OP|^GL|^AU/.test(id) ? 'settings' : 'overview'
}

function contentMeasure(id: string) {
  if (['G01', 'OP01', 'AS01', 'PO01', 'AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08'].includes(id) || id.startsWith('BL')) return 'compact'
  if (id.startsWith('AS')) return 'teaching'
  if (id.startsWith('PO')) return 'portal'
  if (id.startsWith('AU') || id.startsWith('GL')) return 'account'
  return 'standard'
}

function ShellLink({ to, navigate, children, active, onFollow }: {
  to: string; navigate: (path: string) => void; children: ReactNode; active?: boolean; onFollow?: () => void
}) {
  return <a href={to} aria-current={active ? 'page' : undefined} onClick={event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onFollow?.()
    navigate(to)
  }}>{children}</a>
}

function RoleNav({ route, tenant, navigation, navigate, onFollow }: {
  route: ScreenRoute; tenant: Tenant; navigation: readonly ScreenRoute[]; navigate: (path: string) => void; onFollow?: () => void
}) {
  const business = navigation.filter(item => !item.selfService)
  return <>
    {groups.map(group => {
      const items = business.filter(item => group.ids.test(item.id))
      return items.length ? <details className={`navigation-group ${styles.group}`} key={`${tenant.id}:${route.id}:${group.label}`} open={group.ids.test(route.id)}>
        <summary className={`sidebar-caption ${styles.groupLabel}`}>{group.label}</summary>
        {items.map(item => <ShellLink key={item.id} to={item.path.replace(':tenantId', encodeURIComponent(tenant.id))} navigate={navigate}
          active={item.id === route.id} onFollow={onFollow}>
          <span className={styles.navIcon}><AssetIcon name={icon(item.id)} /></span><span>{navLabels[item.id] ?? item.name}</span>
        </ShellLink>)}
      </details> : null
    })}
    <div className={`navigation-group ${styles.accountNavigation}`}>
      <ShellLink to={tenantPath(tenant.id, '/me')} navigate={navigate} active={route.id === 'AU05'} onFollow={onFollow}>
        <span className={styles.navIcon}><AssetIcon name="settings" /></span><span>Tài khoản</span>
      </ShellLink>
    </div>
  </>
}

export function AppShell({ route, tenant, navigate, onLogout, children, preview = false, previewNavigation, navigation = [] }: AppShellProps) {
  const accountRef = useRef<HTMLDetailsElement>(null)
  const mobileRef = useRef<HTMLDetailsElement>(null)
  const scopeRef = useRef(`${tenant.id}:${route.id}`)
  const profile = tenantPath(tenant.id, '/me')
  const closeMenus = () => {
    if (accountRef.current) accountRef.current.open = false
    if (mobileRef.current) mobileRef.current.open = false
  }

  useEffect(() => {
    const scope = `${tenant.id}:${route.id}`
    if (scopeRef.current !== scope) {
      closeMenus()
      document.getElementById('main-content')?.focus()
      scopeRef.current = scope
    }
  }, [route.id, tenant.id])
  useEffect(() => {
    const onOutside = (event: PointerEvent) => {
      const target = event.target
      if (!target) return
      if (accountRef.current?.open && !accountRef.current.contains(target as Node)) accountRef.current.open = false
      if (mobileRef.current?.open && !mobileRef.current.contains(target as Node)) mobileRef.current.open = false
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [])

  return <div className="app-shell"><div className={styles.shell}>
    <a className={`skip-link ${styles.skipLink}`} href="#main-content">Đến nội dung chính</a>
    <aside className={`sidebar ${styles.sidebar}`}>
      <div className={styles.brandRow}><span className={`wordmark ${styles.wordmark}`}>EduCore</span></div>
      <div className={`sidebar-caption ${styles.navHeading}`}>Không gian trung tâm</div>
      <nav aria-label="Điều hướng chính" className={styles.navigation}>
        {preview ? previewNavigation : <RoleNav route={route} tenant={tenant} navigation={navigation} navigate={navigate} />}
      </nav>
      {!preview && !navigation.some(item => !item.selfService) && <p className={styles.sidebarNote} role="status">Chưa có mục nghiệp vụ được cấp quyền truy cập. Bạn vẫn có thể xem tài khoản.</p>}
    </aside>
    <div className={`shell-body ${styles.body}`}>
      <header className={`topbar ${styles.topbar}`}>
        <span className={`mobile-brand wordmark ${styles.mobileBrand}`}>EduCore</span>
        <div className={`tenant-context ${styles.tenantContext}`}>
          <span className="eyebrow">Trung tâm đang chọn</span><strong>{tenant.name}</strong>
        </div>
        {!preview && <div className={`top-actions ${styles.topActions}`}>
          <details ref={accountRef} className={`account-menu ${styles.accountMenu}`} onKeyDown={event => {
            if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
          }}>
            <summary><span className={styles.navIcon}><AssetIcon name="settings" /></span>Tài khoản<AssetIcon name="chevron-down" /></summary>
            <div className={styles.accountMenuItems}>
              <ShellLink to={profile} navigate={navigate} onFollow={closeMenus}>Thông tin tài khoản</ShellLink>
              <ShellLink to="/select-tenant" navigate={navigate} onFollow={closeMenus}>Đổi trung tâm</ShellLink>
              <button type="button" onClick={() => { closeMenus(); onLogout() }}>Đăng xuất</button>
            </div>
          </details>
        </div>}
      </header>
      <main id="main-content" tabIndex={-1} className={`content ${styles.content}`} data-content-measure={contentMeasure(route.id)}>
        <p className={`breadcrumb ${styles.breadcrumb}`}>{tenant.name} / {route.name}</p>{children}
      </main>
      <nav className={`mobile-nav ${styles.mobileNav}`} aria-label="Điều hướng di động">
        {preview ? previewNavigation : <details ref={mobileRef} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
        }} onToggle={event => {
          if (event.currentTarget.open) (event.currentTarget.querySelector<HTMLAnchorElement>('details[open] a')
            ?? event.currentTarget.querySelector<HTMLAnchorElement>('a[href$="/me"]'))?.focus()
        }}>
          <summary>Menu điều hướng</summary>
          <div className={styles.mobileLinks}><RoleNav route={route} tenant={tenant} navigation={navigation} navigate={navigate} onFollow={closeMenus} /></div>
        </details>}
      </nav>
    </div>
  </div></div>
}
