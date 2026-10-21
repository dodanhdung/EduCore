export type AcademicId = 'AC01' | 'AC02' | 'AC03' | 'AC04'
export type AcademicPerson = { id: string; name: string; subject: string; level: string; status: string; classes: string; detail?: { secondary: string; inset: string[]; summary: string[]; next: string } }
export type Metric = [label: string, value: string, note: string]
export type AcademicData = { students: AcademicPerson[]; teachers: AcademicPerson[]; studentMetrics: Metric[]; teacherMetrics: Metric[] }

export type CatalogItem = { code: string; name: string; order: string; status: string; kind: 'Môn học' | 'Trình độ' }
export type CourseItem = { code: string; name: string; subject: string; level: string; status: string }
export type EnrollmentItem = { studentId: string; studentName: string; effective: string; status: string; previousClass: string }
export type ClassItem = { code: string; name: string; course: string; teacher: string; capacity: string; status: string; detail?: { courseCode: string; subjectLevel: string; capacityTotal: string; scope: string; schedule: string; nextDate: string; nextTime: string; availability: string; enrollments: EnrollmentItem[] } }
export type WizardSample = { student: string; source: string; destination: string; effective: string }
export type AcademicMoreData = { catalog: CatalogItem[]; courses: CourseItem[]; classes: ClassItem[]; catalogMetrics: Metric[]; courseMetrics: Metric[]; classMetrics: Metric[]; wizard?: WizardSample }
export type MoreId = 'AC05' | 'AC06' | 'AC07' | 'AC08'
