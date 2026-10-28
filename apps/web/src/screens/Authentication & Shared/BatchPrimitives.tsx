import { useEffect, useId, useRef } from 'react'
import type { MouseEvent, ReactNode, Ref } from 'react'
import { AuthPageLayout } from './AuthComponents.tsx'
import './BatchScreens.css'

export type Navigate = (path: string) => void

export function AppLink({ to, navigate, className, children, ref }: { to: string; navigate: Navigate; className?: string; children: ReactNode; ref?: Ref<HTMLAnchorElement> }) {
  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a className={className} href={to} onClick={onClick} ref={ref}>{children}</a>
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

export function Skeleton({ label = 'Đang tải dữ liệu', metrics = false }: { label?: string; metrics?: boolean }) {
  return <section className="ec-loading" role="status" aria-label={label} aria-busy="true">
    <span className="ec-visually-hidden">{label}</span>
    {metrics && <div className="ec-skeleton-metrics" aria-hidden="true">{[1, 2, 3].map(n => <div className="ec-skeleton-card" key={n}><span className="ec-skeleton short" /><span className="ec-skeleton value" /></div>)}</div>}
    <div className="ec-skeleton-card" aria-hidden="true"><span className="ec-skeleton short" />{[1, 2, 3, 4].map(n => <span className="ec-skeleton" key={n} />)}</div>
  </section>
}

export function EmptyState({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <div className="ec-empty-state" role="status"><h3>{title}</h3><p>{detail}</p>{children}</div>
}

// Native modal supplies focus containment and makes the background inert.
export function ConfirmDialog({ title, detail, busy = false, onClose, children }: {
  title: string; detail?: string; busy?: boolean; onClose: () => void; children: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId(), detailId = useId()
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    element?.querySelector<HTMLElement>('input,textarea,select')?.focus()
    return () => { element?.close(); if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog ref={dialog} className="ec-confirm-dialog" aria-labelledby={titleId} aria-describedby={detail ? detailId : undefined}
    aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose() }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" disabled={busy} onClick={onClose} aria-label="Đóng hộp thoại">×</button></header>
    {detail && <p id={detailId}>{detail}</p>}{children}
  </dialog>
}
