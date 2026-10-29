import { useState } from 'react'
import type { AcademicId, AcademicData } from '../AcademicTypes.ts'
import { TeacherListView } from '../AcademicPersonListView.tsx'
import { fromPersonFixture } from '../AcademicPersonViewModel.ts'
import { EditDialog } from '../AcademicPrimitives.tsx'

export function TeacherListScreen({ data, preview = false, tenantId = '', navigate = () => undefined, pathForDetail }: { data?: AcademicData; preview?: boolean; tenantId?: string; navigate?: (path: string) => void; pathForDetail?: (id: AcademicId, personId: string) => string }) {
  const [query, setQuery] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const model = fromPersonFixture('teacher', data ?? { students: [], teachers: [], studentMetrics: [], teacherMetrics: [] }, query)
  return <><TeacherListView model={model} onQueryChange={setQuery}
    onCreate={preview ? () => setShowDialog(true) : undefined}
    onOpen={(id) => navigate(pathForDetail?.('AC04', id) ?? `/app/${encodeURIComponent(tenantId)}/teachers/${encodeURIComponent(id)}`)} />
    {showDialog && <EditDialog title="Tạo hồ sơ giáo viên" onClose={() => setShowDialog(false)} />}</>
}
