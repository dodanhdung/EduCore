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
globalThis.fetch = async (url, options) => {
  calls.push({ url, method: options.method, body: options.body, auth: options.headers.Authorization })
  const body = options.method === 'POST' ? { id: member, status: 'PENDING_ACTIVATION' }
    : { items: [{ id: member, userId: member, email: 'real@example.test', displayName: 'Real Member',
      status: 'PENDING_ACTIVATION', accountStatus: 'PENDING_ACTIVATION', assignments: [] }], page: 1, pageSize: 20, total: 1, asOf: new Date().toISOString() }
  return new Response(JSON.stringify(body), { status: options.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } })
}
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { ProductionManagement } = await vite.ssrLoadModule('/src/screens/Management & Operations/ProductionManagement.tsx')
after(async () => { await vite.close(); dom.window.close() })

test('OP01 production reads the selected tenant and submits a real create request', async () => {
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
