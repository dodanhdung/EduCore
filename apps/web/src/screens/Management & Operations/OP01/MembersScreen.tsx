import { ReviewAction } from '../ManagementPrimitives.tsx'
import { useManagementPreview } from '../ManagementTypes.ts'
import type { ScreenProps } from '../ManagementTypes.ts'
import { MembersView } from './MembersView.tsx'
import { fromMemberFixture } from './MembersViewModel.ts'

export function MembersScreen({ data, canReview, open }: ScreenProps) {
  const preview = useManagementPreview()
  return <MembersView model={fromMemberFixture(data, preview)} detailLabel="Xem chi tiết"
    action={canReview ? <ReviewAction label="Tạo tài khoản"
      fields={[{ name: 'displayName', label: 'Họ và tên' }, { name: 'email', label: 'Email', type: 'email' }, { name: 'reason', label: 'Lý do', type: 'textarea' }]}
      warning="Thành viên mới chờ kích hoạt. Người dùng tự yêu cầu OTP email; không có mật khẩu tạm." /> : undefined}
    onOpen={open ? id => open('OP02', id) : undefined} />
}
