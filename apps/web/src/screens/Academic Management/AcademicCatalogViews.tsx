import type { ReactNode } from 'react'
import { DataTable, FilterToolbar, MetricCard, PageHeader, PageLayout, ResourceState, StatusBadge } from '../../shared/ui/SharedUI.tsx'
import type { ResourceKind } from '../../shared/ui/SharedUI.tsx'
import type { Assignment, ClassRow, Enrollment, Level, Subject } from './AcademicApi.ts'
import type { AcademicCatalogModel, CatalogTab } from './AcademicCatalogModel.ts'
import { completeChoices } from './AcademicCatalogModel.ts'
import styles from './AcademicCatalogViews.module.css'

export type EditorKind = 'subject' | 'level' | 'course' | 'class'
export type Editor = { kind: EditorKind; target?: string; values: Record<string, string> }
type Props = { model: AcademicCatalogModel; onQuery?: (value: string) => void; onPage?: (value: number) => void; onTab?: (value: CatalogTab) => void; onEnroll?: () => void;
  onCreate?: (kind: EditorKind, trigger: HTMLElement) => void; onEdit?: (kind: EditorKind, row: Record<string, unknown>, trigger: HTMLElement) => void;
  onOpenClass?: (id: string) => void; onOpenStudent?: (id: string) => void; onBack?: () => void;
  operation?: ReactNode; assignmentOperation?: ReactNode; editor?: ReactNode; feedback?: ReactNode }
const label = (sample: boolean) => sample ? 'Dữ liệu mẫu — UI Preview' : 'Dữ liệu trong phạm vi được cấp'
const number = (value: number | undefined) => typeof value === 'number' ? value.toLocaleString('vi-VN') : '—'
function displayDate(value: string | null | undefined, timezone: string) {
  if (!value) return 'Chưa có'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value)
  if (Number.isNaN(date.valueOf())) return 'Không hợp lệ'
  return new Intl.DateTimeFormat('vi-VN', { timeZone: dateOnly ? 'UTC' : timezone, day: '2-digit', month: '2-digit', year: 'numeric', ...(dateOnly ? {} : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const }) }).format(date)
}
const status = (value: string, domain: string) => <StatusBadge label={value} domain={domain} tone={value === 'ACTIVE' ? 'success' : value === 'PENDING' || value === 'PLANNED' ? 'warning' : 'neutral'} />
const panel = (title: string, body: ReactNode, hint?: string) => <section className={styles.panel}><div className={styles.panelHead}><h2>{title}</h2>{hint && <p>{hint}</p>}</div>{body}</section>
const action = (text: string, callback: (trigger: HTMLElement) => void) => <button className={`${styles.link} academic-link`} type="button" onClick={event => callback(event.currentTarget)}>{text}</button>
const pagination = (page: { page: number; pageSize: number; total: number }, onPage?: (value: number) => void) => onPage ? { index: page.page, totalPages: Math.max(1, Math.ceil(page.total / page.pageSize)), onPageChange: onPage } : undefined
const titles = { AC05: 'Danh mục môn học & trình độ', AC06: 'Danh sách khóa học', AC07: 'Danh sách lớp học', AC08: 'Chi tiết lớp học' } as const

export function AcademicCatalogStatusView({ id, kind, onRetry }: { id: keyof typeof titles; kind: ResourceKind; onRetry?: () => void }) {
  return <div className={styles.root} data-screen-id={id}><PageLayout header={<PageHeader title={titles[id]} description="Dữ liệu trong phạm vi được cấp" />}><ResourceState kind={kind} onRetry={onRetry} /></PageLayout></div>
}

export function AcademicCatalogView({ model, onQuery, onPage, onTab, onEnroll, onCreate, onEdit, onOpenClass, onOpenStudent, onBack, operation, assignmentOperation, editor, feedback }: Props) {
  const id = model.kind
  const title = id === 'AC05' ? 'Danh mục môn học & trình độ' : id === 'AC06' ? 'Danh sách khóa học' : id === 'AC07' ? 'Danh sách lớp học' : model.detail.name
  const newKind: EditorKind = id === 'AC05' ? model.tab === 'subjects' ? 'subject' : 'level' : id === 'AC06' ? 'course' : 'class'
  const createAllowed = id !== 'AC08' && model.canCreate
  const optionsComplete = id === 'AC06' ? completeChoices(model.choices.subjects) && completeChoices(model.choices.levels)
    : id === 'AC07' ? completeChoices(model.courses) : true
  const description = id === 'AC08' ? `${model.detail.code} · ${model.detail.courseName} · ${label(model.sample)}` : label(model.sample)
  return <div className={styles.root} data-screen-id={id}><PageLayout header={<PageHeader className="academic-heading" title={title} description={description}
    context={id === 'AC08' && model.canBack && onBack ? action('← Danh sách lớp', () => onBack()) : undefined}
    action={id === 'AC08' ? onEnroll ? <button className={styles.primary} type="button" onClick={onEnroll}>Ghi danh học sinh</button> : model.canEdit && onEdit ? <button className={styles.primary} type="button" onClick={e => onEdit('class', model.detail as unknown as Record<string, unknown>, e.currentTarget)}>Chỉnh sửa lớp</button> : undefined
      : createAllowed && onCreate ? <button className={styles.primary} type="button" onClick={e => onCreate(newKind, e.currentTarget)}>{id === 'AC05' ? 'Thêm danh mục' : id === 'AC06' ? 'Tạo khóa học' : 'Tạo lớp học'}</button> : undefined} />} feedback={feedback}>
    {id === 'AC05' && <>
      <div className={styles.tabs} role="tablist" aria-label="Loại danh mục" onKeyDown={event => { if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && onTab) { event.preventDefault(); const next = model.tab === 'subjects' ? 'levels' : 'subjects'; onTab(next); queueMicrotask(() => document.querySelector<HTMLElement>(`[data-catalog-tab="${next}"]`)?.focus()) } }}>
        <button type="button" role="tab" data-catalog-tab="subjects" aria-selected={model.tab === 'subjects'} onClick={() => onTab?.('subjects')}>Môn học</button>
        <button type="button" role="tab" data-catalog-tab="levels" aria-selected={model.tab === 'levels'} onClick={() => onTab?.('levels')}>Trình độ</button>
      </div>
      <div className={styles.metrics}><MetricCard label={model.tab === 'subjects' ? 'Môn học phù hợp' : 'Trình độ phù hợp'} value={{ kind: 'available', display: number(model.page.total) }} detail="Tổng từ nguồn đang mở" />
        <MetricCard label="Trạng thái hoạt động" value={{ kind: 'pending-api' }} detail="API chưa cấp tổng theo trạng thái" /></div>
    </>}
    {(id === 'AC06' || id === 'AC07') && <div className={styles.metrics}><MetricCard label={id === 'AC06' ? 'Khóa học phù hợp' : 'Lớp học phù hợp'} value={{ kind: 'available', display: number(model.page.total) }} detail="Tổng từ API theo tìm kiếm hiện tại" />
      <MetricCard label="Theo trạng thái" value={{ kind: 'pending-api' }} detail="API chưa cấp tổng theo trạng thái" /></div>}
    {id !== 'AC08' && <>
      {panel('Tìm kiếm và lọc', <FilterToolbar label="Tìm kiếm" scope={model.sample ? 'loaded-page' : 'complete-result'} onReset={() => onQuery?.('')}><label>Tìm theo mã hoặc tên<input type="search" value={model.query} onChange={event => onQuery?.(event.target.value)} placeholder="Nhập mã hoặc tên…" /></label></FilterToolbar>)}
      {id === 'AC05' && panel(model.tab === 'subjects' ? 'Môn học' : 'Trình độ', <><p className={styles.note}>{number(model.page.total)} bản ghi phù hợp · Trang {model.page.page}</p><DataTable caption={model.tab === 'subjects' ? 'Danh mục môn học' : 'Danh mục trình độ'} rows={model.page.items} rowKey={row => row.id} columns={[
        { key: 'code', header: 'Mã', cell: row => <strong>{row.code}</strong> }, { key: 'name', header: 'Tên', cell: row => row.name },
        ...(model.tab === 'levels' ? [{ key: 'order', header: 'Thứ tự', cell: (row: Subject | Level) => 'sortOrder' in row ? row.sortOrder : '—' }] : []),
        { key: 'active', header: 'Trạng thái', cell: row => status(row.active ? 'Đang hoạt động' : 'Đã ẩn', 'catalog') },
        { key: 'action', header: 'Thao tác', cell: row => model.canEdit && onEdit ? action('Chỉnh sửa', trigger => onEdit(model.tab === 'subjects' ? 'subject' : 'level', row as unknown as Record<string, unknown>, trigger)) : '—' },
      ]} empty={<ResourceState kind={model.query ? 'filtered-empty' : 'empty'} title={model.query ? 'Không có danh mục phù hợp' : 'Chưa có danh mục'} />} page={pagination(model.page, onPage)} /></>, 'Môn học không có trường thứ tự. Danh mục đã được tham chiếu có thể chỉ ẩn theo quy tắc máy chủ.')}
      {id === 'AC06' && panel('Khóa học', <><p className={styles.note}>{number(model.page.total)} khóa phù hợp · Trang {model.page.page}</p><DataTable caption="Danh sách khóa học" rows={model.page.items} rowKey={row => row.id} columns={[
        { key: 'course', header: 'Mã / Tên khóa', cell: row => <><strong>{row.code}</strong><br />{row.name}</> },
        { key: 'subject', header: 'Môn học', cell: row => row.subjectName }, { key: 'level', header: 'Trình độ', cell: row => row.levelName },
        { key: 'status', header: 'Trạng thái', cell: row => status(row.status, 'course') },
        { key: 'action', header: 'Thao tác', cell: row => model.canEdit && onEdit ? action('Chỉnh sửa', trigger => onEdit('course', row as unknown as Record<string, unknown>, trigger)) : '—' },
      ]} empty={<ResourceState kind={model.query ? 'filtered-empty' : 'empty'} title={model.query ? 'Không có khóa phù hợp' : 'Chưa có khóa học'} />} page={pagination(model.page, onPage)} /></>, 'Tên môn và trình độ lấy trực tiếp từ khóa học, gồm cả tham chiếu đã ngừng hoạt động.')}
      {id === 'AC07' && panel('Lớp học', <><p className={styles.note}>{number(model.page.total)} lớp phù hợp · Trang {model.page.page}</p><DataTable caption="Danh sách lớp học" rows={model.page.items} rowKey={row => row.id} columns={[
        { key: 'class', header: 'Mã / Tên lớp', cell: (row: ClassRow) => <><strong>{row.code}</strong><br />{row.name}</> },
        { key: 'course', header: 'Khóa học', cell: row => row.courseName },
        { key: 'capacity', header: 'Sĩ số / Sức chứa', cell: row => `${number(row.enrollmentCount)} / ${number(row.capacity)}` },
        { key: 'status', header: 'Trạng thái', cell: row => status(row.status, 'class') },
        { key: 'action', header: 'Thao tác', cell: row => onOpenClass && model.canOpen || model.canEdit && onEdit ? <>{onOpenClass && model.canOpen && action('Xem lớp', () => onOpenClass(row.id))}{model.canEdit && onEdit && action('Chỉnh sửa', trigger => onEdit('class', row as unknown as Record<string, unknown>, trigger))}</> : '—' },
      ]} empty={<ResourceState kind={model.query ? 'filtered-empty' : 'empty'} title={model.query ? 'Không có lớp phù hợp' : 'Chưa có lớp học'} />} page={pagination(model.page, onPage)} /></>, 'Sĩ số và sức chứa từ API; màn danh sách chưa có trường giáo viên.')}
      {id === 'AC06' && !optionsComplete && panel('Lựa chọn tạo khóa', <ResourceState kind="partial" detail="Danh sách môn học hoặc trình độ chưa tải đủ. Form tạo khóa tạm khóa để tránh chọn từ tập dữ liệu thiếu." />)}
      {id === 'AC07' && !optionsComplete && panel('Lựa chọn khóa học', <ResourceState kind="partial" detail="Danh sách khóa học cho form tạo lớp chưa đủ hoặc không được cấp; danh sách lớp vẫn sử dụng bình thường." />)}
    </>}
    {id === 'AC08' && <ClassDetailSections model={model} onOpenStudent={onOpenStudent} operation={operation} assignmentOperation={assignmentOperation} />}
    {editor}
  </PageLayout></div>
}

function ClassDetailSections({ model, onOpenStudent, operation, assignmentOperation }: { model: Extract<AcademicCatalogModel, { kind: 'AC08' }>; onOpenStudent?: (id: string) => void; operation?: ReactNode; assignmentOperation?: ReactNode }) {
  const d = model.detail
  return <><div className={styles.metrics}><MetricCard label="Sức chứa tối đa" value={{ kind: 'available', display: number(d.capacity) }} detail="Sức chứa lớp, không phải phòng" />
    <MetricCard label="Sĩ số hiện tại" value={{ kind: 'pending-api' }} detail="DTO chi tiết chưa cấp sĩ số" />
    <MetricCard label="Trạng thái lớp" value={{ kind: 'available', display: d.status }} /></div>
    {panel('Thông tin lớp', <dl className={styles.details}><div><dt>Mã lớp</dt><dd>{d.code}</dd></div><div><dt>Khóa học</dt><dd>{d.courseName}</dd></div><div><dt>Trạng thái</dt><dd>{status(d.status, 'class')}</dd></div><div><dt>Thời gian</dt><dd>{displayDate(d.startDate, model.timezone)} – {displayDate(d.endDate, model.timezone)}</dd></div></dl>)}
    <div className={styles.twoColumns}>
      {panel('Học sinh ghi danh', d.enrollments === undefined ? <ResourceState kind="unavailable" title="Chưa được cấp dữ liệu ghi danh" /> : <DataTable caption="Lịch sử ghi danh lớp" rows={d.enrollments} rowKey={(row: Enrollment) => row.id} columns={[
        { key: 'student', header: 'Học sinh', cell: row => <>{row.studentCode ?? '—'} · {row.studentName ?? '—'}</> },
        { key: 'window', header: 'Hiệu lực', cell: row => `${displayDate(row.effectiveFrom, model.timezone)} – ${row.effectiveTo ? displayDate(row.effectiveTo, model.timezone) : 'không đặt ngày kết thúc'}` },
        { key: 'status', header: 'Trạng thái', cell: row => status(row.status, 'enrollment') },
        { key: 'prior', header: 'Ghi danh trước', cell: row => row.priorEnrollmentId ?? '—' },
        { key: 'action', header: 'Thao tác', cell: row => row.studentId && onOpenStudent ? action('Xem hồ sơ', () => onOpenStudent(row.studentId!)) : '—' },
      ]} empty={<ResourceState kind="empty" title="Chưa có ghi danh" />} />, 'Giữ cả lịch sử và trạng thái từng bản ghi.')}
      {panel('Phân công giáo viên', d.teacherAssignments === undefined ? <ResourceState kind="unavailable" title="Chưa được cấp dữ liệu phân công" /> : <DataTable caption="Lịch sử phân công giáo viên" rows={d.teacherAssignments} rowKey={(row: Assignment) => row.id} columns={[
        { key: 'teacher', header: 'Giáo viên', cell: row => <>{row.teacherCode ?? '—'} · {row.teacherName ?? '—'}</> },
        { key: 'window', header: 'Hiệu lực', cell: row => `${displayDate(row.validFrom, model.timezone)} – ${row.validTo ? displayDate(row.validTo, model.timezone) : 'không đặt ngày kết thúc'}` },
      ]} empty={<ResourceState kind="empty" title="Chưa có phân công" />} />, 'Phân công lớp, không thay thế lịch sử buổi học.')}
    </div>
    {assignmentOperation && panel('Quản lý phân công', assignmentOperation)}
    {operation && panel('Ghi danh và chuyển lớp', operation)}
    {panel('Lịch học', <ResourceState kind="unavailable" title="Chưa có lịch buổi học trong API chi tiết lớp" detail="Không hiển thị buổi tiếp theo, phòng học hoặc giáo viên buổi học khi chưa có nguồn dữ liệu." />)}
  </>
}
