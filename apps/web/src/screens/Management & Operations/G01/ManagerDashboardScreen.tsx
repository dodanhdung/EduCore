import { useManagementPreview } from '../ManagementTypes.ts'
import type { ScreenProps, ViewState } from '../ManagementTypes.ts'
import { G01DashboardView } from './DashboardView.tsx'
import type { DashboardPresentation } from './DashboardView.tsx'
import { fromManagementFixture } from './DashboardViewModel.ts'

/** Compatibility entry for the DEV ManagementScreen harness. */
export function ManagerDashboardScreen({ data, viewState = 'ready' }: ScreenProps & { viewState?: ViewState }) {
  const preview = useManagementPreview()
  const model = fromManagementFixture(data)
  const presentation: DashboardPresentation = viewState === 'ready' || viewState === 'empty'
    ? { kind: 'ready', model: preview ? model : { ...model, scope: 'Phạm vi được cấp' } }
    : { kind: viewState === 'invalid' ? 'unavailable' : viewState }
  return <G01DashboardView presentation={presentation} />
}
