import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant-a/overview' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); dom.window.close() })
const { ApiError } = await vite.ssrLoadModule('/src/api.ts')
const { DashboardProduction } = await vite.ssrLoadModule('/src/screens/Management & Operations/G01/DashboardProduction.tsx')
const { G01DashboardView } = await vite.ssrLoadModule('/src/screens/Management & Operations/G01/DashboardView.tsx')
const { fromOverviewResponse, fromManagementFixture, formatAsOf, formatVnd, overviewPath } = await vite.ssrLoadModule('/src/screens/Management & Operations/G01/DashboardViewModel.ts')
const { ManagerDashboardScreen } = await vite.ssrLoadModule('/src/screens/Management & Operations/G01/ManagerDashboardScreen.tsx')
const { ManagementPreviewContext } = await vite.ssrLoadModule('/src/screens/Management & Operations/ManagementTypes.ts')
const { managementFixtures } = await vite.ssrLoadModule('/src/ui-preview/managementFixtures.ts')
const e = React.createElement
const documentFor = element => new JSDOM(renderToStaticMarkup(element)).window.document
const response = (tenantId, patch = {}) => ({ tenantId, tenantName: 'Trung tâm hiện tại', timeZone: 'Asia/Ho_Chi_Minh',
  asOf: '2026-10-24T03:00:00Z', scope: 'Effective tenant, class and student grants',
  students: 1248, classes: 46, outstandingVnd: '84500000', ...patch })
const cards = doc => [...doc.querySelectorAll('section[aria-label="Ba chỉ số tổng quan"] > section')]

test('G01 adapter validates tenant, counts, timezone and decimal-string money', () => {
  const model = fromOverviewResponse(response('tenant-a', { students: 0, classes: null,
    outstandingVnd: '9007199254740993' }), 'tenant-a')
  assert.equal(model.students, 0)
  assert.equal(model.classes, null)
  assert.equal(formatVnd(model.outstandingVnd), '9.007.199.254.740.993 ₫')
  assert.match(formatAsOf('2026-10-24T23:00:00Z', model.timeZone), /25\/10\/2026/)
  for (const bad of [response('tenant-b'), response('tenant-a', { students: -1 }),
    response('tenant-a', { classes: 1.5 }), response('tenant-a', { outstandingVnd: 9e15 }),
    response('tenant-a', { timeZone: 'Invalid/Zone' }), response('tenant-a', { asOf: 'bad-date' })]) {
    assert.throws(() => fromOverviewResponse(bad, 'tenant-a'), /INVALID_RESPONSE/)
  }
  assert.equal(overviewPath('tenant/a'), '/api/v1/tenants/tenant%2Fa/portal/overview')
})

test('G01 uses three semantic KPI cards, preserves zero and null, and has no ungranted actions', () => {
  const model = fromOverviewResponse(response('tenant-a', { students: 0, classes: null,
    outstandingVnd: '9007199254740993' }), 'tenant-a')
  const doc = documentFor(e(G01DashboardView, { presentation: { kind: 'ready', model } }))
  assert.equal(doc.querySelectorAll('h1').length, 1)
  assert.deepEqual(cards(doc).map(card => card.querySelector('h2')?.textContent),
    ['Học viên đang theo học', 'Lớp học đang hoạt động', 'Công nợ học phí chưa thu'])
  assert.equal(cards(doc)[0].querySelector('strong')?.textContent, '0')
  assert.match(cards(doc)[1].textContent, /Chưa có quyền xem/)
  assert.match(cards(doc)[2].textContent, /9\.007\.199\.254\.740\.993 ₫/)
  assert.equal(doc.querySelectorAll('button,a').length, 0)
  assert.doesNotMatch(doc.body.textContent, /Lớp học diễn ra hôm nay|Hoạt động gần đây|18 học viên quá hạn/)
})

test('DEV fixture adapter and production use the same G01 presentation markup', () => {
  const preview = e(ManagementPreviewContext.Provider, { value: true },
    e(ManagerDashboardScreen, { data: managementFixtures, canReview: false, open() {} }))
  const direct = e(G01DashboardView, { presentation: { kind: 'ready', model: fromManagementFixture(managementFixtures) } })
  assert.equal(renderToStaticMarkup(preview), renderToStaticMarkup(direct))
  assert.equal(cards(documentFor(preview)).length, 3)
})

test('G01 errors and loading never render KPI content or unauthorized Retry', () => {
  for (const kind of ['loading', 'unauthenticated', 'forbidden', 'not-found', 'conflict']) {
    const doc = documentFor(e(G01DashboardView, { presentation: { kind, onRetry() {} } }))
    assert.equal(cards(doc).length, 0)
    assert.equal(doc.querySelector('button'), null)
  }
  const error = documentFor(e(G01DashboardView, { presentation: { kind: 'error', onRetry() {} } }))
  assert.equal(error.querySelector('button')?.textContent, 'Thử lại')
})

test('G01 ignores late old-scope responses and clears data on 403/401', async () => {
  const pending = []
  const loadOverview = (tenantId, token, signal) => new Promise((resolve, reject) => pending.push({ tenantId, token, signal, resolve, reject }))
  const root = createRoot(document.getElementById('root'))
  let revoked = 0
  const render = async (tenantId, token) => act(async () => root.render(e(DashboardProduction,
    { tenantId, token, loadOverview, onUnauthorized: () => { revoked++ } })))
  const flush = async callback => act(async () => { callback(); await Promise.resolve() })
  try {
    await render('tenant-a', 'one')
    assert.equal(cards(document).length, 0)
    await flush(() => pending[0].resolve(response('tenant-a')))
    assert.match(document.body.textContent, /1\.248/)
    await render('tenant-a', 'two')
    assert.doesNotMatch(document.body.textContent, /1\.248/)
    await render('tenant-b', 'three')
    await flush(() => pending[1].resolve(response('tenant-a', { students: 999 })))
    assert.doesNotMatch(document.body.textContent, /999/)
    await flush(() => pending[2].reject(new ApiError(403, 'FORBIDDEN')))
    assert.equal(cards(document).length, 0)
    assert.equal(document.querySelector('button'), null)
    assert.match(document.body.textContent, /Không có quyền/)
    await render('tenant-b', 'four')
    await flush(() => pending[3].reject(new ApiError(401, 'EXPIRED')))
    assert.equal(revoked, 1)
    assert.equal(cards(document).length, 0)
    assert.equal(document.querySelector('button'), null)
  } finally { await act(async () => root.unmount()) }
})

test('G01 retries only failed read and renders authoritative zero after response', async () => {
  const pending = []
  const loadOverview = (_tenantId, _token, _signal) => new Promise((resolve, reject) => pending.push({ resolve, reject }))
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(e(DashboardProduction, { tenantId: 'tenant-a', token: 'one', loadOverview })))
    await act(async () => { pending[0].reject(new ApiError(503, 'UNAVAILABLE')); await Promise.resolve() })
    const retry = [...document.querySelectorAll('button')].find(button => button.textContent === 'Thử lại')
    assert.ok(retry)
    await act(async () => retry.click())
    assert.equal(cards(document).length, 0)
    assert.equal(pending.length, 2)
    await act(async () => { pending[1].resolve(response('tenant-a', { students: 0, classes: 0, outstandingVnd: '0' })); await Promise.resolve() })
    assert.deepEqual(cards(document).map(card => card.querySelector('strong')?.textContent), ['0', '0', '0 ₫'])
  } finally { await act(async () => root.unmount()) }
})
