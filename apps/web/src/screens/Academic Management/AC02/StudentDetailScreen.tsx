import type { AcademicData } from '../AcademicTypes.ts'
import { DetailScreen } from '../AcademicDetail.tsx'

export function StudentDetailScreen({ data, preview = false, selectedId }: { data?: AcademicData; preview?: boolean; selectedId?: string }) {
  return <DetailScreen id="AC02" person={data?.students.find((student) => student.id === selectedId)} preview={preview} />
}
