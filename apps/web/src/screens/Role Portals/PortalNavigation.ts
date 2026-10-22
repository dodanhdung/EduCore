import { tenantPath } from '../../routes.ts'

export function portalPath(tenantId: string, id: string, recordId?: string) {
  const encoded = recordId ? encodeURIComponent(recordId) : ''
  const suffix: Record<string, string> = {
    SC06: '/my/schedule', SC05: `/schedule/sessions/${encoded}`, AT01: '/attendance', AT02: `/sessions/${encoded}/attendance`,
    AT03: '/leave-requests/new', AS01: '/teaching/assignments', AS03: `/teaching/assignments/${encoded}`,
    AS04: '/teaching/grading', AS06: '/my/assignments', AS07: `/my/assignments/${encoded}`,
    GL01: '/notifications', PO04: `/parent/children/${encoded}`, PO05: '/my/billing', BL07: `/finance/invoices/${encoded}`,
  }
  return tenantPath(tenantId, suffix[id] ?? '')
}

export function portalPreviewPath(id: string, recordId?: string) {
  const key: Record<string, string> = { SC05: 'sessionId', AT02: 'sessionId', AS03: 'assignmentId', AS07: 'assignmentId', PO04: 'studentId', PO05: 'studentId', BL07: 'invoiceId' }
  return `/__ui-preview/${id}${recordId && key[id] ? `?${key[id]}=${encodeURIComponent(recordId)}${id === 'BL07' ? '&role=parent' : ''}` : ''}`
}
