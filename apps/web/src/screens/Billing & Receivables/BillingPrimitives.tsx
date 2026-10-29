import type { ReactNode } from 'react'
import { PageHeader } from '../../shared/ui/SharedUI.tsx'

export function MoneyVnd({ value }: { value: string }) {
  if (!/^-?\d+$/.test(value)) return <span>Giá trị không hợp lệ</span>
  const negative = value.startsWith('-')
  const digits = negative ? value.slice(1) : value
  const normalized = digits.replace(/^0+(?=\d)/, '')
  return <span className="billing-money">{negative ? '−' : ''}{normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫</span>
}

export function BillingHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <PageHeader className="billing-heading" title={title} description={subtitle} action={action} />
}

export function BillingCard({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return <section className="billing-card"><div className="billing-card-head"><h2>{title}</h2>{hint && <p>{hint}</p>}</div>{children}</section>
}

export function BillingMetrics({ items }: { items: { label: string; value: ReactNode; hint: string }[] }) {
  return <div className="billing-metrics">{items.map((item) => <div className="billing-metric" key={item.label}><small>{item.label}</small><strong>{item.value}</strong><span>{item.hint}</span></div>)}</div>
}

export function BillingState({ title, children, alert = false }: { title: string; children: ReactNode; alert?: boolean }) {
  return <div className="billing-state" role={alert ? 'alert' : 'status'}><strong>{title}</strong><p>{children}</p></div>
}

export function BillingBadge({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'success' | 'warning' | 'danger' }) {
  return <span className={`billing-badge billing-badge-${tone}`}>{children}</span>
}

export function PendingNotice({ children }: { children: ReactNode }) {
  return <p className="billing-pending" role="status">{children}</p>
}
