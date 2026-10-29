import type { ReactNode } from 'react'
import { AssetIcon } from '../../assets/AssetIcon.tsx'
import type { AssetIconName } from '../../assets/AssetIcon.tsx'
import styles from './SharedUI.module.css'

/** Presentation only. The container owns scope, authorization, data and navigation. */
export function PageLayout({ header, children, aside, feedback, footer }: {
  header: ReactNode; children: ReactNode; aside?: ReactNode; feedback?: ReactNode; footer?: ReactNode
}) {
  return <div className={styles.page}><div>{header}{feedback}<div className={aside ? styles.withAside : styles.main}>
    <div>{children}</div>{aside && <aside>{aside}</aside>}
  </div></div>{footer}</div>
}

export function PageHeader({ title, description, context, action, className }: {
  title: string; description?: string; context?: ReactNode; action?: ReactNode; className?: string
}) {
  return <header className={[styles.header, className].filter(Boolean).join(' ')}><div className={styles.headerText}>
    {context && <div className={styles.context}>{context}</div>}<h1>{title}</h1>
    {description && <p>{description}</p>}</div>{action}
  </header>
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'
export function StatusBadge({ label, tone = 'neutral', domain, className }: {
  label: string; tone?: BadgeTone; domain: string; className?: string
}) {
  return <span className={[styles.badge, styles[tone], className].filter(Boolean).join(' ')} data-domain={domain}>{label}</span>
}

export type MetricAvailability =
  | { kind: 'available'; display: string }
  | { kind: 'unavailable' | 'forbidden' | 'pending-api' | 'partial'; display?: never }

export function MetricCard({ label, value, detail, icon, action }: {
  label: string; value: MetricAvailability; detail?: ReactNode;
  icon?: AssetIconName | { src: string; alt?: string }; action?: ReactNode
}) {
  const fallback = { unavailable: 'Chưa có dữ liệu', forbidden: 'Chưa có quyền xem', 'pending-api': 'Chưa có dữ liệu từ API', partial: 'Chưa đủ dữ liệu' }
  return <section className={styles.metric}><div className={styles.metricTop}><div className={styles.metricText}>
    <h2>{label}</h2><strong data-availability={value.kind}>{value.kind === 'available' ? value.display : fallback[value.kind]}</strong></div>
    {icon && <span className={styles.metricIcon} aria-hidden="true">{typeof icon === 'string'
      ? <AssetIcon name={icon} /> : <img src={icon.src} alt={icon.alt ?? ''} />}</span>}</div>
    {detail && <div className={styles.metricDetail}>{detail}</div>}{action && <div className={styles.metricAction}>{action}</div>}
  </section>
}

export type ResourceKind = 'loading' | 'empty' | 'filtered-empty' | 'unauthenticated' | 'forbidden' |
  'not-found' | 'conflict' | 'error' | 'partial' | 'unavailable'
const resourceCopy: Record<ResourceKind, [string, string]> = {
  loading: ['Đang tải dữ liệu', 'Vui lòng chờ trong giây lát.'],
  empty: ['Chưa có bản ghi', 'Chưa có dữ liệu trong phạm vi được cấp.'],
  'filtered-empty': ['Không có kết quả phù hợp', 'Thử đổi hoặc xóa bộ lọc.'],
  unauthenticated: ['Cần đăng nhập', 'Phiên đã hết hạn.'],
  forbidden: ['Không có quyền truy cập', 'Không thể xem dữ liệu trong phạm vi này.'],
  'not-found': ['Không tìm thấy', 'Bản ghi không có hoặc không còn khả dụng.'],
  conflict: ['Dữ liệu đã thay đổi', 'Hãy kiểm tra trạng thái mới trước khi tiếp tục.'],
  error: ['Không tải được dữ liệu', 'Có lỗi kết nối hoặc máy chủ.'],
  partial: ['Dữ liệu chưa đầy đủ', 'Một phần thông tin hiện chưa khả dụng.'],
  unavailable: ['Dữ liệu chưa khả dụng', 'Chưa có nguồn dữ liệu để hiển thị.'],
}
export function ResourceState({ kind, title, detail, onRetry, onSignIn }: {
  kind: ResourceKind; title?: string; detail?: string; onRetry?: () => void; onSignIn?: () => void
}) {
  const [defaultTitle, defaultDetail] = resourceCopy[kind]
  return <section className={styles.resource} role={kind === 'loading' || kind === 'empty' || kind === 'filtered-empty' ? 'status' : 'alert'}
    aria-busy={kind === 'loading'}><h2>{title ?? defaultTitle}</h2><p>{detail ?? defaultDetail}</p>
    {kind === 'error' && onRetry && <button type="button" onClick={onRetry}>Thử lại</button>}
    {kind === 'unauthenticated' && onSignIn && <button type="button" onClick={onSignIn}>Đăng nhập</button>}
  </section>
}

export type TableColumn<Row> = { key: string; header: string; cell: (row: Row) => ReactNode;
  mobileLabel?: string; align?: 'start' | 'end' }
export function DataTable<Row>({ caption, columns, rows, rowKey, empty, page }: {
  caption: string; columns: readonly TableColumn<Row>[]; rows: readonly Row[]; rowKey: (row: Row) => string;
  empty?: ReactNode; page?: { index: number; totalPages: number; onPageChange: (page: number) => void }
}) {
  return <div className={styles.tableRegion}><div className={styles.tableScroll} tabIndex={0} role="region" aria-label={caption}>
    <table className={styles.table}><caption>{caption}</caption><thead><tr>{columns.map(col => <th key={col.key} scope="col" className={col.align === 'end' ? styles.end : undefined}>{col.header}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={rowKey(row)}>{columns.map(col => <td key={col.key} data-label={col.mobileLabel ?? col.header} className={col.align === 'end' ? styles.end : undefined}>{col.cell(row)}</td>)}</tr>)}</tbody>
    </table></div>{rows.length === 0 && (empty ?? <ResourceState kind="empty" />)}
    {page && <nav className={styles.pagination} aria-label={`Phân trang ${caption}`}><button type="button" disabled={page.index <= 1} onClick={() => page.onPageChange(page.index - 1)}>Trước</button><span>Trang {page.index} / {page.totalPages}</span><button type="button" disabled={page.index >= page.totalPages} onClick={() => page.onPageChange(page.index + 1)}>Sau</button></nav>}
  </div>
}

export function FilterToolbar({ label, scope, count, onReset, children }: {
  label: string; scope: 'loaded-page' | 'complete-result'; count?: number; onReset: () => void; children: ReactNode
}) {
  return <section className={styles.filters} aria-label={label}><div className={styles.filterFields}>{children}
    <button type="button" onClick={onReset}>Xóa bộ lọc</button></div>
    <p className={styles.filterScope}>{scope === 'loaded-page' ? 'Tìm trong trang đã tải' : 'Tìm trong toàn bộ kết quả được cấp'}{count !== undefined ? ` · ${count} kết quả` : ''}</p>
  </section>
}
