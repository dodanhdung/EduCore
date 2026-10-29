import type { AssignmentData } from '../AssignmentTypes.ts'
import { Page, State } from '../AssignmentPrimitives.tsx'
import { AssignmentListView } from './AssignmentListView.tsx'
import { fromAssignmentFixture } from './AssignmentListViewModel.ts'

/** DEV fixture adapter; the production route imports AssignmentListView directly. */
export function TeacherAssignmentListScreen({ data, state = 'ready', preview = false, referenceTime, onCreate, onOpen }: {
  data?: AssignmentData; state?: 'ready' | 'loading' | 'error'; preview?: boolean;
  referenceTime?: string; onCreate?: () => void; onOpen?: (id: string) => void
}) {
  if (state !== 'ready') return <Page title="Danh sách bài tập"><State kind={state} /></Page>
  if (!data) return <Page title="Danh sách bài tập"><State kind="empty" /></Page>
  return <AssignmentListView model={fromAssignmentFixture(data, referenceTime, preview)} onCreate={onCreate} onOpen={onOpen} />
}
