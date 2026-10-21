import { useState, type FormEvent } from 'react'
import { FormField, PasswordInput, PrimaryButton, SafeFeedback, TextInput } from '../AuthComponents.tsx'
import { AuthCard, AuthScreen, BackToLogin, ScreenHeading, type Navigate } from '../BatchPrimitives.tsx'
import { confirmationError, emailError, otpError, passwordError } from '../authFormValidation.ts'

type Errors = { email: string; otp: string; password: string; confirm: string }
const noErrors: Errors = { email: '', otp: '', password: '', confirm: '' }

export function ActivationScreen({ navigate }: { navigate: Navigate }) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>(noErrors)
  const [pendingAction, setPendingAction] = useState<'otp' | 'activation' | null>(null)

  function requestOtp() {
    const error = emailError(email)
    setErrors({ ...noErrors, email: error })
    setPendingAction(error ? null : 'otp')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = {
      email: emailError(email),
      otp: otpError(otp),
      password: passwordError(password),
      confirm: confirmationError(password, confirm),
    }
    setErrors(nextErrors)
    setPendingAction(Object.values(nextErrors).some(Boolean) ? null : 'activation')
  }

  return <AuthScreen legal>
    <ScreenHeading title="Kích hoạt tài khoản" detail="Xác minh email bằng OTP và thiết lập mật khẩu." />
    <AuthCard>
      <form className="ec-auth-form" onSubmit={submit} noValidate>
        <FormField label="Email" htmlFor="activate-email" error={errors.email}>
          <TextInput id="activate-email" type="email" inputMode="email" autoComplete="email" placeholder="ten@vidu.vn" value={email} aria-invalid={!!errors.email} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: '' })); setPendingAction(null) }} />
        </FormField>
        <button type="button" className="ec-inline-action" onClick={requestOtp}>Gửi mã OTP</button>
        <FormField label="Mã OTP" htmlFor="activate-otp" error={errors.otp}>
          <TextInput id="activate-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} aria-invalid={!!errors.otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setErrors((current) => ({ ...current, otp: '' })); setPendingAction(null) }} />
        </FormField>
        <FormField label="Mật khẩu" htmlFor="activate-password" hint="Tối thiểu 12 ký tự." error={errors.password}>
          <PasswordInput id="activate-password" placeholder="Tạo mật khẩu" value={password} onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: '', confirm: '' })); setPendingAction(null) }} error={errors.password} />
        </FormField>
        <FormField label="Xác nhận mật khẩu" htmlFor="activate-confirm" error={errors.confirm}>
          <PasswordInput id="activate-confirm" placeholder="Nhập lại mật khẩu" value={confirm} onChange={(value) => { setConfirm(value); setErrors((current) => ({ ...current, confirm: '' })); setPendingAction(null) }} error={errors.confirm} />
        </FormField>
        {pendingAction === 'otp' && <SafeFeedback tone="warning">PENDING_API: chưa thể gửi OTP vì API kích hoạt chưa được tích hợp.</SafeFeedback>}
        {pendingAction === 'activation' && <SafeFeedback tone="warning">PENDING_API: chưa thể kích hoạt tài khoản vì API chưa được tích hợp.</SafeFeedback>}
        <PrimaryButton>Kích hoạt tài khoản</PrimaryButton>
      </form>
      <BackToLogin navigate={navigate} />
    </AuthCard>
  </AuthScreen>
}
