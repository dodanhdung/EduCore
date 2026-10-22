import type { AssignmentData } from '../screens/Assignments & Grading/AssignmentTypes.ts'

export const assignmentFixtures: AssignmentData = {
  teacherId: 'teacher-mai', studentId: 'student-minh-anh', sampleNow: '2026-10-17T12:00:00+07:00',
  studentNames: { 'student-minh-anh': 'Trần Minh Anh', 'student-gia-han': 'Nguyễn Gia Hân', 'student-bao-ngoc': 'Trần Bảo Ngọc', 'student-my-linh': 'Lê Mỹ Linh' },
  assignments: [
    { id: 'assignment-chuong-3', title: 'Bài tập chương 3: Phương trình', description: 'Hoàn thành câu 1–10, trình bày lời giải và tải tệp PDF hoặc DOCX.', classId: 'class-toan-8a', className: 'Toán 8A', teacherId: 'teacher-mai', teacherName: 'Cô Mai Nguyễn', recipientIds: ['student-minh-anh', 'student-gia-han', 'student-bao-ngoc'], deadline: '2026-10-20T23:59:00+07:00', priority: 4, status: 'PUBLISHED', attachmentNames: ['de-bai-chuong-3.pdf'] },
    { id: 'assignment-hinh-hoc', title: 'Ôn tập hình học', description: 'Làm bài tập về tam giác và đường tròn.', classId: 'class-toan-8b', className: 'Toán 8B', teacherId: 'teacher-mai', teacherName: 'Cô Mai Nguyễn', recipientIds: ['student-minh-anh', 'student-my-linh'], deadline: '2026-10-17T23:59:00+07:00', priority: 3, status: 'PUBLISHED' },
    { id: 'assignment-dai-so', title: 'Luyện tập đại số', description: 'Hoàn thành phần luyện tập đại số.', classId: 'class-toan-8a', className: 'Toán 8A', teacherId: 'teacher-mai', teacherName: 'Cô Mai Nguyễn', recipientIds: ['student-minh-anh'], deadline: '2026-10-14T23:59:00+07:00', priority: 2, status: 'CLOSED' },
    { id: 'assignment-draft', title: 'Kiểm tra cuối chương', description: 'Bản nháp chưa giao.', classId: 'class-toan-8a', className: 'Toán 8A', teacherId: 'teacher-mai', teacherName: 'Cô Mai Nguyễn', recipientIds: ['student-minh-anh'], deadline: '2026-10-28T23:59:00+07:00', priority: 5, status: 'DRAFT' },
    { id: 'assignment-unrelated', title: 'Bài tập lớp khác', description: 'Chỉ dành cho học sinh khác.', classId: 'class-toan-9a', className: 'Toán 9A', teacherId: 'teacher-other', teacherName: 'Thầy Nam', recipientIds: ['student-other'], deadline: '2026-10-27T23:59:00+07:00', priority: 2, status: 'PUBLISHED' },
  ],
  submissions: [
    { id: 'submission-minh-anh', assignmentId: 'assignment-chuong-3', studentId: 'student-minh-anh', studentName: 'Trần Minh Anh', versions: [{ number: 1, submittedAt: '2026-10-15T19:12:00+07:00', late: false, files: [{ name: 'bai-lam-v1.pdf', size: '1,9 MB' }] }, { number: 2, submittedAt: '2026-10-16T20:14:00+07:00', late: false, files: [{ name: 'bai-lam-chuong-3.pdf', size: '2,4 MB' }, { name: 'hinh-bai-giai.png', size: '1,1 MB' }] }] },
    { id: 'submission-gia-han', assignmentId: 'assignment-chuong-3', studentId: 'student-gia-han', studentName: 'Nguyễn Gia Hân', versions: [{ number: 1, submittedAt: '2026-10-21T09:20:00+07:00', late: true, files: [{ name: 'bai-lam-han.docx', size: '1,4 MB' }] }], grade: { status: 'DRAFT', score: 7.5, feedback: 'Cần bổ sung bước giải.' } },
    { id: 'submission-my-linh', assignmentId: 'assignment-hinh-hoc', studentId: 'student-my-linh', studentName: 'Lê Mỹ Linh', versions: [{ number: 1, submittedAt: '2026-10-16T17:20:00+07:00', late: false, files: [{ name: 'hinh-hoc.jpg', size: '0,8 MB' }] }], grade: { status: 'PUBLISHED', score: 8.5, feedback: 'Trình bày rõ ràng.' } },
    { id: 'submission-dai-so', assignmentId: 'assignment-dai-so', studentId: 'student-minh-anh', studentName: 'Trần Minh Anh', versions: [{ number: 1, submittedAt: '2026-10-15T12:00:00+07:00', late: true, files: [{ name: 'dai-so.pdf', size: '1,2 MB' }] }], grade: { status: 'PUBLISHED', score: 9, feedback: 'Làm tốt.' } },
  ],
}
