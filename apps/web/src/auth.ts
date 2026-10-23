import type { ScreenRoute } from './routes.ts'
import { matchRoute, routes, tenantPath } from './routes.ts'
import { ApiClient, ApiError } from './api.ts'

export type Tenant = { id: string; name: string }
export type Principal = { id: string; sessionId: string; tenantId: string | null; allowedTenants: Tenant[] }
export type Session = { accessToken: string; expiresAt: number; csrfToken: string; principal: Principal; tenantEpoch: number; refreshDeadline?: number; navigation?: PermissionEvidence }
export type AuthState = { status: 'checking' } | { status: 'unauthenticated'; reason?: 'session-expired' | 'access-revoked' | 'unavailable' | 'logged-out' | 'logout-unconfirmed' } | { status: 'authenticated'; session: Session }

// Consumption contract only: /auth/me currently has no navigation grants.
// Production has NO reader until the endpoint, mapping and SQL pass owner review.
export type NavigationResponse = { userId: string; sessionId: string; tenantId: string; screenIds: readonly string[]; validUntil: number }
export type PermissionEvidence = NavigationResponse & { tenantEpoch: number }
export type NavigationReader = (token: string, tenantId: string) => Promise<NavigationResponse>
type RevocationTarget = { token?: string; confirmed: boolean; uncertain: boolean }

export function canView(route: ScreenRoute, session: Session, tenantId: string, evidence?: PermissionEvidence): boolean {
  if (session.expiresAt <= Date.now() || session.principal.tenantId !== tenantId) return false
  if (!session.principal.allowedTenants.some((tenant) => tenant.id === tenantId)) return false
  if (route.selfService) return true
  return evidence?.tenantId === tenantId && evidence.userId === session.principal.id
    && evidence.sessionId === session.principal.sessionId && evidence.tenantEpoch === session.tenantEpoch
    && evidence.validUntil > Date.now() && evidence.validUntil <= session.expiresAt
    && evidence.screenIds.includes(route.id) || false
}

export function navigationRoutes(session: Session, evidence = session.navigation) {
  const tenant = session.principal.tenantId
  return tenant ? routes.filter((route) => !route.public && !route.path.replace(':tenantId', '').includes(':')
    && canView(route, session, tenant, evidence)) : []
}

export function landingPath(session: Session) {
  const tenant = session.principal.tenantId
  if (!tenant) return '/select-tenant'
  const first = navigationRoutes(session).find((route) => !route.selfService)
  return first ? first.path.replace(':tenantId', encodeURIComponent(tenant)) : tenantPath(tenant, '/me')
}

export function resolveRoute(path: string, state: AuthState, evidence = state.status === 'authenticated' ? state.session.navigation : undefined) {
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
  private active: Session | null = null
  private credential: RevocationTarget | null = null
  private pendingLogout?: { revision: number; result: Promise<boolean> }
  private queue: Promise<unknown> = Promise.resolve()
  private pendingCheck: Promise<boolean> | null = null
  private transition = 0
  private navigationReader?: NavigationReader
  constructor(api: ApiClient, navigationReader?: NavigationReader) { this.api = api; this.navigationReader = navigationReader }
  getSnapshot = () => this.current
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private set(state: AuthState) { this.current = state; this.listeners.forEach((listener) => listener()) }
  // No persisted CSRF secret exists, so a reload safely starts unauthenticated.
  finishInitialCheck() { if (this.current.status === 'checking') this.set({ status: 'unauthenticated' }) }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }
  private mutation<T>(revision: number, operation: () => Promise<T>) {
    this.transition = revision
    return this.serial(operation).finally(() => { if (this.transition === revision) this.transition = 0 })
  }
  private async revoke(target: RevocationTarget) {
    if (target.confirmed) return true
    if (!target.token) return !target.uncertain
    try {
      await this.api.logout(target.token)
      target.confirmed = true
      target.token = undefined
      return true
    } catch { return false }
  }
  private principal(value: Principal) {
    if (!value || typeof value.id !== 'string' || !value.id || typeof value.sessionId !== 'string' || !value.sessionId
      || !(value.tenantId === null || typeof value.tenantId === 'string') || !Array.isArray(value.allowedTenants)
      || value.allowedTenants.some((t) => !t || typeof t.id !== 'string' || !t.id || typeof t.name !== 'string')
      || new Set(value.allowedTenants.map((t) => t.id)).size !== value.allowedTenants.length) throw new ApiError(502, 'INVALID_PRINCIPAL')
    return value
  }
  private expiry(seconds: number, started: number, deadline = Infinity) {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 900) throw new ApiError(502, 'INVALID_SESSION')
    const expiresAt = Math.min(started + seconds * 1000 - 1000, deadline)
    if (expiresAt <= Date.now()) throw new ApiError(401, 'AUTH_REQUIRED')
    return expiresAt
  }
  private async grants(session: Session, revision: number) {
    if (!this.navigationReader || !session.principal.tenantId) return session
    try {
      const grant = await this.navigationReader(session.accessToken, session.principal.tenantId)
      if (revision !== this.revision) return session
      if (grant.userId !== session.principal.id || grant.sessionId !== session.principal.sessionId
        || grant.tenantId !== session.principal.tenantId || !Number.isFinite(grant.validUntil)
        || grant.validUntil <= Date.now() || !Array.isArray(grant.screenIds)
        || grant.screenIds.some((id) => !routes.some((route) => route.id === id && !route.public && !route.selfService))) {
        throw new ApiError(502, 'INVALID_NAVIGATION')
      }
      return { ...session, navigation: { ...grant, screenIds: [...new Set(grant.screenIds)], tenantEpoch: session.tenantEpoch,
        validUntil: Math.min(grant.validUntil, session.expiresAt, Date.now() + 60_000) } }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) throw error
      // No fallback grants on forbidden, missing contract, conflict or network error.
      return { ...session, navigation: undefined }
    }
  }
  private publish(session: Session) {
    this.active = session
    this.set({ status: 'authenticated', session })
  }
  login(email: string, password: string) {
    const revision = ++this.revision
    this.set({ status: 'checking' })
    return this.mutation(revision, async () => {
      if (revision !== this.revision) return false
      const previous = this.credential
      this.active = null
      if (previous) await this.revoke(previous)
      if (revision !== this.revision) return false
      const target: RevocationTarget = { confirmed: false, uncertain: true }
      this.credential = target
      const started = Date.now()
      let token: string | undefined
      try {
        const response = await this.api.login(email, password)
        token = response.accessToken
        target.token = token
        if (!token || !response.csrfToken) throw new ApiError(502, 'INVALID_SESSION')
        const principal = this.principal(await this.api.me(token))
        if (principal.tenantId !== null) throw new ApiError(502, 'INVALID_PRINCIPAL')
        const expiresAt = this.expiry(response.expiresInSeconds, started)
        if (revision !== this.revision || expiresAt <= Date.now()) { await this.revoke(target); return false }
        this.publish({ accessToken: token, csrfToken: response.csrfToken, expiresAt, principal, tenantEpoch: ++this.epoch,
          refreshDeadline: started + 7 * 86400_000 - 1000 })
        return true
      } catch (error) {
        if (!token && error instanceof ApiError && [400, 401, 403, 429].includes(error.status)) target.uncertain = false
        if (token) await this.revoke(target)
        if (revision !== this.revision) return false
        this.credential = null
        this.set({ status: 'unauthenticated' })
        throw error
      }
    })
  }
  selectTenant(tenantId: string) {
    const current = this.current
    if (current.status !== 'authenticated' || current.session.expiresAt <= Date.now()) return Promise.reject(new ApiError(401, 'AUTH_REQUIRED'))
    if (!current.session.principal.allowedTenants.some((t) => t.id === tenantId)) return Promise.reject(new ApiError(403, 'FORBIDDEN'))
    const revision = ++this.revision
    // Hide old tenant and grants immediately, before the network request starts.
    this.set({ status: 'authenticated', session: { ...current.session, navigation: undefined,
      principal: { ...current.session.principal, tenantId: null }, tenantEpoch: ++this.epoch } })
    return this.mutation(revision, async () => {
      if (revision !== this.revision) return false
      const active = this.active
      const target = this.credential
      if (!active || !target) throw new ApiError(401, 'AUTH_REQUIRED')
      let rotated: string | undefined
      try {
        const started = Date.now()
        const response = await this.api.selectTenant(active.accessToken, tenantId)
        rotated = response.accessToken
        target.token = rotated
        target.confirmed = false
        const principal = this.principal(response.principal)
        if (!rotated || principal.id !== active.principal.id || principal.sessionId !== active.principal.sessionId
          || principal.tenantId !== tenantId || !principal.allowedTenants.some((t) => t.id === tenantId)) {
          throw new Error('INVALID_TENANT_RESPONSE')
        }
        const selected: Session = { ...active, accessToken: rotated, expiresAt: this.expiry(response.expiresInSeconds, started, active.refreshDeadline),
          principal, navigation: undefined, tenantEpoch: ++this.epoch }
        // Preserve a rotated token for a queued newer selection; never render it.
        if (revision !== this.revision) {
          if (this.current.status === 'authenticated') this.active = selected
          else await this.revoke(target)
          return false
        }
        this.active = selected
        const ready = await this.grants(selected, revision)
        if (revision !== this.revision) return false
        this.publish(ready)
        return true
      } catch (error) {
        if (rotated) await this.revoke(target)
        if (revision !== this.revision) return false
        // Only a definite denial leaves the old unselected credential usable.
        if (!(error instanceof ApiError) || ![400, 403, 404, 409, 422, 429].includes(error.status)) this.expire()
        throw error
      }
    })
  }
  refresh() { return this.revalidate(true) }
  revalidate(refresh = false) {
    // Background maintenance must not supersede an explicit login/tenant choice.
    if (this.transition && this.transition === this.revision) return Promise.resolve(false)
    if (this.pendingCheck) return this.pendingCheck
    if (this.current.status !== 'authenticated') return Promise.resolve(false)
    const revision = ++this.revision
    this.set({ status: 'authenticated', session: { ...this.current.session, navigation: undefined } })
    const pending = this.serial(async () => {
      if (revision !== this.revision) return false
      const active = this.active
      const target = this.credential
      if (!active || !target) return false
      let token = active.accessToken
      try {
        const started = Date.now()
        const response = refresh ? await this.api.refresh(active.csrfToken) : null
        token = response?.accessToken ?? active.accessToken
        if (response) { target.token = response.accessToken; target.confirmed = false }
        const principal = this.principal(await this.api.me(token))
        if (principal.id !== active.principal.id || principal.sessionId !== active.principal.sessionId
          || principal.tenantId !== active.principal.tenantId || (principal.tenantId !== null
            && !principal.allowedTenants.some((t) => t.id === principal.tenantId))) throw new ApiError(401, 'ACCESS_REVOKED')
        if (response && (!response.accessToken || !response.csrfToken)) throw new ApiError(502, 'INVALID_SESSION')
        const next: Session = { ...active, principal, accessToken: token, navigation: undefined, tenantEpoch: ++this.epoch,
          csrfToken: response?.csrfToken ?? active.csrfToken,
          expiresAt: response ? this.expiry(response.expiresInSeconds, started, active.refreshDeadline) : active.expiresAt }
        if (revision !== this.revision) {
          if (this.current.status === 'authenticated') this.active = next
          else if (response) await this.revoke(target)
          return false
        }
        this.active = next
        const ready = await this.grants(next, revision)
        if (revision !== this.revision) return false
        this.publish(ready)
        return true
      } catch (error) {
        if (revision !== this.revision) { await this.revoke(target); return false }
        this.expire(error instanceof ApiError && error.status === 401 ? 'access-revoked' : 'unavailable')
        await this.revoke(target)
        throw error
      }
    })
    this.pendingCheck = pending.finally(() => { this.pendingCheck = null })
    return this.pendingCheck
  }
  logout() {
    if (this.pendingLogout?.revision === this.revision) return this.pendingLogout.result
    const revision = ++this.revision
    // Shared only with in-flight auth work: token rotations update this target
    // even after the visible session and controller credential are cleared.
    const target = this.credential
    this.active = null
    this.credential = null
    ++this.epoch
    this.set({ status: 'unauthenticated', reason: 'logged-out' })
    const result = this.serial(async () => {
      const ok = !target || await this.revoke(target)
      if (!ok && revision === this.revision) this.set({ status: 'unauthenticated', reason: 'logout-unconfirmed' })
      return ok
    })
    this.pendingLogout = { revision, result }
    return result
  }
  expire(reason: 'session-expired' | 'access-revoked' | 'unavailable' = 'session-expired') {
    ++this.revision; ++this.epoch; this.active = null; this.credential = null; this.set({ status: 'unauthenticated', reason })
  }
}
