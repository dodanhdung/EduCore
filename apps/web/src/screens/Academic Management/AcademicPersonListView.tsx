import { DataTable, FilterToolbar, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../shared/ui/SharedUI.tsx'
import type { PersonListModel, PersonRow } from './AcademicPersonViewModel.ts'
import styles from './AcademicPersonView.module.css'

function badge(status: string) { return <StatusBadge domain="academic-profile" label={status === 'ACTIVE' ? 'Đang hoạt động' : status === 'INACTIVE' ? 'Ngừng hoạt động' : status}
  tone={status === 'ACTIVE' ? 'success' : status === 'INACTIVE' ? 'neutral' : 'warning'} /> }
function PersonListView({ model, onQueryChange, onPageChange, onCreate, onOpen }: {
  model: PersonListModel; onQueryChange: (query: string) => void; onPageChange?: (page: number) => void;
  onCreate?: () => void; onOpen?: (id: string) => void
}) {
  const student = model.kind === 'student'
  const noun = student ? 'học sinh' : 'giáo viên'
  const title = student ? 'Danh sách học sinh' : 'Danh sách giáo viên'
  return <div className={styles.root} data-screen-id={student ? 'AC01' : 'AC03'}><PageLayout
    header={<PageHeader title={title} description={'Hồ sơ ' + noun + ' trong phạm vi được cấp' + (model.sample ? ' · Dữ liệu mẫu — UI Preview' : '')}
      action={onCreate ? <button type="button" className={styles.primary} onClick={onCreate}>Tạo hồ sơ</button> : undefined} />}>
    <section className={styles.metrics} aria-label={'Tóm tắt ' + noun}>
      <MetricCard label={model.query ? 'Hồ sơ khớp tìm kiếm' : 'Hồ sơ được cấp'}
        value={{ kind: 'available', display: model.total.toLocaleString('vi-VN') }}
        detail={model.sample ? 'Trong dữ liệu mẫu' : 'Tổng từ API trong phạm vi hiện hành'} />
    </section>
    <section className={styles.panel}><h2>Tìm kiếm và lọc</h2><FilterToolbar label={'Tìm ' + noun}
      scope={model.sample ? 'loaded-page' : 'complete-result'} onReset={() => onQueryChange('')}>
      <label>{'Tìm ' + noun}<input type="search" value={model.query} onChange={event => onQueryChange(event.target.value)}
        placeholder={'Tên hoặc mã ' + noun + '…'} /></label>
    </FilterToolbar><p className={styles.note}>Bộ lọc lớp, môn và trình độ cần API hỗ trợ; danh sách hiện dùng tìm kiếm mã hoặc tên.</p></section>
    <section className={styles.panel}><h2>{student ? 'Học sinh' : 'Giáo viên'}</h2>
      <p>{model.total.toLocaleString('vi-VN')} hồ sơ khớp · Trang {model.page}. Hồ sơ có thể tồn tại trước tài khoản đăng nhập.</p>
      <DataTable caption={title} rows={model.rows} rowKey={row => row.id} columns={[
        { key: 'code', header: 'Mã', cell: (row: PersonRow) => <strong>{row.code}</strong> },
        { key: 'name', header: 'Họ tên', cell: row => row.name },
        { key: 'status', header: 'Trạng thái', cell: row => badge(row.status) },
        { key: 'action', header: 'Thao tác', cell: row => onOpen ? <button type="button" className={styles.link} onClick={() => onOpen(row.id)}>Xem chi tiết</button> : '—' },
      ]} empty={<ResourceState kind={model.query ? 'filtered-empty' : 'empty'} title={model.query ? 'Không tìm thấy hồ sơ phù hợp' : 'Chưa có hồ sơ'} />}
        page={onPageChange ? { index: model.page, totalPages: Math.max(1, Math.ceil(model.total / model.pageSize)), onPageChange } : undefined} />
      <div className={styles.mobileRows}>{model.rows.map(row => <article key={row.id}><h3>{row.name}</h3><p>{row.code}</p>{badge(row.status)}
        {onOpen && <button type="button" className={styles.link} onClick={() => onOpen(row.id)}>Xem chi tiết</button>}</article>)}</div>
    </section>
    <section className={styles.panel}><h2>{student ? 'Truy cập hồ sơ' : 'Hồ sơ và tài khoản'}</h2>
      <p>Hồ sơ {noun} độc lập với tài khoản đăng nhập. Thao tác tạo và sửa do quyền hiện hành cùng máy chủ quyết định.</p></section>
  </PageLayout></div>
}
export function StudentListView(props: Omit<Parameters<typeof PersonListView>[0], 'model'> & { model: PersonListModel }) { return <PersonListView {...props} /> }
export function TeacherListView(props: Omit<Parameters<typeof PersonListView>[0], 'model'> & { model: PersonListModel }) { return <PersonListView {...props} /> }
