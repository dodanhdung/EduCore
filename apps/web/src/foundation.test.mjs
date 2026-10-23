import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiClient, ApiError } from './api.ts'
import { canView, resolveRoute, SessionController } from './auth.ts'
import { matchRoute, routes } from './routes.ts'

const tenantId = '6f28c44e-b286-4d0b-99f3-2899a1b90c11'
const otherId = '9ac0015f-35fa-4905-9abb-f4d7391ef212'
const principal = { id: 'user', sessionId: 'session', tenantId, allowedTenants: [{ id: tenantId, name: 'Trung tâm A' }] }
const session = { accessToken: 'memory-only', csrfToken: 'csrf', expiresAt: Date.now() + 60_000, principal, tenantEpoch: 1 }
const authenticated = { status: 'authenticated', session }
const evidence = (screenIds, extra = {}) => ({ tenantId, userId: principal.id, sessionId: principal.sessionId,
  tenantEpoch: session.tenantEpoch, validUntil: session.expiresAt, screenIds, ...extra })

test('public routes work, checking and unauthenticated states never render protected screens', () => {
  assert.equal(resolveRoute('/login', { status: 'unauthenticated' }).kind, 'public')
  assert.equal(resolveRoute(`/app/${tenantId}/me`, { status: 'checking' }).kind, 'checking')
  assert.equal(resolveRoute(`/app/${tenantId}/me`, { status: 'unauthenticated' }).kind, 'unauthenticated')
})

test('tenant and permission gates fail closed without authoritative grants', () => {
  assert.equal(resolveRoute(`/app/${otherId}/me`, authenticated).kind, 'forbidden')
  assert.equal(resolveRoute(`/app/${tenantId}/students`, authenticated).kind, 'forbidden')
  assert.equal(resolveRoute(`/app/${tenantId}/students`, authenticated, evidence(['AC01'])).kind, 'screen')
  assert.equal(canView(routes.find((r) => r.id === 'AC01'), session, otherId, { tenantId: otherId, screenIds: ['AC01'] }), false)
})

test('expired access tokens require re-authentication instead of showing 403', () => {
  const expired = { status: 'authenticated', session: { ...session, expiresAt: Date.now() - 1 } }
  for (const path of [`/app/${tenantId}/me`, `/app/${tenantId}/students`, '/select-tenant']) {
    const result = resolveRoute(path, expired, { tenantId, screenIds: ['AC01'] })
    assert.equal(result.kind, 'unauthenticated')
    assert.equal(result.reason, 'session-expired')
  }
  assert.equal(canView(routes.find((r) => r.id === 'AU05'), expired.session, tenantId), false)
  assert.equal(resolveRoute('/login', expired).kind, 'public')
  // A live but unauthorized session must still be denied rather than re-authenticated.
  assert.equal(resolveRoute(`/app/${otherId}/me`, authenticated).kind, 'forbidden')
})

test('all dynamic route parameters are available without changing tenant guard inputs', () => {
  const student = matchRoute(`/app/${tenantId}/students/student-99`)
  assert.equal(student?.route.id, 'AC02')
  assert.deepEqual(student?.params, { tenantId, studentId: 'student-99' })
  assert.equal(student?.tenantId, tenantId)

  const invoice = resolveRoute(`/app/${tenantId}/finance/invoices/invoice-42/adjust`, authenticated,
    evidence(['BL10']))
  assert.equal(invoice.kind, 'screen')
  assert.deepEqual(invoice.params, { tenantId, invoiceId: 'invoice-42' })

  const encoded = matchRoute(`/app/${tenantId}/students/H%E1%BB%8Dc%20sinh`)
  assert.equal(encoded?.params.studentId, 'Học sinh')
  assert.deepEqual(matchRoute('/login')?.params, {})
  assert.equal(matchRoute(`/app/${tenantId}/students/bad%ZZ`), null)
  assert.equal(matchRoute(`/app/${tenantId}/students/a%2Fb`), null)
  assert.equal(matchRoute(`/app/${tenantId}/students/a%5Cb`), null)
})

test('unknown, embedded and P1 paths are unregistered', () => {
  for (const path of ['/missing', `/app/${tenantId}/enrollments`, `/app/${tenantId}/attendance/corrections`, `/app/${tenantId}/p1/makeup`]) {
    assert.equal(matchRoute(path), null)
    assert.equal(resolveRoute(path, authenticated).kind, 'not-found')
  }
  assert.equal(routes.some((r) => /^(AC09|SC04|AT05|BL08|BL11|EX\d+)/.test(r.id)), false)
  assert.equal(routes.length, 53)
  assert.equal(matchRoute('/app/%ZZ/me'), null)
})

test('API handles 204, typed errors and credentials deliberately', async () => {
  const calls = []
  const api = new ApiClient('', async (_url, options) => {
    calls.push(options)
    return new Response(null, { status: 204, headers: { 'x-request-id': 'request-1' } })
  })
  assert.equal(await api.logout('access'), undefined)
  assert.equal(calls[0].headers.Authorization, 'Bearer access')
  assert.equal(calls[0].credentials, 'include')
  const failing = new ApiClient('', async () => new Response(JSON.stringify({ code: 'FORBIDDEN', correlationId: 'cid' }), { status: 403 }))
  await assert.rejects(failing.me('access'), (error) => error instanceof ApiError && error.status === 403 && error.code === 'FORBIDDEN' && error.correlationId === 'cid')
  const refresh = new ApiClient('', async (_url, options) => {
    assert.equal(options.headers['X-CSRF-Token'], 'csrf')
    assert.equal(options.credentials, 'include')
    return new Response(JSON.stringify({ accessToken: 'next', expiresInSeconds: 900, csrfToken: 'next-csrf' }))
  })
  await refresh.refresh('csrf')
})

test('session stays in memory; tenant switch changes epoch; logout clears state', async () => {
  let storageWrites = 0
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: () => { storageWrites++ } } })
  const api = {
    login: async () => ({ accessToken: 'first', csrfToken: 'csrf', expiresInSeconds: 900 }),
    me: async () => ({ ...principal, tenantId: null }),
    selectTenant: async () => ({ accessToken: 'second', expiresInSeconds: 900, principal }),
    logout: async () => undefined,
  }
  const store = new SessionController(api)
  store.finishInitialCheck()
  await store.login('x@example.test', 'password')
  assert.equal(store.getSnapshot().session.principal.tenantId, null)
  const firstEpoch = store.getSnapshot().session.tenantEpoch
  await store.selectTenant(tenantId)
  assert.ok(store.getSnapshot().session.tenantEpoch > firstEpoch)
  assert.equal(store.getSnapshot().session.principal.tenantId, tenantId)
  assert.equal(storageWrites, 0)
  await store.logout()
  assert.equal(store.getSnapshot().status, 'unauthenticated')
  delete globalThis.localStorage
})

test('invalid server tenant selection never becomes authorized', async () => {
  const api = {
    login: async () => ({ accessToken: 'first', csrfToken: 'csrf', expiresInSeconds: 900 }),
    me: async () => ({ ...principal, tenantId: null }),
    selectTenant: async () => ({ accessToken: 'bad', expiresInSeconds: 900, principal: { ...principal, tenantId: otherId } }),
  }
  const store = new SessionController(api)
  await store.login('x@example.test', 'password')
  await assert.rejects(store.selectTenant(tenantId), /INVALID_TENANT_RESPONSE/)
  assert.equal(store.getSnapshot().status, 'unauthenticated')
})
