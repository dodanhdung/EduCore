import type { BillingData } from '../screens/Billing & Receivables/BillingTypes.ts'

// UI Preview only. Amounts and statuses are independent sample snapshots, never computed client-side.
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
}
