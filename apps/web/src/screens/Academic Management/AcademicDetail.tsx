import { useState } from 'react'
import type { AcademicPerson } from './AcademicTypes.ts'
import { PageHeader, Section, DetailField, EditDialog } from './AcademicPrimitives.tsx'

export function DetailScreen({ id, person, preview }: { id: 'AC02' | 'AC04'; person?: AcademicPerson; preview: boolean }) {
  const student = id === 'AC02'
  const tabs = student ? ['Hồ sơ', 'Ghi danh', 'Lịch học', 'Người giám hộ', 'Lịch sử'] : ['Hồ sơ', 'Phân công', 'Lịch dạy', 'Lịch sử']
  const [tab, setTab] = useState(tabs[0])
  const [showDialog, setShowDialog] = useState(false)
  return <div className="academic-page"><PageHeader id={id} subtitle={`${person ? `${person.id} · ${person.name}` : 'Đang chờ dữ liệu hồ sơ'}${preview ? ' · Dữ liệu mẫu' : ''}`} action={preview && person ? () => setShowDialog(true) : undefined} />
    {!person ? <Section title="Hồ sơ"><p role="status" className="academic-empty">{preview ? 'Không tìm thấy hồ sơ mẫu theo mã đã chọn.' : 'Đang chờ kết nối API chi tiết và quyền truy cập.'}</p></Section> : <>
      <div className="academic-tabs" role="tablist" aria-label="Thông tin hồ sơ">{tabs.map((item) => <button key={item} role="tab" aria-selected={tab === item} tabIndex={tab === item ? 0 : -1} onKeyDown={(event) => { const at = tabs.indexOf(item); if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); const next = tabs[(at + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; setTab(next); (event.currentTarget.parentElement?.querySelectorAll('[role=tab]')[tabs.indexOf(next)] as HTMLElement)?.focus() } }} onClick={() => setTab(item)}>{item}</button>)}</div>
      <div role="tabpanel" className="academic-detail-grid">
        <Section title={tab === 'Hồ sơ' ? (student ? 'Thông tin cơ bản' : person.name) : tab} hint={tab === 'Hồ sơ' ? (student ? 'Hồ sơ độc lập với tài khoản đăng nhập.' : `Mã ${person.id} · ${person.status}`) : 'Dữ liệu mẫu · Trạng thái chỉ để xem giao diện.'}>
          {tab === 'Hồ sơ' ? <><div className="academic-fields"><DetailField label={student ? 'Mã học sinh' : 'Môn chính'} value={person.kind === 'student' ? person.id : person.subject} /><DetailField label={student ? 'Ngày sinh' : 'Trạng thái tài khoản'} value={person.detail?.secondary ?? '—'} /><DetailField label="Trạng thái hồ sơ" value={person.status} /><DetailField label={student ? 'Liên hệ' : 'Trình độ'} value={student ? 'Theo quyền truy cập' : person.level} /></div><div className="academic-inset"><h3>{student ? 'Người giám hộ đã xác minh' : 'Năng lực được xác minh'}</h3>{person.detail?.inset.map((line) => <p key={line}>{line}</p>)}</div></> : <p className="academic-hint">{tab === 'Lịch sử' ? 'Lịch sử được giữ sau khi thay đổi; cần API để hiển thị dữ liệu thật.' : `${tab} đang chờ API. Không có thay đổi nghiệp vụ nào được áp dụng.`}</p>}
        </Section>
        <Section title={student ? 'Lớp đang học' : 'Phân công hiện tại'} hint={student ? 'Ghi danh đang hoạt động' : 'Dữ liệu mẫu · Phân công hiện hành'}>{person.detail?.summary.map((line) => <p key={line} className="academic-hint">{line}</p>)}{student ? <p className="academic-hint">Mở chi tiết lớp (AC08) để xem biểu mẫu chuyển lớp; xác nhận đang chờ API.</p> : <button className="academic-primary" disabled>Phân công lớp · Chờ API</button>}</Section>
      </div>
      <Section title={student ? 'Lịch học và lịch sử' : 'Lịch sử phân công'} hint={person.detail?.next}><p className="academic-hint">{student ? 'Lịch sử ghi danh cũ vẫn đọc được sau khi chuyển lớp; không tự điều chỉnh hóa đơn đã phát hành.' : 'Phân công mới phải kiểm tra năng lực, lịch thực tế và quyền hiệu lực.'}</p></Section>
    </>}{showDialog && <EditDialog title={student ? 'Chỉnh sửa hồ sơ học sinh' : 'Chỉnh sửa hồ sơ giáo viên'} onClose={() => setShowDialog(false)} />}
  </div>
}
