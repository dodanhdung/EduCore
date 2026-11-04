import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { bindBusinessCredential } from './api.ts'
import { canView } from './auth.ts'
import type { SessionController } from './auth.ts'
import { matchRoute } from './routes.ts'

function sessionIdentity(controller: SessionController) {
  const state = controller.getSnapshot()
  return state.status === 'authenticated' ? JSON.stringify([state.session.principal.id, state.session.principal.sessionId, state.session.principal.tenantId, state.session.tenantEpoch]) : ''
}

/** Retain the page, never retain authority: every request reads the live controller. */
export function SessionPage({ controller, identity, path, paused, unavailable, children }: {
  controller: SessionController; identity: string; path: string; paused: boolean; unavailable: boolean; children: (credential: string) => ReactNode
}) {
  const [credential] = useState(() => `educore-page:${crypto.randomUUID()}`)
  const veil = useRef<HTMLDialogElement | null>(null)
  const focus = useRef<HTMLElement | null>(null)
  useLayoutEffect(() => bindBusinessCredential(credential, tenantId => {
    const current = controller.getSnapshot(), route = matchRoute(path)
    if (current.status !== 'authenticated' || sessionIdentity(controller) !== identity || !route || route.tenantId !== tenantId
      || !canView(route.route, current.session, tenantId, current.session.navigation)) return null
    return current.session.accessToken
  }), [controller, credential, identity, path])
  useLayoutEffect(() => {
    if (!paused) return
    focus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = veil.current
    const preventCancel = (event: Event) => event.preventDefault()
    dialog?.addEventListener('cancel', preventCancel)
    if (typeof veil.current?.showModal === 'function') veil.current.showModal()
    else veil.current?.setAttribute('open', '')
    return () => { dialog?.removeEventListener('cancel', preventCancel); if (focus.current?.isConnected) focus.current.focus({ preventScroll: true }) }
  }, [paused])
  return <>
    <style>{'.session-page[data-paused="true"] dialog,.session-page[data-paused="true"] [popover]{visibility:hidden!important;pointer-events:none!important}'}</style>
    <div className="session-page" data-paused={paused} inert={paused} aria-hidden={paused || undefined} style={{ visibility: paused ? 'hidden' : undefined }}>
      {children(credential)}
    </div>
    {paused && <dialog ref={veil} aria-labelledby="session-reconnect-title" onCancel={event => event.preventDefault()} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() } }}
      style={{ position: 'fixed', inset: 0, margin: 0, border: 0, boxSizing: 'border-box', padding: 24, width: '100vw', height: '100dvh', maxWidth: 'none', maxHeight: 'none', background: 'var(--ec-background, #f8fafc)', color: 'var(--ec-foreground, #0f172a)', zIndex: 10000 }}>
      <div role="status"><h1 id="session-reconnect-title">{unavailable ? 'Chưa thể kết nối để xác minh quyền truy cập' : 'Đang xác minh quyền truy cập'}</h1>
        <p>Nội dung được tạm ẩn và các thao tác bị khóa. Dữ liệu bạn đang nhập vẫn được giữ trong trang này.</p></div>
      {unavailable && <button type="button" style={{ minHeight: 44, padding: '10px 16px', cursor: 'pointer', font: 'inherit' }} onClick={() => { void controller.revalidate().catch(() => {}) }}>Thử kết nối lại</button>}
    </dialog>}
  </>
}
