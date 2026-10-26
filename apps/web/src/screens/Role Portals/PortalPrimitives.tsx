import type { ReactNode } from 'react'
import './portals.css'

export function PortalPage({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return <div className="portal-page"><header className="portal-heading"><h1>{title}</h1>{detail && <p>{detail}</p>}</header>{children}</div>
}
export function PortalCard({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return <section className="portal-card"><h2>{title}</h2>{hint && <p className="portal-muted">{hint}</p>}{children}</section>
}
export function PortalState({ title, children }: { title: string; children: ReactNode }) {
  return <section className="portal-card portal-state" role="status"><h2>{title}</h2><p>{children}</p></section>
}
export function PortalLink({ to, navigate, children }: { to: string; navigate: (path: string) => void; children: ReactNode }) {
  if (!to) return <span className="portal-pending">{children}: chưa được cấp quyền truy cập</span>
  return <a className="portal-link" href={to} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(to) }}>{children}</a>
}
export function PortalMoney({ value }: { value: string }) {
  const formatted = /^-?\d+$/.test(value) ? BigInt(value).toLocaleString('vi-VN') : '—'
  return <span className="portal-money">{formatted} ₫</span>
}
