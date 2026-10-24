import { useState, type InputHTMLAttributes, type ReactNode } from 'react'
import brandIcon from './AU01/assets/au01-brand.svg'
import mobileBrandIcon from './AU01/assets/au01-brand-mobile.svg'
import './AuthComponents.css'

export function EduCoreBrand() {
  return <div className="ec-brand"><span className="ec-brand-icon"><img className="ec-brand-desktop" src={brandIcon} alt="" /><img className="ec-brand-mobile" src={mobileBrandIcon} alt="" /></span><span>EduCore</span></div>
}

export function AuthPageLayout({ children, legal = false, className = '' }: { children: ReactNode; legal?: boolean; className?: string }) {
  return <div className={`ec-auth-page ${legal ? 'ec-auth-page-legal' : ''} ${className}`}>
    <header className="ec-auth-header"><EduCoreBrand />{legal && <div className="ec-legal-links" aria-label="Thông tin pháp lý">
      <span>Trợ giúp</span><span>Điều khoản</span><span>Bảo mật</span><span className="ec-profile-mark" aria-hidden="true">●</span>
    </div>}</header>
    <main className="ec-auth-main">{children}</main>
    <footer className="ec-auth-footer">© 2026 EduCore. Tất cả quyền được bảo lưu.</footer>
  </div>
}

export function FormField({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  return <div className="ec-form-field">
    <label htmlFor={htmlFor}>{label} <span aria-hidden="true">*</span></label>
    {children}
    {hint && <p className="ec-field-hint">{hint}</p>}
    {error && <p className="ec-field-error" id={`${htmlFor}-error`}>{error}</p>}
  </div>
}

export function TextInput({ id, className = '', ...props }: InputHTMLAttributes<HTMLInputElement> & { id: string }) {
  return <input id={id} className={`ec-text-input ${className}`} aria-describedby={props['aria-describedby'] ?? (props['aria-invalid'] ? `${id}-error` : undefined)} {...props} />
}

export function PasswordInput({ id, placeholder, value, onChange, error, disabled = false }: { id: string; placeholder: string; value: string; onChange: (value: string) => void; error?: string; disabled?: boolean }) {
  const [visible, setVisible] = useState(false)
  return <div className="ec-password-input">
    <input id={id} type={visible ? 'text' : 'password'} autoComplete="new-password" placeholder={placeholder} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    <button type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={visible} disabled={disabled} onClick={() => setVisible((current) => !current)}>{visible ? 'Ẩn' : 'Hiện'}</button>
  </div>
}

export function PrimaryButton({ children, disabled = false, type = 'submit' }: { children: ReactNode; disabled?: boolean; type?: 'button' | 'submit' }) {
  return <button className="ec-primary-button" type={type} disabled={disabled}>{children}</button>
}

export function SafeFeedback({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'info' | 'warning' }) {
  return <p className={`ec-feedback ec-feedback-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>{children}</p>
}
