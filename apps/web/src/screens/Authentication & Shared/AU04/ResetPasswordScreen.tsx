import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, safeErrorMessage } from '../../../api.ts'
import { FormField, PasswordInput, PrimaryButton, SafeFeedback, TextInput } from '../AuthComponents.tsx'
import { AppLink, AuthCard, AuthScreen, BackToLogin, type Navigate } from '../BatchPrimitives.tsx'
import resetIcon from './assets/reset-key.svg'
import { confirmationError, emailError, otpError, passwordError } from '../authFormValidation.ts'

export function ResetPasswordScreen({ navigate, onReset }: {
  navigate: Navigate; onReset: (email: string, otp: string, newPassword: string, signal: AbortSignal) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const pending = useRef(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])
  const emailMessage = submitted ? emailError(email) : ''
  const otpMessage = submitted ? otpError(otp) : ''
  const passwordMessage = submitted ? passwordError(password) : ''
  const confirmMessage = submitted ? confirmationError(password, confirm) : ''

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setSubmitted(true)
    setFeedback('')
    const invalidId = emailError(email) ? 'reset-email' : otpError(otp) ? 'reset-otp'
      : passwordError(password) ? 'reset-password' : confirmationError(password, confirm) ? 'reset-confirm' : ''
    if (invalidId) { event.currentTarget.querySelector<HTMLInputElement>(`#${invalidId}`)?.focus(); return }
    pending.current = true
    setSubmitting(true)
    const controller = new AbortController()
    active.current = controller
    try {
      await onReset(email.trim(), otp, password, controller.signal)
      if (!controller.signal.aborted) {
        setOtp(''); setPassword(''); setConfirm(''); setEmail('')
        navigate('/login')
      }
    } catch (failure) {
      if (!controller.signal.aborted) setFeedback(failure instanceof ApiError && failure.status === 400
        ? 'Mã hoặc thông tin chưa hợp lệ. Vui lòng kiểm tra lại hoặc yêu cầu mã mới.' : safeErrorMessage(failure))
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setSubmitting(false) }
      if (active.current === controller) active.current = null
    }
  }

  return <AuthScreen legal>
    <AuthCard>
      <div className="ec-card-icon"><img src={resetIcon} alt="" /></div>
      <h1>Đặt lại mật khẩu</h1>
      <p className="ec-card-description">Nhập email, mã OTP còn hiệu lực trong 15 phút và tạo mật khẩu mới.</p>
      <form className="ec-auth-form" onSubmit={submit} noValidate aria-busy={submitting}>
        <FormField label="Email" htmlFor="reset-email" error={emailMessage}>
          <TextInput id="reset-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="ten@vidu.vn" value={email} disabled={submitting} aria-invalid={!!emailMessage} onChange={(event) => { setEmail(event.target.value); setFeedback('') }} />
        </FormField>
        <FormField label="Mã OTP" htmlFor="reset-otp" error={otpMessage}>
          <TextInput id="reset-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} disabled={submitting} aria-invalid={!!otpMessage} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setFeedback('') }} />
        </FormField>
        <FormField label="Mật khẩu mới" htmlFor="reset-password" hint="Tối thiểu 12 ký tự Unicode, tối đa 1.024 byte UTF-8." error={passwordMessage}>
          <PasswordInput id="reset-password" placeholder="Nhập mật khẩu mới" value={password} onChange={(value) => { setPassword(value); setFeedback('') }} error={passwordMessage} disabled={submitting} />
        </FormField>
        <FormField label="Xác nhận mật khẩu" htmlFor="reset-confirm" error={confirmMessage}>
          <PasswordInput id="reset-confirm" placeholder="Nhập lại mật khẩu" value={confirm} onChange={(value) => { setConfirm(value); setFeedback('') }} error={confirmMessage} disabled={submitting} />
        </FormField>
        <PrimaryButton disabled={submitting}>{submitting ? 'Đang đặt lại…' : 'Cập nhật mật khẩu'}</PrimaryButton>
        {feedback && <SafeFeedback>{feedback}</SafeFeedback>}
        <AppLink to="/forgot-password" navigate={navigate} className="ec-back-link">Yêu cầu mã mới</AppLink>
      </form>
      <BackToLogin navigate={navigate} />
    </AuthCard>
  </AuthScreen>
}
