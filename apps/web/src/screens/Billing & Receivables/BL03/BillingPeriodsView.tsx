import type { ReactNode } from 'react'
import { DataTable, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../../shared/ui/SharedUI.tsx'
import type { BillingPeriodsModel, PeriodGenerationRow, PeriodRow } from './BillingPeriodsViewModel.ts'
import styles from './BillingPeriodsView.module.css'

const stateName: Record<string, string> = {
  OPEN: 'Đang mở', COMPLETED: 'Hoàn tất', RUNNING: 'Đang tính', FAILED: 'Lần tính thất bại',
  NEEDS_INFORMATION: 'Cần bổ sung dữ liệu', STALE_GENERATION: 'Generation đã cũ', DRAFT: 'Dự thảo', ISSUED: 'Đã phát hành',
}
function status(value: string) { return <StatusBadge domain="billing-generation"
  label={['NEEDS_INFORMATION', 'STALE_GENERATION', 'FAILED'].includes(value) ? (stateName[value] ?? value) + ' · ' + value : stateName[value] ?? value}
  tone={value === 'FAILED' || value === 'STALE_GENERATION' ? 'danger' : value === 'NEEDS_INFORMATION' ? 'warning' : value === 'ISSUED' || value === 'COMPLETED' ? 'success' : 'info'} /> }
function count(value: number | null) { return value === null ? { kind: 'pending-api' as const }
  : { kind: 'available' as const, display: value.toLocaleString('vi-VN') } }
function when(value: string, zone: string) {
  const instant = new Date(value)
  return Number.isFinite(instant.getTime()) ? new Intl.DateTimeFormat('vi-VN', { timeZone: zone, dateStyle: 'short', timeStyle: 'short' }).format(instant) : value
}

/** BL03 read presentation; mutation forms are injected by the authorized container. */
export function BillingPeriodsView({ model, action, onSelectPeriod, onSelectGeneration, selectedGenerationId, onPageChange, onOpenDraft, generationForm, openPeriod, currentActions }: {
  model: BillingPeriodsModel; action?: ReactNode; onSelectPeriod: (id: string) => void;
  onSelectGeneration?: (id: string) => void; selectedGenerationId?: string;
  onPageChange?: (page: number) => void; onOpenDraft?: (invoiceId: string) => void;
  generationForm?: ReactNode; openPeriod?: ReactNode; currentActions?: ReactNode
}) {
  const selected = model.periods.find(row => row.id === model.selectedPeriodId)
  const current = model.sample
    ? selected?.generations.find(row => row.id === selectedGenerationId) ?? selected?.generations.find(row => row.current)
    : selected?.generations.find(row => row.current && row.studentId === model.selectedStudentId)
  const history = selected?.generations ?? []
  return <div className={styles.root}><PageLayout header={<PageHeader title="Kỳ học phí & generation tính"
    description={'Kỳ theo ngày bắt đầu buổi · Dự thảo nội bộ, phát hành riêng' + (model.sample ? ' · Dữ liệu mẫu — UI Preview' : '')}
    action={action} />}>
    <section className={styles.metrics} aria-label="Tóm tắt kỳ học phí">
      <MetricCard label="Nguồn đủ dữ liệu" value={{ kind: 'pending-api' }} detail="Chưa có aggregate nguồn được cấp" />
      <MetricCard label="Dự thảo trong kỳ chọn" value={count(selected?.draftCount ?? null)} detail="Không gồm hóa đơn đã phát hành" />
      <MetricCard label="Lần tính hiện tại" value={current ? { kind: 'available', display: current.id } : { kind: 'pending-api' }}
        detail="Chỉ theo học sinh đã chọn" />
    </section>
    <section className={styles.panel}><h2>Kỳ học phí</h2><p>Chọn kỳ trong trang đã tải; tháng tính theo ngày bắt đầu buổi tại timezone đã đóng băng.</p>
      <label className={styles.periodSelect}>Kỳ tháng<select value={model.selectedPeriodId} onChange={e => onSelectPeriod(e.target.value)}>
        <option value="">Chọn kỳ</option>{model.periods.map(row => <option key={row.id} value={row.id}>{row.monthStart}</option>)}</select></label>
      {selected && <div className={styles.selected}><strong>{selected.monthStart}</strong> {status(selected.status)}
        <p>Timezone: {selected.timezone} · Dự thảo: {selected.draftCount ?? 'Chưa có dữ liệu'} · Đã phát hành: {selected.issuedCount ?? 'Chưa có dữ liệu'}</p>
        {selected.sampleReadiness && <p>{selected.sampleReadiness}</p>}</div>}
      <DataTable caption="Các kỳ học phí trong trang" rows={model.periods} rowKey={row => row.id}
        empty={<ResourceState kind="empty" title="Chưa có kỳ học phí" />}
        columns={[
          { key: 'period', header: 'Kỳ', cell: (row: PeriodRow) => row.monthStart },
          { key: 'status', header: 'Trạng thái', cell: row => status(row.status) },
          { key: 'zone', header: 'Timezone', cell: row => row.timezone },
          { key: 'draft', header: 'Dự thảo', cell: row => row.draftCount ?? '—' },
          { key: 'issued', header: 'Đã phát hành', cell: row => row.issuedCount ?? '—' },
        ]} page={onPageChange ? { index: model.page, totalPages: Math.max(1, Math.ceil(model.total / model.pageSize)), onPageChange } : undefined} />
    </section>
    <section className={styles.panel}><h2>Nguồn và lần tính</h2><p>Máy chủ kiểm tra điểm danh và PriceRule khi tạo generation. Thiếu nguồn không được đổi thành phí 0.</p>
      {!model.sample && <ResourceState kind="unavailable" title="Chưa có báo cáo nguồn tổng hợp" detail="Chọn kỳ và học sinh để yêu cầu tạo dự thảo; trạng thái nguồn được xác nhận trong kết quả generation." />}
      {generationForm}
      {!model.sample && model.studentTotal !== null && model.studentTotal > model.studentChoices.length &&
        <p role="status">Danh sách chọn mới có {model.studentChoices.length} / {model.studentTotal} học sinh. Chỉ tạo lần tính cho học sinh có trong danh sách đã tải.</p>}
    </section>
    <section className={styles.panel}><h2>Lịch sử generation</h2><p>Lịch sử thuộc kỳ đã chọn; mỗi generation gắn với một học sinh.</p>
      <DataTable caption="Lịch sử generation trong kỳ" rows={history} rowKey={row => row.id}
        empty={<ResourceState kind="empty" title="Chưa có generation trong kỳ" />}
        columns={[
          { key: 'identity', header: 'Run / generation', cell: (row: PeriodGenerationRow) => <><strong>{row.runId || row.id}</strong><small>{row.id}</small></> },
          { key: 'student', header: 'Học sinh', cell: row => row.studentId },
          { key: 'state', header: 'Trạng thái', cell: row => <>{status(row.status)}{row.current && <small>Hiện hành cho học sinh này</small>}</> },
          { key: 'date', header: 'Bắt đầu', cell: row => selected ? when(row.createdAt, selected.timezone) : row.createdAt },
          { key: 'reason', header: 'Lý do / thiếu nguồn', cell: row => row.missing.length ? row.missing.join(', ') : row.reason || '—' },
          { key: 'draft', header: 'Dự thảo', cell: row => row.invoiceId && onOpenDraft
            ? <button type="button" onClick={() => onOpenDraft(row.invoiceId!)}>Xem dự thảo</button> : 'Chưa có dự thảo' },
          ...(onSelectGeneration ? [{ key: 'view', header: 'Thao tác', cell: (row: PeriodGenerationRow) =>
            <button type="button" onClick={() => onSelectGeneration(row.id)}>Xem</button> }] : []),
        ]} />
    </section>
    <section className={styles.panel}><h2>Generation hiện tại</h2>
      {current ? <p>{'Generation ' + current.id + (current.current ? ' · Hiện tại' : ' · Lịch sử')}
        {' · Học sinh ' + current.studentId} · {status(current.status)} · {when(current.createdAt, selected!.timezone)}</p>
        : <ResourceState kind="unavailable" title="Chưa chọn generation của học sinh" detail="Generation hiện hành chỉ có nghĩa theo từng kỳ và học sinh, không phải một lần tính chung cho trung tâm." />}
      {currentActions}
    </section>
    {openPeriod}
    <section className={styles.panel}><h2>Quy tắc lần tính</h2><p>Hoàn tất lần tính tạo dự thảo; phát hành cần rà soát riêng. Retry giữ cùng generation và key, tính lại DRAFT có lý do tạo generation mới. ISSUED bất biến.</p></section>
  </PageLayout></div>
}
