export function emailError(value: string): string {
  if (!value.trim()) return 'Vui lòng nhập địa chỉ email.'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : 'Địa chỉ email không hợp lệ.'
}

export function otpError(value: string): string {
  return /^\d{6}$/.test(value) ? '' : 'Mã OTP gồm 6 chữ số.'
}

export function passwordError(value: string): string {
  return value.length >= 12 ? '' : 'Mật khẩu cần ít nhất 12 ký tự.'
}

export function confirmationError(password: string, confirmation: string): string {
  if (!confirmation) return 'Vui lòng xác nhận mật khẩu.'
  return confirmation === password ? '' : 'Mật khẩu xác nhận không khớp.'
}
