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
