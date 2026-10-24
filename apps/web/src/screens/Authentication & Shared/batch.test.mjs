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
const { AppView } = await vite.ssrLoadModule('/src/App.tsx')

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

test('AU06 OTP request validates email before integration feedback', async () => {
  const view = mount(ActivationScreen, { navigate: () => {} })
  try {
    await view.render()
    await act(async () => view.document.querySelector('.ec-inline-action').click())
    assert.equal(view.document.querySelector('#activate-email').getAttribute('aria-invalid'), 'true')
    assert.equal(view.document.querySelector('#activate-email').getAttribute('aria-describedby'), 'activate-email-error')
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
    await type(view, '#activate-email', 'person@example.com')
    await act(async () => view.document.querySelector('.ec-inline-action').click())
    assert.match(view.document.body.textContent, /PENDING_API/)
    assert.equal(view.document.querySelector('#activate-email-error'), null)
  } finally { await view.close() }
})

test('AU06 rejects invalid OTP, short password and mismatch; valid data stays pending only', async () => {
  const view = mount(ActivationScreen, { navigate: () => {} })
  try {
    await view.render()
    await submit(view)
    assert.ok(view.document.getElementById('activate-email-error'))
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
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
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
    await type(view, '#activate-otp', '123456')
    await type(view, '#activate-password', 'long-password-123')
    await type(view, '#activate-confirm', 'mismatch')
    await submit(view)
    assert.ok(view.document.getElementById('activate-confirm-error'))
    assert.doesNotMatch(view.document.body.textContent, /PENDING_API/)
    await type(view, '#activate-confirm', 'long-password-123')
    await submit(view)
    assert.match(view.document.body.textContent, /PENDING_API/)
    assert.equal(view.document.querySelector('#activate-email').value, 'person@example.com')
    assert.ok(view.document.querySelector('form'))
    assert.doesNotMatch(view.document.body.textContent, /đã kích hoạt|kích hoạt thành công/i)
  } finally { await view.close() }
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
