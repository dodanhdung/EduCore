import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const initial = new JSDOM('<div></div>', { url: 'http://localhost/login' })
globalThis.window = initial.window
globalThis.document = initial.window.document
globalThis.HTMLElement = initial.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); initial.window.close() })
const { RecoveryRequestScreen } = await vite.ssrLoadModule('/src/screens/Authentication & Shared/AU03/RecoveryRequestScreen.tsx')
const { ResetPasswordScreen } = await vite.ssrLoadModule('/src/screens/Authentication & Shared/AU04/ResetPasswordScreen.tsx')
const { passwordError } = await vite.ssrLoadModule('/src/screens/Authentication & Shared/authFormValidation.ts')
const { ApiClient, ApiError } = await vite.ssrLoadModule('/src/api.ts')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function mount(Component, props, path = '/forgot-password') {
  const dom = new JSDOM('<div id="root"></div>', { url: `http://localhost${path}` })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  const root = createRoot(dom.window.document.getElementById('root'))
  await act(async () => root.render(React.createElement(Component, props)))
  return { dom, document: dom.window.document, close: async () => { await act(async () => root.unmount()); dom.window.close() } }
}
async function type(view, selector, value) {
  await act(async () => {
    const input = view.document.querySelector(selector)
    const setter = Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }))
  })
}
async function submit(view, twice = false) {
  await act(async () => {
    const form = view.document.querySelector('form')
    form.dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true }))
    if (twice) form.dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true }))
  })
}
async function fillReset(view, password = 'a secure password 123') {
  await type(view, '#reset-email', 'person@example.test')
  await type(view, '#reset-otp', '123456')
  await type(view, '#reset-password', password)
  await type(view, '#reset-confirm', password)
}

test('password boundaries match backend Unicode code points and 1024 UTF-8 bytes', () => {
  assert.match(passwordError('😀'.repeat(11)), /12/)
  assert.equal(passwordError('😀'.repeat(12)), '')
  assert.equal(passwordError('a'.repeat(1024)), '')
  assert.match(passwordError('a'.repeat(1025)), /1\.024/)
  assert.equal(passwordError('😀'.repeat(256)), '')
  assert.match(passwordError('😀'.repeat(257)), /1\.024/)
})

test('ApiClient sends exact public DTOs, requires HTTP 202/204, and omits credentials', async () => {
  const calls = []
  const api = new ApiClient('http://localhost:3000', async (url, options) => {
    calls.push({ url, options })
    return calls.length === 1 ? new Response('{"accepted":true}', { status: 202 }) : new Response(null, { status: 204 })
  })
  await api.requestPasswordResetOtp('person@example.test')
  await api.completePasswordReset('person@example.test', '123456', 'new password 123')
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), ['/api/v1/auth/password/otp/request', '/api/v1/auth/password/reset'])
  assert.deepEqual(JSON.parse(calls[0].options.body), { email: 'person@example.test' })
  assert.deepEqual(JSON.parse(calls[1].options.body), { email: 'person@example.test', otp: '123456', newPassword: 'new password 123' })
  assert.ok(calls.every(({ options }) => options.credentials === 'omit' && !options.headers.Authorization))
  await assert.rejects(new ApiClient('', async () => new Response('{"accepted":false}', { status: 202 })).requestPasswordResetOtp('x@example.test'), (e) => e instanceof ApiError && e.status === 502)
  await assert.rejects(new ApiClient('', async () => new Response('{}', { status: 200 })).completePasswordReset('x@example.test', '123456', 'new password 123'), (e) => e instanceof ApiError && e.status === 502)
})

test('AU03 blocks duplicate request, gives neutral acceptance, and offers AU04 without URL data', async () => {
  const gate = deferred(), calls = [], paths = []
  const view = await mount(RecoveryRequestScreen, { navigate: (path) => paths.push(path), onRequest: (email) => { calls.push(email); return gate.promise } })
  try {
    await type(view, '#recovery-email', 'person@example.test')
    await submit(view, true)
    assert.deepEqual(calls, ['person@example.test'])
    assert.equal(view.document.querySelector('button[type="submit"]').disabled, true)
    assert.equal(view.document.querySelector('form').getAttribute('aria-busy'), 'true')
    assert.equal(view.document.querySelector('a[href="/reset-password"]'), null)
    await act(async () => gate.resolve())
    assert.match(view.document.querySelector('[role="status"]').textContent, /Nếu tài khoản đủ điều kiện/)
    assert.doesNotMatch(view.document.body.textContent, /đã gửi|gửi thành công/i)
    assert.equal(view.document.activeElement.getAttribute('href'), '/reset-password')
    await act(async () => view.document.querySelector('a[href="/reset-password"]').click())
    assert.deepEqual(paths, ['/reset-password'])
    assert.equal(view.dom.window.location.search, '')
    assert.equal(view.dom.window.localStorage.length + view.dom.window.sessionStorage.length, 0)
  } finally { await view.close() }
})

test('AU03 rejects invalid email locally; rate limit and network failure permit retry without false success', async () => {
  let calls = 0
  const view = await mount(RecoveryRequestScreen, { navigate: () => {}, onRequest: async () => { calls++; if (calls === 1) throw new ApiError(429, 'RATE_LIMITED'); if (calls === 2) throw new TypeError('private host'); } })
  try {
    await type(view, '#recovery-email', 'bad')
    await submit(view)
    assert.equal(calls, 0)
    assert.ok(view.document.querySelector('#recovery-email-error'))
    await type(view, '#recovery-email', 'person@example.test')
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /quá nhiều lần/)
    assert.equal(view.document.querySelector('a[href="/reset-password"]'), null)
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Không thể kết nối/)
    assert.doesNotMatch(view.document.body.textContent, /private host/)
    await submit(view)
    assert.equal(calls, 3)
    assert.ok(view.document.querySelector('a[href="/reset-password"]'))
  } finally { await view.close() }
})

test('AU04 direct entry validates all fields and confirmation before HTTP', async () => {
  let calls = 0
  const view = await mount(ResetPasswordScreen, { navigate: () => {}, onReset: async () => { calls++ } }, '/reset-password')
  try {
    await submit(view)
    for (const id of ['reset-email', 'reset-otp', 'reset-password', 'reset-confirm']) assert.equal(view.document.getElementById(id).getAttribute('aria-invalid'), 'true')
    await fillReset(view)
    await type(view, '#reset-confirm', 'different password')
    await submit(view)
    assert.equal(calls, 0)
    assert.match(view.document.querySelector('#reset-confirm-error').textContent, /không khớp/)
    assert.equal(view.dom.window.location.search, '')
  } finally { await view.close() }
})

test('AU04 only navigates after confirmed 204, blocks duplicates, and clears sensitive fields', async () => {
  const gate = deferred(), calls = [], paths = []
  const view = await mount(ResetPasswordScreen, { navigate: (path) => paths.push(path), onReset: (...args) => { calls.push(args); return gate.promise } }, '/reset-password')
  try {
    await fillReset(view)
    await submit(view, true)
    assert.equal(calls.length, 1)
    assert.equal(view.document.querySelector('button[type="submit"]').disabled, true)
    assert.deepEqual(paths, [])
    await act(async () => gate.resolve())
    assert.deepEqual(paths, ['/login'])
    for (const id of ['reset-email', 'reset-otp', 'reset-password', 'reset-confirm']) assert.equal(view.document.getElementById(id).value, '')
    assert.equal(view.dom.window.location.search, '')
    assert.equal(view.dom.window.localStorage.length + view.dom.window.sessionStorage.length, 0)
  } finally { await view.close() }
})

test('AU04 handles generic OTP failure, throttling, and network errors with safe retry', async () => {
  let calls = 0
  const paths = []
  const view = await mount(ResetPasswordScreen, { navigate: (path) => paths.push(path), onReset: async () => {
    calls++
    if (calls === 1) throw new ApiError(400, 'INVALID_INPUT')
    if (calls === 2) throw new ApiError(429, 'RATE_LIMITED')
    throw new TypeError('private host')
  } }, '/reset-password')
  try {
    await fillReset(view)
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Mã hoặc thông tin chưa hợp lệ/)
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /quá nhiều lần/)
    await submit(view)
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Không thể kết nối/)
    assert.deepEqual(paths, [])
    assert.equal(view.document.querySelector('button[type="submit"]').disabled, false)
    assert.equal(calls, 3)
  } finally { await view.close() }
})
