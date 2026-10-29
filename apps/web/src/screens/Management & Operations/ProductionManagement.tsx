import { useCallback, useEffect, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import type { Session } from '../../auth.ts'
import { ConfirmDialog } from '../Authentication & Shared/BatchPrimitives.tsx'
import { Badge, Card, Empty, Heading, StateMessage, Table } from './ManagementPrimitives.tsx'
import type { ManagementId, ViewState } from './ManagementTypes.ts'
import { MembersView } from './OP01/MembersView.tsx'
import { fromMemberPage } from './OP01/MembersViewModel.ts'

type Scope = 'TENANT' | 'CLASS' | 'STUDENT'
type Assignment = { id: string; roleId: string; roleCode: string; scopeKind: Scope; classId: string | null; studentId: string | null; assignedAt: string }
type Member = { id: string; userId: string; email: string; displayName: string; status: string; accountStatus: string; assignments: Assignment[] }
type Role = { id: string; code: string; name: string }
type Link = { id: string; parentMembershipId: string; parentName: string; studentId: string; studentName: string; evidenceReference: string | null; verifiedAt: string | null; verifiedByMembershipId: string | null; revokedAt: string | null; status: string }
type Choice = { id: string; name: string; code?: string }
type Page<T> = { items: T[]; page: number; pageSize: number; total: number; asOf: string }
type Action = { path: string; method?: 'POST' | 'PATCH'; body: object; done: string }
const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function errorState(error: unknown): ViewState {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'unauthenticated'
    if (error.status === 403) return 'forbidden'
    if (error.status === 404) return 'not-found'
    if (error.status === 409) return 'conflict'
    if (error.status === 400 || error.status === 422) return 'invalid'
  }
  return 'error'
}

type ProductionProps = {
  id: ManagementId; tenantId: string; selectedId?: string; session: Session; open: (screen: string, recordId?: string) => void
}
export function ProductionManagement(props: ProductionProps) {
  return <ProductionManagementScope key={props.id === 'OP01' ? JSON.stringify([props.tenantId, props.session.accessToken]) : 'legacy'} {...props} />
}
function ProductionManagementScope({ id, tenantId, selectedId, session, open }: ProductionProps) {
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Page<Member> | Page<Link> | Member | null>(null)
  const [state, setState] = useState<ViewState>('loading')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [revision, setRevision] = useState(0)
  const [roles, setRoles] = useState<Role[]>([])
  const [parents, setParents] = useState<Choice[]>([])
  const [students, setStudents] = useState<Choice[]>([])
  const [selectorsReady, setSelectorsReady] = useState(false)
  const token = session.accessToken
  const load = useCallback(async (signal: AbortSignal) => {
    if (signal.aborted) return
    const path = id === 'OP01' ? `/members?page=${page}` : id === 'OP02'
      ? `/members/${encodeURIComponent(selectedId ?? '')}` : `/parent-student-links?page=${page}`
    if (id === 'OP02' && (!selectedId || !uuid.test(selectedId))) { setState('not-found'); return }
    setState('loading')
    try {
      const next = await api.management<typeof data>(tenantId, path, token, { signal })
      if (!signal.aborted) { setData(next); setState('ready') }
    } catch (error) { if (!signal.aborted) setState(errorState(error)) }
  }, [id, page, selectedId, tenantId, token])
  useEffect(() => { const abort = new AbortController(); queueMicrotask(() => { void load(abort.signal) }); return () => abort.abort() }, [load, revision])
  useEffect(() => {
    if (id !== 'OP02' && id !== 'OP03') return
    const abort = new AbortController()
    if (id === 'OP02') {
      void api.management<Page<Role>>(tenantId, '/roles', token, { signal: abort.signal })
        .then((value) => { if (!abort.signal.aborted) setRoles(value.items) }).catch(() => setRoles([]))
    } else {
      void Promise.all([
        api.management<Page<Choice>>(tenantId, '/parent-student-links/parents?pageSize=100', token, { signal: abort.signal }),
        api.management<Page<Choice>>(tenantId, '/parent-student-links/students?pageSize=100', token, { signal: abort.signal }),
      ]).then(([p, s]) => { if (!abort.signal.aborted) { setParents(p.items); setStudents(s.items); setSelectorsReady(p.total <= 100 && s.total <= 100) } })
        .catch(() => setSelectorsReady(false))
    }
    return () => abort.abort()
  }, [id, tenantId, token, revision])
  async function submit(action: Action) {
    if (busy) return
    setBusy(true); setMessage('')
    try {
      await api.management(tenantId, action.path, token, { method: action.method ?? 'POST', body: action.body })
      setMessage(action.done); setRevision((n) => n + 1)
      return true
    } catch (error) { setMessage(safeErrorMessage(error)); return false }
    finally { setBusy(false) }
  }
  if (state !== 'ready') return <div className="management"><StateMessage state={state} /></div>
  return <div className="management" data-screen-id={id}>
    {message && <p role="status" className="mo-warning">{message}</p>}
    {id === 'OP01' && <MemberList data={data as Page<Member>} setPage={setPage} busy={busy} submit={submit} message={message}
      open={session.navigation?.screenIds.includes('OP02') ? open : undefined} />}
    {id === 'OP02' && <MemberDetail data={data as Member} roles={roles} busy={busy} submit={submit} open={open} />}
    {id === 'OP03' && <RelationshipList data={data as Page<Link>} page={page} setPage={setPage} parents={parents}
      students={students} selectorsReady={selectorsReady} busy={busy} submit={submit} />}
  </div>
}

function Pager({ page, total, size, setPage }: { page: number; total: number; size: number; setPage: (page: number) => void }) {
  return <div className="mo-actions"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
    <span>Trang {page} · {total} bản ghi</span><button disabled={page * size >= total} onClick={() => setPage(page + 1)}>Sau</button></div>
}

function MemberList({ data, setPage, busy, submit, open, message }: { data: Page<Member>; setPage: (n: number) => void; busy: boolean; submit: (action: Action) => Promise<boolean | undefined>; open?: (screen: string, id?: string) => void; message: string }) {
  const [creating, setCreating] = useState(false), [disabling, setDisabling] = useState<Member | null>(null)
  return <><MembersView model={fromMemberPage(data)} action={<button type="button" onClick={() => setCreating(true)}>Tạo thành viên</button>}
    onOpen={open ? id => open('OP02', id) : undefined}
    onDisable={id => setDisabling(data.items.find(row => row.id === id) ?? null)}
    onPageChange={setPage} />
    {creating && <ConfirmDialog title="Tạo thành viên" detail="Thành viên được tạo trong trung tâm hiện tại và tự kích hoạt qua OTP email." busy={busy} onClose={() => setCreating(false)}>
      <form onSubmit={async e => {
        e.preventDefault(); const f = new FormData(e.currentTarget)
        const email = String(f.get('email') ?? '').trim().toLowerCase(), displayName = String(f.get('displayName') ?? '').trim(), reason = String(f.get('reason') ?? '').trim()
        if (!email || !displayName || !reason) return
        if (await submit({ path: '/members', body: { email, displayName, reason }, done: 'Đã tạo thành viên. Người dùng tự kích hoạt qua AU06.' })) setCreating(false)
      }}><label>Email<input name="email" type="email" autoComplete="off" required disabled={busy} /></label><label>Họ và tên<input name="displayName" required disabled={busy} /></label>
        <label>Lý do tạo thành viên<textarea name="reason" required disabled={busy} /></label>{message && <p role="status">{message}</p>}
        <div className="mo-actions"><button type="button" disabled={busy} onClick={() => setCreating(false)}>Hủy</button><button type="submit" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo thành viên'}</button></div></form>
    </ConfirmDialog>}
    {disabling && <ConfirmDialog title="Xác nhận vô hiệu hóa" detail={`${disabling.displayName} · ${disabling.email}. Thành viên sẽ không thể tiếp tục truy cập trung tâm này.`} busy={busy} onClose={() => setDisabling(null)}>
      <form onSubmit={async e => {
        e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
        if (reason && await submit({ path: `/members/${disabling.id}`, method: 'PATCH', body: { status: 'DISABLED', reason }, done: 'Đã vô hiệu hóa thành viên.' })) setDisabling(null)
      }}><label>Lý do vô hiệu hóa<textarea name="reason" required disabled={busy} /></label>{message && <p role="status">{message}</p>}
        <div className="mo-actions"><button type="button" disabled={busy} onClick={() => setDisabling(null)}>Hủy</button><button type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Xác nhận vô hiệu hóa'}</button></div></form>
    </ConfirmDialog>}
  </>
}

function MemberDetail({ data: member, roles, busy, submit, open }: { data: Member; roles: Role[]; busy: boolean; submit: (action: Action) => Promise<unknown>; open: (screen: string) => void }) {
  const [roleId, setRoleId] = useState(''), [scope, setScope] = useState<Scope>('TENANT'), [scopeId, setScopeId] = useState(''), [reason, setReason] = useState('')
  const assign = () => {
    if (!roleId || !reason.trim() || (scope !== 'TENANT' && !uuid.test(scopeId))) return
    if (!window.confirm('Xác nhận gán role và phạm vi này?')) return
    void submit({ path: `/members/${member.id}/role-assignments`, body: { roleId, scopeKind: scope,
      ...(scope === 'CLASS' ? { classId: scopeId } : scope === 'STUDENT' ? { studentId: scopeId } : {}), reason }, done: 'Đã gán role.' })
  }
  return <><Heading title="Chi tiết thành viên" detail={member.displayName}><button onClick={() => open('OP01')}>Về danh sách</button></Heading>
    <Card title="Tài khoản"><p>{member.email} · Membership {member.id}</p><p>Trạng thái membership: <Badge value={member.status} /> · Tài khoản: <Badge value={member.accountStatus} /></p>
      {member.status !== 'DISABLED' && <form onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
        if (reason && window.confirm('Xác nhận vô hiệu hóa thành viên?')) void submit({ path: `/members/${member.id}`, method: 'PATCH', body: { status: 'DISABLED', reason }, done: 'Đã vô hiệu hóa thành viên.' })
      }}><label>Lý do vô hiệu hóa<textarea name="reason" required /></label><button disabled={busy}>Vô hiệu hóa</button></form>}</Card>
    <Card title="Role hiện hành">{member.assignments.length ? member.assignments.map((a) => <article key={a.id} className="mo-inset"><strong>{a.roleCode}</strong>
      <p>{a.scopeKind} {a.classId ?? a.studentId ?? ''}</p><form onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
        if (reason && window.confirm(`Xác nhận thu hồi ${a.roleCode}?`)) void submit({ path: `/members/${member.id}/role-assignments/${a.id}/revoke`, body: { reason }, done: 'Đã thu hồi role.' })
      }}><label>Lý do thu hồi<textarea name="reason" required /></label><button disabled={busy}>Thu hồi</button></form></article>) : <Empty />}</Card>
    <Card title="Gán role seed"><label>Role<select value={roleId} onChange={(e) => setRoleId(e.target.value)}><option value="">Chọn role</option>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Phạm vi<select value={scope} onChange={(e) => setScope(e.target.value as Scope)}>{['TENANT', 'CLASS', 'STUDENT'].map((s) => <option key={s}>{s}</option>)}</select></label>
      {scope !== 'TENANT' && <label>{scope === 'CLASS' ? 'Class ID' : 'Student ID'}<input value={scopeId} onChange={(e) => setScopeId(e.target.value)} /></label>}
      <label>Lý do<textarea value={reason} onChange={(e) => setReason(e.target.value)} /></label><button disabled={busy || !roles.length} onClick={assign}>Gán role</button>
      <p>Máy chủ kiểm tra role seed, phạm vi, tenant, tự cấp quyền và Manager cuối cùng.</p></Card></>
}

function RelationshipList({ data, page, setPage, parents, students, selectorsReady, busy, submit }: {
  data: Page<Link>; page: number; setPage: (n: number) => void; parents: Choice[]; students: Choice[]; selectorsReady: boolean; busy: boolean; submit: (action: Action) => Promise<unknown>
}) {
  const [query, setQuery] = useState(''), [status, setStatus] = useState('')
  const rows = data.items.filter((l) => (!status || l.status === status) && `${l.parentName} ${l.studentName} ${l.id}`.toLowerCase().includes(query.toLowerCase()))
  return <><Heading title="Liên kết phụ huynh–học sinh" detail="Quan hệ hiện tại trong trung tâm" />
    <Card title="Tạo quan hệ chờ xác minh">{selectorsReady ? <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget)
      const parentMembershipId = String(f.get('parent') ?? ''), studentId = String(f.get('student') ?? ''), evidenceReference = String(f.get('evidence') ?? '').trim(), reason = String(f.get('reason') ?? '').trim()
      if (uuid.test(parentMembershipId) && uuid.test(studentId) && evidenceReference && reason && window.confirm('Tạo quan hệ chờ xác minh?'))
        void submit({ path: '/parent-student-links', body: { parentMembershipId, studentId, evidenceReference, reason }, done: 'Đã tạo quan hệ chờ xác minh.' })
    }}><label>Phụ huynh<select name="parent" required><option value="">Chọn phụ huynh</option>{parents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>Học sinh<select name="student" required><option value="">Chọn học sinh</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.code}</option>)}</select></label>
      <label>Căn cứ xác minh<input name="evidence" required /></label><label>Lý do<textarea name="reason" required /></label><button disabled={busy}>Tạo quan hệ</button></form>
      : <p role="status">Chưa có danh sách chọn an toàn hoặc danh sách vượt giới hạn. Tạo quan hệ đang tắt.</p>}</Card>
    <Card title="Quan hệ"><div className="mo-filters"><label>Tìm kiếm trong trang<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
      <label>Trạng thái<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tất cả</option>{['PENDING_VERIFICATION', 'ACTIVE', 'INACTIVE'].map((s) => <option key={s}>{s}</option>)}</select></label></div>
      {rows.length ? <Table caption="Quan hệ phụ huynh học sinh" columns={['Phụ huynh', 'Học sinh', 'Căn cứ', 'Trạng thái', 'Thao tác']} rows={rows.map((l) => ({ id: l.id, cells: [l.parentName, l.studentName,
        l.evidenceReference ?? '—', <Badge key="status" value={l.status} />, l.status === 'INACTIVE' ? '—' : <form key="action" onSubmit={(e) => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim()
          const operation = l.status === 'ACTIVE' ? 'revoke' : 'verify'
          if (reason && window.confirm(`Xác nhận ${operation} quan hệ này?`)) void submit({ path: `/parent-student-links/${l.id}/${operation}`, body: { reason }, done: operation === 'verify' ? 'Đã xác minh quan hệ.' : 'Đã thu hồi quan hệ.' })
        }}><label>Lý do<textarea name="reason" required /></label><button disabled={busy}>{l.status === 'ACTIVE' ? 'Thu hồi' : 'Xác minh'}</button></form>] }))} /> : <Empty filtered={!!(query || status)} />}
      <Pager page={page} total={data.total} size={data.pageSize} setPage={setPage} /></Card>
    <p>Quan hệ chờ xác minh không mở quyền xem học sinh. Quan hệ đã xác minh không tự tạo ưu đãi anh chị em.</p></>
}
