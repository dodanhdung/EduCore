import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/parent' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const originalFetch = globalThis.fetch
let handler = async () => { throw Error('UNEXPECTED_REQUEST') }
globalThis.fetch = (...args) => handler(...args)
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { PortalProduction } = await vite.ssrLoadModule('/src/screens/Role Portals/PortalProduction.tsx')
const { MyBillingScreen } = await vite.ssrLoadModule('/src/screens/Role Portals/PO05/MyBillingScreen.tsx')
const { DashboardProduction } = await vite.ssrLoadModule('/src/screens/Management & Operations/G01/DashboardProduction.tsx')
after(async () => { globalThis.fetch = originalFetch; await vite.close(); dom.window.close() })
const context = { tenantId: 'tenant', tenantName: 'Center', timeZone: 'Asia/Ho_Chi_Minh',
  asOf: '2026-10-26T00:00:00Z', teacher: null, student: null,
  children: [{ id: 'child-a', name: 'Child Alpha' }, { id: 'child-b', name: 'Child Beta' }] }
const child = (id, name) => ({ id, name, timeZone: context.timeZone, asOf: context.asOf,
  scheduleAvailable: true, assignmentsAvailable: true, gradesAvailable: true, leaveAvailable: true,
  classes: [{ id: `class-${id}`, name: `Class ${name}` }], sessions: [], assignments: [], leaves: [] })
const billing = (id, amount) => ({ id, name: id, timeZone: context.timeZone, asOf: context.asOf,
  status: 'PARTIAL', wallet: null, invoiceCount: 1, invoiceLimit: 20,
  invoices: [{ id: `invoice-${id}`, number: `INV-${id}`, dueAt: '2026-11-01T00:00:00Z',
    netObligationVnd: amount, allocatedVnd: '0', outstandingVnd: amount }],
  totals: { netObligationVnd: amount, allocatedVnd: '0', outstandingVnd: amount } })
const respond = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
const tick = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)) })
const root = createRoot(document.getElementById('root'))
const props = (id, selectedId) => ({ id, selectedId, tenantId: 'tenant', token: 'token', viewerId: 'viewer',
  allowed: ['PO03', 'PO04', 'PO05'], navigate: () => undefined })

test('PO04 ignores a late response for a previously selected child', async () => {
  let resolveA
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond(context)
    if (url.endsWith('/portal/children/child-a')) return new Promise(resolve => { resolveA = resolve })
    if (url.endsWith('/portal/children/child-b')) return respond(child('child-b', 'Beta'))
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO04', 'child-a'))))
  await tick()
  assert.equal(typeof resolveA, 'function')
  await act(async () => root.render(React.createElement(PortalProduction, props('PO04', 'child-b'))))
  await tick()
  assert.match(document.body.textContent, /Child Beta/)
  await act(async () => resolveA(respond(child('child-a', 'Alpha'))))
  await tick()
  assert.match(document.body.textContent, /Child Beta/)
  assert.doesNotMatch(document.body.textContent, /Class Alpha/)
  await act(async () => root.render(null))
})

test('PO03 clears the previous child before loading the new scoped read', async () => {
  let resolveB
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond(context)
    if (url.endsWith('/portal/children/child-a')) return respond(child('child-a', 'Alpha'))
    if (url.endsWith('/portal/billing/child-a')) return respond(billing('child-a', '1234567890123456'))
    if (url.endsWith('/portal/children/child-b')) return new Promise(resolve => { resolveB = resolve })
    if (url.endsWith('/portal/billing/child-b')) return respond(billing('child-b', '42'))
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO03'))))
  await tick()
  assert.match(document.body.textContent, /Child Alpha.*1\.234\.567\.890\.123\.456/)
  const select = document.querySelector('select')
  await act(async () => { select.value = 'child-b'; select.dispatchEvent(new window.Event('change', { bubbles: true })) })
  assert.doesNotMatch(document.body.textContent, /1\.234\.567\.890\.123\.456/)
  await tick()
  await act(async () => resolveB(respond(child('child-b', 'Beta'))))
  await tick()
  assert.match(document.body.textContent, /Child Beta.*42/)
  assert.doesNotMatch(document.body.textContent, /1\.234\.567\.890\.123\.456/)
  await act(async () => root.render(null))
})

test('PO05 renders exact large VND totals and unavailable wallet separately', () => {
  const html = renderToStaticMarkup(React.createElement(MyBillingScreen, { mode: 'unresolved',
    live: { context, billing: billing('child-a', '9007199254740993'), selectedId: 'child-a', onSelectChild: () => undefined } }))
  assert.match(html, /9\.007\.199\.254\.740\.993/)
  assert.match(html, /Chưa có hợp đồng đọc ví/)
  assert.doesNotMatch(html, /Nạp ví|Thanh toán ngay/)
})

test('G01 drops prior tenant KPIs and distinguishes unavailable from measured zero', async () => {
  let resolveNewTenant
  handler = async (url) => {
    if (url.includes('/tenants/tenant-a/portal/overview')) return respond({
      tenantId: 'tenant-a', tenantName: 'First center', timeZone: 'Asia/Ho_Chi_Minh',
      asOf: context.asOf, scope: 'Effective grants', students: 99, classes: 4, outstandingVnd: '1234',
    })
    if (url.includes('/tenants/tenant-b/portal/overview')) return new Promise(resolve => { resolveNewTenant = resolve })
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(DashboardProduction, { tenantId: 'tenant-a', token: 'first' })))
  await tick()
  assert.match(document.body.textContent, /First center.*99/)
  await act(async () => root.render(React.createElement(DashboardProduction, { tenantId: 'tenant-b', token: 'second' })))
  assert.doesNotMatch(document.body.textContent, /First center|1234/)
  await tick()
  await act(async () => resolveNewTenant(respond({
    tenantId: 'tenant-b', tenantName: 'Second center', timeZone: 'Asia/Ho_Chi_Minh',
    asOf: context.asOf, scope: 'Effective grants', students: null, classes: 0, outstandingVnd: null,
  })))
  await tick()
  assert.match(document.body.textContent, /Second center/)
  assert.match(document.body.textContent, /Chưa có quyền xem/)
  assert.match(document.body.textContent, /0/)
  assert.doesNotMatch(document.body.textContent, /First center|1234/)
  await act(async () => root.render(null))
})
