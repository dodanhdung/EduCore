import { useState } from 'react'
import type { ReactNode } from 'react'
import { DataTable, FilterToolbar, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../../shared/ui/SharedUI.tsx'
import type { MembersViewModel, MemberViewRow } from './MembersViewModel.ts'
import styles from './MembersView.module.css'

const statusLabel: Record<string, string> = { ACTIVE: 'Đang hoạt động', PENDING_ACTIVATION: 'Chờ kích hoạt', DISABLED: 'Đã khóa' }
const tone = (status: string) => status === 'ACTIVE' ? 'success' : status === 'PENDING_ACTIVATION' ? 'warning' : 'danger'
const metric = (value: number | null) => value === null
  ? { kind: 'pending-api' as const } : { kind: 'available' as const, display: value.toLocaleString('vi-VN') }

/** OP01 presentation shared by the API and DEV fixture adapters. Filters are page-scoped. */
export function MembersView({ model, action, onOpen, onDisable, onPageChange, detailLabel = 'Xem', children }: {
  model: MembersViewModel; action?: ReactNode; onOpen?: (id: string) => void;
  onDisable?: (id: string) => void; onPageChange?: (page: number) => void; detailLabel?: string; children?: ReactNode
}) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState(''), [role, setRole] = useState('')
  const roles = [...new Set(model.rows.flatMap(row => row.assignments.map(a => a.role)))]
  const filtered = Boolean(query || status || role)
  const rows = model.rows.filter(row => (!status || row.status === status)
    && (!role || row.assignments.some(a => a.role === role))
    && [row.name, row.email, row.id].join(' ').toLocaleLowerCase('vi-VN').includes(query.toLocaleLowerCase('vi-VN')))
  const reset = () => { setQuery(''); setStatus(''); setRole('') }
  return <div className={styles.root}><PageLayout header={<PageHeader title="Tài khoản người dùng"
    description={model.sample ? 'Quản lý thành viên trong trung tâm · Dữ liệu mẫu — UI Preview' : 'Quản lý thành viên trong trung tâm hiện tại'} action={action} />}>
    <section className={styles.metrics} aria-label="Tóm tắt thành viên">
      <MetricCard label="Thành viên" value={metric(model.total)} detail={model.sample ? 'Trong dữ liệu mẫu' : 'Trong phạm vi được cấp'} />
      <MetricCard label="Chờ kích hoạt" value={metric(model.pendingTotal)} detail="Tự kích hoạt qua OTP email" />
      <MetricCard label="Đã khóa" value={metric(model.disabledTotal)} detail="Chỉ mở khi hợp lệ" />
    </section>
    <section className={styles.panel}><h2>Lọc và tìm kiếm</h2><FilterToolbar label="Lọc thành viên trong trang" scope="loaded-page" count={rows.length} onReset={reset}>
      <label>Tìm kiếm<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Tên, mã hoặc email…" /></label>
      <label>Trạng thái<select value={status} onChange={e => setStatus(e.target.value)}><option value="">Tất cả trạng thái</option>
        {['ACTIVE', 'PENDING_ACTIVATION', 'DISABLED'].map(value => <option value={value} key={value}>{statusLabel[value]}</option>)}</select></label>
      <label>Role trong trang<select value={role} onChange={e => setRole(e.target.value)}><option value="">Tất cả role</option>
        {roles.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    </FilterToolbar></section>
    <section className={styles.panel}><h2>Danh sách thành viên</h2><p>{model.total.toLocaleString('vi-VN')} thành viên được cấp · Trang {model.page}</p>
      <DataTable caption="Danh sách thành viên" rows={rows} rowKey={row => row.id} columns={[
        { key: 'name', header: 'Thành viên', cell: row => <strong>{row.name}</strong> },
        { key: 'email', header: 'Email', cell: row => row.email },
        { key: 'roles', header: 'Role / phạm vi', cell: row => row.assignments.map(a => a.role + ' · ' + a.scope).join(', ') || 'Chưa gán role' },
        { key: 'status', header: 'Trạng thái', cell: row => <StatusBadge domain="membership" label={statusLabel[row.status] ?? row.status} tone={tone(row.status)} /> },
        { key: 'actions', header: 'Thao tác', cell: row => <div className={styles.actions}>
          {onOpen && <button type="button" onClick={() => onOpen(row.id)}>{detailLabel}</button>}
          {onDisable && row.status !== 'DISABLED' && <button type="button" onClick={() => onDisable(row.id)}>Vô hiệu hóa</button>}
        </div> },
      ]} empty={<ResourceState kind={filtered ? 'filtered-empty' : 'empty'} />}
        page={onPageChange ? { index: model.page, totalPages: Math.max(1, Math.ceil(model.total / model.pageSize)), onPageChange } : undefined} />
      <div className={styles.mobileRows}>{rows.map((row: MemberViewRow) => <article key={row.id}>
        <h3>{row.name}</h3><p>{row.email}</p><p>{row.assignments.map(a => a.role + ' · ' + a.scope).join(', ') || 'Chưa gán role'}</p>
        <StatusBadge domain="membership" label={statusLabel[row.status] ?? row.status} tone={tone(row.status)} />
        <div className={styles.actions}>{onOpen && <button type="button" onClick={() => onOpen(row.id)}>{detailLabel}</button>}
          {onDisable && row.status !== 'DISABLED' && <button type="button" onClick={() => onDisable(row.id)}>Vô hiệu hóa</button>}</div>
      </article>)}</div>
    </section>
    <section className={styles.panel}><h2>Nguyên tắc quản lý</h2><p>Thành viên mới chờ kích hoạt; người dùng tự yêu cầu OTP email để đặt mật khẩu.</p>
      <p>Vô hiệu hóa cần lý do, xác nhận và quyền hiện hành. Máy chủ bảo vệ Manager đang hoạt động cuối cùng.</p></section>
    {children}
  </PageLayout></div>
}
