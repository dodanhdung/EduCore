import type { Principal, Tenant } from './auth.ts'

export type LoginResponse = { user: { id: string; displayName: string }; allowedTenants: Tenant[]; requiresTenantSelection: true; accessToken: string; expiresInSeconds: number; csrfToken: string }
export type SelectTenantResponse = { accessToken: string; expiresInSeconds: number; principal: Principal }
export type RefreshResponse = { accessToken: string; expiresInSeconds: number; csrfToken: string }
type ErrorBody = { code?: string; message?: string; correlationId?: string }

export class ApiError extends Error {
  status: number
  code: string
  correlationId?: string
  constructor(status: number, code: string, correlationId?: string) {
    super(code)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.correlationId = correlationId
  }
}

export class ApiClient {
  private baseUrl: string
  private transport: typeof fetch
  constructor(baseUrl = '', transport: typeof fetch = fetch) {
    this.baseUrl = baseUrl
    this.transport = transport
  }

  async request<T>(path: string, options: {
    method?: 'GET' | 'POST'; body?: unknown; accessToken?: string; csrfToken?: string;
    credentials?: 'include' | 'omit'; signal?: AbortSignal
  } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`
    if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: options.credentials ?? 'omit', signal: options.signal,
    })
    const requestId = response.headers.get('x-request-id') ?? undefined
    if (response.status === 204) {
      if (!response.ok) throw new ApiError(response.status, 'HTTP_ERROR', requestId)
      return undefined as T
    }
    const raw = await response.text()
    let data: unknown
    try { data = raw ? JSON.parse(raw) : undefined } catch { throw new ApiError(response.status, 'INVALID_RESPONSE', requestId) }
    if (!response.ok) {
      const error = data && typeof data === 'object' ? data as ErrorBody : {}
      throw new ApiError(response.status, typeof error.code === 'string' ? error.code : 'HTTP_ERROR', error.correlationId ?? requestId)
    }
    if (data === undefined) throw new ApiError(response.status, 'INVALID_RESPONSE', requestId)
    return data as T
  }

  login(email: string, password: string, signal?: AbortSignal) {
    return this.request<LoginResponse>('/api/v1/auth/login', { method: 'POST', body: { email, password }, credentials: 'include', signal })
  }
  me(accessToken: string, signal?: AbortSignal) {
    return this.request<Principal>('/api/v1/auth/me', { accessToken, signal })
  }
  selectTenant(accessToken: string, tenantId: string, signal?: AbortSignal) {
    return this.request<SelectTenantResponse>('/api/v1/auth/select-tenant', { method: 'POST', body: { tenantId }, accessToken, signal })
  }
  logout(accessToken: string) {
    return this.request<void>('/api/v1/auth/logout', { method: 'POST', accessToken, credentials: 'include' })
  }
  // Refresh is only callable with the CSRF token returned by login/refresh.
  // No token is persisted, so page reload requires a fresh login until a secure bootstrap contract exists.
  refresh(csrfToken: string, signal?: AbortSignal) {
    return this.request<RefreshResponse>('/api/v1/auth/refresh', { method: 'POST', csrfToken, credentials: 'include', signal })
  }
}
