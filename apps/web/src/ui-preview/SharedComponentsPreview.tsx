import { DataTable, FilterToolbar, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../shared/ui/SharedUI.tsx'
import type { TableColumn } from '../shared/ui/SharedUI.tsx'

// Isolated WEB_FIXTURE harness. It is deliberately not registered as a production route.
const rows = [{ id: 'fixture-1', name: 'Nguyễn Văn An với tên dài để thử xuống dòng', amount: '900000000000000000000000' }]
const columns: TableColumn<(typeof rows)[number]>[] = [
  { key: 'name', header: 'Thành viên', cell: row => row.name },
  { key: 'amount', header: 'Số tiền', align: 'end', cell: row => row.amount + ' ₫' },
]

export function SharedComponentsPreview() {
  return <div style={{ maxWidth: 1120, margin: 'auto', padding: 16 }}><PageLayout
    header={<PageHeader title="Shared UI · WEB_FIXTURE" description="Chỉ dùng để kiểm tra component, không phải dữ liệu nghiệp vụ." action={<button type="button">Hành động mẫu</button>} />}>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 16 }}>
      <MetricCard label="Giá trị bằng không" value={{ kind: 'available', display: '0' }} icon="people" />
      <MetricCard label="Nguồn chưa khả dụng" value={{ kind: 'unavailable' }} />
      <MetricCard label="Tiền VND dạng chuỗi" value={{ kind: 'available', display: '900.000.000.000.000.000.000.000 ₫' }} icon="finance" />
    </div>
    <StatusBadge domain="fixture" tone="warning" label="Trạng thái có nhãn dài để thử hiển thị ở màn hình 320px" />
    <FilterToolbar label="Bộ lọc mẫu" scope="loaded-page" count={1} onReset={() => {}}><label>Tìm kiếm<input type="search" defaultValue="An" /></label></FilterToolbar>
    <DataTable caption="Bảng dữ liệu mẫu" columns={columns} rows={rows} rowKey={row => row.id} />
    <ResourceState kind="filtered-empty" /><ResourceState kind="forbidden" /><ResourceState kind="error" onRetry={() => {}} />
  </PageLayout></div>
}
