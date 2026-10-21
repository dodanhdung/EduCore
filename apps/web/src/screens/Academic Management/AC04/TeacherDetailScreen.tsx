import type { AcademicData } from '../AcademicTypes.ts'
import { DetailScreen } from '../AcademicDetail.tsx'

export function TeacherDetailScreen({ data, preview = false }: { data?: AcademicData; preview?: boolean }) {
  return <DetailScreen id="AC04" person={data?.teachers[0]} preview={preview} />
}
