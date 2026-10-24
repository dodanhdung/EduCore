import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const initialDom = new JSDOM('<div></div>', { url: 'http://localhost/login' })
globalThis.window = initialDom.window
globalThis.document = initialDom.window.document
globalThis.HTMLElement = initialDom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); initialDom.window.close() })

async function screen(id, file, name) {
  return (await vite.ssrLoadModule(`/src/screens/Authentication & Shared/${id}/${file}.tsx`))[name]
}
const RecoveryRequestScreen = await screen('AU03', 'RecoveryRequestScreen', 'RecoveryRequestScreen')
const ResetPasswordScreen = await screen('AU04', 'ResetPasswordScreen', 'ResetPasswordScreen')
const ActivationScreen = await screen('AU06', 'ActivationScreen', 'ActivationScreen')
const TenantSelectionScreen = await screen('AU02', 'TenantSelectionScreen', 'TenantSelectionScreen')
const ProfileScreen = await screen('AU05', 'ProfileScreen', 'ProfileScreen')
const NotificationScreen = await screen('GL01', 'NotificationScreen', 'NotificationScreen')
const ErrorScreen = await screen('GL02', 'ErrorScreen', 'ErrorScreen')
const { BackToLogin } = await vite.ssrLoadModule('/src/screens/Authentication & Shared/BatchPrimitives.tsx')
const { SessionController } = await vite.ssrLoadModule('/src/auth.ts')
const { ApiClient, ApiError } = await vite.ssrLoadModule('/src/api.ts')
const { AppView } = await vite.ssrLoadModule('/src/App.tsx')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function mount(Component, props = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/login' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  const root = createRoot(dom.window.document.getElementById('root'))
  return {
    dom,
    document: dom.window.document,
    render: async () => { await act(async () => root.render(React.createElement(Component, props))) },
    close: async () => { await act(async () => root.unmount()); dom.window.close() },
  }
}

async function type(view, selector, value) {
  await act(async () => {
    const input = view.document.querySelector(selector)
    const setter = Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }))
  })
}

async function submit(view) {
  await act(async () => view.document.querySelector('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })))
}

test('AU03 validates email and shows neutral acceptance after the request succeeds', async () => {
  const requests = []
  const view = mount(RecoveryRequestScreen, { navigate: () => {}, onRequest: async (email) => { requests.push(email) } })
  try {
    await view.render()
    await type(view, '#recovery-email', 'bad')
    await submit(view)
    assert.equal(view.document.querySelector('#recovery-email').getAttribute('aria-invalid'), 'true')
    assert.equal(view.document.querySelector('#recovery-email').getAttribute('aria-describedby'), 'recovery-email-error')
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
    await type(view, '#recovery-email', 'person@example.com')
    assert.equal(view.document.querySelector('#recovery-email-error'), null)
    await submit(view)
    assert.equal(requests.length, 1)
    assert.match(view.document.body.textContent, /Nếu tài khoản đủ điều kiện/)
    assert.ok(view.document.querySelector('a[href="/reset-password"]'))
    assert.equal(view.document.querySelector('#recovery-email').value, 'person@example.com')
    assert.ok(view.document.querySelector('form'))
    await type(view, '#recovery-email', 'another@example.com')
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
    await submit(view)
    assert.equal(requests.length, 2)
    assert.doesNotMatch(view.document.body.textContent, /đã gửi|gửi thành công/i)
  } finally { await view.close() }
})

test('AU06 ApiClient sends exact public DTOs and checks 202/204', async () => {
  const calls = []
  const api = new ApiClient('http://localhost:3000', async (url, options) => {
    calls.push({ url, options })
    return calls.length === 1 ? new Response('{"accepted":true}', { status: 202 }) : new Response(null, { status: 204 })
  })
  await api.requestActivationOtp('person@example.test')
  await api.completeActivation('person@example.test', '123456', 'a secure password 123')
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), ['/api/v1/auth/activation/otp/request', '/api/v1/auth/activation/complete'])
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'person@example.test' })
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'person@example.test', otp: '123456', newPassword: 'a secure password 123' })
  assert.ok(calls.every(({ url, options }) => options.credentials === 'omit' && !options.headers.Authorization && !new URL(url).search))
  await assert.rejects(new ApiClient('', async () => new Response('{"accepted":false}', { status: 202 })).requestActivationOtp('x@example.test'), (e) => e instanceof ApiError && e.status === 502)
  await assert.rejects(new ApiClient('', async () => new Response('{}', { status: 200 })).completeActivation('x@example.test', '123456', 'a secure password 123'), (e) => e instanceof ApiError && e.status === 502)
})

test('AU06 OTP request validates email, prevents duplicates and gives neutral feedback', async () => {
  const gate = deferred(), calls = []
  const view = mount(ActivationScreen, { navigate: () => {}, onRequest: (email) => { calls.push(email); return gate.promise }, onActivate: async () => {} })
  try {
    await view.render()
    await act(async () => view.document.querySelector('.ec-inline-action').click())
    assert.equal(view.document.querySelector('#activate-email').getAttribute('aria-invalid'), 'true')
    assert.equal(view.document.querySelector('#activate-email').getAttribute('aria-describedby'), 'activate-email-error')
    assert.equal(calls.length, 0)
    await type(view, '#activate-email', 'person@example.com')
    await act(async () => { view.document.querySelector('.ec-inline-action').click(); view.document.querySelector('.ec-inline-action').click() })
    assert.deepEqual(calls, ['person@example.com'])
    assert.equal(view.document.querySelector('.ec-inline-action').disabled, true)
    await act(async () => gate.resolve())
    assert.match(view.document.querySelector('[role="status"]').textContent, /Nếu tài khoản đủ điều kiện/)
    assert.doesNotMatch(view.document.body.textContent, /đã gửi|gửi thành công/i)
    assert.equal(view.document.querySelector('#activate-email-error'), null)
    assert.equal(view.dom.window.localStorage.length + view.dom.window.sessionStorage.length, 0)
  } finally { await view.close() }
})

test('AU06 validates OTP and Unicode password, blocks repeated submit, clears fields and navigates on 204', async () => {
  const gate = deferred(), calls = [], paths = []
  const view = mount(ActivationScreen, { navigate: (path) => paths.push(path), onRequest: async () => {}, onActivate: (...args) => { calls.push(args); return gate.promise } })
  try {
    await view.render()
    await submit(view)
    assert.ok(view.document.getElementById('activate-email-error'))
    await type(view, '#activate-email', 'person@example.com')
    await type(view, '#activate-otp', '123')
    await type(view, '#activate-password', 'short')
    await type(view, '#activate-confirm', 'different')
    await submit(view)
    for (const id of ['activate-otp', 'activate-password', 'activate-confirm']) {
      const input = view.document.getElementById(id)
      assert.equal(input.getAttribute('aria-invalid'), 'true')
      assert.equal(input.getAttribute('aria-describedby'), `${id}-error`)
      assert.ok(view.document.getElementById(`${id}-error`))
    }
    await type(view, '#activate-otp', '123456')
    await type(view, '#activate-password', '😀'.repeat(11))
    await type(view, '#activate-confirm', '😀'.repeat(11))
    await submit(view)
    assert.match(view.document.querySelector('#activate-password-error').textContent, /12/)
    await type(view, '#activate-password', '😀'.repeat(257))
    await type(view, '#activate-confirm', '😀'.repeat(257))
    await submit(view)
    assert.match(view.document.querySelector('#activate-password-error').textContent, /1\.024/)
    await type(view, '#activate-password', 'long-password-123')
    await type(view, '#activate-confirm', 'mismatch')
    await submit(view)
    assert.ok(view.document.getElementById('activate-confirm-error'))
    await type(view, '#activate-confirm', 'long-password-123')
    await act(async () => { const form = view.document.querySelector('form'); form.dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })) })
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].slice(0, 3), ['person@example.com', '123456', 'long-password-123'])
    assert.equal(view.document.querySelector('button[type="submit"]').disabled, true)
    assert.deepEqual(paths, [])
    await act(async () => gate.resolve())
    assert.deepEqual(paths, ['/login'])
    for (const id of ['activate-email', 'activate-otp', 'activate-password', 'activate-confirm']) assert.equal(view.document.getElementById(id).value, '')
    assert.equal(view.dom.window.location.search, '')
    assert.equal(view.dom.window.localStorage.length + view.dom.window.sessionStorage.length, 0)
  } finally { await view.close() }
})

test('AU06 handles 400, 429 and network errors with retry, and ignores responses after unmount', async () => {
  let requests = 0, activations = 0
  const view = mount(ActivationScreen, { navigate: () => {}, onRequest: async () => {
    requests++
    if (requests === 1) throw new ApiError(429, 'RATE_LIMITED')
    if (requests === 2) throw new TypeError('private host')
  }, onActivate: async () => {
    activations++
    if (activations === 1) throw new ApiError(400, 'INVALID_OTP')
    if (activations === 2) throw new ApiError(429, 'RATE_LIMITED')
    throw new TypeError('private host')
  } })
  try {
    await view.render()
    await type(view, '#activate-email', 'person@example.test')
    await act(async () => view.document.querySelector('.ec-inline-action').click())
    assert.match(view.document.querySelector('[role="alert"]').textContent, /quá nhiều lần/)
    await act(async () => view.document.querySelector('.ec-inline-action').click())
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Không thể kết nối/)
    assert.doesNotMatch(view.document.body.textContent, /private host/)
    await act(async () => view.document.querySelector('.ec-inline-action').click())
    assert.ok(view.document.querySelector('[role="status"]'))
    await type(view, '#activate-otp', '123456')
    await type(view, '#activate-password', 'long-password-123')
    await type(view, '#activate-confirm', 'long-password-123')
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Mã hoặc thông tin chưa hợp lệ/)
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /quá nhiều lần/)
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Không thể kết nối/)
    assert.equal(requests, 3)
    assert.equal(activations, 3)
  } finally { await view.close() }
  const gate = deferred(), paths = []
  let requestSignal
  const stale = mount(ActivationScreen, { navigate: (path) => paths.push(path), onRequest: (_email, signal) => { requestSignal = signal; return gate.promise }, onActivate: async () => {} })
  await stale.render()
  await type(stale, '#activate-email', 'person@example.test')
  await act(async () => stale.document.querySelector('.ec-inline-action').click())
  assert.equal(stale.document.querySelector('.ec-inline-action').disabled, true)
  await stale.close()
  assert.equal(requestSignal.aborted, true)
  await act(async () => gate.resolve())
  assert.deepEqual(paths, [])

  const completion = deferred()
  let activationSignal
  const pendingActivation = mount(ActivationScreen, { navigate: (path) => paths.push(path), onRequest: async () => {}, onActivate: (_email, _otp, _password, signal) => { activationSignal = signal; return completion.promise } })
  await pendingActivation.render()
  await type(pendingActivation, '#activate-email', 'person@example.test')
  await type(pendingActivation, '#activate-otp', '123456')
  await type(pendingActivation, '#activate-password', 'long-password-123')
  await type(pendingActivation, '#activate-confirm', 'long-password-123')
  await submit(pendingActivation)
  await pendingActivation.close()
  assert.equal(activationSignal.aborted, true)
  await act(async () => completion.resolve())
  assert.deepEqual(paths, [])
})

test('AU04 exposes email and credential errors with stable IDs', async () => {
  const view = mount(ResetPasswordScreen, { navigate: () => {}, onReset: async () => {} })
  try {
    await view.render()
    await submit(view)
    for (const id of ['reset-email', 'reset-otp', 'reset-password', 'reset-confirm']) {
      const input = view.document.getElementById(id)
      assert.equal(input.getAttribute('aria-invalid'), 'true')
      assert.equal(input.getAttribute('aria-describedby'), `${id}-error`)
      assert.ok(view.document.getElementById(`${id}-error`))
    }
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
  } finally { await view.close() }
})

test('AU02 calls the session tenant boundary, prevents duplicates, and fails closed', async () => {
  let requestedId = ''
  let rejectRequest
  const request = new Promise((_, reject) => { rejectRequest = reject })
  const api = {
    login: async () => ({ accessToken: 'pre-tenant', csrfToken: 'csrf', expiresInSeconds: 900 }),
    me: async () => ({ id: 'user-1', sessionId: 'private-session', tenantId: null, allowedTenants: [{ id: 'one', name: 'One' }, { id: 'two', name: 'Two' }] }),
    selectTenant: (_token, id) => { requestedId = id; return request },
  }
  const controller = new SessionController(api)
  await controller.login('person@example.com', 'password')
  let navigated = ''
  const view = mount(TenantSelectionScreen, { tenants: controller.getSnapshot().session.principal.allowedTenants, onSelect: (id) => controller.selectTenant(id), navigate: (path) => { navigated = path } })
  try {
    await view.render()
    await act(async () => view.document.querySelectorAll('.ec-tenant-choice')[1].click())
    assert.equal(requestedId, 'two')
    assert.ok([...view.document.querySelectorAll('.ec-tenant-choice')].every((button) => button.disabled))
    await act(async () => rejectRequest(new Error('network failure')))
    assert.equal(controller.getSnapshot().status, 'unauthenticated')
    assert.equal(navigated, '')
    assert.ok(view.document.querySelector('[role="alert"]'))
  } finally { await view.close() }
})

test('shared links respect modified clicks and legal labels have no dead destinations', async () => {
  let navigated = ''
  const view = mount(BackToLogin, { navigate: (path) => { navigated = path } })
  try {
    await view.render()
    const link = view.document.querySelector('a')
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      const event = new view.dom.window.MouseEvent('click', { bubbles: true, cancelable: true, ...options })
      await act(async () => link.dispatchEvent(event))
      assert.equal(event.defaultPrevented, false)
      assert.equal(navigated, '')
    }
    const normal = new view.dom.window.MouseEvent('click', { button: 0, bubbles: true, cancelable: true })
    await act(async () => link.dispatchEvent(normal))
    assert.equal(normal.defaultPrevented, true)
    assert.equal(navigated, '/login')
    assert.equal(link.getAttribute('href'), '/login')
  } finally { await view.close() }
  const legal = renderToStaticMarkup(React.createElement(ResetPasswordScreen, { navigate: () => {} }))
  assert.doesNotMatch(legal, /href="#/)
  assert.match(legal, /Trợ giúp/)
  const error = renderToStaticMarkup(React.createElement(ErrorScreen, { code: '404', navigate: () => {} }))
  assert.match(error, /href="\/login"/)
})

test('AU05 hides raw session identifiers, GL01 stays empty and guarded', () => {
  const principal = { id: 'user-1', sessionId: 'secret-session', tenantId: 't1', allowedTenants: [{ id: 't1', name: 'Trung tâm' }] }
  const session = { principal, expiresAt: Date.now() + 60000 }
  const profile = renderToStaticMarkup(React.createElement(ProfileScreen, { session, tenant: principal.allowedTenants[0], onLogout: () => {} }))
  assert.doesNotMatch(profile, /secret-session|Mã phiên/)
  assert.match(profile, /user-1/)
  const notifications = renderToStaticMarkup(React.createElement(NotificationScreen, {}))
  assert.match(notifications, /Chưa có thông báo/)
  const denied = renderToStaticMarkup(React.createElement(AppView, { state: { status: 'authenticated', session }, path: '/app/t1/notifications', navigate: () => {}, onLogout: () => {} }))
  assert.match(denied, /Không đủ quyền truy cập/)
  assert.doesNotMatch(denied, /Chưa có thông báo/)
})
