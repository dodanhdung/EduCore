import { AppLink, type Navigate } from '../BatchPrimitives.tsx'
import permissionIcon from './assets/permission.svg'

export function ErrorScreen({ code, navigate }: { code: '403' | '404'; navigate: Navigate }) {
  const forbidden = code === '403'
  const title = forbidden ? 'Không đủ quyền truy cập' : 'Không tìm thấy trang'
  const detail = forbidden
    ? 'Bạn không có quyền truy cập nội dung này. Hãy kiểm tra trung tâm đang chọn hoặc liên hệ quản trị viên.'
    : 'Đường dẫn có thể đã thay đổi hoặc không tồn tại.'

  return <main className="ec-error-page">
    <div className="ec-error-card">
      <img src={permissionIcon} alt="" /><span>{code}</span>
      <h1>{title}</h1><p>{detail}</p>
      <AppLink to="/login" navigate={navigate}>Quay về đăng nhập</AppLink>
    </div>
  </main>
}
