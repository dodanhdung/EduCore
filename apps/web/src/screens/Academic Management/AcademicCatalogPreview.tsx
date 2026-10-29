import { useRef, useState } from 'react'
import type { ClassDetail, ClassRow, Course, Level, Subject } from './AcademicApi.ts'
import type { AcademicMoreData, MoreId } from './AcademicTypes.ts'
import { AcademicCatalogEditor } from './AcademicCatalogEditor.tsx'
import { AcademicCatalogView } from './AcademicCatalogViews.tsx'
import type { Editor, EditorKind } from './AcademicCatalogViews.tsx'
import { catalogModel, classModel, classesModel, courseModel, newEditor, pageOf } from './AcademicCatalogModel.ts'
import type { CatalogTab } from './AcademicCatalogModel.ts'
import { EnrollmentSheet } from './AC09/EnrollmentSheet.tsx'

type Props = { id: MoreId; data?: AcademicMoreData; preview?: boolean; navigate?: (path: string) => void; tenantId?: string;
  initialSheet?: boolean; pathForDetail?: (id: 'AC08', classId: string) => string; pathForStudent?: (studentId: string) => string; selectedId?: string }
function iso(value: string): string { const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/); return match ? `${match[3]}-${match[2]}-${match[1]}` : '' }
export function AcademicCatalogPreview({ id, data, preview = true, navigate = () => undefined, tenantId = '', initialSheet = false, pathForDetail, pathForStudent, selectedId }: Props) {
  const [tab, setTab] = useState<CatalogTab>('subjects')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [sheet, setSheet] = useState(initialSheet)
  const trigger = useRef<HTMLElement | null>(null)
  const catalog = data?.catalog ?? []
  const subjects: Subject[] = catalog.filter(row => row.kind === 'Môn học').map(row => ({ id: row.code, code: row.code, name: row.name, active: row.status === 'Đang hoạt động' }))
  const levels: Level[] = catalog.filter(row => row.kind === 'Trình độ').map(row => ({ id: row.code, code: row.code, name: row.name, active: row.status === 'Đang hoạt động', sortOrder: Number(row.order) }))
  const courses: Course[] = (data?.courses ?? []).map(row => ({ id: row.code, code: row.code, name: row.name, status: row.status, subjectId: row.subject, subjectName: row.subject, levelId: row.level, levelName: row.level, description: null }))
  const classes: ClassRow[] = (data?.classes ?? []).map(row => { const nums = row.capacity.match(/(\d+)\s*\/\s*(\d+)/); return { id: row.code, code: row.code, name: row.name, status: row.status, courseId: row.course, courseName: row.course, enrollmentCount: nums ? Number(nums[1]) : 0, capacity: nums ? Number(nums[2]) : 0 } })
  const filtered = <T extends { code: string; name: string }>(items: T[]) => items.filter(row => `${row.code} ${row.name}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')))
  const chunk = <T,>(items: T[]) => pageOf(items.slice((page - 1) * 20, page * 20), page, 20, items.length)
  const target = classes.find(row => row.code === selectedId)
  const original = data?.classes.find(row => row.code === selectedId)
  const detail: ClassDetail | undefined = target && original ? { ...target, subjectId: '', levelId: '', startDate: null, endDate: null,
    enrollments: original.detail?.enrollments.map((row, index) => ({ id: `${target.id}-${index}`, studentId: row.studentId, studentCode: row.studentId, studentName: row.studentName,
      status: row.status, effectiveFrom: iso(row.effective), effectiveTo: row.effective.includes('nay') || row.effective.endsWith('→') ? null : iso(row.effective.split('→')[1] ?? ''), priorEnrollmentId: row.previousClass === '—' ? null : row.previousClass })) ?? [],
    teacherAssignments: undefined } : undefined
  const model = id === 'AC05' ? catalogModel(tab, chunk(filtered(tab === 'subjects' ? subjects : levels)), query, true, preview)
    : id === 'AC06' ? courseModel(chunk(filtered(courses)), query, true, preview, preview, pageOf(subjects), pageOf(levels))
      : id === 'AC07' ? classesModel(chunk(filtered(classes)), query, true, preview, preview, true, pageOf(courses))
        : detail ? classModel(detail, true, preview, true, 'Asia/Ho_Chi_Minh') : undefined
  function open(kind: EditorKind, row: Record<string, unknown> | undefined, element: HTMLElement) { trigger.current = element; setEditor(newEditor(kind, row)) }
  function close() { setEditor(null); queueMicrotask(() => { if (trigger.current?.isConnected) trigger.current.focus() }) }
  if (!model) return <div className="academic-page"><h1>Chi tiết lớp học</h1><p role="status">Không tìm thấy lớp học mẫu.</p></div>
  return <AcademicCatalogView model={model} onTab={value => { setTab(value); setPage(1); setQuery('') }} onQuery={value => { setQuery(value); setPage(1) }} onPage={setPage} onEnroll={id === 'AC08' ? () => setSheet(true) : undefined}
    onCreate={(kind, element) => open(kind, undefined, element)} onEdit={(kind, row, element) => open(kind, row, element)}
    onOpenClass={classId => navigate(pathForDetail?.('AC08', classId) ?? `/app/${encodeURIComponent(tenantId)}/classes/${encodeURIComponent(classId)}`)}
    onOpenStudent={studentId => navigate(pathForStudent?.(studentId) ?? `/app/${encodeURIComponent(tenantId)}/students/${encodeURIComponent(studentId)}`)}
    onBack={undefined}
    operation={id === 'AC08' && <>{sheet && <EnrollmentSheet onClose={() => setSheet(false)} sample={data?.wizard} initialMode={initialSheet ? 'Chuyển lớp' : 'Ghi danh'} />}</>}
    editor={editor && <AcademicCatalogEditor key={`${editor.kind}:${editor.target ?? 'new'}`} editor={editor} model={model} onClose={close} />} />
}
