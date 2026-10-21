import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { validateLogin } from './loginValidation.ts'

const initialDom = new JSDOM('<div></div>', { url: 'http://localhost/login' })
globalThis.window = initialDom.window
globalThis.document = initialDom.window.document
globalThis.HTMLElement = initialDom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
after(async () => { await vite.close(); initialDom.window.close() })
const { LoginScreen } = await vite.ssrLoadModule('/src/screens/Authentication & Shared/AU01/LoginScreen.tsx')
const { AppView } = await vite.ssrLoadModule('/src/App.tsx')

function renderLogin(props = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/login' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(dom.window.document.getElementById('root'))
  return { dom, root, render: async (next = props) => { await act(async () => root.render(React.createElement(LoginScreen, { navigate: () => {}, ...next }))) }, close: async () => { await act(async () => root.unmount()); dom.window.close() } }
}

function typeInto(input, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, value)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
}

test('AU01 public route renders the form; protected routes remain guarded', () => {
  const state = { status: 'unauthenticated' }
  const markup = renderToStaticMarkup(React.createElement(AppView, { state, path: '/login', navigate: () => {}, onLogout: () => {} }))
  assert.match(markup, /Đăng nhập tài khoản/)
  assert.match(markup, /name="email"/)
  assert.match(markup, /name="password"/)
  const protectedMarkup = renderToStaticMarkup(React.createElement(AppView, { state, path: '/app/tenant/me', navigate: () => {}, onLogout: () => {} }))
  assert.match(protectedMarkup, /Cần đăng nhập/)
  assert.doesNotMatch(protectedMarkup, /Trung tâm đang chọn/)
})

test('validation rejects invalid email and missing password', () => {
  assert.equal(validateLogin('bad', 'x').email, 'Địa chỉ email không hợp lệ.')
  assert.equal(validateLogin('a@example.com', '').password, 'Vui lòng nhập mật khẩu.')
  assert.deepEqual(validateLogin('a@example.com', 'secret'), { email: '', password: '' })
})

test('form shows validation, visibility toggle, safe errors and forgot-password navigation', async () => {
  let path = ''
  const view = renderLogin({ navigate: (next) => { path = next }, feedback: 'invalid_credentials' })
  try {
    await view.render()
    const document = view.dom.window.document
    assert.match(document.querySelector('[role="alert"]').textContent, /Email hoặc mật khẩu chưa đúng/)
    await act(async () => document.querySelector('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(document.querySelector('#login-email').getAttribute('aria-invalid'), 'true')
    assert.equal(document.querySelector('#login-password').getAttribute('aria-invalid'), 'true')
    await act(async () => document.querySelector('.login-visibility').click())
    assert.equal(document.querySelector('#login-password').type, 'text')
    assert.equal(document.querySelector('.login-visibility').getAttribute('aria-label'), 'Ẩn mật khẩu')
    await act(async () => document.querySelector('a[href="/forgot-password"]').click())
    assert.equal(path, '/forgot-password')
  } finally { await view.close() }
})

test('valid local submit never authenticates; asynchronous submit stays disabled while pending', async () => {
  const view = renderLogin()
  try {
    await view.render()
    const document = view.dom.window.document
    await act(async () => { typeInto(document.querySelector('#login-email'), 'a@example.com'); typeInto(document.querySelector('#login-password'), 'secret') })
    await act(async () => document.querySelector('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.match(document.querySelector('[role="status"]').textContent, /chưa được kết nối/)
    assert.equal(document.querySelector('.login-submit').disabled, false)
    let resolveSubmit
    const pending = new Promise((resolve) => { resolveSubmit = resolve })
    await view.render({ navigate: () => {}, onSubmit: () => pending })
    await act(async () => document.querySelector('form').dispatchEvent(new view.dom.window.Event('submit', { bubbles: true, cancelable: true })))
    assert.equal(document.querySelector('.login-submit').disabled, true)
    assert.match(document.querySelector('.login-submit').textContent, /Đang đăng nhập/)
    await act(async () => resolveSubmit())
    assert.equal(document.querySelector('.login-submit').disabled, false)
    assert.doesNotMatch(document.body.textContent, /Đã xác thực/)
  } finally { await view.close() }
})
