export type AcademicId = 'AC01' | 'AC02' | 'AC03' | 'AC04' | 'AC05' | 'AC06' | 'AC07' | 'AC08'
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; asOf: string }
export type Person = { id: string; code: string; name: string; status: string }
export type Enrollment = { id: string; studentId?: string; studentCode?: string; studentName?: string;
  classId?: string; classCode?: string; className?: string; status: string;
  effectiveFrom: string; effectiveTo: string | null; priorEnrollmentId?: string | null }
export type Assignment = { id: string; teacherId?: string; teacherCode?: string; teacherName?: string;
  classId?: string; classCode?: string; className?: string; validFrom: string; validTo: string | null }
export type Student = Person & { dateOfBirth: string | null; enrollments: Enrollment[] }
export type Teacher = Person & { contact: string | null; assignments: Assignment[] }
export type Subject = { id: string; code: string; name: string; active: boolean }
export type Level = Subject & { sortOrder: number }
export type Course = { id: string; code: string; name: string; status: string; subjectId: string;
  subjectName: string; levelId: string; levelName: string; description: string | null }
export type ClassRow = { id: string; code: string; name: string; status: string; capacity: number;
  courseId: string; courseName: string; enrollmentCount: number }
export type ClassDetail = Omit<ClassRow, 'enrollmentCount'> & { subjectId: string; levelId: string;
  startDate: string | null; endDate: string | null; enrollments?: Enrollment[];
  teacherAssignments?: Assignment[] }
export type Capabilities = { studentCreate: boolean; studentUpdate: boolean; teacherCreate: boolean;
  teacherUpdate: boolean; catalogManage: boolean; courseUpdate: boolean; classCreate: boolean;
  classUpdate: boolean; teacherAssign: boolean; enroll: boolean; transferRequest: boolean;
  tenantTimezone: string }
export type PlacementContext = { targetSubjectId: string; targetLevelId: string;
  publishedAssessments: { gradeId: string; revision: number; evidenceHash: string; score: string }[];
  automaticRecommendation: 'DEFERRED_NO_APPROVED_RUBRIC' }
