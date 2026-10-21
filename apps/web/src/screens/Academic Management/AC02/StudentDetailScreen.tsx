import type { AcademicData } from '../AcademicTypes.ts'
import { DetailScreen } from '../AcademicDetail.tsx'

export function StudentDetailScreen({ data, preview = false }: { data?: AcademicData; preview?: boolean }) {
  return <DetailScreen id="AC02" person={data?.students[0]} preview={preview} />
}
