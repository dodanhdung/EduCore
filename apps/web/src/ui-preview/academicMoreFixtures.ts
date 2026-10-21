import type { AcademicMoreData } from '../screens/Academic Management/AcademicMoreScreens.tsx'

// Chỉ dùng cho UI Preview phát triển; không nhập vào luồng production.
export const academicMoreFixtures: AcademicMoreData = {
  catalog: [
    { code: 'ENG', name: 'Tiếng Anh', order: '01', status: 'Đang hoạt động', kind: 'Môn học' },
    { code: 'IELTS', name: 'Luyện thi IELTS', order: '02', status: 'Đang hoạt động', kind: 'Môn học' },
    { code: 'JPN', name: 'Tiếng Nhật', order: '03', status: 'Đang hoạt động', kind: 'Môn học' },
    { code: 'MATH', name: 'Toán tư duy', order: '04', status: 'Đang hoạt động', kind: 'Môn học' },
    { code: 'A2', name: 'Sơ cấp A2', order: '01', status: 'Đang hoạt động', kind: 'Trình độ' },
    { code: 'B2', name: 'Trung cấp B2', order: '02', status: 'Đang hoạt động', kind: 'Trình độ' },
    { code: 'N4', name: 'Tiếng Nhật N4', order: '03', status: 'Đang hoạt động', kind: 'Trình độ' },
  ],
  courses: [
    { code: 'CR-ENG-B2', name: 'Giao tiếp B2', subject: 'Tiếng Anh', level: 'B2', status: 'Đang hoạt động' },
    { code: 'CR-IELTS65', name: 'IELTS Master', subject: 'IELTS', level: '6.5+', status: 'Đang hoạt động' },
    { code: 'CR-JPN-N4', name: 'Nhật N4 Cấp tốc', subject: 'Tiếng Nhật', level: 'N4', status: 'Đang hoạt động' },
    { code: 'CR-MATH-KIDS', name: 'Toán tư duy', subject: 'Toán tư duy', level: 'Cơ bản', status: 'Chưa mở lớp' },
  ],
  classes: [
    { code: 'IELTS-03', name: 'Master 6.5+', course: 'IELTS Master', teacher: 'Mai Phương', capacity: '16/18', status: 'Đang hoạt động', detail: { courseCode: 'CR-IELTS65', subjectLevel: 'IELTS · 6.5+', capacityTotal: '18 học sinh', scope: 'Cơ sở Quận 1', schedule: 'Thứ 3, 5 · 18:30–20:30', nextDate: '29/10', nextTime: '18:30–20:30 · Phòng 302', availability: 'Còn 02 chỗ · Dữ liệu mẫu', enrollments: [
      { studentId: 'HS-1028', studentName: 'Nguyễn Minh Anh', effective: '01/09/2026 → nay', status: 'Đang hoạt động', previousClass: '—' },
      { studentId: 'HS-1037', studentName: 'Trần Thu Hà', effective: '15/09/2026 → nay', status: 'Đang hoạt động', previousClass: '—' },
      { studentId: 'HS-1048', studentName: 'Lê Thanh Bình', effective: '29/10/2026 →', status: 'Chờ xác nhận', previousClass: 'ENG-B2' },
      { studentId: 'HS-1005', studentName: 'Phạm Ngọc Diệp', effective: '01/01 → 30/09/2026', status: 'Đã chuyển lớp', previousClass: '—' },
    ] } },
    { code: 'ENG-B2', name: 'Giao tiếp B2', course: 'Giao tiếp B2', teacher: 'Đặng Văn Trân', capacity: '18/20', status: 'Đang hoạt động' },
    { code: 'JPN-N4', name: 'Nhật N4', course: 'Nhật N4', teacher: 'Kenji Sato', capacity: '10/12', status: 'Dự kiến mở' },
    { code: 'MATH-01', name: 'Toán tư duy', course: 'Toán tư duy', teacher: 'Bích Thảo', capacity: '15/15 · Đầy', status: 'Đang hoạt động' },
  ],
  catalogMetrics: [['MÔN ĐANG DÙNG', '12', 'Có khóa học/lớp tham chiếu'], ['TRÌNH ĐỘ', '08', 'Sắp theo thứ tự hiển thị'], ['ĐÃ ẨN', '02', 'Lịch sử còn đọc được']],
  courseMetrics: [['KHÓA ĐANG HOẠT ĐỘNG', '24', 'Có thể mở lớp'], ['CHƯA MỞ LỚP', '05', 'Chưa có lớp tham chiếu'], ['ĐÃ NGỪNG', '03', 'Giữ lịch sử khóa']],
  classMetrics: [['ĐANG HOẠT ĐỘNG', '46', 'Lớp đang hoạt động'], ['DỰ KIẾN MỞ', '08', 'Chưa mở lớp'], ['ĐÃ HOÀN THÀNH', '12', 'Giữ dữ liệu ghi danh']],
  wizard: { student: 'HS-1048 · Lê Thanh Bình', source: 'ENG-B2 · Giao tiếp B2', destination: 'IELTS-03 · Master 6.5+', effective: '29/10/2026 · 18:30' },
}
