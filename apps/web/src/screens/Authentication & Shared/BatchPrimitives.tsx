import type { MouseEvent, ReactNode } from 'react'
import { AuthPageLayout } from './AuthComponents.tsx'
import './BatchScreens.css'

export type Navigate = (path: string) => void

export function AppLink({ to, navigate, className, children }: { to: string; navigate: Navigate; className?: string; children: ReactNode }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a className={className} href={to} onClick={onClick}>{children}</a>
}

export function AuthCard({ children }: { children: ReactNode }) {
  return <section className="ec-auth-card">{children}</section>
}

export function ScreenHeading({ title, detail }: { title: string; detail: string }) {
  return <div className="ec-screen-heading"><h1>{title}</h1><p>{detail}</p></div>
}

export function AuthScreen({ children, legal = false, wide = false }: { children: ReactNode; legal?: boolean; wide?: boolean }) {
  return <AuthPageLayout legal={legal}><div className={`ec-batch-wrap${wide ? ' wide' : ''}`}>{children}</div></AuthPageLayout>
}

export function BackToLogin({ navigate }: { navigate: Navigate }) {
  return <AppLink className="ec-back-link" to="/login" navigate={navigate}>Quay lại đăng nhập</AppLink>
}
