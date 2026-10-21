import type { ScreenRoute } from './routes.ts'
import { matchRoute } from './routes.ts'
import { ApiClient } from './api.ts'

export type Tenant = { id: string; name: string }
export type Principal = { id: string; sessionId: string; tenantId: string | null; allowedTenants: Tenant[] }
export type Session = { accessToken: string; expiresAt: number; csrfToken: string; principal: Principal; tenantEpoch: number }
export type AuthState = { status: 'checking' } | { status: 'unauthenticated' } | { status: 'authenticated'; session: Session }

// Reserved for a future server-authoritative grant contract. The current /auth/me has no grants.
export type PermissionEvidence = { tenantId: string; screenIds: readonly string[] }

export function canView(route: ScreenRoute, session: Session, tenantId: string, evidence?: PermissionEvidence): boolean {
  if (session.expiresAt <= Date.now() || session.principal.tenantId !== tenantId) return false
  if (!session.principal.allowedTenants.some((tenant) => tenant.id === tenantId)) return false
  if (route.selfService) return true
  return evidence?.tenantId === tenantId && evidence.screenIds.includes(route.id) || false
}

export function resolveRoute(path: string, state: AuthState, evidence?: PermissionEvidence) {
  const matched = matchRoute(path)
  if (!matched) return { kind: 'not-found' as const }
  if (matched.route.public && matched.route.id !== 'AU02') return { kind: 'public' as const, route: matched.route }
  if (state.status === 'checking') return { kind: 'checking' as const }
  if (state.status === 'unauthenticated') return { kind: 'unauthenticated' as const }
  // An expired access token requires re-authentication, not an HTTP 403-style denial.
  // Keep the existing 'unauthenticated' UI branch compatible; the reason allows specific copy.
  if (state.session.expiresAt <= Date.now()) return { kind: 'unauthenticated' as const, reason: 'session-expired' as const }
  if (matched.route.id === 'AU02') return { kind: 'tenant-selection' as const, route: matched.route }
  if (!matched.tenantId || !canView(matched.route, state.session, matched.tenantId, evidence)) return { kind: 'forbidden' as const }
  return { kind: 'screen' as const, route: matched.route, tenantId: matched.tenantId, params: matched.params }
}

export class SessionController {
  private current: AuthState = { status: 'checking' }
  private listeners = new Set<() => void>()
  private revision = 0
  private epoch = 0
  private api: ApiClient
  constructor(api: ApiClient) { this.api = api }
  getSnapshot = () => this.current
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(state: AuthState) { this.current = state; this.listeners.forEach((listener) => listener()) }
  // No persisted CSRF secret exists, so a reload safely starts unauthenticated.
  finishInitialCheck() { if (this.current.status === 'checking') this.set({ status: 'unauthenticated' }) }
  async login(email: string, password: string) {
    const revision = ++this.revision
    this.set({ status: 'checking' })
    try {
      const response = await this.api.login(email, password)
      const principal = await this.api.me(response.accessToken)
      if (revision !== this.revision) return
      this.set({ status: 'authenticated', session: {
        accessToken: response.accessToken, csrfToken: response.csrfToken,
        expiresAt: Date.now() + response.expiresInSeconds * 1000,
        principal, tenantEpoch: ++this.epoch,
      } })
    } catch (error) {
      if (revision === this.revision) this.set({ status: 'unauthenticated' })
      throw error
    }
  }
  async selectTenant(tenantId: string) {
    const current = this.current
    if (current.status !== 'authenticated') throw new Error('AUTH_REQUIRED')
    const revision = ++this.revision
    let response
    try { response = await this.api.selectTenant(current.session.accessToken, tenantId) }
    catch (error) {
      if (revision === this.revision && error instanceof Error && 'status' in error && error.status === 401) this.expire()
      throw error
    }
    if (revision !== this.revision) return
    const principal = response.principal
    if (principal.tenantId !== tenantId || !principal.allowedTenants.some((tenant) => tenant.id === tenantId)) {
      this.set({ status: 'unauthenticated' })
      throw new Error('INVALID_TENANT_RESPONSE')
    }
    this.set({ status: 'authenticated', session: {
      ...current.session, accessToken: response.accessToken,
      expiresAt: Date.now() + response.expiresInSeconds * 1000,
      principal, tenantEpoch: ++this.epoch,
    } })
  }
  async logout() {
    const current = this.current
    ++this.revision
    ++this.epoch
    this.set({ status: 'unauthenticated' })
    if (current.status === 'authenticated') {
      try { await this.api.logout(current.session.accessToken) } catch { /* Local access is cleared even if revocation fails. */ }
    }
  }
  expire() { ++this.revision; ++this.epoch; this.set({ status: 'unauthenticated' }) }
}
