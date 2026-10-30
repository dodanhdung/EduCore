import { useEffect, useRef, useState } from 'react'
import { ApiClient, ApiError, safeErrorMessage } from '../../api.ts'
import type { AcademicId, Capabilities, ClassDetail, ClassRow, Course, Level, Page, Subject } from './AcademicApi.ts'
import { AcademicAdmission } from './AcademicAdmission.tsx'
import { AcademicTeacherAssignment } from './AcademicTeacherAssignment.tsx'
import { AcademicClassSchedule } from './AcademicClassSchedule.tsx'
import { AcademicCatalogEditor } from './AcademicCatalogEditor.tsx'
import { AcademicCatalogStatusView, AcademicCatalogView } from './AcademicCatalogViews.tsx'
import type { Editor, EditorKind } from './AcademicCatalogViews.tsx'
import { catalogModel, classModel, classesModel, courseModel, editorBody, editorError, newEditor } from './AcademicCatalogModel.ts'
import type { AcademicCatalogModel, CatalogTab } from './AcademicCatalogModel.ts'

const api = new ApiClient(import.meta.env.VITE_API_BASE_URL ?? '')
type Id = Extract<AcademicId, 'AC05' | 'AC06' | 'AC07' | 'AC08'>
type Props = { id: Id; tenantId: string; token: string; selectedId?: string; navigate: (next: string) => void; allowed?: readonly string[] }
type Phase = 'loading' | 'ready' | 'unauthenticated' | 'forbidden' | 'not-found' | 'error'
type Data = { main: Page<Subject> | Page<Level> | Page<Course> | Page<ClassRow> | ClassDetail; subjects?: Page<Subject>; levels?: Page<Level>; courses?: Page<Course>; enrollmentCount?: number }
const falseCaps: Capabilities = { studentCreate: false, studentUpdate: false, teacherCreate: false, teacherUpdate: false,
  catalogManage: false, courseUpdate: false, classCreate: false, classUpdate: false, teacherAssign: false, enroll: false, transferRequest: false, tenantTimezone: '' }
function errorPhase(error: unknown): Phase {
  if (error instanceof ApiError) { if (error.status === 401) return 'unauthenticated'; if (error.status === 403) return 'forbidden'; if (error.status === 404) return 'not-found' }
  return 'error'
}
function targetPath(tenant: string, suffix: string) { return `/app/${encodeURIComponent(tenant)}/${suffix}` }

export function AcademicCatalogProduction(props: Props) {
  return <CatalogScope key={JSON.stringify([props.id, props.tenantId, props.token, props.selectedId])} {...props} />
}
function CatalogScope({ id, tenantId, token, selectedId, navigate, allowed }: Props) {
  const [tab, setTab] = useState<CatalogTab>('subjects')
  const [search, setSearch] = useState({ subjects: '', levels: '', courses: '', classes: '' })
  const [pages, setPages] = useState({ subjects: 1, levels: 1, courses: 1, classes: 1 })
  const [revision, setRevision] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [loaded, setLoaded] = useState('')
  const [data, setData] = useState<Data | null>(null)
  const [caps, setCaps] = useState<Capabilities>(falseCaps)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [saveError, setSaveError] = useState('')
  const trigger = useRef<HTMLElement | null>(null)
  const kind = id === 'AC05' ? tab : id === 'AC06' ? 'courses' : 'classes'
  const query = search[kind], page = pages[kind]
  const scope = JSON.stringify([id, tenantId, token, selectedId, kind, query, page, revision])
  useEffect(() => {
    const abort = new AbortController()
    const get = <T,>(suffix: string) => api.academic<T>(tenantId, suffix, token, { signal: abort.signal })
    if (id !== 'AC08' || selectedId) queueMicrotask(() => { if (!abort.signal.aborted) setPhase('loading') })
    void (async () => {
      try {
        if (id === 'AC08' && !selectedId) { setData(null); setLoaded(scope); setPhase('not-found'); return }
        const suffix = id === 'AC08' ? `/classes/${encodeURIComponent(selectedId!)}` : `/${kind}?page=${page}&q=${encodeURIComponent(query)}`
        const main = await get<Data['main']>(suffix)
        const capabilities = await get<Capabilities>(`/permissions/capabilities/current${id === 'AC08' ? `?classId=${encodeURIComponent(selectedId!)}` : ''}`)
        let extra: Partial<Data> = {}
        if (id === 'AC08') {
          const detail = main as ClassDetail
          const page = await get<Page<ClassRow>>(`/classes?q=${encodeURIComponent(detail.code)}&pageSize=100`).catch(() => undefined)
          const count = page?.items?.find(row => row.id === detail.id)?.enrollmentCount
          extra = { enrollmentCount: typeof count === 'number' ? count : undefined }
        } else if (id === 'AC06') {
          const [subjects, levels] = await Promise.all([get<Page<Subject>>('/subjects?pageSize=100').catch(() => undefined), get<Page<Level>>('/levels?pageSize=100').catch(() => undefined)])
          extra = { subjects, levels }
        } else if (id === 'AC07') {
          const courses = await get<Page<Course>>('/courses?pageSize=100').catch(() => undefined)
          extra = { courses }
        }
        if (!abort.signal.aborted) { setData({ main, ...extra }); setCaps(capabilities); setLoaded(scope); setPhase('ready') }
      } catch (error) {
        if (!abort.signal.aborted) { setData(null); setCaps(falseCaps); setLoaded(scope); setPhase(errorPhase(error)) }
      }
    })()
    return () => abort.abort()
  }, [id, tenantId, token, selectedId, kind, query, page, revision, scope])
  function changeQuery(value: string) { setSearch(current => ({ ...current, [kind]: value })); setPages(current => ({ ...current, [kind]: 1 })) }
  function changePage(value: number) { setPages(current => ({ ...current, [kind]: value })) }
  function open(kind: EditorKind, item: Record<string, unknown> | undefined, element: HTMLElement) { trigger.current = element; setSaveError(''); setEditor(newEditor(kind, item)) }
  function close() { setEditor(null); queueMicrotask(() => { if (trigger.current?.isConnected) trigger.current.focus() }) }
  async function save(draft: Editor) {
    if (busy || editorError(draft)) return
    const resource = { subject: 'subjects', level: 'levels', course: 'courses', class: 'classes' }[draft.kind]
    setBusy(true); setSaveError('')
    try {
      await api.academic(tenantId, `/catalog/${resource}${draft.target ? `/${encodeURIComponent(draft.target)}` : ''}`, token,
        { method: draft.target ? 'PATCH' : 'POST', body: editorBody(draft) })
      close(); setFeedback('Đã lưu theo xác nhận của máy chủ.'); setRevision(value => value + 1)
    } catch (error) { setSaveError(safeErrorMessage(error)); if (error instanceof ApiError && (error.status === 401 || error.status === 403)) { setEditor(null); setData(null); setCaps(falseCaps); setPhase(errorPhase(error)) } }
    finally { setBusy(false) }
  }
  const visible = loaded === scope ? phase : 'loading'
  if (visible !== 'ready' || !data) return <AcademicCatalogStatusView id={id} kind={visible === 'ready' ? 'loading' : visible} onRetry={visible === 'error' ? () => setRevision(value => value + 1) : undefined} />
  let model: AcademicCatalogModel
  if (id === 'AC05') model = catalogModel(tab, data.main as Page<Subject> | Page<Level>, query, false, caps.catalogManage)
  else if (id === 'AC06') model = courseModel(data.main as Page<Course>, query, false, caps.catalogManage, caps.courseUpdate, data.subjects, data.levels)
  else if (id === 'AC07') model = classesModel(data.main as Page<ClassRow>, query, false, caps.classCreate, caps.classUpdate, allowed === undefined || allowed.includes('AC08'), data.courses)
  else model = classModel(data.main as ClassDetail, false, caps.classUpdate, allowed === undefined || allowed.includes('AC07'), caps.tenantTimezone || 'UTC', data.enrollmentCount)
  const detail = id === 'AC08' ? data.main as ClassDetail : null
  return <AcademicCatalogView model={model} onQuery={changeQuery} onPage={changePage} onTab={setTab}
    onCreate={(resource, element) => open(resource, undefined, element)} onEdit={(resource, item, element) => open(resource, item, element)}
    onOpenClass={classId => navigate(targetPath(tenantId, `classes/${encodeURIComponent(classId)}`))}
    onOpenStudent={allowed === undefined || allowed.includes('AC02') ? studentId => navigate(targetPath(tenantId, `students/${encodeURIComponent(studentId)}`)) : undefined}
    onBack={() => navigate(targetPath(tenantId, 'classes'))}
    feedback={feedback && <p role="status">{feedback}</p>}
    editor={editor && <AcademicCatalogEditor key={`${editor.kind}:${editor.target ?? 'new'}`} editor={editor} model={model} busy={busy} error={saveError} onClose={close} onSave={save} />}
    operation={detail && <AcademicAdmission tenantId={tenantId} token={token} classId={detail.id} enrollments={detail.enrollments ?? []} onChanged={() => { setFeedback('Máy chủ đã lưu ghi danh hoặc yêu cầu chuyển lớp. Kiểm tra lịch sử ghi danh bên dưới.'); setRevision(value => value + 1) }} />}
    assignmentOperation={detail && <AcademicTeacherAssignment tenantId={tenantId} token={token} classId={detail.id} onChanged={() => setRevision(value => value + 1)} />}
    schedule={detail && <AcademicClassSchedule key={JSON.stringify([tenantId, token, detail.id])} tenantId={tenantId} token={token} classId={detail.id} timezone={caps.tenantTimezone || 'UTC'} navigate={navigate} allowed={allowed} />} />
}
