export function emailError(value: string): string {
  if (!value.trim()) return 'Vui lòng nhập địa chỉ email.'
  if (value.trim().length > 254) return 'Địa chỉ email quá dài.'
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '' : 'Địa chỉ email không hợp lệ.'
}

export function otpError(value: string): string {
  return /^\d{6}$/.test(value) ? '' : 'Mã OTP gồm 6 chữ số.'
}

export function passwordError(value: string): string {
  if (Array.from(value).length < 12) return 'Mật khẩu cần ít nhất 12 ký tự.'
  return new TextEncoder().encode(value).length <= 1024 ? '' : 'Mật khẩu không được vượt quá 1.024 byte UTF-8.'
}

export function confirmationError(password: string, confirmation: string): string {
  if (!confirmation) return 'Vui lòng xác nhận mật khẩu.'
  return confirmation === password ? '' : 'Mật khẩu xác nhận không khớp.'
}
