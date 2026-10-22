import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import './Assignments.css'

export function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <div className="as-page"><header className="as-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</div>
}
export function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: ReactNode }) {
  return <section className="as-card">{title && <div className="as-card-heading"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>}{children}</section>
}
export function Badge({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'muted' }) { return <span className={`as-badge as-${tone}`}>{children}</span> }
export function Notice({ children }: { children: ReactNode }) { return <p className="as-notice">{children}</p> }
export function State({ kind, children }: { kind: 'loading' | 'empty' | 'error' | 'not-found'; children?: ReactNode }) {
  return <Card title={{ loading: 'Đang tải', empty: 'Chưa có dữ liệu', error: 'Không thể tải dữ liệu', 'not-found': 'Không tìm thấy' }[kind]}><p>{children ?? 'Dữ liệu sẽ xuất hiện khi dịch vụ nghiệp vụ được kết nối.'}</p></Card>
}
export function Button({ children, onClick, secondary = false, disabled = false }: { children: ReactNode; onClick?: () => void; secondary?: boolean; disabled?: boolean }) { return <button type="button" className={`as-button${secondary ? ' as-secondary' : ''}`} onClick={onClick} disabled={disabled}>{children}</button> }
export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const old = document.activeElement as HTMLElement | null; ref.current?.focus(); const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); if (event.key === 'Tab' && ref.current) { const buttons = [...ref.current.querySelectorAll<HTMLElement>('button')]; if (!buttons.length) return; const first = buttons[0], last = buttons.at(-1)!; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() } } }; document.addEventListener('keydown', key); return () => { document.removeEventListener('keydown', key); old?.focus() } }, [onClose])
  return <div className="as-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="as-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}><h2>{title}</h2>{children}<div className="as-actions"><Button secondary onClick={onClose}>Đóng</Button></div></div></div>
}
