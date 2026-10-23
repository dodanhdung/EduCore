import { ManagerDashboardScreen } from './G01/ManagerDashboardScreen.tsx'
import { MembersScreen } from './OP01/MembersScreen.tsx'
import { MemberDetailScreen } from './OP02/MemberDetailScreen.tsx'
import { RelationshipsScreen } from './OP03/RelationshipsScreen.tsx'
import { ApprovalsScreen } from './OP04/ApprovalsScreen.tsx'
import { ApprovalDetailScreen } from './OP05/ApprovalDetailScreen.tsx'
import { AuditScreen } from './OP06/AuditScreen.tsx'
import { JobsScreen } from './OP07/JobsScreen.tsx'
import { StateMessage } from './ManagementPrimitives.tsx'
import type { ManagementData, ManagementId, ViewState } from './ManagementTypes.ts'
import './management.css'

const components = { G01: ManagerDashboardScreen, OP01: MembersScreen, OP02: MemberDetailScreen, OP03: RelationshipsScreen, OP04: ApprovalsScreen, OP05: ApprovalDetailScreen, OP06: AuditScreen, OP07: JobsScreen }

// No production data provider until auth/me supplies server-authoritative grant evidence.
// Preview fixtures are supplied solely by the DEV entry, never imported here.
export function ManagementScreen({ id, tenantId, data, preview = false, state = 'ready', selectedId, canReview = false, open }: {
  id: ManagementId; tenantId: string; data?: ManagementData; preview?: boolean; state?: ViewState; selectedId?: string; canReview?: boolean; open?: (screen: string, recordId?: string) => void
}) {
  if (!preview || !data) return <div className="management"><StateMessage state="pending" /></div>
  if (data.tenantId !== tenantId) return <div className="management"><StateMessage state="forbidden" /></div>
  if (state !== 'ready' && state !== 'empty') return <div className="management"><StateMessage state={state} /></div>
  // Defense in depth for fixture injection. Real scope checks remain server-side.
  const scoped = { ...data, members: data.members.filter((r) => r.tenantId === tenantId), relationships: data.relationships.filter((r) => r.tenantId === tenantId), approvals: data.approvals.filter((r) => r.tenantId === tenantId), audit: data.audit.filter((r) => r.tenantId === tenantId), jobs: data.jobs.filter((r) => r.tenantId === tenantId) }
  const Component = components[id]
  return <div className="management" data-screen-id={id}><Component key={`${tenantId}:${id}:${selectedId ?? ''}:${canReview}`} data={scoped} selectedId={selectedId} canReview={canReview} open={open} /></div>
}
