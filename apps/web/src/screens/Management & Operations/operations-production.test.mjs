import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/audit' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let handler = async () => new Response('{}', { status: 404 })
globalThis.fetch = (...args) => handler(...args)
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); dom.window.close() })
const { NotificationProduction } = await vite.ssrLoadModule('/src/screens/Authentication & Shared/GL01/NotificationProduction.tsx')
const { OperationsProduction } = await vite.ssrLoadModule('/src/screens/Management & Operations/OperationsProduction.tsx')
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const tenantId = '00000000-0000-4000-8000-000000000001'
const recordId = '00000000-0000-4000-8000-000000000002'
const at = '2026-10-25T03:00:00Z'
async function mount(Component, props) {
  const root = createRoot(document.getElementById('root'))
  await act(async () => { root.render(React.createElement(Component, props)); await new Promise((resolve) => setTimeout(resolve, 20)) })
  return async () => { await act(async () => root.unmount()) }
}

test('GL01 reads authenticated data and waits for server confirmation before marking read', async () => {
  let read = false
  const calls = []
  handler = async (url, options) => {
    calls.push({ url: String(url), method: options.method, auth: options.headers.Authorization })
    if (String(url).endsWith('/notifications/unread-count')) return json({ count: read ? 0 : 1 })
    if (String(url).includes('/notifications?')) return json({ items: [{ id: recordId, kind: 'SCHEDULE_CHANGED', title: 'Schedule changed', body: 'Open the authorized resource for current details.', readAt: read ? at : null, createdAt: at }], page: 1, pageSize: 20, total: 1, timezone: 'Asia/Ho_Chi_Minh' })
    if (String(url).endsWith(`/notifications/${recordId}/read`)) { read = true; return json({ id: recordId, read: true }) }
    return json({}, 404)
  }
  const close = await mount(NotificationProduction, { tenantId, token: 'TEST_TOKEN' })
  try {
    assert.match(document.body.textContent, /Schedule changed/)
    assert.match(document.body.textContent, /Chưa đọc \(1\)/)
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Đánh dấu đã đọc')
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.equal(read, true)
    assert.match(document.body.textContent, /Đã đọc/)
    assert.ok(calls.every((call) => call.auth === 'Bearer TEST_TOKEN'))
  } finally { await close() }
})

test('OP06 queries server-scoped audit data and never renders raw payload', async () => {
  const paths = []
  handler = async (url) => {
    paths.push(String(url))
    return json({ items: [{ id: recordId, eventType: 'JOB_ENQUEUED', entityType: 'AutomationJob', entityId: recordId,
      actorKind: 'USER', actorDisplay: 'Operator', createdAt: at, outcome: null, reasonCode: null,
      policyVersionId: recordId, correlationId: recordId, after_json: { password: 'SECRET_VALUE' } }],
    page: 1, pageSize: 20, total: 1, timezone: 'Asia/Ho_Chi_Minh' })
  }
  const close = await mount(OperationsProduction, { id: 'OP06', tenantId, token: 'TEST_TOKEN' })
  try {
    assert.match(document.body.textContent, /JOB_ENQUEUED/)
    assert.doesNotMatch(document.body.textContent, /SECRET_VALUE/)
    assert.ok(paths.some((path) => path.includes('/audit?page=1')))
  } finally { await close() }
})

test('OP07 keeps retry unavailable when server says NEEDS_INFORMATION', async () => {
  const job = { id: recordId, jobKind: 'SCHEDULE_CHECK', status: 'NEEDS_INFORMATION', attemptCount: 1,
    nextAttemptAt: at, lastErrorCode: 'P0002', policyVersionId: recordId, correlationId: recordId,
    sourceType: 'ClassSession', sourceId: recordId, retryEligible: false, attempts: [] }
  handler = async (url) => String(url).endsWith(`/jobs/${recordId}`) ? json(job)
    : String(url).includes('/audit/operations/') ? json({ code: 'FORBIDDEN' }, 403)
      : json({ items: [job], page: 1, pageSize: 20, total: 1, timezone: 'Asia/Ho_Chi_Minh' })
  const close = await mount(OperationsProduction, { id: 'OP07', tenantId, token: 'TEST_TOKEN' })
  try {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Xem')
    await act(async () => { button.click(); await new Promise((resolve) => setTimeout(resolve, 20)) })
    assert.match(document.body.textContent, /NEEDS_INFORMATION/)
    assert.doesNotMatch(document.body.textContent, /Xác nhận retry/)
  } finally { await close() }
})
