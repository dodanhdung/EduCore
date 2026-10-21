import type { AcademicData } from '../screens/Academic Management/AcademicScreens.tsx'

// Chỉ được import từ PreviewApp, nằm ngoài bundle production.
export const academicFixtures: AcademicData = {
  students: [
    { kind: 'student', id: 'HS-1028', name: 'Nguyễn Minh Anh', activeClasses: [{ id: 'IELTS-03', name: 'IELTS Master 6.5+' }], level: 'B2', status: 'Đang học', detail: { secondary: '14/05/2010', inset: ['Nguyễn Thị Hạnh · Liên kết đang hiệu lực.', 'Xem căn cứ và lịch sử xác minh trong tab Người giám hộ.'], summary: ['IELTS Master 6.5+', 'Lớp IELTS-03 · 16/18 học sinh'], next: 'Buổi sắp tới: 29/10/2026, 18:30–20:30 · Phòng 302.' } },
    { kind: 'student', id: 'HS-1031', name: 'Trần Bảo Ngọc', activeClasses: [{ id: 'ENG-B2', name: 'Tiếng Anh Giao Tiếp B2' }], level: 'B2', status: 'Đang học' },
    { kind: 'student', id: 'HS-1035', name: 'Lê Quốc Bảo', activeClasses: [], level: 'A2', status: 'Chưa có lớp' },
    { kind: 'student', id: 'HS-1042', name: 'Phạm Khánh Linh', activeClasses: [{ id: 'JP-N4', name: 'Tiếng Nhật N4 Cấp tốc' }], level: 'N4', status: 'Đang học' },
  ],
  teachers: [
    { kind: 'teacher', id: 'GV-018', name: 'Đặng Văn Trân', subject: 'Tiếng Anh · B2/C1', level: 'B2', status: 'Đang hoạt động', classes: '03 lớp', detail: { secondary: 'Chưa có membership', inset: ['Tiếng Anh Giao Tiếp B2 · xác minh 12/08/2026.', 'IELTS 6.5+ · xác minh 01/09/2026.'], summary: ['ENG-B2 · Thứ 2, 4 · 18:00', 'IELTS-03 · Thứ 3, 5 · 18:30', 'ENG-C1 · Thứ 7 · 09:00'], next: 'Dữ liệu mẫu · Chỉ hiển thị thông tin trong phạm vi được cấp quyền.' } },
    { kind: 'teacher', id: 'GV-023', name: 'Mai Phương', subject: 'IELTS · 6.5+', level: 'C1', status: 'Đang hoạt động', classes: '02 lớp' },
    { kind: 'teacher', id: 'GV-031', name: 'Kenji Sato', subject: 'Tiếng Nhật · N4', level: 'N4', status: 'Đang hoạt động', classes: '01 lớp' },
    { kind: 'teacher', id: 'GV-044', name: 'Bích Thảo', subject: 'Toán tư duy', level: 'A2', status: 'Đang hoạt động', classes: 'Chưa phân công' },
  ],
  studentMetrics: [['ĐANG HỌC', '1.248', 'Hồ sơ đang hoạt động trong tenant'], ['CHƯA GHI DANH', '32', 'Có hồ sơ nhưng chưa có lớp'], ['NGỪNG HỌC', '18', 'Lưu lịch sử học tập']],
  teacherMetrics: [['ĐANG HOẠT ĐỘNG', '48', 'Hồ sơ giáo viên hiện hành'], ['CHƯA PHÂN CÔNG', '06', 'Chưa có lớp hiện hành'], ['NGỪNG HOẠT ĐỘNG', '04', 'Giữ lịch sử phân công']],
}
