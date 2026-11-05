export type AttendanceResult = 'ATTENDED' | 'UNEXCUSED' | 'EXCUSED'
export type RowCapabilities = { canMark: boolean; markReasons: string[]; canCorrect: boolean; correctReasons: string[] }
export type SheetCapabilities = RowCapabilities & { protocolVersion: 1; evaluatedAt: string; canFinalize: boolean; finalizeReasons: string[] }
export type SheetParticipant = { id: string; studentId: string; name: string; enrollmentId: string | null; attendanceId: string | null;
  status: AttendanceResult | null; revision: number; approvedLeave: boolean; billingSourceLocked: boolean; invoiceIssued: boolean;
  capabilities?: RowCapabilities }
export type AttendanceSheet = { sessionId: string; classId: string; startsAt: string; endsAt: string; status: string; timeZone: string;
  finalized: boolean; participants: SheetParticipant[]; sheetVersion?: string; capabilities?: SheetCapabilities }

const reasons: Record<string, string> = {
  NOT_AUTHORIZED: 'Bạn chưa được cấp quyền thao tác này trong phạm vi hiện tại.',
  SESSION_NOT_ELIGIBLE: 'Chỉ thao tác với buổi học đã xác nhận hoặc đã hoàn thành.',
  SESSION_NOT_STARTED: 'Buổi học chưa bắt đầu theo thời gian máy chủ.',
  ASSIGNMENT_OR_LATE_STAFF_REQUIRED: 'Cần là giáo viên phụ trách hoặc nhân sự được phép xử lý điểm danh quá hạn.',
  STAFF_WINDOW_NOT_REACHED: 'Chưa tới mốc xử lý quá hạn: 48 giờ sau khi buổi học kết thúc. Hãy đọc lại quyền thao tác khi tới mốc.',
  ALREADY_FINALIZED: 'Bảng đã được xác nhận; lưu nháp và xác nhận lại đang khóa.',
  SOURCE_LOCKED: 'Nguồn điểm danh đã khóa; cần quy trình điều chỉnh được cấp quyền.',
  RESULTS_INCOMPLETE: 'Cần lưu đủ kết quả hợp lệ cho mọi học viên trước khi xác nhận.',
  APPROVED_LEAVE_REQUIRED: 'Vắng có phép cần đơn nghỉ đã được duyệt hợp lệ.',
  NO_RECORD_TO_CORRECT: 'Chưa có bản ghi hợp lệ để điều chỉnh.',
  EMPTY_ROSTER: 'Không thể xác nhận vì buổi học chưa có học viên tham gia hợp lệ.',
}
export function attendanceReasonText(codes?: readonly string[]) {
  return [...new Set(codes ?? [])].map(code => reasons[code] ?? 'Thao tác chưa khả dụng. Hãy đọc lại dữ liệu.').join(' ')
}
export function validSheetVersion(value: unknown): value is string { return typeof value === 'string' && /^av1:[0-9a-f]{64}$/.test(value) }
function validDecision(value: unknown, key: string, reasonKey: string) {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>, codes = data[reasonKey]
  return typeof data[key] === 'boolean' && Array.isArray(codes) && codes.every(c => typeof c === 'string' && Object.hasOwn(reasons, c))
    && (data[key] ? codes.length === 0 : codes.length > 0)
}
export function validAttendanceContract(sheet: AttendanceSheet): boolean {
  const c = sheet.capabilities
  return validSheetVersion(sheet.sheetVersion) && !!c && c.protocolVersion === 1 && typeof c.evaluatedAt === 'string'
    && Number.isFinite(Date.parse(c.evaluatedAt)) && validDecision(c, 'canMark', 'markReasons')
    && validDecision(c, 'canCorrect', 'correctReasons') && validDecision(c, 'canFinalize', 'finalizeReasons')
    && Array.isArray(sheet.participants) && sheet.participants.every(p => validDecision(p.capabilities, 'canMark', 'markReasons') && validDecision(p.capabilities, 'canCorrect', 'correctReasons'))
    && c.canMark === sheet.participants.some(p => p.capabilities?.canMark === true)
    && c.canCorrect === sheet.participants.some(p => p.capabilities?.canCorrect === true)
    && (!c.canFinalize || (!sheet.finalized && sheet.participants.length > 0 && sheet.participants.every(p => p.status && (p.status !== 'EXCUSED' || p.approvedLeave))))
}
