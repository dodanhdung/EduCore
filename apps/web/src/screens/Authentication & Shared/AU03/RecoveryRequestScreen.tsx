import { useState, type FormEvent } from 'react'
import { FormField, PrimaryButton, SafeFeedback, TextInput } from '../AuthComponents.tsx'
import { AuthCard, AuthScreen, BackToLogin, ScreenHeading, type Navigate } from '../BatchPrimitives.tsx'
import { emailError } from '../authFormValidation.ts'
import recoveryIcon from './assets/recovery.svg'

export function RecoveryRequestScreen({ navigate }: { navigate: Navigate }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = emailError(email)
    if (validationError) {
      setError(validationError)
      setPending(false)
      return
    }
    setError('')
    setPending(true)
  }

  return <AuthScreen>
    <ScreenHeading title="Quên mật khẩu?" detail="Nhập email tài khoản để nhận hướng dẫn khôi phục." />
    <AuthCard>
      <div className="ec-card-icon"><img src={recoveryIcon} alt="" /></div>
      <h1>Khôi phục mật khẩu</h1>
      <p className="ec-card-description">Nếu tài khoản phù hợp, hướng dẫn sẽ được gửi đến email.</p>
      <form className="ec-auth-form" onSubmit={submit} noValidate>
        <FormField label="Email" htmlFor="recovery-email" error={error}>
          <TextInput id="recovery-email" type="email" inputMode="email" autoComplete="email" placeholder="ten@vidu.vn" value={email} onChange={(event) => { setEmail(event.target.value); setError(''); setPending(false) }} aria-invalid={!!error} />
        </FormField>
        <PrimaryButton>Gửi mã xác minh</PrimaryButton>
        {pending && <SafeFeedback tone="warning">PENDING_API: chưa gửi yêu cầu vì dịch vụ khôi phục chưa được tích hợp.</SafeFeedback>}
      </form>
      <BackToLogin navigate={navigate} />
    </AuthCard>
  </AuthScreen>
}
