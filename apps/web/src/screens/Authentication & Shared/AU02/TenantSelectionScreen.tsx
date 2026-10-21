import { useState } from 'react'
import type { Tenant } from '../../../auth.ts'
import { SafeFeedback } from '../AuthComponents.tsx'
import { AuthCard, AuthScreen, ScreenHeading, type Navigate } from '../BatchPrimitives.tsx'

export function TenantSelectionScreen({ tenants, onSelect, navigate }: {
  tenants: Tenant[]
  onSelect: (id: string) => Promise<void>
  navigate: Navigate
}) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function chooseTenant(id: string) {
    setBusy(id)
    setError('')
    try {
      await onSelect(id)
      navigate(`/app/${encodeURIComponent(id)}/me`)
    } catch {
      setError('Không thể chọn trung tâm lúc này. Vui lòng thử lại.')
    } finally {
      setBusy('')
    }
  }

  return <AuthScreen wide>
    <ScreenHeading title="Chọn trung tâm" detail="Chọn trung tâm bạn muốn truy cập." />
    <AuthCard>
      <div className="ec-tenant-list">
        {tenants.map((tenant) => <button className="ec-tenant-choice" key={tenant.id} disabled={!!busy} onClick={() => void chooseTenant(tenant.id)}>
          <span className="ec-tenant-avatar" aria-hidden="true">{tenant.name.slice(0, 1).toUpperCase()}</span>
          <span><strong>{tenant.name}</strong><small>Trung tâm EduCore</small></span><span aria-hidden="true">›</span>
        </button>)}
      </div>
      {!tenants.length && <SafeFeedback tone="info">Tài khoản hiện không có trung tâm được cấp quyền.</SafeFeedback>}
      {error && <SafeFeedback>{error}</SafeFeedback>}
    </AuthCard>
  </AuthScreen>
}
