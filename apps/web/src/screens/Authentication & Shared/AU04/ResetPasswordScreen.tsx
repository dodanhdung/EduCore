import { useState, type FormEvent } from 'react'
import { FormField, PasswordInput, PrimaryButton, SafeFeedback, TextInput } from '../AuthComponents.tsx'
import { AuthCard, AuthScreen, BackToLogin, type Navigate } from '../BatchPrimitives.tsx'
import resetIcon from './assets/reset-key.svg'
import { confirmationError, otpError, passwordError } from '../authFormValidation.ts'

export function ResetPasswordScreen({ navigate }: { navigate: Navigate }) {
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [pending, setPending] = useState(false)
  const otpMessage = submitted ? otpError(otp) : ''
  const passwordMessage = submitted ? passwordError(password) : ''
  const confirmMessage = submitted ? confirmationError(password, confirm) : ''

  function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitted(true)
    setPending(!otpError(otp) && !passwordError(password) && !confirmationError(password, confirm))
  }

  return <AuthScreen legal>
    <AuthCard>
      <div className="ec-card-icon"><img src={resetIcon} alt="" /></div>
      <h1>Đặt lại mật khẩu</h1>
      <p className="ec-card-description">Nhập mã OTP và tạo mật khẩu mới.</p>
      <form className="ec-auth-form" onSubmit={submit} noValidate>
        <FormField label="Mã OTP" htmlFor="reset-otp" error={otpMessage}>
          <TextInput id="reset-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} aria-invalid={!!otpMessage} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setPending(false) }} />
        </FormField>
        <FormField label="Mật khẩu mới" htmlFor="reset-password" hint="Tối thiểu 12 ký tự." error={passwordMessage}>
          <PasswordInput id="reset-password" placeholder="Nhập mật khẩu mới" value={password} onChange={(value) => { setPassword(value); setPending(false) }} error={passwordMessage} />
        </FormField>
        <FormField label="Xác nhận mật khẩu" htmlFor="reset-confirm" error={confirmMessage}>
          <PasswordInput id="reset-confirm" placeholder="Nhập lại mật khẩu" value={confirm} onChange={(value) => { setConfirm(value); setPending(false) }} error={confirmMessage} />
        </FormField>
        {pending && <SafeFeedback tone="warning">PENDING_API: chưa thể xác minh OTP hoặc cập nhật mật khẩu.</SafeFeedback>}
        <PrimaryButton>Cập nhật mật khẩu</PrimaryButton>
      </form>
      <BackToLogin navigate={navigate} />
    </AuthCard>
  </AuthScreen>
}
