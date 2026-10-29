import type { AssignmentData } from '../AssignmentTypes.ts'
import { upcomingDeadlineCount } from '../AssignmentTypes.ts'

export type AssignmentListRow = {
  id: string; title: string; classId: string; className: string; deadline: string;
  priority: number; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}
export type AssignmentListModel = {
  rows: AssignmentListRow[]; timeZone: string; sample: boolean;
  published: number | null; upcoming: number | null; ungraded: number | null
}
type ProductionAssignment = { id: string; title: string; class_id: string | null;
  deadline_at: string; priority: number; status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' }
type Class = { id: string; name: string }

/** The authorized assignment read is a complete array; submission/grading totals are separate projections. */
export function fromAssignmentRead(items: ProductionAssignment[], classes: Class[], timeZone: string): AssignmentListModel {
  const names = new Map(classes.map(row => [row.id, row.name]))
  const rows = items.map(row => ({ id: row.id, title: row.title, classId: row.class_id ?? '',
    className: names.get(row.class_id ?? '') ?? 'Lớp được phân công', deadline: row.deadline_at,
    priority: row.priority, status: row.status }))
  return { rows, timeZone, sample: false, published: rows.filter(row => row.status === 'PUBLISHED').length,
    upcoming: null, ungraded: null }
}
export function fromAssignmentFixture(data: AssignmentData, referenceTime?: string, sample = true): AssignmentListModel {
  const source = data.assignments.filter(row => row.teacherId === data.teacherId)
  const rows: AssignmentListRow[] = source.map(row => ({ id: row.id, title: row.title, classId: row.classId,
    className: row.className, deadline: row.deadline, priority: row.priority,
    status: row.status === 'CLOSED' ? 'ARCHIVED' : row.status }))
  return { rows, timeZone: 'Asia/Ho_Chi_Minh', sample,
    published: rows.filter(row => row.status === 'PUBLISHED').length,
    upcoming: referenceTime ? upcomingDeadlineCount(source, referenceTime) ?? null : null, ungraded: null }
}
