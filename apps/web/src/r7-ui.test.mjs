import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act, useState, useSyncExternalStore } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const initial = new JSDOM('<div></div>', { url: 'http://localhost/login' })
globalThis.window = initial.window
globalThis.document = initial.window.document
globalThis.HTMLElement = initial.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); initial.window.close() })
const { default: App, AppView, AppShell } = await vite.ssrLoadModule('/src/App.tsx')
const { ApiClient } = await vite.ssrLoadModule('/src/api.ts')
const { SessionController, navigationRoutes } = await vite.ssrLoadModule('/src/auth.ts')
const { routes } = await vite.ssrLoadModule('/src/routes.ts')
const tenantId = '00000000-0000-4000-8000-000000000001'
const principal = { id: '00000000-0000-4000-8000-000000000003', sessionId: '00000000-0000-4000-8000-000000000004', tenantId: null, allowedTenants: [{ id: tenantId, name: 'Trung tâm thật' }] }
const json = (data, status = 200) => new Response(JSON.stringify(data), { status })

function backend(fault, navigation = false) {
  const calls = []
  let selected = false
  const api = new ApiClient('http://localhost:3000', async (url, options) => {
    const path = new URL(url).pathname
    calls.push({ path, options })
    const failure = await fault?.(path, options)
    if (failure) return failure
    if (path.endsWith('/login')) return json({ accessToken: 'TEST_SECRET_ACCESS', csrfToken: 'TEST_SECRET_CSRF', expiresInSeconds: 900 })
    if (path.endsWith('/me')) return json({ ...principal, tenantId: selected ? tenantId : null })
    if (path.endsWith('/select-tenant')) {
      assert.equal(JSON.parse(options.body).tenantId, tenantId)
      selected = true
      return json({ accessToken: 'TEST_SECRET_SELECTED', expiresInSeconds: 900, principal: { ...principal, tenantId } })
    }
    if (path.endsWith('/navigation')) return json({ userId: principal.id, sessionId: principal.sessionId, tenantId, screenIds: ['OP01'], validUntil: Date.now() + 30_000 })
    if (path.endsWith('/logout')) return new Response(null, { status: 204 })
    return json({}, 404)
  })
  return { calls, controller: new SessionController(api, navigation ? (token, id) => api.request(`/api/v1/tenants/${id}/access/navigation`, { accessToken: token }) : undefined) }
}

async function mount(controller, initialPath = '/login') {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/login' })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
  const root = createRoot(dom.window.document.getElementById('root'))
  const paths = []
  function Harness() {
    const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
    const [path, setPath] = useState(initialPath)
    const navigate = (next) => { paths.push(next); setPath(next) }
    return React.createElement(AppView, { state, path, controller, navigate, onLogout: () => { void controller.logout(); navigate('/login') } })
  }
  await act(async () => { controller.finishInitialCheck(); root.render(React.createElement(Harness)) })
  return { dom, document: dom.window.document, paths, close: async () => { await act(async () => root.unmount()); dom.window.close() } }
}
async function fill(view) {
  await act(async () => {
    for (const [selector, value] of [['#login-email', 'person@example.test'], ['#login-password', 'test password']]) {
      const input = view.document.querySelector(selector)
      Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set.call(input, value)
      input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }))
    }
  })
}
async function submit(view) {
  await act(async () => view.document.querySelector('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })))
}

test('R7 UI real AppView journey login → AU02 → selected AppShell → logout, no fixtures or secrets', async () => {
  const { controller, calls } = backend()
  const view = await mount(controller)
  try {
    await fill(view); await submit(view)
    assert.equal(view.paths.at(-1), '/select-tenant')
    assert.match(view.document.body.textContent, /Chọn trung tâm/)
    assert.equal(view.document.querySelectorAll('.ec-tenant-choice').length, 1)
    await act(async () => view.document.querySelector('.ec-tenant-choice').click())
    assert.equal(view.paths.at(-1), `/app/${tenantId}/me`)
    assert.ok(view.document.querySelector('.app-shell'))
    assert.match(view.document.body.textContent, /Trung tâm thật/)
    assert.match(view.document.body.textContent, /Chưa có mục nghiệp vụ/)
    assert.doesNotMatch(view.document.body.textContent, /TEST_SECRET|PREVIEW_ONLY|Dữ liệu mẫu/)
    assert.deepEqual(calls.map((c) => c.path), ['/api/v1/auth/login', '/api/v1/auth/me', '/api/v1/auth/select-tenant'])
    await act(async () => view.document.querySelector('.top-actions button').click())
    assert.equal(controller.getSnapshot().status, 'unauthenticated')
    assert.equal(view.document.querySelector('.app-shell'), null)
    assert.match(view.document.body.textContent, /Bạn đã đăng xuất/)
  } finally { await view.close() }
})

for (const [status, expected] of [[401, /Email hoặc mật khẩu chưa đúng/], [429, /quá nhiều lần/], [503, /Không thể kết nối/]]) {
  test(`R7 UI ${status}: safe feedback, password cleared, no successful navigation`, async () => {
    const { controller } = backend((path) => path.endsWith('/login') && json({ message: 'private SQL user exists' }, status))
    const view = await mount(controller)
    try {
      await fill(view); await submit(view)
      assert.match(view.document.querySelector('[role="alert"]').textContent, expected)
      assert.equal(view.document.querySelector('#login-password').value, '')
      assert.equal(view.paths.length, 0)
      assert.doesNotMatch(view.document.body.textContent, /SQL|user exists|test password/)
    } finally { await view.close() }
  })
}

test('R7 UI double submit sends one login while showing accessible busy state', async () => {
  let release
  const pending = new Promise((resolve) => { release = resolve })
  const { controller, calls } = backend(async (path) => { if (path.endsWith('/login')) await pending })
  const view = await mount(controller)
  try {
    await fill(view)
    await act(async () => {
      for (let i = 0; i < 2; i++) view.document.querySelector('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true }))
    })
    assert.equal(calls.length, 1)
    assert.equal(view.document.querySelector('button[type="submit"]').disabled, true)
    assert.equal(view.document.querySelector('form').getAttribute('aria-busy'), 'true')
    await act(async () => release())
    assert.equal(view.paths.at(-1), '/select-tenant')
  } finally { await view.close() }
})

test('R7 UI invalid tenant stays on AU02, announces error, and never opens AppShell', async () => {
  const { controller } = backend((path) => path.endsWith('/select-tenant') && json({}, 403))
  await controller.login('person@example.test', 'test password')
  const view = await mount(controller, '/select-tenant')
  try {
    await act(async () => view.document.querySelector('.ec-tenant-choice').click())
    assert.match(view.document.querySelector('[role="alert"]').textContent, /không còn quyền/)
    assert.equal(view.paths.length, 0)
    assert.equal(view.document.querySelector('.app-shell'), null)
  } finally { await view.close() }
})

test('R7 UI AppShell consumes only eligible links and protected screens remain denied without evidence', async () => {
  const { controller } = backend(undefined, true)
  await controller.login('person@example.test', 'test password'); await controller.selectTenant(tenantId)
  const state = controller.getSnapshot()
  const props = { state, path: `/app/${tenantId}/settings/members`, controller, navigate() {}, onLogout() {} }
  const markup = renderToStaticMarkup(React.createElement(AppView, props))
  assert.match(markup, new RegExp(`href="/app/${tenantId}/settings/members"`))
  assert.doesNotMatch(markup, /href="[^"]*finance|href="[^"]*teachers|Dữ liệu mẫu|PREVIEW_ONLY/)
  const denied = renderToStaticMarkup(React.createElement(AppView, { ...props, state: { ...state, session: { ...state.session, navigation: undefined } } }))
  assert.match(denied, /Đang xác minh quyền truy cập/)
  assert.doesNotMatch(denied, /app-shell/)
})

test('R7 UI mobile menu has native keyboard control, active link and tenant/self-service context', async () => {
  const { controller } = backend(undefined, true)
  await controller.login('person@example.test', 'test password'); await controller.selectTenant(tenantId)
  const { session } = controller.getSnapshot()
  const markup = renderToStaticMarkup(React.createElement(AppShell, { route: routes.find((r) => r.id === 'OP01'), tenant: principal.allowedTenants[0],
    navigation: navigationRoutes(session), navigate() {}, onLogout() {} }, 'Nội dung'))
  const dom = new JSDOM(markup)
  try {
    assert.ok(dom.window.document.querySelector('.mobile-nav details summary'))
    assert.equal(dom.window.document.querySelector('[aria-current="page"]').textContent, 'Tài khoản người dùng')
    assert.match(markup, /Trung tâm thật/)
    assert.ok(dom.window.document.querySelector(`a[href="/app/${tenantId}/me"]`))
  } finally { dom.window.close() }
})

test('R13.1 shell keeps tenant controls usable and closes menus across scope changes', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: `http://localhost/app/${tenantId}/settings/members` })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
  const root = createRoot(dom.window.document.getElementById('root'))
  const paths = []
  let logouts = 0
  const op01 = routes.find(route => route.id === 'OP01')
  const au05 = routes.find(route => route.id === 'AU05')
  const draw = (route, tenant = principal.allowedTenants[0], navigation = [op01, au05]) => React.createElement(AppShell, {
    route, tenant, navigation, navigate: path => paths.push(path), onLogout: () => { logouts += 1 },
  }, React.createElement('h1', null, 'Nội dung không đổi'))
  try {
    await act(async () => root.render(draw(op01)))
    const account = dom.window.document.querySelector('.account-menu')
    const accountTrigger = account.querySelector('summary')
    await act(async () => accountTrigger.click())
    assert.equal(account.open, true)
    await act(async () => account.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(account.open, false)
    assert.equal(dom.window.document.activeElement, accountTrigger)

    await act(async () => accountTrigger.click())
    await act(async () => dom.window.document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })))
    assert.equal(account.open, false)
    await act(async () => accountTrigger.click())
    await act(async () => account.querySelector('a[href="/select-tenant"]').click())
    assert.equal(paths.at(-1), '/select-tenant')
    assert.equal(account.open, false)

    const mobile = dom.window.document.querySelector('.mobile-nav details')
    await act(async () => mobile.querySelector('summary').click())
    assert.equal(mobile.open, true)
    await act(async () => mobile.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    assert.equal(mobile.open, false)
    assert.equal(dom.window.document.activeElement, mobile.querySelector('summary'))

    await act(async () => root.render(draw(au05, { id: 'second-tenant', name: 'Trung tâm thứ hai' }, [au05])))
    assert.match(dom.window.document.querySelector('.tenant-context').textContent, /Trung tâm thứ hai/)
    assert.doesNotMatch(dom.window.document.querySelector('.sidebar nav').textContent, /Tài khoản người dùng/)
    assert.equal(dom.window.document.querySelector('.sidebar a[aria-current="page"]').getAttribute('href'), '/app/second-tenant/me')
    assert.equal(dom.window.document.activeElement.id, 'main-content')
    assert.match(dom.window.document.querySelector('#main-content h1').textContent, /Nội dung không đổi/)
    await act(async () => dom.window.document.querySelector('.top-actions button').click())
    assert.equal(logouts, 1)
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('R7 actual App expiry timer removes AppShell without requiring navigation or reload', async () => {
  const { controller } = backend()
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/login' })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
  const timers = new Map()
  let nextTimer = 0
  dom.window.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
  dom.window.clearTimeout = (id) => { timers.delete(id) }
  const root = createRoot(dom.window.document.getElementById('root'))
  const view = { dom, document: dom.window.document }
  try {
    await act(async () => root.render(React.createElement(App, { controller })))
    await fill(view); await submit(view)
    await act(async () => view.document.querySelector('.ec-tenant-choice').click())
    assert.ok(view.document.querySelector('.app-shell'))
    assert.equal(timers.size, 2, 'maintenance and hard expiry timers exist')
    const expiry = [...timers.values()].sort((a, b) => b.delay - a.delay)[0]
    assert.ok(expiry.delay > 800_000 && expiry.delay <= 900_000)
    await act(async () => expiry.callback())
    assert.equal(controller.getSnapshot().status, 'unauthenticated')
    assert.equal(view.document.querySelector('.app-shell'), null)
    assert.match(view.document.body.textContent, /hết hạn hoặc bị thu hồi/)
  } finally { await act(async () => root.unmount()); dom.window.close() }
})

test('Phase B App timer removes expired navigation on desktop and mobile while retaining AU05', async () => {
  let hold = false, release
  const gate = new Promise(resolve => { release = resolve })
  const { controller } = backend(async path => { if (hold && path.endsWith('/navigation')) await gate }, true)
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/login' })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
  const timers = new Map()
  let nextTimer = 0
  dom.window.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
  dom.window.clearTimeout = (id) => { timers.delete(id) }
  const root = createRoot(dom.window.document.getElementById('root'))
  const view = { dom, document: dom.window.document }
  try {
    await act(async () => root.render(React.createElement(App, { controller })))
    await fill(view); await submit(view)
    await act(async () => view.document.querySelector('.ec-tenant-choice').click())
    const evidence = controller.getSnapshot().session.navigation
    assert.ok(evidence)
    assert.match(view.document.querySelector('.sidebar').textContent, /Tài khoản người dùng/)
    await act(async () => view.document.querySelector(`.sidebar a[href="/app/${tenantId}/me"]`).click())
    assert.equal(timers.size, 3)
    const evidenceTimer = [...timers.values()].sort((a, b) => a.delay - b.delay)[0]
    assert.ok(evidenceTimer.delay <= 30_000)
    hold = true
    evidence.validUntil = Date.now() - 1
    await act(async () => evidenceTimer.callback())
    assert.equal(controller.getSnapshot().session.navigation, undefined)
    assert.doesNotMatch(view.document.querySelector('.sidebar').textContent, /Tài khoản người dùng/)
    assert.doesNotMatch(view.document.querySelector('.mobile-nav').textContent, /Tài khoản người dùng/)
    assert.match(view.document.querySelector('.sidebar').textContent, /Tài khoản/)
    await act(async () => { release(); await controller.revalidate() })
    assert.match(view.document.querySelector('.sidebar').textContent, /Tài khoản người dùng/)
  } finally { release(); await act(async () => root.unmount()); dom.window.close() }
})

async function actualProtectedApp(controller, run) {
  const dom = new JSDOM('<div id="root"></div>', { url: `http://localhost/app/${tenantId}/settings/members` })
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement
  const timers = new Map()
  let nextTimer = 0
  dom.window.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id }
  dom.window.clearTimeout = id => timers.delete(id)
  const root = createRoot(dom.window.document.getElementById('root'))
  try {
    await act(async () => root.render(React.createElement(App, { controller })))
    await run({ dom, document: dom.window.document, timers })
  } finally { await act(async () => root.unmount()); dom.window.close() }
}
function holdResponse() { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
const forbiddenCopy = /Không đủ quyền|Không có quyền truy cập/

test('R13 actual App focus storms show checking immediately, hide protected content and restore only fresh grants', async () => {
  const gate = holdResponse()
  let hold = false
  const { controller, calls } = backend(async path => { if (hold && path.endsWith('/navigation')) await gate.promise }, true)
  await controller.login('person@example.test', 'test password'); await controller.selectTenant(tenantId)
  try {
    await actualProtectedApp(controller, async view => {
      assert.ok(view.document.querySelector('.app-shell'))
      const before = calls.length
      hold = true
      await act(async () => { for (let i = 0; i < 10; i++) view.dom.window.dispatchEvent(new view.dom.window.Event('focus')) })
      assert.equal(view.document.querySelector('.app-shell'), null)
      assert.match(view.document.querySelector('[role="status"]').textContent, /Đang xác minh quyền truy cập/)
      assert.doesNotMatch(view.document.body.textContent, forbiddenCopy)
      assert.equal(calls.slice(before).filter(c => c.path.endsWith('/me')).length, 1)
      assert.equal(calls.slice(before).filter(c => c.path.endsWith('/navigation')).length, 1)
      await act(async () => { gate.release(); await controller.revalidate() })
      assert.ok(view.document.querySelector('.app-shell'))
      assert.doesNotMatch(view.document.body.textContent, forbiddenCopy)
    })
  } finally { gate.release() }
})

test('R13 actual App expires navigation into one pending revalidation and ignores its stale timer', async () => {
  const gate = holdResponse()
  let hold = false
  const { controller, calls } = backend(async path => { if (hold && path.endsWith('/navigation')) await gate.promise }, true)
  await controller.login('person@example.test', 'test password'); await controller.selectTenant(tenantId)
  try {
    await actualProtectedApp(controller, async view => {
      const evidence = controller.getSnapshot().session.navigation
      const timer = [...view.timers.values()].find(t => t.delay <= 30_000)
      assert.ok(timer)
      hold = true; evidence.validUntil = Date.now() - 1
      const before = calls.length
      await act(async () => { timer.callback(); view.dom.window.dispatchEvent(new view.dom.window.Event('focus')) })
      assert.equal(controller.getSnapshot().session.navigationStatus, 'pending')
      assert.equal(view.document.querySelector('.app-shell'), null)
      assert.doesNotMatch(view.document.body.textContent, forbiddenCopy)
      assert.equal(calls.slice(before).filter(c => c.path.endsWith('/navigation')).length, 1)
      await act(async () => { gate.release(); await controller.revalidate() })
      const fresh = controller.getSnapshot().session.navigation, count = calls.length
      await act(async () => timer.callback())
      assert.equal(controller.getSnapshot().session.navigation, fresh)
      assert.equal(calls.length, count)
      assert.ok(view.document.querySelector('.app-shell'))
    })
  } finally { gate.release() }
})

test('R13 actual App distinguishes revoked permissions from an unavailable navigation service', async () => {
  for (const response of ['revoked', 'forbidden', 'unavailable']) {
    const gate = holdResponse()
    let hold = false, failure = response
    const { controller } = backend(async path => {
      if (!hold || !path.endsWith('/navigation')) return
      await gate.promise
      if (failure === 'unavailable') return json({}, 503)
      if (failure === 'forbidden') return json({}, 403)
      if (failure === 'revoked') return json({ userId: principal.id, sessionId: principal.sessionId, tenantId, screenIds: [], validUntil: Date.now() + 30_000 })
    }, true)
    await controller.login('person@example.test', 'test password'); await controller.selectTenant(tenantId)
    try {
      await actualProtectedApp(controller, async view => {
        hold = true
        await act(async () => view.dom.window.dispatchEvent(new view.dom.window.Event('focus')))
        assert.doesNotMatch(view.document.body.textContent, forbiddenCopy)
        await act(async () => { gate.release(); await controller.revalidate() })
        assert.equal(view.document.querySelector('.app-shell'), null)
        if (response !== 'unavailable') assert.match(view.document.body.textContent, forbiddenCopy)
        else {
          assert.doesNotMatch(view.document.body.textContent, forbiddenCopy)
          assert.match(view.document.querySelector('[role="alert"]').textContent, /Chưa thể kết nối/)
          failure = ''
          await act(async () => { [...view.document.querySelectorAll('button')].find(b => b.textContent === 'Thử kết nối lại').click(); await controller.revalidate() })
          assert.ok(view.document.querySelector('.app-shell'))
        }
      })
    } finally { gate.release() }
  }
})

test('R13 focus near access expiry keeps refresh single-flight with the existing cookie and CSRF contract', async () => {
  const gate = holdResponse()
  const { controller, calls } = backend(async (path, options) => {
    if (path.endsWith('/refresh')) {
      assert.equal(options.credentials, 'include')
      assert.equal(options.headers['X-CSRF-Token'], 'TEST_SECRET_CSRF')
      await gate.promise
      return json({ accessToken: 'TEST_SECRET_ROTATED', csrfToken: 'TEST_SECRET_NEW_CSRF', expiresInSeconds: 900 })
    }
  }, true)
  await controller.login('person@example.test', 'test password'); await controller.selectTenant(tenantId)
  const deadline = controller.getSnapshot().session.refreshDeadline, now = Date.now
  const instant = controller.getSnapshot().session.expiresAt - 45_000
  Date.now = () => instant
  try {
    await actualProtectedApp(controller, async view => {
      await act(async () => { for (let i = 0; i < 5; i++) view.dom.window.dispatchEvent(new view.dom.window.Event('focus')) })
      assert.doesNotMatch(view.document.body.textContent, forbiddenCopy)
      assert.equal(view.document.querySelector('.app-shell'), null)
      await act(async () => { gate.release(); await controller.revalidate(true) })
      assert.equal(calls.filter(c => c.path.endsWith('/refresh')).length, 1)
      assert.equal(controller.getSnapshot().session.accessToken, 'TEST_SECRET_ROTATED')
      assert.equal(controller.getSnapshot().session.csrfToken, 'TEST_SECRET_NEW_CSRF')
      assert.equal(controller.getSnapshot().session.refreshDeadline, deadline)
      assert.ok(view.document.querySelector('.app-shell'))
    })
  } finally { gate.release(); Date.now = now }
})
