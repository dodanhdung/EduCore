import type { AcademicData, AcademicStudent, AcademicTeacher } from './AcademicTypes.ts'
import type { Assignment, Enrollment, Page, Person, Student, Teacher } from './AcademicApi.ts'

export type PersonKind = 'student' | 'teacher'
export type PersonRow = { id: string; code: string; name: string; status: string }
export type PersonListModel = { kind: PersonKind; rows: PersonRow[]; page: number; pageSize: number;
  total: number; sample: boolean; query: string }
export type PersonDetailModel = { kind: PersonKind; person: PersonRow; dateOfBirth: string | null;
  contact: string | null; enrollments: Enrollment[]; assignments: Assignment[];
  timeZone: string; sample: boolean; sampleNotes: string[] }

export function fromPersonPage(kind: PersonKind, page: Page<Person>, query: string): PersonListModel {
  return { kind, rows: page.items.map(({ id, code, name, status }) => ({ id, code, name, status })),
    page: page.page, pageSize: page.pageSize, total: page.total, sample: false, query }
}
export function fromPersonFixture(kind: PersonKind, data: AcademicData, query = ''): PersonListModel {
  const source = kind === 'student' ? data.students : data.teachers
  const rows = source.filter(row => [row.id, row.name].join(' ').toLocaleLowerCase('vi-VN')
    .includes(query.toLocaleLowerCase('vi-VN'))).map(row => ({ id: row.id, code: row.id, name: row.name, status: row.status }))
  return { kind, rows, page: 1, pageSize: rows.length || 1, total: rows.length, sample: true, query }
}
export function fromStudentDetail(student: Student, timeZone: string): PersonDetailModel {
  return { kind: 'student', person: student, dateOfBirth: student.dateOfBirth, contact: null,
    enrollments: student.enrollments, assignments: [], timeZone, sample: false, sampleNotes: [] }
}
export function fromTeacherDetail(teacher: Teacher, timeZone: string): PersonDetailModel {
  return { kind: 'teacher', person: teacher, dateOfBirth: null, contact: teacher.contact,
    enrollments: [], assignments: teacher.assignments, timeZone, sample: false, sampleNotes: [] }
}
export function fromStudentFixture(student: AcademicStudent): PersonDetailModel {
  return { kind: 'student', person: { id: student.id, code: student.id, name: student.name, status: student.status },
    dateOfBirth: null, contact: null, assignments: [], timeZone: 'Asia/Ho_Chi_Minh', sample: true,
    enrollments: student.activeClasses.map((row, index) => ({ id: `${student.id}-sample-${index}`, studentId: student.id,
      classId: row.id, className: row.name, status: 'ACTIVE', effectiveFrom: '', effectiveTo: null })),
    sampleNotes: student.detail?.summary ?? [] }
}
export function fromTeacherFixture(teacher: AcademicTeacher): PersonDetailModel {
  return { kind: 'teacher', person: { id: teacher.id, code: teacher.id, name: teacher.name, status: teacher.status },
    dateOfBirth: null, contact: null, enrollments: [], assignments: [], timeZone: 'Asia/Ho_Chi_Minh', sample: true,
    sampleNotes: teacher.detail?.summary ?? [] }
}
