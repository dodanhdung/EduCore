import { useRef, useState } from 'react'
import type { Tenant } from '../../../auth.ts'
import { safeErrorMessage } from '../../../api.ts'
import { SafeFeedback } from '../AuthComponents.tsx'
import { AuthCard, AuthScreen, ScreenHeading, type Navigate } from '../BatchPrimitives.tsx'

export function TenantSelectionScreen({ tenants, onSelect, navigate }: {
  tenants: Tenant[]
  onSelect: (id: string) => Promise<void | boolean | string>
  navigate: Navigate
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const pending = useRef(false)

  async function chooseTenant(id: string) {
    if (pending.current) return
    pending.current = true
    setBusy(id)
    setError('')
    try {
      const destination = await onSelect(id)
      if (destination !== false) navigate(typeof destination === 'string' ? destination : `/app/${encodeURIComponent(id)}/me`)
    } catch (error) {
      setError(safeErrorMessage(error, 'tenant'))
    } finally {
      pending.current = false
      setBusy('')
    }
  }

  return <AuthScreen wide>
    <ScreenHeading title="Chọn trung tâm" detail="Chọn trung tâm bạn muốn truy cập." />
    <AuthCard>
      <div className="ec-tenant-list" aria-busy={!!busy}>
        {tenants.map((tenant) => <button className="ec-tenant-choice" key={tenant.id} disabled={!!busy} onClick={() => void chooseTenant(tenant.id)}>
          <span className="ec-tenant-avatar" aria-hidden="true">{tenant.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{tenant.name}</strong><small>Trung tâm EduCore</small></span><span aria-hidden="true">›</span>
        </button>)}
      </div>
      {busy && <p role="status">Đang chọn trung tâm…</p>}
      {!tenants.length && <SafeFeedback tone="info">Tài khoản hiện không có trung tâm được cấp quyền.</SafeFeedback>}
      {error && <SafeFeedback>{error}</SafeFeedback>}
    </AuthCard>
  </AuthScreen>
}
