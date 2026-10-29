import { useState } from 'react'
import type { AcademicData } from '../AcademicTypes.ts'
import { StudentDetailView } from '../AcademicPersonDetailView.tsx'
import { fromStudentFixture } from '../AcademicPersonViewModel.ts'
import { EditDialog } from '../AcademicPrimitives.tsx'
import { ResourceState } from '../../../shared/ui/SharedUI.tsx'

export function StudentDetailScreen({ data, preview = false, selectedId }: { data?: AcademicData; preview?: boolean; selectedId?: string }) {
  const [showDialog, setShowDialog] = useState(false)
  const student = data?.students.find((item) => item.id === selectedId)
  if (!student) return <div data-screen-id="AC02"><ResourceState kind="not-found" title="Không tìm thấy hồ sơ mẫu theo mã đã chọn" /></div>
  return <><StudentDetailView model={fromStudentFixture(student)} onEdit={preview ? () => setShowDialog(true) : undefined} />
    {showDialog && <EditDialog title="Chỉnh sửa hồ sơ học sinh" onClose={() => setShowDialog(false)} />}</>
}
