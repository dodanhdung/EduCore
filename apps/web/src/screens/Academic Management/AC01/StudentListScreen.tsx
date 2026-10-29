import { useState } from 'react'
import type { AcademicId, AcademicData } from '../AcademicTypes.ts'
import { StudentListView } from '../AcademicPersonListView.tsx'
import { fromPersonFixture } from '../AcademicPersonViewModel.ts'
import { EditDialog } from '../AcademicPrimitives.tsx'

export function StudentListScreen({ data, preview = false, tenantId = '', navigate = () => undefined, pathForDetail }: { data?: AcademicData; preview?: boolean; tenantId?: string; navigate?: (path: string) => void; pathForDetail?: (id: AcademicId, personId: string) => string }) {
  const [query, setQuery] = useState('')
  const [showDialog, setShowDialog] = useState(false)
  const model = fromPersonFixture('student', data ?? { students: [], teachers: [], studentMetrics: [], teacherMetrics: [] }, query)
  return <><StudentListView model={model} onQueryChange={setQuery}
    onCreate={preview ? () => setShowDialog(true) : undefined}
    onOpen={(id) => navigate(pathForDetail?.('AC02', id) ?? `/app/${encodeURIComponent(tenantId)}/students/${encodeURIComponent(id)}`)} />
    {showDialog && <EditDialog title="Tạo hồ sơ học sinh" onClose={() => setShowDialog(false)} />}</>
}
