import { MetricCard, PageHeader, PageLayout, ResourceState } from '../../../shared/ui/SharedUI.tsx'
import type { MetricAvailability, ResourceKind } from '../../../shared/ui/SharedUI.tsx'
import studentsIcon from '../assets/active-students.svg'
import classesIcon from '../assets/active-classes.svg'
import receivablesIcon from '../assets/receivables.svg'
import { formatAsOf, formatVnd } from './DashboardViewModel.ts'
import type { DashboardViewModel } from './DashboardViewModel.ts'
import styles from './DashboardView.module.css'

export type DashboardPresentation = { kind: 'ready'; model: DashboardViewModel } |
  { kind: Exclude<ResourceKind, 'empty' | 'filtered-empty'>; detail?: string; onRetry?: () => void }

function numberValue(value: number | null): MetricAvailability {
  return value === null ? { kind: 'forbidden' } : { kind: 'available', display: value.toLocaleString('vi-VN') }
}
function moneyValue(value: string | null): MetricAvailability {
  return value === null ? { kind: 'forbidden' } : { kind: 'available', display: formatVnd(value) }
}

/** Shared by the authorized API container and the DEV fixture adapter. */
export function G01DashboardView({ presentation }: { presentation: DashboardPresentation }) {
  const model = presentation.kind === 'ready' ? presentation.model : null
  const description = model
    ? `${model.tenantName} · ${model.scope === 'Effective tenant, class and student grants' ? 'Phạm vi theo quyền được cấp' : model.scope} · Cập nhật ${formatAsOf(model.asOf, model.timeZone)} (${model.timeZone})`
    : 'Số liệu trong phạm vi trung tâm hiện tại'
  const allZero = !!model && model.students === 0 && model.classes === 0 && model.outstandingVnd === '0'
  return <div className={styles.dashboard}><PageLayout
    header={<PageHeader title="Tổng quan quản lý" description={description} />}>
    {presentation.kind === 'ready' ? <section className={styles.kpiGrid} aria-label="Ba chỉ số tổng quan" data-zero={allZero}>
      <MetricCard label="Học viên đang theo học" value={numberValue(presentation.model.students)}
        icon={allZero ? undefined : { src: studentsIcon }}
        detail={allZero || presentation.model.students === null ? undefined : <span className={styles.metricMeta}><span className={styles.scopePill}>Theo phạm vi</span><span>ACTIVE duy nhất</span></span>} />
      <MetricCard label="Lớp học đang hoạt động" value={numberValue(presentation.model.classes)}
        icon={allZero ? undefined : { src: classesIcon }}
        detail={allZero || presentation.model.classes === null ? undefined : <span className={styles.metricMeta}><span className={styles.scopePill}>Theo phạm vi</span><span>Lớp ACTIVE</span></span>} />
      <MetricCard label="Công nợ học phí chưa thu" value={moneyValue(presentation.model.outstandingVnd)}
        icon={allZero ? undefined : { src: receivablesIcon }}
        detail={allZero || presentation.model.outstandingVnd === null ? undefined : <span className={styles.metricMeta}><span className={styles.scopePill}>Theo phạm vi</span><span>Hóa đơn ISSUED</span></span>} />
    </section> : <div className={styles.stateWrap}><ResourceState kind={presentation.kind}
      title={presentation.kind === 'error' ? 'Không tải được dữ liệu tổng quan' : undefined}
      detail={presentation.detail} onRetry={presentation.kind === 'error' ? presentation.onRetry : undefined} /></div>}
  </PageLayout></div>
}
