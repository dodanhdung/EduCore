import type { ManagementData } from '../ManagementTypes.ts'

export type MemberViewRow = {
  id: string; name: string; email: string; status: string; assignments: { role: string; scope: string }[]
}
export type MembersViewModel = {
  rows: MemberViewRow[]; page: number; pageSize: number; total: number;
  pendingTotal: number | null; disabledTotal: number | null; sample: boolean
}
type ProductionPage = { items: { id: string; displayName: string; email: string; status: string;
  assignments: { roleCode: string; scopeKind: string }[] }[]; page: number; pageSize: number; total: number }

/** The member page gives an authoritative total, but no status aggregates. */
export function fromMemberPage(page: ProductionPage): MembersViewModel {
  return { rows: page.items.map(row => ({ id: row.id, name: row.displayName, email: row.email,
    status: row.status, assignments: row.assignments.map(a => ({ role: a.roleCode, scope: a.scopeKind })) })),
  page: page.page, pageSize: page.pageSize, total: page.total, pendingTotal: null, disabledTotal: null, sample: false }
}
export function fromMemberFixture(data: ManagementData, sample = true): MembersViewModel {
  const rows = data.members.filter(row => row.tenantId === data.tenantId).map(row => ({
    id: row.id, name: row.name, email: row.email, status: row.status,
    assignments: row.assignments.filter(a => a.status === 'ACTIVE').map(a => ({ role: a.role, scope: a.scope })),
  }))
  return { rows, page: 1, pageSize: rows.length || 1, total: rows.length,
    pendingTotal: rows.filter(row => row.status === 'PENDING_ACTIVATION').length,
    disabledTotal: rows.filter(row => row.status === 'DISABLED').length, sample }
}
