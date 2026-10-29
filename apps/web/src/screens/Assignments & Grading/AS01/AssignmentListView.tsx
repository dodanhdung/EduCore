import { useState } from 'react'
import { DataTable, FilterToolbar, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../../shared/ui/SharedUI.tsx'
import type { AssignmentListModel, AssignmentListRow } from './AssignmentListViewModel.ts'
import styles from './AssignmentListView.module.css'

const label: Record<string, string> = { DRAFT: 'Bản nháp', PUBLISHED: 'Đã giao', ARCHIVED: 'Đã lưu trữ' }
const metric = (value: number | null) => value === null ? { kind: 'pending-api' as const }
  : { kind: 'available' as const, display: value.toLocaleString('vi-VN') }
function deadline(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('vi-VN', { timeZone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}
function priority(value: number) { return Number.isInteger(value) && value >= 1 && value <= 5
  ? '★'.repeat(value) + '☆'.repeat(5 - value) : '—' }

/** One AS01 presentation for the authorized read and DEV fixture. */
export function AssignmentListView({ model, onCreate, onOpen }: {
  model: AssignmentListModel; onCreate?: () => void; onOpen?: (id: string) => void
}) {
  const [search, setSearch] = useState(''), [status, setStatus] = useState('all'), [classId, setClassId] = useState('all')
  const classes = [...new Map(model.rows.map(row => [row.classId, row.className])).entries()]
  const filtered = Boolean(search || status !== 'all' || classId !== 'all')
  const rows = model.rows.filter(row => (status === 'all' || row.status === status)
    && (classId === 'all' || row.classId === classId)
    && [row.title, row.className].join(' ').toLocaleLowerCase('vi-VN').includes(search.toLocaleLowerCase('vi-VN')))
  const reset = () => { setSearch(''); setStatus('all'); setClassId('all') }
  return <div className={'as-page ' + styles.root}><PageLayout header={<PageHeader title="Danh sách bài tập"
    description={'Lớp được phân công' + (model.sample ? ' · Dữ liệu mẫu trong UI Preview' : '')}
    action={onCreate ? <button type="button" className={styles.primary} onClick={onCreate}>Tạo bài tập</button> : undefined} />}>
    <section className={styles.metrics} aria-label="Tóm tắt bài tập">
      <MetricCard label="Đã giao" value={metric(model.published)} detail="Bài tập trong phạm vi được cấp" />
      <MetricCard label="Sắp đến hạn (72 giờ)" value={metric(model.upcoming)} detail="Chỉ số cần mốc thời gian xác thực" />
      <MetricCard label="Chưa chấm" value={metric(model.ungraded)} detail="Chưa có tổng từ API" />
    </section>
    <section className={styles.panel}><h2>Bài tập trong lớp phụ trách</h2><p>Tìm theo tiêu đề, lớp hoặc trạng thái.</p>
      <FilterToolbar label="Lọc bài tập" scope="complete-result" count={rows.length} onReset={reset}>
        <label>Tìm kiếm<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm bài tập…" /></label>
        <label>Trạng thái<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">Tất cả trạng thái</option>
          {['DRAFT', 'PUBLISHED', 'ARCHIVED'].map(value => <option key={value} value={value}>{label[value]}</option>)}</select></label>
        <label>Lớp<select value={classId} onChange={e => setClassId(e.target.value)}><option value="all">Tất cả lớp</option>
          {classes.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      </FilterToolbar></section>
    <section className={styles.panel}><h2>Danh sách bài tập</h2><DataTable caption="Danh sách bài tập trong lớp phụ trách"
      rows={rows} rowKey={row => row.id} empty={<ResourceState kind={filtered ? 'filtered-empty' : 'empty'}
        title={filtered ? 'Không có bài tập phù hợp' : 'Chưa có bài tập'} />}
      columns={[
        { key: 'title', header: 'Bài tập', cell: row => onOpen ? <button className="as-link" type="button" onClick={() => onOpen(row.id)}>{row.title}</button> : <strong>{row.title}</strong> },
        { key: 'class', header: 'Lớp', cell: row => row.className },
        { key: 'deadline', header: 'Hạn nộp', cell: row => <time dateTime={row.deadline}>{deadline(row.deadline, model.timeZone)}</time> },
        { key: 'priority', header: 'Ưu tiên', cell: row => <span aria-label={'Ưu tiên ' + row.priority + ' trên 5'}>{priority(row.priority)}</span> },
        { key: 'status', header: 'Trạng thái', cell: row => <StatusBadge domain="assignment" label={label[row.status]} tone={row.status === 'PUBLISHED' ? 'success' : row.status === 'DRAFT' ? 'warning' : 'neutral'} /> },
        { key: 'action', header: 'Thao tác', cell: row => onOpen ? <button type="button" onClick={() => onOpen(row.id)}>Chi tiết</button> : '—' },
      ]} />
      <div className={styles.mobileRows}>{rows.map((row: AssignmentListRow) => <article key={row.id}>
        <h3>{row.title}</h3><p>{row.className} · <time dateTime={row.deadline}>{deadline(row.deadline, model.timeZone)}</time></p>
        <p aria-label={'Ưu tiên ' + row.priority + ' trên 5'}>{priority(row.priority)}</p>
        <StatusBadge domain="assignment" label={label[row.status]} tone={row.status === 'PUBLISHED' ? 'success' : row.status === 'DRAFT' ? 'warning' : 'neutral'} />
        {onOpen && <button className="as-link" type="button" onClick={() => onOpen(row.id)}>Xem chi tiết</button>}
      </article>)}</div>
    </section>
    <p className={styles.notice}>Chỉ hiển thị bài tập trong lớp được phân công. Bản nháp chưa gửi thông báo in-app.</p>
  </PageLayout></div>
}
