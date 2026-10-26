import { useEffect, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { tenantPath } from '../../routes.ts'
import type { PortalData, PortalSession } from './PortalTypes.ts'
import { PortalState } from './PortalPrimitives.tsx'
import { TeacherHomeScreen } from './PO01/TeacherHomeScreen.tsx'
import { StudentHomeScreen } from './PO02/StudentHomeScreen.tsx'
import { ParentHomeScreen } from './PO03/ParentHomeScreen.tsx'
import { ChildLearningScreen } from './PO04/ChildLearningScreen.tsx'
import { MyBillingScreen, type LiveBilling } from './PO05/MyBillingScreen.tsx'
import { portalPath } from './PortalNavigation.ts'

type Id = 'PO01' | 'PO02' | 'PO03' | 'PO04' | 'PO05'
type Person = { id: string; name: string }
type Context = { tenantId: string; tenantName: string; timeZone: string; asOf: string;
  teacher: Person | null; student: Person | null; children: Person[] }
type Page<T> = { items: T[]; total: number; asOf: string; timeZone?: string; timezone?: string }
type Session = { id: string; classId: string; className: string; teacherId: string; roomId: string | null;
  deliveryMode: string; startsAt: string; endsAt: string; status: string }
type Due = { id: string; finalized: boolean }
type Teaching = { id: string; title: string; description: string; class_id: string | null;
  created_by_teacher_id: string; deadline_at: string; priority: number; status: string }
type Queue = { submissionId: string; assignmentId: string; studentId: string; gradeStatus: string | null;
  versionNo: number; submittedAt: string }
type Mine = { id: string; title: string; description: string; className: string | null; deadlineAt: string;
  priority: number; status: string; submissionId: string | null; versionNo: number | null;
  score: string | null; feedback: string | null; submittedAt: string | null }
type Child = { id: string; name: string; timeZone: string; asOf: string;
  scheduleAvailable: boolean; assignmentsAvailable: boolean; gradesAvailable: boolean; leaveAvailable: boolean;
  classes: { id: string; name: string }[];
  sessions: { id: string; startsAt: string; className: string; status: string }[];
  assignments: { id: string; title: string; deadlineAt: string; className: string | null; score: string | null }[];
  leaves: { id: string; status: string; submittedAt: string; sessionId: string }[] | null }
type Notice = { id: string; title: string; body: string; createdAt: string }
type Payload = { key: string; context: Context; data: PortalData; billing?: LiveBilling | null; truncated?: boolean }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')

function emptyData(context: Context, viewerId: string): PortalData {
  return { scope: { viewerId, tenantId: context.tenantId }, sampleNow: context.asOf, timeZone: context.timeZone,
    teacherId: '', teacherName: '', studentId: '', studentName: '', sessions: [],
    assignments: { assignments: [], submissions: [] },
    links: context.children.map(child => ({ studentId: child.id, name: child.name, status: 'VERIFIED' })),
    activeClasses: {}, leaveRequests: [], notices: [], invoices: [], wallets: [] }
}

function sessionRows(rows: Session[], studentId: string, due: Due[] = []): PortalSession[] {
  const dueById = new Map(due.map(row => [row.id, row.finalized]))
  return rows.filter(row => row.status === 'CONFIRMED' || row.status === 'CANCELLED').map(row => ({
    id: row.id, classId: row.classId, className: row.className, teacherId: row.teacherId,
    studentIds: studentId ? [studentId] : [], startsAt: row.startsAt, endsAt: row.endsAt,
    room: row.roomId ?? (row.deliveryMode === 'ONLINE' ? 'Trực tuyến' : '—'),
    status: row.status as 'CONFIRMED' | 'CANCELLED',
    attendance: dueById.has(row.id) ? dueById.get(row.id) ? 'CONFIRMED' : 'PENDING' : 'NOT_DUE',
  }))
}

function childData(context: Context, child: Child, viewerId: string) {
  const data = emptyData(context, viewerId)
  data.availability = { schedule: child.scheduleAvailable, assignments: child.assignmentsAvailable,
    grades: child.gradesAvailable,
    leave: child.leaveAvailable }
  data.activeClasses[child.id] = child.classes
  data.sessions = child.sessions.map(row => ({ id: row.id, classId: '', className: row.className,
    teacherId: '', studentIds: [child.id], startsAt: row.startsAt, endsAt: row.startsAt,
    room: '', status: 'CONFIRMED', attendance: 'NOT_DUE' }))
  data.assignments.assignments = child.assignments.map(row => ({ id: row.id, title: row.title,
    description: '', classId: '', className: row.className ?? '', teacherId: '', teacherName: '',
    recipientIds: [child.id], deadline: row.deadlineAt, priority: 1, status: 'PUBLISHED' }))
  data.assignments.submissions = child.assignments.filter(row => row.score !== null).map(row => ({
    id: row.id, assignmentId: row.id, studentId: child.id, studentName: child.name, versions: [],
    grade: { status: 'PUBLISHED', score: Number(row.score), feedback: '' },
  }))
  data.leaveRequests = (child.leaves ?? []).map(row => ({ id: row.id, studentId: child.id, status: row.status, sessionId: row.sessionId }))
  return data
}

export function PortalProduction({ id, tenantId, token, viewerId, selectedId, initialChildId, onChooseChild, allowed, navigate }: {
  id: Id; tenantId: string; token: string; viewerId: string; selectedId?: string; initialChildId?: string;
  onChooseChild?: (studentId: string) => void;
  allowed: readonly string[]; navigate: (path: string) => void
}) {
  const [childId, setChildId] = useState<string | undefined>(initialChildId)
  const [payload, setPayload] = useState<Payload | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [loading, setLoading] = useState(true)
  const chosen = id === 'PO04' ? selectedId : childId
  const key = `${tenantId}:${token}:${viewerId}:${id}:${chosen ?? ''}`
  const path = (screen: string, recordId?: string) => allowed.includes(screen) ? portalPath(tenantId, screen, recordId) : ''
  const read = <T,>(suffix: string, signal: AbortSignal) => api.request<T>(
    `/api/v1/tenants/${encodeURIComponent(tenantId)}${suffix}`,
    { accessToken: token, signal, cache: 'no-store' })

  useEffect(() => {
    const abort = new AbortController()
    setLoading(true); setPayload(null); setError(null)
    void (async () => {
      try {
        const context = await read<Context>('/portal/context', abort.signal)
        if (context.tenantId !== tenantId) throw new ApiError(502, 'INVALID_CONTEXT')
        const data = emptyData(context, viewerId)
        let billing: LiveBilling | null | undefined
        let truncated = false
        if (id === 'PO01') {
          if (!context.teacher) throw new ApiError(403, 'TEACHER_NOT_ACTIVE')
          data.teacherId = context.teacher.id; data.teacherName = context.teacher.name
          const from = new Date(Date.now() - 86400_000).toISOString()
          const to = new Date(Date.now() + 29 * 86400_000).toISOString()
          const range = `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&pageSize=100`
          const [calendar, attendance, assignments, classes, grading] = await Promise.all([
            read<Page<Session>>('/portal/teacher-sessions', abort.signal),
            read<Page<Due>>(`/attendance/due${range}`, abort.signal),
            read<Teaching[]>('/teaching/assignments', abort.signal),
            read<{ classes: { id: string; name: string }[] }>('/teaching/assignment-classes', abort.signal),
            read<Page<Queue>>('/grading/queue', abort.signal),
          ])
          truncated = calendar.total > 100 || attendance.total > 100 || grading.total > grading.items.length
          const names = new Map(classes.classes.map(row => [row.id, row.name]))
          data.sessions = sessionRows(calendar.items.filter(row => row.teacherId === context.teacher!.id), '', attendance.items)
          data.assignments.assignments = assignments.filter(row => row.created_by_teacher_id === context.teacher!.id)
            .map(row => ({ id: row.id, title: row.title, description: row.description, classId: row.class_id ?? '',
              className: names.get(row.class_id ?? '') ?? '', teacherId: context.teacher!.id, teacherName: context.teacher!.name,
              recipientIds: [], deadline: row.deadline_at, priority: row.priority,
              status: row.status === 'ARCHIVED' ? 'CLOSED' as const : row.status as 'DRAFT' | 'PUBLISHED' }))
          data.assignments.submissions = grading.items.filter(row => row.studentId && row.gradeStatus !== 'PUBLISHED').map(row => ({
            id: row.submissionId, assignmentId: row.assignmentId, studentId: row.studentId,
            studentName: '', versions: [{ number: row.versionNo, submittedAt: row.submittedAt, late: false, files: [] }],
          }))
        } else if (id === 'PO02') {
          if (!context.student) throw new ApiError(403, 'STUDENT_NOT_ACTIVE')
          data.studentId = context.student.id; data.studentName = context.student.name
          const [calendar, mine, inbox] = await Promise.all([
            read<Page<Session>>('/portal/student-sessions', abort.signal),
            read<{ items: Mine[] }>('/my/assignments', abort.signal),
            read<Page<Notice>>('/notifications?pageSize=20', abort.signal),
          ])
          truncated = calendar.total > 100
          data.sessions = sessionRows(calendar.items, context.student.id)
          data.assignments.assignments = mine.items.map(row => ({ id: row.id, title: row.title,
            description: row.description, classId: '', className: row.className ?? '', teacherId: '', teacherName: '',
            recipientIds: [context.student!.id], deadline: row.deadlineAt, priority: row.priority,
            status: row.status === 'ARCHIVED' ? 'CLOSED' as const : 'PUBLISHED' as const }))
          data.assignments.submissions = mine.items.filter(row => row.submissionId).map(row => ({
            id: row.submissionId!, assignmentId: row.id, studentId: context.student!.id,
            studentName: context.student!.name, versions: row.versionNo ? [{ number: row.versionNo,
              submittedAt: row.submittedAt ?? '', late: false, files: [] }] : [],
            grade: row.score === null ? undefined : { status: 'PUBLISHED', score: Number(row.score), feedback: row.feedback ?? '' },
          }))
          data.notices = inbox.items.map(row => ({ id: row.id, recipientId: context.student!.id,
            text: `${row.title}: ${row.body}`, occurredAt: row.createdAt }))
        } else {
          const current = chosen ?? context.children[0]?.id ?? (id === 'PO05' ? context.student?.id : undefined)
          if (current && (id === 'PO03' || id === 'PO04')) {
            const child = await read<Child>(`/portal/children/${encodeURIComponent(current)}`, abort.signal)
            Object.assign(data, childData(context, child, viewerId))
          }
          if (current && (id === 'PO03' || id === 'PO05')) {
            billing = await read<LiveBilling>(`/portal/billing/${encodeURIComponent(current)}`, abort.signal)
          }
        }
        if (!abort.signal.aborted) { setPayload({ key, context, data, billing, truncated }); setLoading(false) }
      } catch (cause) { if (!abort.signal.aborted) { setError(cause); setLoading(false) } }
    })()
    return () => abort.abort()
  }, [key])

  const current = payload?.key === key ? payload : null
  if (loading || !current && !error) return <PortalState title="Đang tải dữ liệu">Đang kiểm tra quyền và phạm vi hiện hành.</PortalState>
  if (error) return <PortalState title={error instanceof ApiError && error.status === 403 ? 'Không có quyền xem' : 'Không thể tải dữ liệu'}>{safeErrorMessage(error)}</PortalState>
  if (!current) return <PortalState title="Dữ liệu không khả dụng">Vui lòng tải lại trang.</PortalState>
  const { context, data, billing } = current
  const chosenId = chosen ?? context.children[0]?.id ?? context.student?.id
  const changeChild = (next: string) => { setPayload(null); setChildId(next); onChooseChild?.(next) }
  const debt = billing?.totals?.outstandingVnd ?? null
  const notice = current.truncated && <p role="status" className="portal-notice">Danh sách đang giới hạn ở các mục đầu tiên. Mở trang nguồn để xem thêm.</p>
  if (id === 'PO01') return <>{notice}<TeacherHomeScreen data={data} teacherId={context.teacher?.id} navigate={navigate} path={path} production /></>
  if (id === 'PO02') return <>{notice}<StudentHomeScreen data={data} studentId={context.student?.id} navigate={navigate} path={path} /></>
  if (id === 'PO03') return context.children.length ? <ParentHomeScreen data={data} viewerId={viewerId} tenantId={tenantId}
    initialChildId={chosenId} onSelectChild={changeChild} billingAvailable={billing?.status === 'PARTIAL'} debtVnd={debt}
    production navigate={navigate} path={path} onOpenBilling={allowed.includes('PO05') && billing?.status === 'PARTIAL'
      ? studentId => { onChooseChild?.(studentId); navigate(tenantPath(tenantId, '/my/billing')) } : undefined} />
    : <PortalState title="Chưa có liên kết đã xác minh">Không có học sinh được phép xem trong trung tâm này.</PortalState>
  if (id === 'PO04') return <ChildLearningScreen data={data} studentId={selectedId} navigate={navigate} path={path} />
  return <MyBillingScreen mode="unresolved" live={{ context, billing: billing ?? null, selectedId: chosenId,
    onSelectChild: changeChild }} tenantId={tenantId} />
}
