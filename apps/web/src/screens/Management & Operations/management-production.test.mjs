import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/settings/members' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.FormData = dom.window.FormData
globalThis.IS_REACT_ACT_ENVIRONMENT = true
window.confirm = () => true
const tenant = '00000000-0000-4000-8000-000000000001'
const member = '00000000-0000-4000-8000-000000000002'
const calls = []
let denySelectors = false
let denyMutations = false
globalThis.fetch = async (url, options) => {
  calls.push({ url, method: options.method, body: options.body, auth: options.headers.Authorization })
  if ((denySelectors && /\/parent-student-links\/(parents|students)/.test(url)) || (denyMutations && options.method !== 'GET'))
    return new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403, headers: { 'content-type': 'application/json' } })
  const record = { id: member, userId: member, email: 'real@example.test', displayName: 'Real Member',
    status: 'PENDING_ACTIVATION', accountStatus: 'PENDING_ACTIVATION', assignments: [] }
  const body = options.method === 'POST' ? { id: member, status: 'PENDING_ACTIVATION' }
    : url.endsWith(`/members/${member}`) ? record
      : url.includes('/parent-student-links/parents') ? { items: [{ id: member, name: 'Parent One' }], page: 1, pageSize: 100, total: 1 }
        : url.includes('/parent-student-links/students') ? { items: [{ id: member, name: 'Student One', code: 'S1' }], page: 1, pageSize: 100, total: 1 }
          : url.includes('/parent-student-links') ? { items: [], page: 1, pageSize: 20, total: 0 }
            : { items: [record], page: 1, pageSize: 20, total: 1, asOf: new Date().toISOString() }
  return new Response(JSON.stringify(body), { status: options.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } })
}
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { ProductionManagement } = await vite.ssrLoadModule('/src/screens/Management & Operations/ProductionManagement.tsx')
const { AppView } = await vite.ssrLoadModule('/src/App.tsx')
after(async () => { await vite.close(); dom.window.close() })

test('OP01 production reads the selected tenant and submits a real create request', async () => {
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  const session = { accessToken: 'live-token', navigation: { screenIds: ['OP01'] } }
  try {
    await act(async () => { root.render(React.createElement(ProductionManagement, { id: 'OP01', tenantId: tenant, session, open() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.match(document.body.textContent, /Real Member/)
    assert.doesNotMatch(document.body.textContent, /Preview|yen.le@educore.vn/)
    assert.equal(calls[0].url, `/api/v1/tenants/${tenant}/members?page=1`)
    assert.equal(calls[0].auth, 'Bearer live-token')
    const form = document.querySelector('form')
    form.querySelector('[name=email]').value = 'new@example.test'
    form.querySelector('[name=displayName]').value = 'New Member'
    form.querySelector('[name=reason]').value = 'Onboarding'
    await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    const create = calls.find((c) => c.method === 'POST')
    assert.ok(create)
    assert.equal(create.url, `/api/v1/tenants/${tenant}/members`)
    assert.deepEqual(JSON.parse(create.body), { email: 'new@example.test', displayName: 'New Member', reason: 'Onboarding' })
  } finally { await act(async () => root.unmount()) }
})
test('OP01 opens the selected membership through the approved OP02 route', async () => {
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  const session = { accessToken: 'live-token', csrfToken: 'csrf', expiresAt: Date.now() + 600_000,
    tenantEpoch: 1, principal: { id: member, sessionId: member, tenantId: tenant, allowedTenants: [{ id: tenant, name: 'Center' }] },
    navigation: { userId: member, sessionId: member, tenantId: tenant, tenantEpoch: 1,
      validUntil: Date.now() + 30_000, screenIds: ['OP01', 'OP02', 'OP03'] } }
  const state = { status: 'authenticated', session }
  let nextPath = ''
  try {
    await act(async () => { root.render(React.createElement(AppView, { state, path: `/app/${tenant}/settings/members`, navigate(path) { nextPath = path }, onLogout() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    const view = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Xem')
    assert.ok(view)
    await act(async () => view.click())
    assert.equal(nextPath, `/app/${tenant}/settings/members/${member}`)
    await act(async () => { root.render(React.createElement(AppView, { state, path: nextPath, navigate() {}, onLogout() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.match(document.body.textContent, /Real Member/)
    assert.ok(calls.some((c) => c.url === `/api/v1/tenants/${tenant}/members/${member}`))
  } finally { await act(async () => root.unmount()) }
})
test('OP03 selector denial disables create, and denied mutation never reports success', async () => {
  calls.length = 0
  denySelectors = true
  const root = createRoot(document.getElementById('root'))
  const session = { accessToken: 'live-token', navigation: { screenIds: ['OP03'] } }
  try {
    await act(async () => { root.render(React.createElement(ProductionManagement, { id: 'OP03', tenantId: tenant, session, open() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.match(document.body.textContent, /Tạo quan hệ đang tắt/)
    assert.equal(document.querySelector('select[name=parent]'), null)
  } finally { await act(async () => root.unmount()); denySelectors = false }
  const secondRoot = createRoot(document.getElementById('root'))
  denyMutations = true
  try {
    await act(async () => { secondRoot.render(React.createElement(ProductionManagement, { id: 'OP01', tenantId: tenant, session, open() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    const form = document.querySelector('form')
    form.querySelector('[name=email]').value = 'new@example.test'
    form.querySelector('[name=displayName]').value = 'New Member'
    form.querySelector('[name=reason]').value = 'Onboarding'
    await act(async () => { form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.doesNotMatch(document.body.textContent, /Đã tạo thành viên/)
    assert.match(document.body.textContent, /không có quyền/)
  } finally { await act(async () => secondRoot.unmount()); denyMutations = false }
})
test('OP03 uses authorized Parent and Student selector responses', async () => {
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  const session = { accessToken: 'live-token', navigation: { screenIds: ['OP03'] } }
  try {
    await act(async () => { root.render(React.createElement(ProductionManagement, { id: 'OP03', tenantId: tenant, session, open() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.equal(document.querySelector('select[name=parent] option:last-child').value, member)
    assert.equal(document.querySelector('select[name=student] option:last-child').value, member)
    assert.ok(calls.some((c) => c.url === `/api/v1/tenants/${tenant}/parent-student-links/parents?pageSize=100`))
    assert.ok(calls.some((c) => c.url === `/api/v1/tenants/${tenant}/parent-student-links/students?pageSize=100`))
  } finally { await act(async () => root.unmount()) }
})
