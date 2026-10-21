import type { AcademicId, AcademicData } from '../AcademicTypes.ts'
import { ListScreen } from '../AcademicList.tsx'

export function StudentListScreen({ data, preview = false, tenantId = '', navigate = () => undefined, pathForDetail }: { data?: AcademicData; preview?: boolean; tenantId?: string; navigate?: (path: string) => void; pathForDetail?: (id: AcademicId, personId: string) => string }) {
  return <ListScreen id="AC01" rows={data?.students ?? []} metrics={data?.studentMetrics} preview={preview} navigate={navigate} tenantId={tenantId} pathForDetail={pathForDetail} />
}
