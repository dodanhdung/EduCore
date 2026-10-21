import { useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import brandIcon from './assets/au01-brand.svg'
import mobileBrandIcon from './assets/au01-brand-mobile.svg'
import badgeIcon from './assets/au01-badge.svg'
import emailIcon from './assets/au01-email.svg'
import passwordIcon from './assets/au01-password.svg'
import eyeIcon from './assets/au01-eye.svg'
import arrowIcon from './assets/au01-arrow.svg'
import { validateLogin } from './loginValidation.ts'
import './LoginScreen.css'

export type LoginFeedback = 'invalid_credentials' | 'inactive_account' | 'rate_limited' | 'server_error' | 'success_handoff'

const feedbackCopy: Record<LoginFeedback, string> = {
  invalid_credentials: 'Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.',
  inactive_account: 'Không thể đăng nhập bằng tài khoản này. Vui lòng liên hệ trung tâm nếu cần hỗ trợ.',
  rate_limited: 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
  server_error: 'Chưa thể đăng nhập lúc này. Vui lòng thử lại sau.',
  success_handoff: 'Đã xác thực. Đang chờ chuyển sang bước tiếp theo.',
}

function Brand() {
  return <div className="login-brand"><span className="login-brand-icon"><img className="login-brand-desktop" src={brandIcon} alt="" /><img className="login-brand-mobile" src={mobileBrandIcon} alt="" /></span><span>EduCore</span></div>
}

export function LoginScreen({ navigate, onSubmit, feedback }: {
  navigate: (path: string) => void
  onSubmit?: (email: string, password: string) => Promise<void>
  feedback?: LoginFeedback
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [errors, setErrors] = useState({ email: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [localFeedback, setLocalFeedback] = useState<LoginFeedback | 'pending_integration' | null>(null)
  const currentFeedback = localFeedback ?? feedback

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return
    const next = validateLogin(email, password)
    setErrors(next)
    setLocalFeedback(null)
    if (next.email || next.password) return
    if (!onSubmit) { setLocalFeedback('pending_integration'); return }
    setSubmitting(true)
    try { await onSubmit(email.trim(), password) }
    catch { setLocalFeedback('server_error') }
    finally { setSubmitting(false) }
  }

  function forgotPassword(event: MouseEvent<HTMLAnchorElement>) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate('/forgot-password')
  }

  return <div className="login-page">
    <header className="login-header"><Brand /></header>
    <main className="login-main">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-intro">
          <span className="login-badge"><img src={badgeIcon} alt="" /></span>
          <h1 id="login-title">Đăng nhập tài khoản</h1>
          <p className="login-subtitle">Đăng nhập để tiếp tục sử dụng EduCore.</p>
        </div>
        <form className="login-form" onSubmit={submit} noValidate>
          <div className="login-field">
            <label htmlFor="login-email">Địa chỉ email <span aria-hidden="true">*</span></label>
            <div className="login-input-wrap">
              <img className="login-input-icon" src={emailIcon} alt="" />
              <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" placeholder="name@example.com" required value={email} aria-invalid={!!errors.email} aria-describedby={errors.email ? 'login-email-error' : undefined} onChange={(event) => { setEmail(event.target.value); setErrors((old) => ({ ...old, email: '' })); setLocalFeedback(null) }} />
            </div>
            {errors.email && <p className="login-field-error" id="login-email-error">{errors.email}</p>}
          </div>
          <div className="login-field">
            <div className="login-password-heading"><label htmlFor="login-password">Mật khẩu <span aria-hidden="true">*</span></label><a href="/forgot-password" onClick={forgotPassword}>Quên mật khẩu?</a></div>
            <div className="login-input-wrap">
              <img className="login-input-icon" src={passwordIcon} alt="" />
              <input id="login-password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="Nhập mật khẩu" required value={password} aria-invalid={!!errors.password} aria-describedby={errors.password ? 'login-password-error' : undefined} onChange={(event) => { setPassword(event.target.value); setErrors((old) => ({ ...old, password: '' })); setLocalFeedback(null) }} />
              <button className="login-visibility" type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} onClick={() => setVisible((old) => !old)}><img src={eyeIcon} alt="" /></button>
            </div>
            {errors.password && <p className="login-field-error" id="login-password-error">{errors.password}</p>}
          </div>
          <button className="login-submit" type="submit" disabled={submitting} aria-busy={submitting}>{submitting ? 'Đang đăng nhập…' : 'Đăng nhập'}{!submitting && <img src={arrowIcon} alt="" />}</button>
          {currentFeedback && <p className={`login-feedback ${currentFeedback === 'success_handoff' ? 'login-feedback-info' : ''}`} role={currentFeedback === 'success_handoff' || currentFeedback === 'pending_integration' ? 'status' : 'alert'}>{currentFeedback === 'pending_integration' ? 'Chức năng đăng nhập chưa được kết nối. Vui lòng thử lại sau.' : feedbackCopy[currentFeedback]}</p>}
        </form>
      </section>
      <p className="login-mobile-help">Nếu không đăng nhập được, hãy thử lại hoặc đặt lại mật khẩu.</p>
    </main>
    <footer className="login-footer">© EduCore. Tất cả quyền được bảo lưu.</footer>
  </div>
}
