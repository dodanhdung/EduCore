import type { BillingInvoice } from './BillingTypes.ts'

export function invoiceStatus(item: BillingInvoice) {
  if (item.status === 'CANCELLED') return { label: 'Đã hủy', tone: 'warning' as const }
  if (item.settlement === 'SETTLED') return { label: 'Đã tất toán', tone: 'success' as const }
  if (item.overdue) return { label: 'Quá hạn', tone: 'danger' as const }
  return { label: item.settlement === 'PARTIAL' ? 'Thanh toán một phần' : 'Chưa thanh toán', tone: 'info' as const }
}
