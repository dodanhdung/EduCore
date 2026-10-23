import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { labels, useManagementPreview } from './ManagementTypes.ts'
import type { ViewState } from './ManagementTypes.ts'


export function Heading({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <header className="mo-heading"><div><h1>{title}</h1><p>{detail}</p></div>{children}</header>
}
export function Card({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return <section className="mo-card"><h2>{title}</h2>{detail && <p className="mo-muted">{detail}</p>}{children}</section>
}
export function Badge({ value }: { value: string }) { return <span className={`mo-badge mo-status-${value.toLowerCase()}`}>{labels[value] ?? value}</span> }
export function Metrics({ items }: { items: { label: string; value: ReactNode; detail: string; icon?: string; open?: () => void }[] }) {
  return <div className="mo-metrics">{items.map((item) => <section className="mo-metric" key={item.label}><div className="mo-metric-top"><div><p>{item.label}</p><strong>{item.value}</strong></div>{item.icon && <span className="mo-metric-icon"><img src={item.icon} alt="" /></span>}</div><small>{item.detail}</small>{item.open && <button className="mo-link" onClick={item.open}>Xem chi tiết →</button>}</section>)}</div>
}
export function StateMessage({ state }: { state: Exclude<ViewState, 'ready'> | 'pending' }) {
  const copy = {
    loading: ['Đang tải dữ liệu', 'Vui lòng chờ trong giây lát.'], empty: ['Chưa có dữ liệu', 'Chưa có bản ghi trong phạm vi được cấp.'],
    unauthenticated: ['Cần đăng nhập · 401', 'Phiên đã hết hạn. Đăng nhập lại để tiếp tục.'], forbidden: ['Không có quyền · 403', 'Không thể xem dữ liệu trong phạm vi này.'],
    'not-found': ['Không tìm thấy · 404', 'Bản ghi không có hoặc không còn khả dụng.'], conflict: ['Dữ liệu đã thay đổi · 409', 'Tải lại dữ liệu và kiểm tra trước khi tiếp tục; thay đổi chưa được thực hiện.'],
    invalid: ['Dữ liệu chưa hợp lệ · 422', 'Kiểm tra thông tin và điều kiện nghiệp vụ. Chưa thực hiện thay đổi.'], error: ['Không tải được dữ liệu', 'Lỗi kết nối hoặc máy chủ. Không thể xác nhận kết quả; vui lòng tải lại.'],
    pending: ['Chờ kết nối quyền truy cập', 'Chưa có bằng chứng quyền từ máy chủ cho màn hình này. Dữ liệu và thao tác nghiệp vụ chưa khả dụng.'],
  }[state]
  return <section className="mo-card mo-state" role={state === 'loading' ? 'status' : 'alert'} aria-busy={state === 'loading'}><h2>{copy[0]}</h2><p>{copy[1]}</p>{state === 'unauthenticated' && <a href="/login">Đăng nhập</a>}{['error', 'conflict'].includes(state) && <button onClick={() => window.location.reload()}>Tải lại</button>}</section>
}
export function Empty({ filtered = false }: { filtered?: boolean }) { return <p className="mo-empty" role="status">{filtered ? 'Không có kết quả phù hợp. Thử đổi bộ lọc.' : 'Chưa có bản ghi trong phạm vi được cấp.'}</p> }
export function Table({ caption, columns, rows }: { caption: string; columns: string[]; rows: { id: string; cells: ReactNode[] }[] }) {
  return <table className="mo-table"><caption className="mo-sr-only">{caption}</caption><thead><tr>{columns.map((col) => <th key={col} scope="col">{col}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{row.cells.map((cell, i) => <td key={i} data-label={columns[i]}>{cell}</td>)}</tr>)}</tbody></table>
}
export function Filters({ query, setQuery, status, setStatus, statuses, children }: { query: string; setQuery: (value: string) => void; status: string; setStatus: (value: string) => void; statuses: string[]; children?: ReactNode }) {
  return <Card title="Lọc và tìm kiếm" detail="Kết quả chỉ gồm dữ liệu trong phạm vi được cấp."><div className="mo-filters"><label>Tìm kiếm<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tên, mã hoặc email…" /></label><label>Trạng thái<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>{statuses.map((s) => <option key={s} value={s}>{labels[s] ?? s}</option>)}</select></label>{children}<button onClick={() => { setQuery(''); setStatus('') }}>Xóa bộ lọc</button></div></Card>
}
export function Timeline({ items }: { items: string[] }) { return <ol className="mo-timeline">{items.map((item, i) => <li key={i}>{item}</li>)}</ol> }
export type Field = { name: string; label: string; type?: 'email' | 'textarea'; options?: string[]; optional?: boolean }
export function ReviewAction({ label, title, fields = [{ name: 'reason', label: 'Lý do', type: 'textarea' }], validate, warning, details, disabled = false }: {
  label: string; title?: string; fields?: Field[]; validate?: (values: Record<string, string>) => string | undefined; warning?: string; details?: { label: string; value: string }[]; disabled?: boolean
}) {
  const preview = useManagementPreview()
  const [open, setOpen] = useState(false), [values, setValues] = useState<Record<string, string>>({}), [error, setError] = useState(''), [review, setReview] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLButtonElement>(null), titleId = useId(), errorId = useId()
  useEffect(() => { if (open) { dialog.current?.showModal(); dialog.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus() } }, [open])
  const close = () => { dialog.current?.close(); setOpen(false); setReview(false); setError(''); trigger.current?.focus() }
  return <><button ref={trigger} disabled={disabled} onClick={() => { setValues({}); setOpen(true) }}>{label}</button>{open && <dialog ref={dialog} className="mo-dialog" aria-labelledby={titleId} onCancel={(e) => { e.preventDefault(); close() }} onKeyDown={(e) => {
    if (e.key !== 'Tab') return
    const targets = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,textarea') ?? [])]
    const first = targets[0], last = targets.at(-1)
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus() }
  }}><h2 id={titleId}>{title ?? label}</h2><p>{preview ? 'Dữ liệu mẫu — UI Preview. ' : ''}Chỉ xem xét nội dung; chưa gửi yêu cầu. Thao tác thực tế: PENDING_API.</p>{details && <dl className="mo-detail">{details.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}{warning && <p className="mo-warning">{warning}</p>}<form noValidate onSubmit={(e) => {
    e.preventDefault()
    const missing = fields.find((f) => !f.optional && !values[f.name]?.trim())
    const email = fields.find((f) => f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[f.name] ?? ''))
    const message = missing ? `Nhập ${missing.label.toLocaleLowerCase('vi-VN')}.` : email ? 'Email chưa hợp lệ.' : validate?.(values)
    setError(message ?? ''); if (!message) setReview(true)
  }}>{fields.map((f) => <label key={f.name}>{f.label}{f.optional ? ' (không bắt buộc)' : ' *'}{f.options ? <select value={values[f.name] ?? ''} aria-required={!f.optional} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} onChange={(e) => { setValues({ ...values, [f.name]: e.target.value }); setReview(false) }}><option value="">Chọn…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select> : f.type === 'textarea' ? <textarea aria-required={!f.optional} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} value={values[f.name] ?? ''} maxLength={2000} onChange={(e) => { setValues({ ...values, [f.name]: e.target.value }); setReview(false) }} /> : <input aria-required={!f.optional} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} type={f.type ?? 'text'} maxLength={200} value={values[f.name] ?? ''} onChange={(e) => { setValues({ ...values, [f.name]: e.target.value }); setReview(false) }} />}</label>)}{error && <p role="alert" id={errorId}>{error}</p>}<div className="mo-actions"><button type="button" onClick={close}>Đóng</button><button type="submit">Xem lại yêu cầu</button></div>{review && <section className="mo-review" aria-live="polite"><h3>Nội dung chờ xác nhận</h3><dl>{fields.map((f) => <div key={f.name}><dt>{f.label}</dt><dd>{values[f.name] || '—'}</dd></div>)}</dl><p>Chưa thực hiện thay đổi. Cần kết nối quyền hiện hành và kết quả xác nhận từ máy chủ.</p><button disabled>Gửi yêu cầu chưa khả dụng</button></section>}</form></dialog>}</>
}
