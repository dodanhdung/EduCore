import type { Session, Tenant } from '../../../auth.ts'
import '../BatchPrimitives.tsx'

export function ProfileScreen({ session, tenant, onLogout }: { session: Session; tenant: Tenant; onLogout: () => void }) {
  return <section className="ec-content-page">
    <span className="ec-route-tag">AU05 · Tài khoản</span>
    <div className="ec-profile-heading">
      <div><h1>Hồ sơ & phiên đăng nhập</h1><p>Thông tin phiên hiện tại và trung tâm đang truy cập.</p></div>
      <button className="ec-outline-button" onClick={onLogout}>Đăng xuất</button>
    </div>
    <div className="ec-profile-grid">
      <article className="ec-profile-card">
        <h2>Phiên hiện tại</h2>
        <dl>
          <div><dt>Mã tài khoản</dt><dd>{session.principal.id}</dd></div>
          <div><dt>Trung tâm</dt><dd>{tenant.name}</dd></div>
          <div><dt>Mã trung tâm</dt><dd>{tenant.id}</dd></div>
          <div><dt>Hết hạn</dt><dd>{new Date(session.expiresAt).toLocaleString('vi-VN')}</dd></div>
        </dl>
      </article>
      <article className="ec-profile-card">
        <h2>Quyền truy cập</h2>
        <p>Vai trò và quyền chi tiết chưa có trong dữ liệu phiên.</p>
        <span className="ec-pending-chip">PENDING_API</span>
        <h3>Trung tâm được cấp quyền</h3>
        <ul>{session.principal.allowedTenants.map((allowedTenant) => <li key={allowedTenant.id}>{allowedTenant.name}</li>)}</ul>
      </article>
    </div>
  </section>
}
