import { useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import { Card, Header } from './AcademicMorePrimitives.tsx'
import type { AcademicId, Assignment, Capabilities, ClassDetail, ClassRow, Course, Enrollment, Level, Page, Person, Student, Subject, Teacher } from './AcademicApi.ts'
import { AcademicAdmission } from './AcademicAdmission.tsx'
import { AcademicTeacherAssignment } from './AcademicTeacherAssignment.tsx'
import { StudentListView, TeacherListView } from './AcademicPersonListView.tsx'
import { StudentDetailView, TeacherDetailView } from './AcademicPersonDetailView.tsx'
import { fromPersonPage, fromStudentDetail, fromTeacherDetail } from './AcademicPersonViewModel.ts'
import { AcademicCatalogProduction } from './AcademicCatalogProduction.tsx'
import './AcademicScreens.css'

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
const paths: Record<AcademicId, string> = {
  AC01: 'students', AC02: 'students', AC03: 'teachers', AC04: 'teachers',
  AC05: 'subjects', AC06: 'courses', AC07: 'classes', AC08: 'classes',
}
const titles: Record<AcademicId, string> = {
  AC01: 'Danh sách học sinh', AC02: 'Chi tiết học sinh', AC03: 'Danh sách giáo viên',
  AC04: 'Chi tiết giáo viên', AC05: 'Môn học và trình độ', AC06: 'Khóa học',
  AC07: 'Danh sách lớp', AC08: 'Chi tiết lớp',
}
const emptyCapabilities: Capabilities = {
  studentCreate: false, studentUpdate: false, teacherCreate: false, teacherUpdate: false,
  catalogManage: false, courseUpdate: false, classCreate: false, classUpdate: false,
  teacherAssign: false, enroll: false, transferRequest: false, tenantTimezone: '',
}
type Loaded = { main: Page<Person | Course | ClassRow | Subject | Level> | Student | Teacher | ClassDetail;
  subjects?: Page<Subject>; levels?: Page<Level>; courses?: Page<Course> }
type Phase = 'loading' | 'ready' | 'unauthenticated' | 'forbidden' | 'not-found' | 'error'
type FormKind = 'student' | 'teacher' | 'subject' | 'level' | 'course' | 'class'
type Form = { kind: FormKind; target?: string; values: Record<string, string> }
const fieldNames: Record<string, string> = {
  code: 'Mã', name: 'Tên', dateOfBirth: 'Ngày sinh', contact: 'Liên hệ', active: 'Trạng thái',
  sortOrder: 'Thứ tự', subjectId: 'Môn học', levelId: 'Trình độ',
  description: 'Mô tả', courseId: 'Khóa học', capacity: 'Sĩ số',
  startDate: 'Ngày bắt đầu', endDate: 'Ngày kết thúc', reason: 'Lý do',
}

function phaseFor(error: unknown): Phase {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'unauthenticated'
    if (error.status === 403) return 'forbidden'
    if (error.status === 404) return 'not-found'
  }
  return 'error'
}
function date(value: string | null | undefined) { return value ? value.slice(0, 10) : '—' }
function path(tenant: string, suffix: string) { return `/app/${encodeURIComponent(tenant)}/${suffix}` }

type AcademicProductionProps = { id: AcademicId; tenantId: string; token: string; selectedId?: string;
  navigate: (next: string) => void; allowed?: readonly string[] }

export function AcademicProduction(props: AcademicProductionProps) {
  if (props.id === 'AC05' || props.id === 'AC06' || props.id === 'AC07' || props.id === 'AC08')
    return <AcademicCatalogProduction key={[props.tenantId, props.token, props.id, props.selectedId].join('\u0000')} {...props} id={props.id} />
  return <AcademicScope key={[props.tenantId, props.token, props.id, props.selectedId].join('\u0000')} {...props} />
}

function AcademicScope({ id, tenantId, token, selectedId, navigate, allowed }: AcademicProductionProps) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [loadedScope, setLoadedScope] = useState('')
  const [data, setData] = useState<Loaded | null>(null)
  const [capabilities, setCapabilities] = useState<Capabilities>(emptyCapabilities)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [catalogTab, setCatalogTab] = useState<'subjects' | 'levels'>('subjects')
  const requestScope = JSON.stringify([id, tenantId, token, selectedId, query, page, revision])
  const formOpen = Boolean(form)
  const formTrigger = useRef<HTMLElement | null>(null)
  const profileDialog = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (formOpen && (id === 'AC01' || id === 'AC02' || id === 'AC03' || id === 'AC04')) {
      profileDialog.current?.querySelector<HTMLElement>('input, select, button')?.focus()
    }
  }, [formOpen, id])

  function closeForm() {
    setForm(null)
    queueMicrotask(() => { if (formTrigger.current?.isConnected) formTrigger.current.focus() })
  }

  function dialogKeys(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') { event.preventDefault(); if (!busy) closeForm(); return }
    if (event.key !== 'Tab') return
    const items = [...(profileDialog.current?.querySelectorAll<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled), [href]') ?? [])]
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  useEffect(() => {
    const abort = new AbortController()
    const request = <T,>(suffix: string) => api.academic<T>(tenantId, suffix, token, { signal: abort.signal })
    const paging = `?page=${page}&q=${encodeURIComponent(query)}`
    queueMicrotask(() => { if (!abort.signal.aborted) setPhase('loading') })
    void (async () => {
      try {
        if ((id === 'AC02' || id === 'AC04' || id === 'AC08') && !selectedId) { setLoadedScope(requestScope); setPhase('not-found'); return }
        let next: Loaded
        if (id === 'AC05') {
          const [subjects, levels] = await Promise.all([
            request<Page<Subject>>(`/subjects${paging}`), request<Page<Level>>(`/levels${paging}`),
          ])
          next = { main: subjects, subjects, levels }
        } else if (id === 'AC06') {
          const [main, subjects, levels] = await Promise.all([
            request<Page<Course>>(`/courses${paging}`),
            request<Page<Subject>>('/subjects?pageSize=100'),
            request<Page<Level>>('/levels?pageSize=100'),
          ])
          next = { main, subjects, levels }
        } else if (id === 'AC07') {
          const main = await request<Page<ClassRow>>(`/classes${paging}`)
          // class.read alone is enough for AC07. Catalog choices are optional.
          const courses = await request<Page<Course>>('/courses?pageSize=100').catch(() => undefined)
          next = { main, courses }
        } else if (id === 'AC02' || id === 'AC04' || id === 'AC08') {
          next = { main: await request<Student | Teacher | ClassDetail>(`/${paths[id]}/${encodeURIComponent(selectedId!)}`) }
        } else {
          next = { main: await request<Page<Person>>(`/${paths[id]}${paging}`) }
        }
        const scope = new URLSearchParams()
        if (id === 'AC02') scope.set('studentId', selectedId!)
        if (id === 'AC08') scope.set('classId', selectedId!)
        const caps = await request<Capabilities>(`/permissions/capabilities/current?${scope}`)
        if (!abort.signal.aborted) { setData(next); setCapabilities(caps); setLoadedScope(requestScope); setPhase('ready') }
      } catch (error) {
        if (!abort.signal.aborted) { setData(null); setCapabilities(emptyCapabilities); setLoadedScope(requestScope); setPhase(phaseFor(error)) }
      }
    })()
    return () => abort.abort()
  }, [id, tenantId, token, selectedId, query, page, revision, requestScope])

  function open(kind: FormKind, item?: Record<string, unknown>) {
    const values: Record<string, string> = {}
    for (const key of ['code', 'name', 'dateOfBirth', 'contact', 'sortOrder', 'active', 'subjectId',
      'levelId', 'description', 'courseId', 'capacity', 'startDate', 'endDate']) {
      const value = item?.[key]
      values[key] = value === null || value === undefined ? '' : String(value).slice(0, key.endsWith('Date') || key === 'dateOfBirth' ? 10 : undefined)
    }
    values.reason = ''
    setMessage(''); setForm({ kind, target: typeof item?.id === 'string' ? item.id : undefined, values })
  }

  async function submit() {
    if (!form || busy) return
    const v = form.values
    if (!v.name?.trim() || !v.reason?.trim() || (!form.target && !v.code?.trim())) {
      setMessage('Nhập tên, mã và lý do hợp lệ.'); return
    }
    const create = !form.target
    const body: Record<string, unknown> = { name: v.name.trim(), reason: v.reason.trim() }
    if (create) body.code = v.code.trim()
    if (form.kind === 'student') body.dateOfBirth = v.dateOfBirth || null
    if (form.kind === 'teacher') body.contact = v.contact || null
    if (form.kind === 'level') body.sortOrder = Number(v.sortOrder)
    if ((form.kind === 'subject' || form.kind === 'level') && !create) body.active = v.active === 'true'
    if (form.kind === 'course') {
      body.description = v.description || null
      if (create) { body.subjectId = v.subjectId; body.levelId = v.levelId }
    }
    if (form.kind === 'class' && create) {
      body.courseId = v.courseId; body.capacity = Number(v.capacity)
      body.startDate = v.startDate || null; body.endDate = v.endDate || null
    }
    const resource = ({ student: 'students', teacher: 'teachers', subject: 'subjects', level: 'levels',
      course: 'courses', class: 'classes' } as const)[form.kind]
    const prefix = form.kind === 'student' || form.kind === 'teacher' ? '/profiles' : '/catalog'
    const suffix = `${prefix}/${resource}${form.target ? `/${encodeURIComponent(form.target)}` : ''}`
    setBusy(true); setMessage('')
    try {
      await api.academic(tenantId, suffix, token, { method: create ? 'POST' : 'PATCH', body })
      closeForm(); setMessage('Đã lưu theo xác nhận của máy chủ.'); setRevision((value) => value + 1)
    } catch (error) { setMessage(safeErrorMessage(error)) }
    finally { setBusy(false) }
  }

  const visiblePhase = loadedScope === requestScope ? phase : 'loading'
  if (visiblePhase !== 'ready' || !data) return <section className="academic-page" data-screen-id={id}>
    <Header title={titles[id]} subtitle="Dữ liệu học vụ" />
    <Card title="Trạng thái"><p role={visiblePhase === 'loading' ? 'status' : 'alert'}>{visiblePhase === 'loading' ? 'Đang tải…'
      : visiblePhase === 'forbidden' ? 'Bạn không có quyền xem dữ liệu này.'
        : visiblePhase === 'not-found' ? 'Không tìm thấy hồ sơ trong phạm vi được cấp.'
          : visiblePhase === 'unauthenticated' ? 'Phiên đăng nhập đã hết hạn.' : 'Không thể tải dữ liệu.'}</p>
      {visiblePhase === 'error' && <button onClick={() => setRevision((value) => value + 1)}>Thử lại</button>}</Card>
  </section>

  const main = data.main
  const listPage = 'items' in main ? main : null
  const displayPage = id === 'AC05' ? catalogTab === 'subjects' ? data.subjects! : data.levels! : listPage
  const person = (id === 'AC02' ? main as Student : id === 'AC04' ? main as Teacher : null)
  const classDetail = id === 'AC08' ? main as ClassDetail : null
  const canCreate = id === 'AC01' ? capabilities.studentCreate : id === 'AC03' ? capabilities.teacherCreate
    : id === 'AC05' ? capabilities.catalogManage : id === 'AC06' ? capabilities.catalogManage
      : id === 'AC07' ? capabilities.classCreate : false
  const canEdit = id === 'AC02' ? capabilities.studentUpdate : id === 'AC04' ? capabilities.teacherUpdate
    : id === 'AC08' ? capabilities.classUpdate : false
  const pageKind = id === 'AC01' || id === 'AC02' ? 'student' : id === 'AC03' || id === 'AC04' ? 'teacher'
    : id === 'AC07' || id === 'AC08' ? 'class' : id === 'AC06' ? 'course' : catalogTab === 'subjects' ? 'subject' : 'level'
  const canGo = (screen: string) => allowed === undefined || allowed.includes(screen)
  const formPanel = form && <div className="academic-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) closeForm() }}>
    <div className="academic-profile-dialog" ref={profileDialog} role="dialog" aria-modal="true" aria-label={form.target ? 'Chỉnh sửa hồ sơ' : 'Tạo hồ sơ'} onKeyDown={dialogKeys}>
    <Card title={form.target ? 'Chỉnh sửa' : 'Tạo mới'}><div className="academic-form">
    {message && <p role="alert" className="academic-error">{message}</p>}
    {formFields(form, data).map(({ key, options }) => <label className="academic-field" key={key}><span>{fieldNames[key]}</span>
      {key === 'active' ? <select value={form.values[key]} onChange={(event) => setForm({ ...form, values: { ...form.values, active: event.target.value } })}>
        <option value="true">Hoạt động</option><option value="false">Đã ẩn</option></select>
        : options ? <select value={form.values[key]} onChange={(event) => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })}>
        <option value="">Chọn</option>{options.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
        : <input type={key.endsWith('Date') || key === 'dateOfBirth' ? 'date' : key === 'capacity' || key === 'sortOrder' ? 'number' : 'text'}
          value={form.values[key]} onChange={(event) => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })} />}</label>)}
    <div className="academic-dialog-actions"><button disabled={busy} onClick={closeForm}>Hủy</button>
      <button className="academic-primary" disabled={busy} onClick={() => { void submit() }}>Lưu</button></div></div></Card></div></div>

  if (id === 'AC01' && listPage) return <section data-screen-id={id}>
    <StudentListView model={fromPersonPage('student', listPage as Page<Person>, query)}
      onQueryChange={(next) => { setQuery(next); setPage(1) }} onPageChange={setPage}
      onCreate={canCreate ? () => { formTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; open('student') } : undefined}
      onOpen={canGo('AC02') ? (recordId) => navigate(path(tenantId, `students/${encodeURIComponent(recordId)}`)) : undefined} />
    {message && !form && <p role="status" className="academic-hint">{message}</p>}{formPanel}</section>
  if (id === 'AC03' && listPage) return <section data-screen-id={id}>
    <TeacherListView model={fromPersonPage('teacher', listPage as Page<Person>, query)}
      onQueryChange={(next) => { setQuery(next); setPage(1) }} onPageChange={setPage}
      onCreate={canCreate ? () => { formTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; open('teacher') } : undefined}
      onOpen={canGo('AC04') ? (recordId) => navigate(path(tenantId, `teachers/${encodeURIComponent(recordId)}`)) : undefined} />
    {message && !form && <p role="status" className="academic-hint">{message}</p>}{formPanel}</section>
  if (id === 'AC02' && person) return <section data-screen-id={id}>
    <StudentDetailView model={fromStudentDetail(person as Student, capabilities.tenantTimezone || 'Asia/Ho_Chi_Minh')}
      onEdit={canEdit ? () => { formTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; open('student', person as Record<string, unknown>) } : undefined}
      onBack={canGo('AC01') ? () => navigate(path(tenantId, 'students')) : undefined}
      onOpenClass={canGo('AC08') ? (classId) => navigate(path(tenantId, `classes/${encodeURIComponent(classId)}`)) : undefined}
      operation={<AcademicAdmission tenantId={tenantId} token={token} studentId={person.id}
        enrollments={(person as Student).enrollments} onChanged={() => setRevision((value) => value + 1)} />} />
    {message && !form && <p role="status" className="academic-hint">{message}</p>}{formPanel}</section>
  if (id === 'AC04' && person) return <section data-screen-id={id}>
    <TeacherDetailView model={fromTeacherDetail(person as Teacher, capabilities.tenantTimezone || 'Asia/Ho_Chi_Minh')}
      onEdit={canEdit ? () => { formTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; open('teacher', person as Record<string, unknown>) } : undefined}
      onBack={canGo('AC03') ? () => navigate(path(tenantId, 'teachers')) : undefined}
      onOpenClass={canGo('AC08') ? (classId) => navigate(path(tenantId, `classes/${encodeURIComponent(classId)}`)) : undefined}
      operation={<AcademicTeacherAssignment tenantId={tenantId} token={token} teacherId={person.id}
        onChanged={() => setRevision((value) => value + 1)} />} />
    {message && !form && <p role="status" className="academic-hint">{message}</p>}{formPanel}</section>
  return <section className="academic-page" data-screen-id={id}>
    <Header title={titles[id]} subtitle="Dữ liệu hiện hành trong phạm vi được cấp"
      action={canCreate ? 'Tạo mới' : canEdit ? 'Chỉnh sửa' : undefined}
      onAction={() => open(pageKind, canEdit ? main as Record<string, unknown> : undefined)} />
    {message && <p role="status" className="academic-hint">{message}</p>}
    {listPage && <Card title="Tìm kiếm"><label className="academic-field"><span>Mã hoặc tên</span>
      <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /></label></Card>}
    {id === 'AC05' && <nav aria-label="Loại danh mục" className="academic-tabs">
      <button aria-current={catalogTab === 'subjects' ? 'page' : undefined} onClick={() => setCatalogTab('subjects')}>Môn học</button>
      <button aria-current={catalogTab === 'levels' ? 'page' : undefined} onClick={() => setCatalogTab('levels')}>Trình độ</button></nav>}
    {displayPage && <Card title="Danh sách">{renderList(id, displayPage,
      tenantId, navigate, (kind, row) => open(kind, row), capabilities)}
      {displayPage.total > displayPage.pageSize && <div className="academic-pagination"><span>Trang {page} · {displayPage.total} bản ghi</span>
        <div><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Trước</button>
          <button disabled={page * displayPage.pageSize >= displayPage.total} onClick={() => setPage(page + 1)}>Sau</button></div></div>}</Card>}
    {person && <Card title="Hồ sơ"><div className="academic-fields"><p>Mã: {person.code}</p><p>Tên: {person.name}</p>
      <p>Trạng thái: {person.status}</p><p>{id === 'AC02' ? `Ngày sinh: ${date((person as Student).dateOfBirth)}`
        : `Liên hệ: ${(person as Teacher).contact ?? '—'}`}</p></div></Card>}
    {id === 'AC02' && person && <Card title="Ghi danh"><EnrollmentTable items={(person as Student).enrollments}
      tenantId={tenantId} navigate={navigate} /><AcademicAdmission tenantId={tenantId} token={token}
        studentId={person.id} enrollments={(person as Student).enrollments} onChanged={() => setRevision((value) => value + 1)} /></Card>}
    {id === 'AC04' && person && <Card title="Phân công lớp"><AssignmentTable items={(person as Teacher).assignments}
      tenantId={tenantId} navigate={navigate} /><AcademicTeacherAssignment tenantId={tenantId} token={token}
        teacherId={person.id} onChanged={() => setRevision((value) => value + 1)} /></Card>}
    {classDetail && <><Card title="Thông tin lớp"><p>{classDetail.code} · {classDetail.name}</p>
      <p>Khóa học: {classDetail.courseName}</p><p>Sĩ số tối đa: {classDetail.capacity}</p>
      <p>Trạng thái: {classDetail.status}</p><p>Thời gian: {date(classDetail.startDate)} – {date(classDetail.endDate)}</p></Card>
      <Card title="Học sinh ghi danh">{classDetail.enrollments === undefined
        ? <p role="status">Bạn không có quyền xem danh sách ghi danh.</p>
        : <EnrollmentTable items={classDetail.enrollments} tenantId={tenantId} navigate={navigate} />}</Card>
      <Card title="Giáo viên">{classDetail.teacherAssignments === undefined
        ? <p role="status">Bạn không có quyền xem phân công giáo viên.</p>
        : <AssignmentTable items={classDetail.teacherAssignments} tenantId={tenantId} navigate={navigate} />}
        <AcademicTeacherAssignment tenantId={tenantId} token={token} classId={classDetail.id}
          onChanged={() => setRevision((value) => value + 1)} /></Card>
      <Card title="Ghi danh và chuyển lớp"><AcademicAdmission tenantId={tenantId} token={token}
        classId={classDetail.id} enrollments={classDetail.enrollments ?? []} onChanged={() => setRevision((value) => value + 1)} /></Card></>}
    {form && <Card title={form.target ? 'Chỉnh sửa' : 'Tạo mới'}><div className="academic-form">
      {formFields(form, data).map(({ key, options }) => <label className="academic-field" key={key}><span>{fieldNames[key]}</span>
        {key === 'active' ? <select value={form.values[key]} onChange={(event) => setForm({ ...form, values: { ...form.values, active: event.target.value } })}>
          <option value="true">Hoạt động</option><option value="false">Đã ẩn</option></select>
          : options ? <select value={form.values[key]} onChange={(event) => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })}>
          <option value="">Chọn</option>{options.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select>
          : <input type={key.endsWith('Date') || key === 'dateOfBirth' ? 'date' : key === 'capacity' || key === 'sortOrder' ? 'number' : 'text'}
            value={form.values[key]} onChange={(event) => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })} />}</label>)}
      <div className="academic-dialog-actions"><button disabled={busy} onClick={() => setForm(null)}>Hủy</button>
        <button className="academic-primary" disabled={busy} onClick={() => { void submit() }}>Lưu</button></div></div></Card>}
  </section>
}

function formFields(form: Form, data: Loaded): { key: string; options?: { id: string; code: string; name: string }[] }[] {
  const create = !form.target
  const fields = create ? ['code', 'name'] : ['name']
  if (form.kind === 'student') fields.push('dateOfBirth')
  if (form.kind === 'teacher') fields.push('contact')
  if (form.kind === 'level') fields.push('sortOrder')
  if ((form.kind === 'subject' || form.kind === 'level') && !create) fields.push('active')
  if (form.kind === 'course') { if (create) fields.push('subjectId', 'levelId'); fields.push('description') }
  if (form.kind === 'class' && create) fields.push('courseId', 'capacity', 'startDate', 'endDate')
  fields.push('reason')
  return fields.map((key) => ({ key,
    options: key === 'subjectId' ? data.subjects?.items.filter((item) => item.active)
      : key === 'levelId' ? data.levels?.items.filter((item) => item.active)
        : key === 'courseId' ? data.courses?.items.filter((item) => item.status === 'ACTIVE') : undefined }))
}

function renderList(id: AcademicId, page: Page<unknown>, tenantId: string, navigate: (next: string) => void,
  edit: (kind: FormKind, row: Record<string, unknown>) => void, capabilities: Capabilities) {
  if (!page.items.length) return <p role="status" className="academic-empty">Không có bản ghi phù hợp.</p>
  return <div className="academic-table-scroll"><table className="academic-table"><thead><tr>
    <th>Mã</th><th>Tên</th><th>Trạng thái</th><th>Thông tin</th><th>Thao tác</th>
  </tr></thead><tbody>{page.items.map((raw) => {
    const item = raw as Record<string, unknown>
    const code = String(item.code), name = String(item.name), recordId = String(item.id)
    const kind: FormKind = id === 'AC01' ? 'student' : id === 'AC03' ? 'teacher' : id === 'AC05'
      ? 'active' in item && 'sortOrder' in item ? 'level' : 'subject' : id === 'AC06' ? 'course' : 'class'
    const editable = id === 'AC05' ? capabilities.catalogManage : id === 'AC06' ? capabilities.courseUpdate
      : id === 'AC07' ? capabilities.classUpdate : false
    const more = id === 'AC06' ? `${String(item.subjectName)} · ${String(item.levelName)}`
      : id === 'AC07' ? `${String(item.courseName)} · ${String(item.enrollmentCount)}/${String(item.capacity)}`
        : id === 'AC05' && 'sortOrder' in item ? `Thứ tự ${String(item.sortOrder)}` : '—'
    const destination = id === 'AC01' ? `students/${recordId}` : id === 'AC03' ? `teachers/${recordId}`
      : id === 'AC07' ? `classes/${recordId}` : null
    return <tr key={recordId}><th scope="row">{code}</th><td>{name}</td>
      <td>{'active' in item ? item.active ? 'Hoạt động' : 'Đã ẩn' : String(item.status)}</td><td>{more}</td>
      <td>{destination && <button className="academic-link" onClick={() => navigate(path(tenantId, destination))}>Xem</button>}
        {editable && <button className="academic-link" onClick={() => edit(kind, item)}>Sửa</button>}</td></tr>
  })}</tbody></table></div>
}

function EnrollmentTable({ items, tenantId, navigate }: { items: Enrollment[]; tenantId: string;
  navigate: (next: string) => void }) {
  if (!items.length) return <p role="status" className="academic-empty">Chưa có ghi danh.</p>
  return <div className="academic-table-scroll"><table className="academic-table"><thead><tr>
    <th>Học sinh / lớp</th><th>Trạng thái</th><th>Hiệu lực</th><th>Thao tác</th>
  </tr></thead><tbody>{items.map((item) => <tr key={item.id}>
    <td>{item.studentName ?? item.className ?? item.studentCode ?? item.classCode ?? item.id}</td>
    <td>{item.status}</td><td>{date(item.effectiveFrom)} – {date(item.effectiveTo)}</td>
    <td>{item.studentId && <button className="academic-link" onClick={() => navigate(path(tenantId, `students/${item.studentId}`))}>Học sinh</button>}
      {item.classId && <button className="academic-link" onClick={() => navigate(path(tenantId, `classes/${item.classId}`))}>Lớp</button>}</td>
  </tr>)}</tbody></table></div>
}

function AssignmentTable({ items, tenantId, navigate }: { items: Assignment[]; tenantId: string;
  navigate: (next: string) => void }) {
  if (!items.length) return <p role="status" className="academic-empty">Chưa có phân công.</p>
  return <div className="academic-table-scroll"><table className="academic-table"><thead><tr>
    <th>Giáo viên / lớp</th><th>Hiệu lực</th><th>Thao tác</th>
  </tr></thead><tbody>{items.map((item) => <tr key={item.id}>
    <td>{item.teacherName ?? item.className ?? item.teacherCode ?? item.classCode ?? item.id}</td>
    <td>{date(item.validFrom)} – {date(item.validTo)}</td>
    <td>{item.teacherId && <button className="academic-link" onClick={() => navigate(path(tenantId, `teachers/${item.teacherId}`))}>Giáo viên</button>}
      {item.classId && <button className="academic-link" onClick={() => navigate(path(tenantId, `classes/${item.classId}`))}>Lớp</button>}</td>
  </tr>)}</tbody></table></div>
}
