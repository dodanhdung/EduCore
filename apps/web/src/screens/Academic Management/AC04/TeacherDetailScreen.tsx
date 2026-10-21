import type { AcademicData } from '../AcademicTypes.ts'
import { DetailScreen } from '../AcademicDetail.tsx'

export function TeacherDetailScreen({ data, preview = false, selectedId }: { data?: AcademicData; preview?: boolean; selectedId?: string }) {
  return <DetailScreen id="AC04" person={data?.teachers.find((teacher) => teacher.id === selectedId)} preview={preview} />
}
