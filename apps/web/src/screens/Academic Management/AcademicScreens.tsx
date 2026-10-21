import './AcademicScreens.css'
import type { AcademicId, AcademicData } from './AcademicTypes.ts'
import { StudentListScreen } from './AC01/StudentListScreen.tsx'
import { StudentDetailScreen } from './AC02/StudentDetailScreen.tsx'
import { TeacherListScreen } from './AC03/TeacherListScreen.tsx'
import { TeacherDetailScreen } from './AC04/TeacherDetailScreen.tsx'
export type { AcademicId, AcademicPerson, AcademicData } from './AcademicTypes.ts'
export function AcademicScreen({ id, data, preview = false, tenantId = '', navigate = () => undefined, pathForDetail, selectedId }: { id: AcademicId; data?: AcademicData; preview?: boolean; tenantId?: string; navigate?: (path: string) => void; pathForDetail?: (id: AcademicId, personId: string) => string; selectedId?: string }) {
  if (id === 'AC01') return <StudentListScreen data={data} preview={preview} tenantId={tenantId} navigate={navigate} pathForDetail={pathForDetail} />
  if (id === 'AC02') return <StudentDetailScreen data={data} preview={preview} selectedId={selectedId} />
  if (id === 'AC03') return <TeacherListScreen data={data} preview={preview} tenantId={tenantId} navigate={navigate} pathForDetail={pathForDetail} />
  return <TeacherDetailScreen data={data} preview={preview} selectedId={selectedId} />
}
