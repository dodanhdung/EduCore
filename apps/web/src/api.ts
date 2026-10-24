import type { Principal, Tenant } from './auth.ts'

export type LoginResponse = { user: { id: string; displayName: string }; allowedTenants: Tenant[]; requiresTenantSelection: true; accessToken: string; expiresInSeconds: number; csrfToken: string }
export type SelectTenantResponse = { accessToken: string; expiresInSeconds: number; principal: Principal }
export type RefreshResponse = { accessToken: string; expiresInSeconds: number; csrfToken: string }
type ErrorBody = { code?: string; message?: string; correlationId?: string }

export function safeErrorMessage(error: unknown, operation: 'login' | 'tenant' | 'request' = 'request'): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return operation === 'login'
      ? 'Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.'
      : 'Phiên đăng nhập đã hết hạn hoặc bị thu hồi. Vui lòng đăng nhập lại.'
    if (error.status === 429) return 'Bạn đã thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.'
    if (error.status === 403) return operation === 'tenant'
      ? 'Bạn không còn quyền truy cập trung tâm này. Vui lòng chọn lại.'
      : 'Bạn không có quyền thực hiện thao tác này.'
    if (error.status === 404) return 'Không tìm thấy nội dung yêu cầu.'
    if (error.status === 409) return 'Dữ liệu hoặc phiên đã thay đổi. Vui lòng tải lại và thử lại.'
    if (error.status === 400 || error.status === 422) return 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.'
  }
  return 'Không thể kết nối dịch vụ lúc này. Vui lòng thử lại sau.'
}

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
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    // Native browser fetch requires its Window/global receiver. Node and most
    // HTTP doubles accept an arbitrary receiver and previously masked this bug.
    this.transport = transport.bind(globalThis)
  }

  async request<T>(path: string, options: {
    method?: 'GET' | 'POST'; body?: unknown; accessToken?: string; csrfToken?: string;
    credentials?: 'include' | 'omit'; signal?: AbortSignal; cache?: RequestCache; expectedStatus?: number
  } = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`
    if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken
    const response = await this.transport(`${this.baseUrl}${path}`, {
      method: options.method ?? 'GET', headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: options.credentials ?? 'omit',
      cache: options.cache,
      signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
    })
    const requestId = response.headers.get('x-request-id') ?? undefined
    if (options.expectedStatus !== undefined && response.ok && response.status !== options.expectedStatus)
      throw new ApiError(502, 'INVALID_RESPONSE', requestId)
    if (response.status === 204) {
      if (!response.ok) throw new ApiError(response.status, 'HTTP_ERROR', requestId)
      return undefined as T
    }
    const raw = await response.text()
    let data: unknown
    try { data = raw ? JSON.parse(raw) : undefined } catch { throw new ApiError(response.ok ? 502 : response.status, 'INVALID_RESPONSE', requestId) }
    if (!response.ok) {
      const error = data && typeof data === 'object' ? data as ErrorBody : {}
      throw new ApiError(response.status, typeof error.code === 'string' ? error.code : 'HTTP_ERROR', error.correlationId ?? requestId)
    }
    if (data === undefined) throw new ApiError(502, 'INVALID_RESPONSE', requestId)
    return data as T
  }

  login(email: string, password: string, signal?: AbortSignal) {
    return this.request<LoginResponse>('/api/v1/auth/login', { method: 'POST', body: { email, password }, credentials: 'include', signal })
  }
  async requestPasswordResetOtp(email: string, signal?: AbortSignal) {
    const result = await this.request<{ accepted: boolean }>('/api/v1/auth/password/otp/request',
      { method: 'POST', body: { email }, signal, expectedStatus: 202 })
    if (result?.accepted !== true) throw new ApiError(502, 'INVALID_RESPONSE')
  }
  completePasswordReset(email: string, otp: string, newPassword: string, signal?: AbortSignal) {
    return this.request<void>('/api/v1/auth/password/reset',
      { method: 'POST', body: { email, otp, newPassword }, signal, expectedStatus: 204 })
  }
  me(accessToken: string, signal?: AbortSignal) {
    return this.request<Principal>('/api/v1/auth/me', { accessToken, signal })
  }
  navigation(accessToken: string, tenantId: string, signal?: AbortSignal) {
    return this.request<unknown>(`/api/v1/tenants/${encodeURIComponent(tenantId)}/access/navigation`,
      { accessToken, credentials: 'omit', cache: 'no-store', signal })
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
