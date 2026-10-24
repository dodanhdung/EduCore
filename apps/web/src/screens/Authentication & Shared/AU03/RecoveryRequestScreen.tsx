import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ApiError, safeErrorMessage } from '../../../api.ts'
import { FormField, PrimaryButton, SafeFeedback, TextInput } from '../AuthComponents.tsx'
import { AppLink, AuthCard, AuthScreen, BackToLogin, ScreenHeading, type Navigate } from '../BatchPrimitives.tsx'
import { emailError } from '../authFormValidation.ts'
import recoveryIcon from './assets/recovery.svg'

export function RecoveryRequestScreen({ navigate, onRequest }: {
  navigate: Navigate; onRequest: (email: string, signal: AbortSignal) => Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const pending = useRef(false)
  const active = useRef<AbortController | null>(null)
  const nextLink = useRef<HTMLAnchorElement>(null)
  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => { if (accepted) nextLink.current?.focus() }, [accepted])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    const validationError = emailError(email)
    setError(validationError)
    setFeedback('')
    setAccepted(false)
    if (validationError) { event.currentTarget.querySelector<HTMLInputElement>('#recovery-email')?.focus(); return }
    pending.current = true
    setSubmitting(true)
    const controller = new AbortController()
    active.current = controller
    try {
      await onRequest(email.trim(), controller.signal)
      if (!controller.signal.aborted) setAccepted(true)
    } catch (failure) {
      if (!controller.signal.aborted) setFeedback(failure instanceof ApiError && failure.status === 400
        ? 'Địa chỉ email chưa hợp lệ. Vui lòng kiểm tra lại.' : safeErrorMessage(failure))
    } finally {
      if (!controller.signal.aborted) { pending.current = false; setSubmitting(false) }
      if (active.current === controller) active.current = null
    }
  }

  return <AuthScreen>
    <ScreenHeading title="Quên mật khẩu?" detail="Nhập email tài khoản để yêu cầu mã khôi phục." />
    <AuthCard>
      <div className="ec-card-icon"><img src={recoveryIcon} alt="" /></div>
      <h1>Khôi phục mật khẩu</h1>
      <p className="ec-card-description">Nếu tài khoản đủ điều kiện, mã OTP một lần có thể được gửi qua email.</p>
      <form className="ec-auth-form" onSubmit={submit} noValidate aria-busy={submitting}>
        <FormField label="Email" htmlFor="recovery-email" error={error}>
          <TextInput id="recovery-email" type="email" inputMode="email" autoComplete="email" maxLength={254} placeholder="ten@vidu.vn" value={email} disabled={submitting} onChange={(event) => { setEmail(event.target.value); setError(''); setFeedback(''); setAccepted(false) }} aria-invalid={!!error} />
        </FormField>
        <PrimaryButton disabled={submitting}>{submitting ? 'Đang tiếp nhận…' : 'Gửi mã xác minh'}</PrimaryButton>
        {feedback && <SafeFeedback>{feedback}</SafeFeedback>}
        {accepted && <>
          <SafeFeedback tone="info">Nếu tài khoản đủ điều kiện, mã có thể được gửi đến email. Vui lòng kiểm tra hộp thư và thư rác.</SafeFeedback>
          <AppLink to="/reset-password" navigate={navigate} className="ec-back-link" ref={nextLink}>Nhập mã và đặt lại mật khẩu</AppLink>
        </>}
      </form>
      <BackToLogin navigate={navigate} />
    </AuthCard>
  </AuthScreen>
}
