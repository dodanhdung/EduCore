import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'
import { ApiClient } from '../../api.ts'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { BillingProduction } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BillingProduction.tsx')
const root = createRoot(dom.window.document.getElementById('root'))
after(async () => { await act(async () => root.unmount()); await vite.close(); dom.window.close() })

test('R10 BL03 renders missing-source history without automatically opening a period or generating drafts', async () => {
  const calls = []
  const container = document.createElement('div')
  document.body.append(container)
  const fixtureRoot = createRoot(container)
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), method: options.method })
    const items = String(url).includes('/billing/students') ? [] : [{ id: 'period-a', monthStart: '2026-09-01', timezone: 'Asia/Ho_Chi_Minh', status: 'OPEN', draftCount: 0, issuedCount: 0,
      generations: [{ id: 'generation-a', studentId: 'student-a', status: 'NEEDS_INFORMATION', createdAt: '2026-10-01T00:00:00Z', missing: ['Chưa xác nhận điểm danh'], reason: 'Review', invoiceId: null, current: true }] }]
    return Response.json({ items, page: 1, pageSize: 20, total: items.length })
  })
  try {
    await act(async () => fixtureRoot.render(React.createElement(BillingProduction, { id: 'BL03', tenantId: 'tenant-a', token: 'token-a', api, navigate() {} })))
    assert.match(container.textContent, /NEEDS_INFORMATION/)
    assert.match(container.textContent, /Chưa xác nhận điểm danh/)
    assert.match(container.textContent, /Chưa có dự thảo/)
    assert.ok(!container.querySelector('.billing-open-period').open)
    assert.equal(calls.filter(c => c.method !== 'GET').length, 0)
    assert.ok([...container.querySelectorAll('button')].find(b => b.textContent === 'Tạo dự thảo').disabled)
  } finally { await act(async () => fixtureRoot.unmount()); container.remove() }
})

const detail = {
  id: 'invoice-a', studentId: 'student-a', studentName: 'Lan', periodId: 'period-a', period: '2025-09-01',
  status: 'DRAFT', number: null, issuedAt: null, dueAt: null, grossVnd: '800000', discountVnd: '0',
  totalVnd: '800000', policyVersionId: 'policy-a', canIssue: true, currentGenerationId: 'generation-a',
  latestGenerationId: 'generation-a', generationHistory: [], payments: [], adjustments: [],
  snapshot: { id: 'generation-a', source: { timezone: 'Asia/Ho_Chi_Minh', sibling: false,
    siblingEvidence: [], missing: [], lines: [] } },
  lines: [{ id: 'line-a', amountVnd: '800000', source: { sessionId: 'session-a', sourceBusinessDate: '2025-09-20',
    sourceStatus: 'ATTENDED', units: 1, priceRuleId: 'rule-a', priceScope: 'COURSE',
    priceEffectiveFrom: '2025-01-01', priceEffectiveTo: null, unitPriceVnd: '800000' } }],
}
function setInput(node, value) {
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
  setter.call(node, value)
  node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}

test('BL05 waits for an authenticated ISSUE response before navigating and sends the reviewed generation', async () => {
  const calls = [], navigated = []
  let complete
  const pending = new Promise((resolve) => { complete = resolve })
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), options })
    return options.method === 'POST' ? pending : Response.json(detail)
  })
  await act(async () => {
    root.render(React.createElement(BillingProduction, { id: 'BL05', tenantId: 'tenant-a', token: 'token-a',
      selectedId: 'invoice-a', api, navigate: (path) => navigated.push(path) }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  const issue = [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Phát hành')
  assert.ok(issue.disabled)
  await act(async () => {
    setInput(dom.window.document.querySelector('textarea'), 'Reviewed source and policy')
    dom.window.document.querySelector('input[type="checkbox"]').click()
  })
  assert.equal(issue.disabled, false)
  await act(async () => issue.click())
  assert.equal(navigated.length, 0)
  const post = calls.find((call) => call.options.method === 'POST')
  assert.match(post.url, /\/tenants\/tenant-a\/billing\/drafts\/invoice-a\/issue$/)
  assert.equal(post.options.headers.Authorization, 'Bearer token-a')
  assert.ok(post.options.headers['Idempotency-Key'])
  assert.deepEqual(JSON.parse(post.options.body), { reason: 'Reviewed source and policy', confirmed: true,
    expectedGenerationId: 'generation-a' })
  await act(async () => complete(Response.json({ id: 'invoice-a', status: 'ISSUED' })))
  assert.deepEqual(navigated, ['/app/tenant-a/finance/invoices/invoice-a'])
})

test('BL07 explicit wallet payment sends the reviewed amount and preserves invoice scope', async () => {
  const calls = []
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), options })
    if (options.method === 'POST') return Response.json({ id: 'payment-a', balanceVnd: '200000', outstandingVnd: '500000' })
    if (String(url).includes('/receivable')) return Response.json({ originalTotalVnd: '800000', netObligationVnd: '800000', netAllocatedVnd: '0', outstandingVnd: '800000', status: 'ISSUED' })
    if (String(url).includes('/finance/students/')) return Response.json({ balanceVnd: '500000', canTopUp: true })
    return Response.json({ ...detail, id: 'invoice-a', status: 'ISSUED', number: 'INV-1', canIssue: false })
  })
  await act(async () => { root.render(React.createElement(BillingProduction, { id: 'BL07', tenantId: 'tenant-a', token: 'token-a',
    selectedId: 'invoice-a', api, navigate() {} })); await new Promise((resolve) => setTimeout(resolve, 20)) })
  const amount = document.querySelector('input[inputmode="numeric"]')
  const reason = [...document.querySelectorAll('input')].find((node) => node.value === '' && node !== amount && node.type !== 'checkbox')
  const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
  await act(async () => {
    setter.call(amount, '300000'); amount.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    setter.call(reason, 'Explicit payment'); reason.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    document.querySelector('input[type="checkbox"]').click()
  })
  const pay = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Thanh toán từ ví')
  assert.equal(pay.disabled, false)
  await act(async () => { pay.click(); await new Promise((resolve) => setTimeout(resolve, 20)) })
  const post = calls.find((call) => call.options.method === 'POST')
  assert.match(post.url, /\/invoices\/invoice-a\/wallet-payments$/)
  assert.deepEqual(JSON.parse(post.options.body), { amountVnd: '300000', reason: 'Explicit payment', confirmed: true })
  assert.ok(post.options.headers['Idempotency-Key'])
})

const { ApiClient: GateApiClient } = await vite.ssrLoadModule('/src/api.ts')
const gatePeriod = { id: 'period-private', monthStart: '2026-09-01', timezone: 'Asia/Ho_Chi_Minh', status: 'OPEN', draftCount: 0, issuedCount: 0, generations: [] }
const gatePage = (items = [gatePeriod], page = 1, total = items.length) => ({ items, page, pageSize: 20, total })
async function billingFixture(run) {
  const container = document.createElement('div')
  document.body.append(container)
  const fixtureRoot = createRoot(container)
  const render = async props => act(async () => fixtureRoot.render(React.createElement(BillingProduction, props)))
  try { await run({ container, render }) }
  finally { await act(async () => fixtureRoot.unmount()); container.remove() }
}
for (const status of [401, 403]) test('Gate0 BL03 loaded content and controls are cleared on ' + status, async () => {
  await billingFixture(async ({ container, render }) => {
    let denied = false
    const api = new GateApiClient('', async url => denied ? Response.json({ code: 'AUTH_FAILURE' }, { status })
      : Response.json(gatePage(String(url).includes('/students') ? [] : [gatePeriod])))
    const props = { id: 'BL03', tenantId: 'gate-a', token: 'token-a', api, navigate() {} }
    await render(props)
    assert.match(container.textContent, /2026-09-01/)
    denied = true
    await render({ ...props, token: 'token-b' })
    assert.doesNotMatch(container.textContent, /2026-09-01|Mở kỳ tháng|Tạo dự thảo/)
    assert.equal(container.querySelector('table, select, textarea'), null)
    assert.ok(![...container.querySelectorAll('button')].some(b => /Thử tải lại/.test(b.textContent)))
    assert.match(container.textContent, status === 401 ? /đăng nhập lại/i : /không có quyền/i)
  })
})
for (const failure of [503, 'network']) test('Gate0 BL03 explicit retry after ' + failure + ' performs reads only', async () => {
  await billingFixture(async ({ container, render }) => {
    let fail = true
    const requests = []
    const api = new GateApiClient('', async (url, options) => {
      requests.push(options.method)
      if (fail) { if (failure === 'network') throw new TypeError('network'); return Response.json({ code: 'UNAVAILABLE' }, { status: failure }) }
      return Response.json(gatePage(String(url).includes('/students') ? [] : [gatePeriod]))
    })
    await render({ id: 'BL03', tenantId: 'gate-a', token: 'token-a', api, navigate() {} })
    const retry = [...container.querySelectorAll('button')].find(b => b.textContent === 'Thử tải lại')
    assert.ok(retry)
    assert.equal(container.querySelector('table'), null)
    fail = false
    await act(async () => retry.click())
    assert.match(container.textContent, /2026-09-01/)
    assert.ok(requests.every(method => method === 'GET'))
  })
})
for (const status of [409, 422]) test('Gate0 BL03 domain error ' + status + ' is not a generic retryable failure', async () => {
  await billingFixture(async ({ container, render }) => {
    const api = new GateApiClient('', async () => Response.json({ code: 'DOMAIN_ERROR' }, { status }))
    await render({ id: 'BL03', tenantId: 'gate-a', token: 'token-a', api, navigate() {} })
    assert.match(container.textContent, status === 409 ? /thay đổi|xung đột/i : /hợp lệ/i)
    assert.ok(![...container.querySelectorAll('button')].some(b => /Thử tải lại/.test(b.textContent)))
  })
})

test('Gate0 BL07 ambiguous payment retains original key across token refresh and receipt reconciliation without POST retry', async () => {
  await billingFixture(async ({ container, render }) => {
    const calls = []
    let lookup = 0
    const storageKey = 'educore:wallet-payment:gate-wallet:invoice-gate'
    window.sessionStorage.removeItem(storageKey)
    const api = new GateApiClient('', async (url, options) => {
      calls.push({ url: String(url), options })
      if (options.method === 'POST') throw new TypeError('ambiguous transport failure')
      if (String(url).includes('/outcomes/PAY/')) return Response.json({ status: lookup++ ? 'COMMITTED' : 'PENDING_RECONCILIATION' })
      if (String(url).endsWith('/receivable')) return Response.json({ originalTotalVnd: '800000', netObligationVnd: '800000', netAllocatedVnd: '100000', outstandingVnd: '700000', status: 'ISSUED' })
      if (String(url).includes('/finance/students/')) return Response.json({ balanceVnd: '500000', canTopUp: true })
      return Response.json({ ...detail, id: 'invoice-gate', status: 'ISSUED', number: 'INV-GATE', canIssue: false })
    })
    const props = { id: 'BL07', tenantId: 'gate-wallet', token: 'token-a', selectedId: 'invoice-gate', api, navigate() {} }
    try {
      await render(props)
      for (const amount of ['800.000', '100.000', '700.000', '500.000']) assert.ok(container.textContent.includes(amount))
      const fields = container.querySelectorAll('input')
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      await act(async () => {
        const amount = container.querySelector('input[inputmode="numeric"]')
        const reason = [...fields].find(n => n.type !== 'checkbox' && n !== amount)
        setter.call(amount, '300000'); amount.dispatchEvent(new window.Event('input', { bubbles: true }))
        setter.call(reason, 'Reviewed payment'); reason.dispatchEvent(new window.Event('input', { bubbles: true }))
        container.querySelector('input[type="checkbox"]').click()
      })
      await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Thanh toán từ ví').click())
      const payment = calls.find(c => c.options.method === 'POST')
      const originalKey = payment.options.headers['Idempotency-Key']
      assert.ok(originalKey)
      assert.equal(JSON.parse(window.sessionStorage.getItem(storageKey)).key, originalKey)
      await render({ ...props, token: 'token-b' })
      const receipt = () => [...container.querySelectorAll('button')].find(b => /biên nhận|receipt/i.test(b.textContent))
      assert.ok(receipt())
      await act(async () => receipt().click())
      assert.equal(JSON.parse(window.sessionStorage.getItem(storageKey)).key, originalKey)
      await act(async () => receipt().click())
      const lookups = calls.filter(c => c.url.includes('/outcomes/PAY/'))
      assert.equal(lookups.length, 2)
      assert.ok(lookups.every(c => c.url.endsWith('/' + originalKey)))
      assert.equal(calls.filter(c => c.options.method === 'POST').length, 1)
      assert.equal(window.sessionStorage.getItem(storageKey), null)
    } finally { window.sessionStorage.removeItem(storageKey) }
  })
})

test('Gate0 BL03 paging is scope-local and late previous-page responses cannot restore data', async () => {
  await billingFixture(async ({ container, render }) => {
    let release
    let delayed = false
    const requests = []
    const api = new GateApiClient('', async (url, options) => {
      requests.push({ url: String(url), options })
      if (String(url).includes('/students')) return Response.json(gatePage([]))
      if (String(url).includes('page=2') && !delayed) {
        delayed = true
        return new Promise(resolve => { release = () => resolve(Response.json(gatePage([{ ...gatePeriod, monthStart: '1999-01-01' }], 2, 40))) })
      }
      return Response.json(gatePage([gatePeriod], 1, 40))
    })
    const props = { id: 'BL03', tenantId: 'gate-a', token: 'token-a', api, navigate() {} }
    await render(props)
    await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Sau').click())
    assert.ok(release)
    await render({ ...props, tenantId: 'gate-b' })
    assert.match(container.textContent, /Trang 1/)
    assert.ok(requests.filter(r => r.url.includes('/gate-b/billing/periods')).every(r => r.url.includes('page=1')))
    assert.ok(requests.find(r => r.url.includes('page=2')).options.signal.aborted)
    await act(async () => release())
    assert.doesNotMatch(container.textContent, /1999-01-01/)
    assert.match(container.textContent, /2026-09-01/)
  })
})

test('Gate0 BL07 unavailable wallet never turns into zero balance or hides invoice receivable', async () => {
  await billingFixture(async ({ container, render }) => {
    const api = new GateApiClient('', async url => {
      if (String(url).endsWith('/receivable')) return Response.json({ originalTotalVnd: '800000', netObligationVnd: '800000', netAllocatedVnd: '100000', outstandingVnd: '700000', status: 'ISSUED' })
      if (String(url).includes('/finance/students/')) return Response.json({ code: 'FORBIDDEN' }, { status: 403 })
      return Response.json({ ...detail, status: 'ISSUED', number: 'INV-NOWALLET', canIssue: false })
    })
    await render({ id: 'BL07', tenantId: 'gate-a', token: 'token-a', selectedId: 'invoice-a', api, navigate() {} })
    assert.match(container.textContent, /800.000|800\u00a0000/)
    assert.match(container.textContent, /700.000|700\u00a0000/)
    assert.ok(![...container.querySelectorAll('button')].some(b => b.textContent === 'Thanh toán từ ví'))
    assert.match(container.textContent, /Chưa tải|khả dụng|quyền/i)
  })
})
