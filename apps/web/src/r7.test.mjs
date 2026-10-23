import assert from 'node:assert/strict'
import test from 'node:test'
import { ApiClient, ApiError, safeErrorMessage } from './api.ts'
import { canView, landingPath, navigationRoutes, resolveRoute, SessionController } from './auth.ts'
import { routes } from './routes.ts'

const tenantA = '00000000-0000-4000-8000-000000000001'
const tenantB = '00000000-0000-4000-8000-000000000002'
const tenants = [{ id: tenantA, name: 'Trung tâm A' }, { id: tenantB, name: 'Trung tâm B' }]
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }

// Contract double behind the REAL ApiClient. These are not PostgreSQL evidence.
function setup({ fault, navigation = false } = {}) {
  let number = 0, current = null
  const calls = [], records = new Map()
  const state = { screenIds: ['AC01'], denied: false, principalOverride: null }
  const api = new ApiClient('http://localhost:3000', async (url, options) => {
    const path = new URL(url).pathname
    calls.push({ path, options })
    const failure = await fault?.(path, options)
    if (failure) return failure
    const token = options.headers.Authorization?.slice(7)
    if (path.endsWith('/login')) {
      const accessToken = `test-access-${++number}`
      current = accessToken
      records.set(accessToken, { id: 'user', sessionId: `session-${number}`, tenantId: null, allowedTenants: tenants })
      return json({ accessToken, csrfToken: 'test-csrf', expiresInSeconds: 900, requiresTenantSelection: true, allowedTenants: tenants })
    }
    if (path.endsWith('/refresh')) {
      assert.equal(options.credentials, 'include')
      assert.equal(options.headers['X-CSRF-Token'], 'test-csrf')
      if (!current || state.denied) return json({ code: 'AUTH_REQUIRED' }, 401)
      const next = `test-refreshed-${++number}`
      records.set(next, records.get(current)); current = next
      return json({ accessToken: next, csrfToken: 'test-csrf', expiresInSeconds: 900 })
    }
    if (!current || token !== current || state.denied) return json({ code: 'AUTH_REQUIRED' }, 401)
    if (path.endsWith('/me')) return json(state.principalOverride ?? records.get(token))
    if (path.endsWith('/select-tenant')) {
      const { tenantId } = JSON.parse(options.body)
      if (!tenants.some((t) => t.id === tenantId)) return json({ code: 'FORBIDDEN' }, 403)
      const principal = { ...records.get(token), tenantId }
      current = `test-selected-${++number}`; records.set(current, principal)
      return json({ accessToken: current, expiresInSeconds: 900, principal })
    }
    if (path.endsWith('/navigation')) {
      const principal = records.get(token)
      return json({ userId: principal.id, sessionId: principal.sessionId, tenantId: principal.tenantId,
        screenIds: state.screenIds, validUntil: Date.now() + 60_000 })
    }
    if (path.endsWith('/logout')) { current = null; return new Response(null, { status: 204 }) }
    return json({ code: 'FORBIDDEN' }, 403)
  })
  const controller = new SessionController(api, navigation
    ? (token, tenant) => api.request(`/api/v1/tenants/${tenant}/access/navigation`, { accessToken: token }) : undefined)
  return { controller, api, calls, state }
}
async function selected(options) {
  const ctx = setup(options)
  await ctx.controller.login('person@example.test', 'test password')
  await ctx.controller.selectTenant(tenantA)
  return ctx
}

test('R7 real ApiClient sends credentials, loads me, and requires explicit tenant selection', async () => {
  const { controller, calls } = setup()
  assert.equal(await controller.login('person@example.test', 'test password'), true)
  assert.deepEqual(calls.map((c) => c.path), ['/api/v1/auth/login', '/api/v1/auth/me'])
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'person@example.test', password: 'test password' })
  assert.equal(calls[0].options.credentials, 'include')
  assert.equal(controller.getSnapshot().session.principal.tenantId, null)
  assert.equal(landingPath(controller.getSnapshot().session), '/select-tenant')
})

for (const [status, copy] of [[401, /Email hoặc mật khẩu/], [429, /quá nhiều lần/], [500, /Không thể kết nối/]]) {
  test(`R7 login ${status} fails closed with safe Vietnamese feedback`, async () => {
    const { controller } = setup({ fault: (path) => path.endsWith('/login') && json({ code: 'PRIVATE_SQL_EMAIL_EXISTS' }, status) })
    await assert.rejects(controller.login('person@example.test', 'bad'), (error) => {
      assert.match(safeErrorMessage(error, 'login'), copy)
      assert.doesNotMatch(safeErrorMessage(error, 'login'), /SQL|EXISTS/)
      return true
    })
    assert.equal(controller.getSnapshot().status, 'unauthenticated')
  })
}

test('R7 network login failure clears checking state', async () => {
  const { controller } = setup({ fault: () => { throw new TypeError('private hostname') } })
  await assert.rejects(controller.login('person@example.test', 'bad'))
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
  assert.doesNotMatch(safeErrorMessage(new TypeError('private hostname')), /private hostname/)
})

test('R7 tenant selection sends the actual ID and uses the returned selected principal', async () => {
  const { controller, calls } = await selected()
  assert.deepEqual(JSON.parse(calls.find((c) => c.path.endsWith('/select-tenant')).options.body), { tenantId: tenantA })
  assert.equal(controller.getSnapshot().session.principal.tenantId, tenantA)
  assert.equal(landingPath(controller.getSnapshot().session), `/app/${tenantA}/me`)
  assert.equal(calls.some((c) => c.path.endsWith('/navigation')), false, 'unapproved contract is never called by default')
})

test('R7 unknown tenant is rejected without sending a selection', async () => {
  const { controller, calls } = await selected()
  const before = calls.length
  await assert.rejects(controller.selectTenant('unknown'), (error) => error.status === 403)
  assert.equal(calls.length, before)
})

test('R7 a definite invalid selection keeps routes closed and does not report success', async () => {
  const { controller } = await selected({ fault: (path, options) => path.endsWith('/select-tenant')
    && JSON.parse(options.body).tenantId === tenantB && json({ code: 'FORBIDDEN' }, 403) })
  await assert.rejects(controller.selectTenant(tenantB), (error) => error.status === 403)
  assert.equal(controller.getSnapshot().session.principal.tenantId, null)
  assert.equal(resolveRoute(`/app/${tenantA}/me`, controller.getSnapshot()).kind, 'forbidden')
  assert.equal(await controller.selectTenant(tenantA), true)
})

test('R7 overlapping login responses cannot revive stale sessions; cookie mutations are serialized', async () => {
  const gate = deferred(), entered = deferred()
  let first = true
  const { controller, calls } = setup({ fault: async (path) => {
    if (path.endsWith('/login') && first) { first = false; entered.resolve(); await gate.promise }
  } })
  const old = controller.login('old@example.test', 'test password')
  await entered.promise
  const latest = controller.login('latest@example.test', 'test password')
  assert.equal(calls.filter((c) => c.path.endsWith('/login')).length, 1)
  gate.resolve()
  assert.equal(await old, false)
  assert.equal(await latest, true)
  assert.equal(controller.getSnapshot().session.principal.sessionId, 'session-2')
  assert.deepEqual(calls.map((c) => c.path.split('/').at(-1)), ['login', 'me', 'logout', 'login', 'me'])
})

test('R7 logout racing login revokes the stale login and never restores privileges', async () => {
  const gate = deferred(), entered = deferred()
  const { controller, calls } = setup({ fault: async (path) => {
    if (path.endsWith('/login')) { entered.resolve(); await gate.promise }
  } })
  const login = controller.login('person@example.test', 'test password')
  await entered.promise
  const logout = controller.logout()
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
  gate.resolve()
  assert.equal(await login, false); await logout
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
  assert.ok(calls.some((c) => c.path.endsWith('/logout')))
})

test('R7 logout failure still clears all local privileges and reports unconfirmed revocation', async () => {
  const { controller } = await selected({ navigation: true, fault: (path) => path.endsWith('/logout') && json({}, 503) })
  assert.equal(await controller.logout(), false)
  assert.deepEqual(controller.getSnapshot(), { status: 'unauthenticated', reason: 'logout-unconfirmed' })
})

test('R7 previous tenant evidence disappears synchronously and rapid switches use rotated tokens', async () => {
  const gate = deferred(), entered = deferred()
  const { controller } = await selected({ navigation: true, fault: async (path, options) => {
    if (path.endsWith('/select-tenant') && JSON.parse(options.body).tenantId === tenantB) { entered.resolve(); await gate.promise }
  } })
  const old = controller.getSnapshot().session.navigation
  const first = controller.selectTenant(tenantB)
  assert.equal(controller.getSnapshot().session.navigation, undefined)
  assert.equal(controller.getSnapshot().session.principal.tenantId, null)
  await entered.promise
  const second = controller.selectTenant(tenantA)
  gate.resolve()
  assert.equal(await first, false); assert.equal(await second, true)
  const live = controller.getSnapshot().session
  assert.equal(live.principal.tenantId, tenantA)
  assert.equal(canView(routes.find((r) => r.id === 'AC01'), live, tenantA, old), false)
})

test('R7 refresh follows cookie/CSRF contract, rotates memory secrets and reload remains signed out', async () => {
  const { controller, api, calls } = await selected({ navigation: true })
  const old = controller.getSnapshot().session
  assert.equal(await controller.refresh(), true)
  const live = controller.getSnapshot().session
  assert.notEqual(live.accessToken, old.accessToken)
  assert.ok(live.tenantEpoch > old.tenantEpoch)
  assert.equal(live.principal.tenantId, tenantA)
  const reload = new SessionController(api)
  const before = calls.length
  reload.finishInitialCheck()
  assert.equal(reload.getSnapshot().status, 'unauthenticated')
  assert.equal(calls.length, before, 'no refresh bootstrap after reload')
})

test('R7 concurrent refreshes are single-flight and never replay rotating cookies', async () => {
  const { controller, calls } = await selected()
  await Promise.all([controller.refresh(), controller.refresh(), controller.refresh()])
  assert.equal(calls.filter((c) => c.path.endsWith('/refresh')).length, 1)
})

test('R7 refresh never extends the original seven-day session deadline', async () => {
  const { controller } = await selected({ navigation: true })
  const deadline = controller.getSnapshot().session.refreshDeadline
  const originalNow = Date.now
  try {
    Date.now = () => deadline - 10_000
    await controller.refresh()
    assert.equal(controller.getSnapshot().session.expiresAt, deadline)
    assert.ok(controller.getSnapshot().session.navigation.validUntil <= deadline)
    Date.now = () => deadline + 1
    await assert.rejects(controller.refresh(), (error) => error.status === 401)
    assert.equal(controller.getSnapshot().status, 'unauthenticated')
  } finally { Date.now = originalNow }
})

test('R7 denied refresh and revoked membership remove privileges', async () => {
  const { controller, state } = await selected({ navigation: true })
  state.denied = true
  await assert.rejects(controller.refresh(), (error) => error.status === 401)
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
  assert.equal(resolveRoute(`/app/${tenantA}/students`, controller.getSnapshot()).kind, 'unauthenticated')
})

test('R7 revalidation detects removed selected membership from fresh me', async () => {
  const { controller, state } = await selected({ navigation: true })
  state.principalOverride = { ...controller.getSnapshot().session.principal, allowedTenants: [] }
  await assert.rejects(controller.revalidate(), (error) => error.status === 401)
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
})

test('R7 expired access loses both business and self-service routes', async () => {
  const { controller } = await selected({ navigation: true })
  const state = controller.getSnapshot()
  const expired = { ...state, session: { ...state.session, expiresAt: Date.now() - 1 } }
  assert.equal(resolveRoute(`/app/${tenantA}/students`, expired).kind, 'unauthenticated')
  assert.equal(resolveRoute(`/app/${tenantA}/me`, expired).kind, 'unauthenticated')
  controller.expire()
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
})

test('R7 reviewed-reader consumption binds grants to session, user, tenant, epoch and freshness', async () => {
  const { controller } = await selected({ navigation: true })
  const { session } = controller.getSnapshot()
  assert.equal(resolveRoute(`/app/${tenantA}/students`, controller.getSnapshot()).kind, 'screen')
  for (const change of [{ userId: 'other' }, { sessionId: 'other' }, { tenantId: tenantB }, { tenantEpoch: 0 }, { validUntil: 0 }, { validUntil: session.expiresAt + 1 }]) {
    assert.equal(canView(routes.find((r) => r.id === 'AC01'), session, tenantA, { ...session.navigation, ...change }), false)
  }
  assert.equal(landingPath(session), `/app/${tenantA}/students`)
})

test('R7 no evidence or role labels alone grant no business routes', async () => {
  const { controller } = await selected()
  const state = controller.getSnapshot()
  for (const role of ['MANAGER', 'TEACHER', 'PARENT']) {
    assert.equal(resolveRoute(`/app/${tenantA}/students`, { ...state, session: { ...state.session, roles: [role] } }).kind, 'forbidden')
  }
  assert.deepEqual(navigationRoutes(state.session).map((r) => r.id), ['AU05'])
})

test('R7 navigation grants do not infer resource access, arbitrary IDs still reach backend denial', async () => {
  const { controller, api } = await selected({ navigation: true })
  assert.equal(resolveRoute(`/app/${tenantA}/students`, controller.getSnapshot()).kind, 'screen')
  assert.equal(resolveRoute(`/app/${tenantA}/students/other-student`, controller.getSnapshot()).kind, 'forbidden')
  await assert.rejects(api.request(`/api/v1/tenants/${tenantA}/students/other-student`, { accessToken: controller.getSnapshot().session.accessToken }), (error) => error.status === 403)
})

test('R7 permission loss removes navigation and previous protected route', async () => {
  const { controller, state } = await selected({ navigation: true })
  assert.ok(navigationRoutes(controller.getSnapshot().session).some((r) => r.id === 'AC01'))
  state.screenIds = []
  await controller.revalidate()
  assert.deepEqual(navigationRoutes(controller.getSnapshot().session).map((r) => r.id), ['AU05'])
  assert.equal(resolveRoute(`/app/${tenantA}/students`, controller.getSnapshot()).kind, 'forbidden')
})

for (const status of [403, 404, 409, 503]) {
  test(`R7 navigation ${status} never fabricates grants`, async () => {
    const { controller } = await selected({ navigation: true, fault: (path) => path.endsWith('/navigation') && json({}, status) })
    assert.equal(controller.getSnapshot().session.navigation, undefined)
    assert.equal(resolveRoute(`/app/${tenantA}/students`, controller.getSnapshot()).kind, 'forbidden')
  })
}

test('R7 stale navigation response cannot restore access after logout', async () => {
  const gate = deferred(), entered = deferred()
  const { controller } = setup({ navigation: true, fault: async (path) => {
    if (path.endsWith('/navigation')) { entered.resolve(); await gate.promise }
  } })
  await controller.login('person@example.test', 'test password')
  const select = controller.selectTenant(tenantA)
  await entered.promise
  const logout = controller.logout()
  gate.resolve()
  assert.equal(await select, false); await logout
  assert.equal(controller.getSnapshot().status, 'unauthenticated')
})

test('R7 background revalidation cannot supersede an explicit tenant selection', async () => {
  const gate = deferred(), entered = deferred()
  const { controller } = await selected({ fault: async (path, options) => {
    if (path.endsWith('/select-tenant') && JSON.parse(options.body).tenantId === tenantB) { entered.resolve(); await gate.promise }
  } })
  const choosing = controller.selectTenant(tenantB)
  await entered.promise
  assert.equal(await controller.revalidate(), false)
  gate.resolve()
  assert.equal(await choosing, true)
  assert.equal(controller.getSnapshot().session.principal.tenantId, tenantB)
})

test('R7 storage is never read or written, including constructor and reload', async () => {
  const previous = new Map()
  for (const key of ['localStorage', 'sessionStorage']) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, { configurable: true, get() { throw Error('PERSISTENT_STORAGE_USED') } })
  }
  try {
    const { controller, api } = await selected()
    await controller.refresh(); await controller.logout()
    new SessionController(api).finishInitialCheck()
  } finally {
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
})

test('R7 distinct 401/403/404/409/network messages and malformed error responses stay safe', async () => {
  const messages = [401, 403, 404, 409].map((status) => safeErrorMessage(new ApiError(status, 'PRIVATE')))
  assert.equal(new Set(messages).size, 4)
  assert.ok(!messages.includes(safeErrorMessage(new TypeError('NETWORK'))))
  const api = new ApiClient('', async () => new Response('<html>private proxy detail</html>', { status: 429 }))
  await assert.rejects(api.login('a@example.test', 'bad'), (error) => error.status === 429 && /quá nhiều/.test(safeErrorMessage(error)))
})
