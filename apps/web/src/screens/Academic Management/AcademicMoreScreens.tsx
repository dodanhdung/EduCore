import './AcademicScreens.css'
import type { AcademicMoreData, MoreId } from './AcademicTypes.ts'
import { CatalogScreen } from './AC05/CatalogScreen.tsx'
import { CourseScreen } from './AC06/CourseScreen.tsx'
import { ClassListScreen } from './AC07/ClassListScreen.tsx'
import { ClassDetailScreen } from './AC08/ClassDetailScreen.tsx'
export type { CatalogItem, CourseItem, ClassItem, AcademicMoreData, MoreId } from './AcademicTypes.ts'
export function AcademicMoreScreen({ id, data, preview = false, navigate = () => undefined, tenantId = '', initialSheet = false, pathForDetail, pathForStudent, selectedId }: { id: MoreId; data?: AcademicMoreData; preview?: boolean; navigate?: (path: string) => void; tenantId?: string; initialSheet?: boolean; pathForDetail?: (id: 'AC08', classId: string) => string; pathForStudent?: (studentId: string) => string; selectedId?: string }) {
  if (id === 'AC05') return <CatalogScreen data={data} preview={preview} />
  if (id === 'AC06') return <CourseScreen data={data} preview={preview} />
  if (id === 'AC07') return <ClassListScreen data={data} preview={preview} navigate={navigate} tenantId={tenantId} pathForDetail={pathForDetail} />
  return <ClassDetailScreen data={data} preview={preview} navigate={navigate} tenantId={tenantId} initialSheet={initialSheet} pathForStudent={pathForStudent} selectedId={selectedId} />
}
