export type ScreenRoute = { id: string; name: string; path: string; public?: boolean; selfService?: boolean }

// P0 page proposals from SCREEN_MAP v1.0. Embedded units and P1 concepts have no route.
export const routes: readonly ScreenRoute[] = [
  { id: 'AU01', name: 'Đăng nhập', path: '/login', public: true },
  { id: 'AU02', name: 'Chọn trung tâm', path: '/select-tenant', public: true },
  { id: 'AU03', name: 'Yêu cầu OTP khôi phục', path: '/forgot-password', public: true },
  { id: 'AU04', name: 'Nhập OTP và đặt mật khẩu', path: '/reset-password', public: true },
  { id: 'AU06', name: 'Kích hoạt tài khoản bằng OTP', path: '/activate-account', public: true },
  { id: 'AU05', name: 'Hồ sơ tài khoản & phiên', path: '/app/:tenantId/me', selfService: true },
  { id: 'GL01', name: 'Trung tâm thông báo in-app', path: '/app/:tenantId/notifications' },
  { id: 'G01', name: 'Dashboard quản lý', path: '/app/:tenantId/overview' },
  { id: 'OP01', name: 'Tài khoản người dùng', path: '/app/:tenantId/settings/members' },
  { id: 'OP02', name: 'Chi tiết tài khoản và gán role', path: '/app/:tenantId/settings/members/:membershipId' },
  { id: 'OP03', name: 'Liên kết phụ huynh–học sinh', path: '/app/:tenantId/relationships' },
  { id: 'OP04', name: 'Danh sách phê duyệt', path: '/app/:tenantId/approvals' },
  { id: 'OP05', name: 'Xem xét và quyết định phê duyệt', path: '/app/:tenantId/approvals/:requestId' },
  { id: 'OP06', name: 'Tra cứu audit log', path: '/app/:tenantId/audit' },
  { id: 'OP07', name: 'Quản lý job và retry', path: '/app/:tenantId/operations/jobs' },
  { id: 'AC01', name: 'Danh sách học sinh', path: '/app/:tenantId/students' },
  { id: 'AC02', name: 'Chi tiết/chỉnh sửa học sinh', path: '/app/:tenantId/students/:studentId' },
  { id: 'AC03', name: 'Danh sách giáo viên', path: '/app/:tenantId/teachers' },
  { id: 'AC04', name: 'Chi tiết giáo viên & phân công', path: '/app/:tenantId/teachers/:teacherId' },
  { id: 'AC05', name: 'Danh mục môn & trình độ', path: '/app/:tenantId/academic/catalog' },
  { id: 'AC06', name: 'Danh sách khóa học', path: '/app/:tenantId/courses' },
  { id: 'AC07', name: 'Danh sách lớp học', path: '/app/:tenantId/classes' },
  { id: 'AC08', name: 'Chi tiết lớp & học sinh ghi danh', path: '/app/:tenantId/classes/:classId' },
  { id: 'SC01', name: 'Lịch học trung tâm', path: '/app/:tenantId/schedule' },
  { id: 'SC02', name: 'Phòng học & lịch bận tài nguyên', path: '/app/:tenantId/resources' },
  { id: 'SC03', name: 'Tạo lịch/buổi học', path: '/app/:tenantId/schedule/create' },
  { id: 'SC05', name: 'Chi tiết buổi / đổi / hủy lịch', path: '/app/:tenantId/schedule/sessions/:sessionId' },
  { id: 'SC06', name: 'Lịch cá nhân', path: '/app/:tenantId/my/schedule' },
  { id: 'AT01', name: 'Danh sách buổi cần điểm danh', path: '/app/:tenantId/attendance' },
  { id: 'AT02', name: 'Bảng điểm danh theo buổi', path: '/app/:tenantId/sessions/:sessionId/attendance' },
  { id: 'AT03', name: 'Gửi đơn xin nghỉ', path: '/app/:tenantId/leave-requests/new' },
  { id: 'AT04', name: 'Danh sách và xử lý đơn nghỉ', path: '/app/:tenantId/leave-requests' },
  { id: 'BL01', name: 'Bảng đơn giá học phí', path: '/app/:tenantId/finance/pricing' },
  { id: 'BL02', name: 'Xác minh và áp dụng ưu đãi anh/chị/em', path: '/app/:tenantId/finance/discount-eligibility' },
  { id: 'BL03', name: 'Kỳ học phí & generation tính', path: '/app/:tenantId/finance/billing-periods' },
  { id: 'BL04', name: 'Danh sách hóa đơn dự thảo', path: '/app/:tenantId/finance/drafts' },
  { id: 'BL05', name: 'Rà soát và phát hành hóa đơn nội bộ', path: '/app/:tenantId/finance/drafts/:draftId' },
  { id: 'BL06', name: 'Danh sách hóa đơn đã phát hành', path: '/app/:tenantId/finance/invoices' },
  { id: 'BL07', name: 'Chi tiết hóa đơn & lịch sử thu', path: '/app/:tenantId/finance/invoices/:invoiceId' },
  { id: 'BL09', name: 'Công nợ, ví & khoản thu', path: '/app/:tenantId/finance/receivables' },
  { id: 'BL10', name: 'Yêu cầu điều chỉnh/hủy hóa đơn', path: '/app/:tenantId/finance/invoices/:invoiceId/adjust' },
  { id: 'AS01', name: 'Danh sách bài tập của giáo viên', path: '/app/:tenantId/teaching/assignments' },
  { id: 'AS02', name: 'Tạo/chỉnh sửa/giao bài', path: '/app/:tenantId/teaching/assignments/new' },
  { id: 'AS03', name: 'Chi tiết bài tập & lượt nộp', path: '/app/:tenantId/teaching/assignments/:assignmentId' },
  { id: 'AS04', name: 'Danh sách cần chấm', path: '/app/:tenantId/teaching/grading' },
  { id: 'AS05', name: 'Chấm bài và công bố điểm', path: '/app/:tenantId/teaching/submissions/:submissionId/grade' },
  { id: 'AS06', name: 'Bài tập của tôi', path: '/app/:tenantId/my/assignments' },
  { id: 'AS07', name: 'Chi tiết và nộp bài', path: '/app/:tenantId/my/assignments/:assignmentId' },
  { id: 'PO01', name: 'Trang chủ giáo viên', path: '/app/:tenantId/teacher' },
  { id: 'PO02', name: 'Trang chủ học sinh', path: '/app/:tenantId/student' },
  { id: 'PO03', name: 'Trang chủ phụ huynh', path: '/app/:tenantId/parent' },
  { id: 'PO04', name: 'Thông tin học tập của con', path: '/app/:tenantId/parent/children/:studentId' },
  { id: 'PO05', name: 'Học phí & ví của con / học sinh', path: '/app/:tenantId/my/billing' },
]

export type RouteMatch = {
  route: ScreenRoute
  params: Record<string, string>
  tenantId?: string
}

export function matchRoute(pathname: string): RouteMatch | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  for (const route of routes) {
    const names: string[] = []
    const pattern = route.path.split('/').map((part) => {
      if (part.startsWith(':')) { names.push(part.slice(1)); return '([^/]+)' }
      return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }).join('/')
    const found = new RegExp(`^${pattern}$`).exec(path)
    if (!found) continue

    try {
      const params: Record<string, string> = {}
      for (let i = 0; i < names.length; i++) {
        const value = decodeURIComponent(found[i + 1])
        // Encoded separators cannot turn one route segment into multiple segments.
        if (value.includes('/') || value.includes('\\')) return null
        params[names[i]] = value
      }
      return { route, params, tenantId: params.tenantId }
    } catch {
      // Reject invalid percent escapes rather than interpreting a malformed path.
      return null
    }
  }
  return null
}

export function tenantPath(tenantId: string, suffix: string) {
  return `/app/${encodeURIComponent(tenantId)}${suffix}`
}
