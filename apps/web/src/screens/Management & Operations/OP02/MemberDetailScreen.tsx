import { Badge, Card, Heading, ReviewAction, StateMessage, Timeline } from '../ManagementPrimitives.tsx'
import { labels, roleValidation } from '../ManagementTypes.ts'
import type { ScreenProps } from '../ManagementTypes.ts'

export function MemberDetailScreen({ data, selectedId, canReview, open }: ScreenProps) {
  const member = data.members.find((m) => m.id === selectedId)
  if (!member) return <StateMessage state="not-found" />
  return <><Heading title="Chi tiết tài khoản và gán role" detail={`Tài khoản / ${member.name}`}>{open && <button onClick={() => open('OP01')}>Về danh sách</button>}</Heading>
    <div className="mo-split"><Card title={member.name} detail={`Membership ${member.id}`}><Badge value={member.status} /><dl className="mo-detail"><div><dt>Email</dt><dd>{member.email}</dd></div><div><dt>Trung tâm</dt><dd>{data.tenantName}</dd></div></dl><Card title="Lịch sử cơ bản"><Timeline items={member.history} /></Card>
      {canReview && member.status !== 'DISABLED' && <ReviewAction label="Khóa tài khoản" disabled={member.protectedManager} warning="Quyền truy cập của thành viên sẽ bị vô hiệu hóa. Máy chủ phải bảo vệ Manager hợp lệ cuối cùng." />}
      {member.protectedManager && <p className="mo-warning">Manager hoạt động cuối cùng trong dữ liệu mẫu: không được khóa hoặc thu hồi role quản lý.</p>}</Card>
      <Card title="Role được gán" detail="Nhiều role có thể cùng hiệu lực; chỉ dùng role seed P0.">{member.assignments.map((a) => <article key={a.id} className="mo-inset"><strong>{a.role}</strong><p>{labels[a.scope]}{a.scopeId ? ` · ${a.scopeId}` : ''}</p><Badge value={a.status} />{canReview && a.status === 'ACTIVE' && <ReviewAction label={`Thu hồi ${a.role}`} disabled={member.protectedManager} warning="Thu hồi có hiệu lực cho các thao tác tiếp theo; yêu cầu cũ vẫn phải kiểm tra quyền khi thực thi." />}</article>)}{!member.assignments.length && <p>Chưa gán role.</p>}{canReview && <ReviewAction label="Gán role" fields={[{ name: 'role', label: 'Role seed', options: ['Manager', 'Academic Staff', 'Accountant', 'Teacher', 'Student', 'Parent'] }, { name: 'scope', label: 'Phạm vi', options: ['TENANT', 'CLASS', 'STUDENT'] }, { name: 'scopeId', label: 'Mã lớp / học sinh (bắt buộc ngoài TENANT)', optional: true }, { name: 'reason', label: 'Lý do', type: 'textarea' }]} validate={(values) => roleValidation(values, member.assignments)} warning="Danh mục mẫu chỉ để review. Role/scope hợp lệ và quyền gán phải lấy từ máy chủ trước khi gửi." />}</Card></div>
    <Card title="Xác nhận thay đổi quyền"><p>Role đã hiệu lực không được gán trùng. Role đã thu hồi được giữ trong lịch sử. Không cấu hình permission động ở P0.</p><p>Máy chủ kiểm tra tenant, phạm vi và Manager hoạt động cuối cùng cho từng thay đổi.</p></Card>
  </>
}
