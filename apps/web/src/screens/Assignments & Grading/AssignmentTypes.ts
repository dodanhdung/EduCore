export type Assignment = {
  id: string; title: string; description: string; classId: string; className: string;
  teacherId: string; teacherName: string; recipientIds: string[]; deadline: string;
  priority: number; status: 'DRAFT' | 'PUBLISHED' | 'CLOSED'; attachmentNames?: string[];
}
export type SubmissionVersion = { number: number; submittedAt: string; late: boolean; files: { name: string; size: string }[] }
export type Submission = {
  id: string; assignmentId: string; studentId: string; studentName: string;
  versions: SubmissionVersion[]; grade?: { status: 'DRAFT' | 'PUBLISHED'; score: number; feedback: string }
}
export type AssignmentData = { assignments: Assignment[]; submissions: Submission[]; studentNames?: Record<string, string>; sampleNow?: string; studentId?: string; teacherId?: string }

export const assignmentFor = (data: AssignmentData | undefined, id: string | undefined) => data?.assignments.find((item) => item.id === id)
export const submissionFor = (data: AssignmentData | undefined, id: string | undefined) => data?.submissions.find((item) => item.id === id)
export const latestVersion = (submission: Submission) => submission.versions.at(-1)
export const studentAssignments = (data: AssignmentData, studentId: string) => data.assignments.filter((item) => item.status !== 'DRAFT' && item.recipientIds.includes(studentId))
export const validScore = (value: string) => /^(?:\d|10)(?:\.\d)?$/.test(value) && Number(value) >= 0 && Number(value) <= 10

const allowedMime: Record<string, string[]> = {
  pdf: ['application/pdf'], docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  jpg: ['image/jpeg'], png: ['image/png'],
}
export function validateSelection(existing: File[], incoming: File[]) {
  const accepted = [...existing]
  const errors: string[] = []
  for (const file of incoming) {
    const ext = file.name.split('.').at(-1)?.toLowerCase() ?? ''
    if (!allowedMime[ext] || file.type && !allowedMime[ext].includes(file.type)) { errors.push(`${file.name}: định dạng không hỗ trợ.`); continue }
    if (file.size > 10 * 1024 * 1024) { errors.push(`${file.name}: vượt quá 10 MB.`); continue }
    if (accepted.some((item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified)) { errors.push(`${file.name}: tệp đã được chọn.`); continue }
    if (accepted.length >= 5) { errors.push('Tối đa 5 tệp cho mỗi lần nộp.'); break }
    accepted.push(file)
  }
  return { files: accepted, errors }
}
