export function Header({ title, subtitle, action, onAction }: { title: string; subtitle: string; action?: string; onAction?: () => void }) {
  return <header className="academic-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action && onAction && <button className="academic-primary" onClick={onAction}>{action}</button>}</header>
}
export function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="academic-card"><h2>{title}</h2>{hint && <p className="academic-hint">{hint}</p>}{children}</section>
}
export function Metrics({ items }: { items: [string, string, string][] }) {
  return <div className="academic-metrics">{items.map(([label, value, note]) => <div className="academic-metric" key={label}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
}
export function Tabs({ items, value, onChange, label }: { items: string[]; value: string; onChange: (value: string) => void; label: string }) {
  return <div className="academic-tabs" role="tablist" aria-label={label}>{items.map((item, index) => <button key={item} role="tab" aria-selected={value === item} tabIndex={value === item ? 0 : -1} onClick={() => onChange(item)} onKeyDown={(event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    event.preventDefault()
    const next = items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]
    onChange(next)
    ;(event.currentTarget.parentElement?.querySelectorAll('[role=tab]')[items.indexOf(next)] as HTMLElement)?.focus()
  }}>{item}</button>)}</div>
}
export function Field({ label, value, onChange, placeholder, error, errorId }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; error?: boolean; errorId?: string }) {
  return <label className="academic-field"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-invalid={error || undefined} aria-describedby={error ? errorId : undefined} /></label>
}
export function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="academic-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
}
export function Empty({ preview }: { preview: boolean }) { return <p role="status" className="academic-empty">{preview ? 'Không tìm thấy dữ liệu mẫu phù hợp.' : 'Đang chờ kết nối API và quyền truy cập.'}</p> }
