import type { BillingData, BillingLine } from '../screens/Billing & Receivables/BillingTypes.ts'

// UI Preview only. Amounts and statuses are independent sample snapshots, never computed client-side.
const zone = 'Asia/Ho_Chi_Minh'
const engDates = ['01', '03', '05', '08', '10', '12', '15', '17', '19']
const khoiLines: BillingLine[] = [
  ...engDates.map((day) => ({ id: `line-eng-${day}`, sessionId: `ENG-B2-2026-09-${day}`, className: 'ENG-B2', sourceBusinessDate: `2026-09-${day}`, timeZone: zone, attendance: day === '19' ? 'UNEXCUSED' as const : 'ATTENDED' as const, chargeUnit: '1' as const, priceRuleId: 'price-class-eng', priceScope: 'CLASS' as const, effectiveFrom: '2026-09-01', unitPriceVnd: '300000', amountVnd: '300000', sourceConfirmed: true })),
  { id: 'line-eng-22', sessionId: 'ENG-B2-2026-09-22', className: 'ENG-B2', sourceBusinessDate: '2026-09-22', timeZone: zone, attendance: 'EXCUSED', chargeUnit: '0', priceRuleId: 'price-class-eng', priceScope: 'CLASS', effectiveFrom: '2026-09-01', unitPriceVnd: '300000', amountVnd: '0', sourceConfirmed: true },
  ...['25', '27'].map((day) => ({ id: `line-ielts-${day}`, sessionId: `IELTS-06-2026-09-${day}`, className: 'IELTS-06', sourceBusinessDate: `2026-09-${day}`, timeZone: zone, attendance: 'ATTENDED' as const, chargeUnit: '1' as const, priceRuleId: 'price-class-ielts', priceScope: 'CLASS' as const, effectiveFrom: '2026-09-01', unitPriceVnd: '400000', amountVnd: '400000', sourceConfirmed: true })),
]

export const billingFixtures: BillingData = {
  priceMissingCount: '0',
  latestPriceEffectiveDate: '28/09/2026',
  priceRules: [
    { id: 'price-session-28', scope: 'SESSION', target: 'IELTS-06 · 28/09', amountVnd: '350000', effectiveFrom: '2026-09-28', effectiveTo: '2026-09-29', policy: 'v3', status: 'ACTIVE' },
    { id: 'price-class-eng', scope: 'CLASS', target: 'ENG-B2', amountVnd: '300000', effectiveFrom: '2026-09-01', policy: 'v3', status: 'ACTIVE' },
    { id: 'price-class-ielts', scope: 'CLASS', target: 'IELTS-06', amountVnd: '400000', effectiveFrom: '2026-09-01', policy: 'v3', status: 'ACTIVE' },
    { id: 'price-course-eng', scope: 'COURSE', target: 'Tiếng Anh B2', amountVnd: '250000', effectiveFrom: '2026-08-01', policy: 'v2', status: 'HISTORICAL' },
    { id: 'price-overlap', scope: 'CLASS', target: 'Lớp có quy tắc chồng lấn', amountVnd: '280000', effectiveFrom: '2026-09-01', effectiveTo: '2026-10-01', policy: 'v3', status: 'OVERLAP' },
  ],
  siblingEligibility: [
    { id: 'siblings-khoi-anh', studentNames: 'Nguyễn Minh Khôi / Minh Anh', evidence: 'VERIFIED', enrollment: 'ACTIVE', eligible: true, evidenceNote: 'Chứng cứ quan hệ đã được xác minh trong dữ liệu mẫu; cả hai ghi danh hợp lệ.' },
    { id: 'siblings-linh-nam', studentNames: 'Trần Phương Linh / Phương Nam', evidence: 'UNVERIFIED', enrollment: 'ACTIVE', eligible: false, evidenceNote: 'Chưa có chứng cứ xác minh; cùng phụ huynh hoặc cùng họ không đủ điều kiện.' },
    { id: 'siblings-yen-long', studentNames: 'Lê Hoàng Yến / Hoàng Long', evidence: 'REVOKED', enrollment: 'INACTIVE', eligible: false, evidenceNote: 'Điều kiện đã thu hồi; một ghi danh không còn hoạt động.' },
  ],
  periods: [
    { id: '2026-09', label: '09/2026', attendance: 'Đầy đủ · 120/120', price: 'Đầy đủ', policy: 'quy tắc học phí v3', sourceReadyCount: '120/120', ready: true, draftCount: '120', sourceTimeZone: 'Asia/Ho_Chi_Minh' },
    { id: '2026-08', label: '08/2026', attendance: 'Thiếu xác nhận · 118/120', price: 'Thiếu PriceRule', policy: 'quy tắc học phí v3', sourceReadyCount: '118/120', ready: false, draftCount: '0', sourceTimeZone: 'Asia/Ho_Chi_Minh' },
  ],
  generations: [
    { id: 'G2', runId: 'RUN-0926-02', period: '2026-09', startedAt: '02/10 · 09:10', status: 'COMPLETED', draftCount: '120', current: true, reason: 'Tính lại có chủ đích · nguồn điểm danh đổi', diff: '12 dòng thay đổi theo snapshot máy chủ; cần rà soát trước phát hành.' },
    { id: 'G1', runId: 'RUN-0926-01', period: '2026-09', startedAt: '01/10 · 08:20', status: 'COMPLETED', draftCount: '120', current: false, reason: 'Generation ban đầu' },
    { id: 'G0', runId: 'RUN-0926-00', period: '2026-09', startedAt: '30/09 · 08:20', status: 'STALE_GENERATION', current: false, reason: 'Nguồn đã đổi' },
    { id: 'G-08', runId: 'RUN-0826-01', period: '2026-08', startedAt: '01/09 · 08:20', status: 'NEEDS_INFORMATION', current: true, reason: 'Thiếu xác nhận điểm danh và PriceRule' },
    { id: 'G-08-F', runId: 'RUN-0826-00', period: '2026-08', startedAt: '01/09 · 07:50', status: 'FAILED', current: false, reason: 'Tác vụ thất bại; retry giữ generation' },
  ],
  draftEstimatedTotalVnd: '5850000',
  issuedOutstandingTotalVnd: '5150000',
  drafts: [
    { id: 'D-0926-001', studentId: 'student-khoi', studentName: 'Nguyễn Minh Khôi', period: '2026-09', status: 'DRAFT', reviewState: 'READY', generationId: 'G2', currentGenerationId: 'G2', policyVersion: 'v3', timeZone: zone, grossVnd: '3500000', discountVnd: '350000', netVnd: '3150000', siblingVerified: true, lines: khoiLines, warnings: [] },
    { id: 'D-0926-002', studentId: 'student-linh', studentName: 'Trần Phương Linh', period: '2026-09', status: 'DRAFT', reviewState: 'STALE_GENERATION', generationId: 'G1', currentGenerationId: 'G2', policyVersion: 'v3', timeZone: zone, grossVnd: '2700000', discountVnd: '0', netVnd: '2700000', siblingVerified: false, lines: khoiLines.filter((line) => line.className === 'ENG-B2' && line.chargeUnit === '1'), warnings: ['Generation G1 không còn hiện hành; cần rà soát bản tính G2 trước khi phát hành.'] },
    { id: 'D-0926-003', studentId: 'student-yen', studentName: 'Lê Hoàng Yến', period: '2026-09', status: 'NEEDS_INFORMATION', reviewState: 'NEEDS_INFORMATION', generationId: 'G2', currentGenerationId: 'G2', policyVersion: 'v3', timeZone: zone, siblingVerified: false, lines: [{ ...khoiLines[0], id: 'line-yen-missing', sessionId: 'ENG-B2-2026-09-01-YEN', sourceConfirmed: false }], warnings: ['Điểm danh chưa xác nhận hoặc PriceRule còn thiếu. Không suy ra số tiền 0.'] },
    { id: 'D-0926-004', studentId: 'student-binh', studentName: 'Phạm Quốc Bình', period: '2026-09', status: 'FAILED', reviewState: 'FAILED', generationId: 'G2', currentGenerationId: 'G2', policyVersion: 'v3', timeZone: zone, siblingVerified: false, lines: [], warnings: ['Lần tính thất bại. Chưa có snapshot số tiền hợp lệ.'] },
  ],
  invoices: [
    { id: 'invoice-hai-dang-0926', number: 'INV-2026-00001', studentId: 'student-hai-dang', studentName: 'Nguyễn Hải Đăng', period: '2026-09', status: 'ISSUED', settlement: 'PARTIAL', overdue: true, issuedAt: '2026-10-03', dueAt: '2026-10-10', policyVersion: 'v3', generationId: 'G2', timeZone: zone, originalObligationVnd: '3150000', adjustedObligationVnd: '3150000', allocatedVnd: '1000000', outstandingVnd: '2150000', walletAvailableVnd: '1200000', verifiedCashReceivedVnd: '2200000', sourceType: 'PURE_WALLET', lines: khoiLines, payments: [
      { id: 'PAY-2026-011', receivedAt: '2026-10-05', method: 'WALLET', amountVnd: '500000', allocatedVnd: '500000', status: 'APPLIED', receiptRef: 'WALLET-PAY-011' },
      { id: 'PAY-2026-018', receivedAt: '2026-10-07', method: 'WALLET', amountVnd: '500000', allocatedVnd: '500000', status: 'APPLIED', receiptRef: 'WALLET-PAY-018' },
    ], adjustments: [{ id: 'ADJ-2026-011', kind: 'ADJUSTMENT', decision: 'APPROVED', execution: 'NOT_STARTED', occurredAt: '2026-10-12', note: 'Đã duyệt yêu cầu; chưa thực thi, nghĩa vụ vẫn theo snapshot hiện tại.' }] },
    { id: 'invoice-thao-vy-0926', number: 'INV-2026-00002', studentId: 'student-thao-vy', studentName: 'Trần Thảo Vy', period: '2026-09', status: 'ISSUED', settlement: 'SETTLED', overdue: false, issuedAt: '2026-10-03', dueAt: '2026-10-10', policyVersion: 'v3', generationId: 'G2', timeZone: zone, originalObligationVnd: '2700000', adjustedObligationVnd: '2700000', allocatedVnd: '2700000', outstandingVnd: '0', walletAvailableVnd: '0', verifiedCashReceivedVnd: '2700000', sourceType: 'LEGACY_MIXED', lines: khoiLines.filter((line) => line.className === 'ENG-B2' && line.chargeUnit === '1'), payments: [
      { id: 'PAY-LEGACY-002', receivedAt: '2026-10-06', method: 'BANK_TRANSFER', amountVnd: '2700000', allocatedVnd: '2700000', status: 'APPLIED', receiptRef: 'LEGACY-RECEIPT-002' },
    ], adjustments: [] },
    { id: 'invoice-nam-phong-0926', number: 'INV-2026-00003', studentId: 'student-nam-phong', studentName: 'Lê Nam Phong', period: '2026-09', status: 'ISSUED', settlement: 'UNPAID', overdue: true, issuedAt: '2026-10-04', dueAt: '2026-10-11', policyVersion: 'v3', generationId: 'G2', timeZone: zone, originalObligationVnd: '3000000', adjustedObligationVnd: '3000000', allocatedVnd: '0', outstandingVnd: '3000000', walletAvailableVnd: '100000', verifiedCashReceivedVnd: '100000', sourceType: 'PURE_WALLET', lines: [...khoiLines.filter((line) => line.className === 'ENG-B2' && line.chargeUnit === '1'), { ...khoiLines[0], id: 'line-nam-phong-24', sessionId: 'ENG-B2-2026-09-24', sourceBusinessDate: '2026-09-24' }], payments: [], adjustments: [] },
    { id: 'invoice-mai-an-0926', number: 'INV-2026-00004', studentId: 'student-mai-an', studentName: 'Đỗ Mai An', period: '2026-09', status: 'CANCELLED', settlement: 'UNPAID', overdue: false, issuedAt: '2026-10-04', dueAt: '2026-10-11', policyVersion: 'v3', generationId: 'G2', timeZone: zone, originalObligationVnd: '2400000', adjustedObligationVnd: '0', allocatedVnd: '0', outstandingVnd: '0', walletAvailableVnd: '0', verifiedCashReceivedVnd: '0', sourceType: 'PURE_WALLET', lines: khoiLines.filter((line) => line.className === 'ENG-B2').slice(0, 8), payments: [], adjustments: [{ id: 'CXL-2026-004', kind: 'CANCELLATION', decision: 'APPROVED', execution: 'COMPLETED', occurredAt: '2026-10-15', note: 'Lệnh hủy đã thực thi và được ghi nhận; dòng đã phát hành vẫn chỉ đọc.', walletCreditVnd: '0' }] },
  ],
}
