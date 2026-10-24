import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, safeErrorMessage } from '../../../api.ts'
import { FormField, PasswordInput, PrimaryButton, SafeFeedback, TextInput } from '../AuthComponents.tsx'
import { AuthCard, AuthScreen, BackToLogin, ScreenHeading, type Navigate } from '../BatchPrimitives.tsx'
import { confirmationError, emailError, otpError, passwordError } from '../authFormValidation.ts'

type Errors = { email: string; otp: string; password: string; confirm: string }
const noErrors: Errors = { email: '', otp: '', password: '', confirm: '' }

export function ActivationScreen({ navigate, onRequest, onActivate }: {
  navigate: Navigate
  onRequest: (email: string, signal: AbortSignal) => Promise<void>
  onActivate: (email: string, otp: string, newPassword: string, signal: AbortSignal) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Errors>(noErrors)
  const [pendingAction, setPendingAction] = useState<'otp' | 'activation' | null>(null)
  const [accepted, setAccepted] = useState(false)
  const [feedback, setFeedback] = useState('')
  const pending = useRef(false)
  const active = useRef<AbortController | null>(null)
  useEffect(() => () => active.current?.abort(), [])

  async function requestOtp() {
    if (pending.current) return
    const error = emailError(email)
    setErrors({ ...noErrors, email: error })
    setAccepted(false)
    setFeedback('')
    if (error) { document.getElementById('activate-email')?.focus(); return }
    pending.current = true
    setPendingAction('otp')
    const controller = new AbortController()
    active.current = controller
    try {
      await onRequest(email.trim(), controller.signal)
      if (!controller.signal.aborted) setAccepted(true)
    } catch (failure) {
      if (!controller.signal.aborted) setFeedback(failure instanceof ApiError && failure.status === 400
        ? 'Địa chỉ email chưa hợp lệ. Vui lòng kiểm tra lại.' : safeErrorMessage(failure))
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setPendingAction(null) }
      if (active.current === controller) active.current = null
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const nextErrors = {
      email: emailError(email),
      otp: otpError(otp),
      password: passwordError(password),
      confirm: confirmationError(password, confirm),
    }
    setErrors(nextErrors)
    setFeedback('')
    const invalid = (Object.keys(nextErrors) as (keyof Errors)[]).find((key) => nextErrors[key])
    if (invalid) { event.currentTarget.querySelector<HTMLInputElement>(`#activate-${invalid}`)?.focus(); return }
    pending.current = true
    setPendingAction('activation')
    const controller = new AbortController()
    active.current = controller
    try {
      await onActivate(email.trim(), otp, password, controller.signal)
      if (!controller.signal.aborted) {
        setEmail(''); setOtp(''); setPassword(''); setConfirm(''); setAccepted(false)
        navigate('/login')
      }
    } catch (failure) {
      if (!controller.signal.aborted) setFeedback(failure instanceof ApiError && failure.status === 400
        ? 'Mã hoặc thông tin chưa hợp lệ. Vui lòng kiểm tra lại hoặc yêu cầu mã mới.' : safeErrorMessage(failure))
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setPendingAction(null) }
      if (active.current === controller) active.current = null
    }
  }

  const busy = pendingAction !== null
  return <AuthScreen legal>
    <ScreenHeading title="Kích hoạt tài khoản" detail="Xác minh email bằng OTP và thiết lập mật khẩu." />
    <AuthCard>
      <form className="ec-auth-form" onSubmit={submit} noValidate aria-busy={busy}>
        <FormField label="Email" htmlFor="activate-email" error={errors.email}>
          <TextInput id="activate-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="ten@vidu.vn" value={email} disabled={busy} aria-invalid={!!errors.email} onChange={(event) => { setEmail(event.target.value); setErrors((current) => ({ ...current, email: '' })); setAccepted(false); setFeedback('') }} />
        </FormField>
        <button type="button" className="ec-inline-action" disabled={busy} onClick={requestOtp}>{pendingAction === 'otp' ? 'Đang tiếp nhận…' : 'Gửi mã OTP'}</button>
        {accepted && <SafeFeedback tone="info">Nếu tài khoản đủ điều kiện, mã có thể được gửi đến email. Nếu chưa nhận mã, kiểm tra thư rác và thử lại sau ít nhất 1 phút.</SafeFeedback>}
        <FormField label="Mã OTP" htmlFor="activate-otp" error={errors.otp}>
          <TextInput id="activate-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={otp} disabled={busy} aria-invalid={!!errors.otp} onChange={(event) => { setOtp(event.target.value.replace(/\D/g, '').slice(0, 6)); setErrors((current) => ({ ...current, otp: '' })); setFeedback('') }} />
        </FormField>
        <FormField label="Mật khẩu mới" htmlFor="activate-password" hint="Tối thiểu 12 ký tự Unicode, tối đa 1.024 byte UTF-8." error={errors.password}>
          <PasswordInput id="activate-password" placeholder="Tạo mật khẩu" value={password} disabled={busy} onChange={(value) => { setPassword(value); setErrors((current) => ({ ...current, password: '', confirm: '' })); setFeedback('') }} error={errors.password} />
        </FormField>
        <FormField label="Xác nhận mật khẩu" htmlFor="activate-confirm" error={errors.confirm}>
          <PasswordInput id="activate-confirm" placeholder="Nhập lại mật khẩu" value={confirm} disabled={busy} onChange={(value) => { setConfirm(value); setErrors((current) => ({ ...current, confirm: '' })); setFeedback('') }} error={errors.confirm} />
        </FormField>
        {feedback && <SafeFeedback>{feedback}</SafeFeedback>}
        <PrimaryButton disabled={busy}>{pendingAction === 'activation' ? 'Đang kích hoạt…' : 'Kích hoạt tài khoản'}</PrimaryButton>
      </form>
      <BackToLogin navigate={navigate} />
    </AuthCard>
  </AuthScreen>
}
