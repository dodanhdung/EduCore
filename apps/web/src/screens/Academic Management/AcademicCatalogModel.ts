import type { Assignment, ClassDetail, ClassRow, Course, Enrollment, Level, Page, Subject } from './AcademicApi.ts'
import type { Editor, EditorKind } from './AcademicCatalogViews.tsx'

export type CatalogTab = 'subjects' | 'levels'
export type CatalogItem = Subject | Level
export type CatalogModel = { kind: 'AC05'; tab: CatalogTab; page: Page<CatalogItem>; query: string; sample: boolean; canCreate: boolean; canEdit: boolean }
export type CourseModel = { kind: 'AC06'; page: Page<Course>; query: string; sample: boolean; canCreate: boolean; canEdit: boolean; choices: { subjects?: Page<Subject>; levels?: Page<Level> } }
export type ClassesModel = { kind: 'AC07'; page: Page<ClassRow>; query: string; sample: boolean; canCreate: boolean; canEdit: boolean; canOpen: boolean; courses?: Page<Course> }
export type ClassModel = { kind: 'AC08'; detail: ClassDetail; sample: boolean; canEdit: boolean; canBack: boolean; timezone: string; enrollmentCount?: number; enrollmentAccess: 'available' | 'unavailable'; assignmentAccess: 'available' | 'unavailable' }
export type AcademicCatalogModel = CatalogModel | CourseModel | ClassesModel | ClassModel

export function pageOf<T>(items: T[], page = 1, pageSize = 20, total = items.length): Page<T> {
  return { items, page, pageSize, total, asOf: '' }
}
export function catalogModel(tab: CatalogTab, page: Page<Subject> | Page<Level>, query: string, sample: boolean, canManage: boolean): CatalogModel {
  return { kind: 'AC05', tab, page, query, sample, canCreate: canManage, canEdit: canManage }
}
export function courseModel(page: Page<Course>, query: string, sample: boolean, canCreate: boolean, canEdit: boolean, subjects?: Page<Subject>, levels?: Page<Level>): CourseModel {
  return { kind: 'AC06', page, query, sample, canCreate, canEdit, choices: { subjects, levels } }
}
export function classesModel(page: Page<ClassRow>, query: string, sample: boolean, canCreate: boolean, canEdit: boolean, canOpen: boolean, courses?: Page<Course>): ClassesModel {
  return { kind: 'AC07', page, query, sample, canCreate, canEdit, canOpen, courses }
}
export function classModel(detail: ClassDetail, sample: boolean, canEdit: boolean, canBack: boolean, timezone = 'UTC', enrollmentCount?: number): ClassModel {
  return { kind: 'AC08', detail, sample, canEdit, canBack, timezone, enrollmentCount, enrollmentAccess: detail.enrollments === undefined ? 'unavailable' : 'available', assignmentAccess: detail.teacherAssignments === undefined ? 'unavailable' : 'available' }
}
export function completeChoices<T>(page: Page<T> | undefined): page is Page<T> {
  return Boolean(page && page.items.length >= page.total)
}
export function enrollmentRows(detail: ClassDetail): Enrollment[] | undefined { return detail.enrollments }
export function assignmentRows(detail: ClassDetail): Assignment[] | undefined { return detail.teacherAssignments }

export function newEditor(kind: EditorKind, item?: Record<string, unknown>): Editor {
  const values: Record<string, string> = {}
  for (const key of ['code', 'name', 'active', 'sortOrder', 'description', 'subjectId', 'levelId', 'courseId', 'capacity', 'startDate', 'endDate']) {
    const value = item?.[key]; values[key] = value == null ? '' : String(value).slice(0, key.endsWith('Date') ? 10 : undefined)
  }
  values.reason = ''
  return { kind, target: typeof item?.id === 'string' ? item.id : undefined, values }
}
export function editorError(editor: Editor): string | null {
  const v = editor.values
  if (!v.name?.trim() || !v.reason?.trim() || (!editor.target && !v.code?.trim())) return 'Nhập tên, mã (khi tạo) và lý do.'
  if (editor.kind === 'level' && (!/^\d+$/.test(v.sortOrder) || !Number.isSafeInteger(Number(v.sortOrder)))) return 'Thứ tự phải là số nguyên không âm.'
  if (editor.kind === 'course' && !editor.target && (!v.subjectId || !v.levelId)) return 'Chọn môn học và trình độ đang hoạt động.'
  if (editor.kind === 'class' && !editor.target && (!v.courseId || !/^\d+$/.test(v.capacity) || Number(v.capacity) < 1 || Number(v.capacity) > 100000)) return 'Chọn khóa học và nhập sức chứa từ 1 đến 100000.'
  if (editor.kind === 'class' && v.startDate && v.endDate && v.endDate < v.startDate) return 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'
  return null
}
export function editorBody(editor: Editor): Record<string, unknown> {
  const v = editor.values, create = !editor.target
  const body: Record<string, unknown> = { name: v.name.trim(), reason: v.reason.trim() }
  if (create) body.code = v.code.trim()
  if (editor.kind === 'level') body.sortOrder = Number(v.sortOrder)
  if ((editor.kind === 'subject' || editor.kind === 'level') && !create) body.active = v.active === 'true'
  if (editor.kind === 'course') { body.description = v.description || null; if (create) { body.subjectId = v.subjectId; body.levelId = v.levelId } }
  if (editor.kind === 'class' && create) { body.courseId = v.courseId; body.capacity = Number(v.capacity); body.startDate = v.startDate || null; body.endDate = v.endDate || null }
  return body
}
