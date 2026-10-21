export function validateLogin(email: string, password: string) {
  return {
    email: !email.trim() ? 'Vui lòng nhập địa chỉ email.' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? 'Địa chỉ email không hợp lệ.' : '',
    password: !password ? 'Vui lòng nhập mật khẩu.' : '',
  }
}
