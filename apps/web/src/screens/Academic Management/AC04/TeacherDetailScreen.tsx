import { useState } from 'react'
import type { AcademicData } from '../AcademicTypes.ts'
import { TeacherDetailView } from '../AcademicPersonDetailView.tsx'
import { fromTeacherFixture } from '../AcademicPersonViewModel.ts'
import { EditDialog } from '../AcademicPrimitives.tsx'
import { ResourceState } from '../../../shared/ui/SharedUI.tsx'

export function TeacherDetailScreen({ data, preview = false, selectedId }: { data?: AcademicData; preview?: boolean; selectedId?: string }) {
  const [showDialog, setShowDialog] = useState(false)
  const teacher = data?.teachers.find((item) => item.id === selectedId)
  if (!teacher) return <div data-screen-id="AC04"><ResourceState kind="not-found" title="Không tìm thấy hồ sơ mẫu theo mã đã chọn" /></div>
  return <><TeacherDetailView model={fromTeacherFixture(teacher)} onEdit={preview ? () => setShowDialog(true) : undefined} />
    {showDialog && <EditDialog title="Chỉnh sửa hồ sơ giáo viên" onClose={() => setShowDialog(false)} />}</>
}
