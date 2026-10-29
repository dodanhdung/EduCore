import type { ReactNode } from 'react'
import { PageHeader, PageLayout, ResourceState, StatusBadge } from '../../shared/ui/SharedUI.tsx'
import type { PersonDetailModel } from './AcademicPersonViewModel.ts'
import styles from './AcademicPersonView.module.css'

function date(value: string | null | undefined, zone: string) {
  if (!value) return 'Chưa có dữ liệu'
  const instant = new Date(value)
  if (!Number.isFinite(instant.getTime())) return value
  return new Intl.DateTimeFormat('vi-VN', { timeZone: value.includes('T') ? zone : 'UTC', day: '2-digit', month: '2-digit', year: 'numeric' }).format(instant)
}
function status(value: string) { return <StatusBadge domain="academic-profile" label={value === 'ACTIVE' ? 'Đang hoạt động' : value === 'INACTIVE' ? 'Ngừng hoạt động' : value}
  tone={value === 'ACTIVE' ? 'success' : 'neutral'} /> }

function PersonDetailView({ model, onEdit, onBack, onOpenClass, operation }: {
  model: PersonDetailModel; onEdit?: () => void; onBack?: () => void;
  onOpenClass?: (id: string) => void; operation?: ReactNode
}) {
  const student = model.kind === 'student'
  const noun = student ? 'học sinh' : 'giáo viên'
  const records = student ? model.enrollments : model.assignments
  return <div className={styles.root} data-screen-id={student ? 'AC02' : 'AC04'}><PageLayout
    header={<PageHeader title={model.person.name} context={status(model.person.status)}
      description={`${student ? 'Hồ sơ học sinh' : 'Hồ sơ giáo viên'} · ${model.person.code}${model.sample ? ' · Dữ liệu mẫu — UI Preview' : ''}`}
      action={onEdit ? <button type="button" className={styles.primary} onClick={onEdit}>Chỉnh sửa hồ sơ</button> : undefined} />}>
    {onBack && <button type="button" className={styles.link} onClick={onBack}>← Trở lại danh sách {noun}</button>}
    <nav className={styles.tabs} aria-label={'Các phần hồ sơ ' + noun}>
      <a href="#academic-profile">Hồ sơ</a><a href="#academic-records">{student ? 'Ghi danh' : 'Phân công'}</a>
    </nav>
    <div className={styles.detailGrid}>
      <section id="academic-profile" className={styles.panel}><h2>{student ? 'Thông tin cơ bản' : model.person.name}</h2>
        <p>Hồ sơ độc lập với tài khoản đăng nhập.</p>
        <dl className={styles.fields}><div><dt>Mã {noun}</dt><dd>{model.person.code}</dd></div>
          <div><dt>Họ tên</dt><dd>{model.person.name}</dd></div>
          <div><dt>Trạng thái hồ sơ</dt><dd>{status(model.person.status)}</dd></div>
          {student ? <div><dt>Ngày sinh</dt><dd>{date(model.dateOfBirth, model.timeZone)}</dd></div>
            : <div><dt>Liên hệ</dt><dd>{model.contact ?? 'Chưa có dữ liệu'}</dd></div>}
        </dl>
      </section>
      <section className={styles.panel}><h2>{student ? 'Ghi danh trong hồ sơ' : 'Phân công trong hồ sơ'}</h2>
        <p>{records.length.toLocaleString('vi-VN')} bản ghi được cấp từ chi tiết hồ sơ.</p>
        {records.length ? <ul>{records.slice(0, 3).map(row => <li key={row.id}>{row.className ?? row.classCode ?? row.classId ?? 'Lớp chưa có tên'}</li>)}</ul>
          : <ResourceState kind="empty" title={student ? 'Chưa có ghi danh' : 'Chưa có phân công'} />}
      </section>
    </div>
    <section id="academic-records" className={styles.panel}><h2>{student ? 'Lịch sử ghi danh' : 'Lịch sử phân công'}</h2>
      {records.length ? <ol className={styles.history}>{records.map(row => <li key={row.id}>
        <strong>{row.className ?? row.classCode ?? row.classId ?? 'Lớp chưa có tên'}</strong>
        {'status' in row && row.status && <> · <StatusBadge domain="academic-enrollment" label={row.status} tone={row.status === 'ACTIVE' ? 'success' : 'neutral'} /></>}
        <small>{student ? date('effectiveFrom' in row ? row.effectiveFrom : '', model.timeZone) + ' – ' + ('effectiveTo' in row && row.effectiveTo ? date(row.effectiveTo, model.timeZone) : 'Hiện tại')
          : date('validFrom' in row ? row.validFrom : '', model.timeZone) + ' – ' + ('validTo' in row && row.validTo ? date(row.validTo, model.timeZone) : 'Hiện tại')}</small>
        {row.classId && onOpenClass && <button type="button" className={styles.link} onClick={() => onOpenClass(row.classId!)}>Xem lớp</button>}
      </li>)}</ol> : <ResourceState kind="empty" title={student ? 'Chưa có ghi danh' : 'Chưa có phân công'} />}
      {model.sample && model.sampleNotes.length > 0 && <div className={styles.actions}><p>Dữ liệu mẫu bổ sung:</p>
        <ul>{model.sampleNotes.map(note => <li key={note}>{note}</li>)}</ul></div>}
      {operation && <div className={styles.actions}>{operation}</div>}
    </section>
    <section className={styles.panel}><h2>Thông tin cần nguồn riêng</h2>
      <p>{student ? 'Lịch học, người giám hộ và audit cần API cùng quyền đọc tương ứng.' : 'Năng lực xác minh, lịch dạy và audit cần API cùng quyền đọc tương ứng.'} Chưa hiển thị danh sách giả.</p>
    </section>
  </PageLayout></div>
}
export function StudentDetailView(props: Parameters<typeof PersonDetailView>[0]) { return <PersonDetailView {...props} /> }
export function TeacherDetailView(props: Parameters<typeof PersonDetailView>[0]) { return <PersonDetailView {...props} /> }
