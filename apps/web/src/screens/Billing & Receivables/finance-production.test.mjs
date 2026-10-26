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
const { FinanceProduction } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/FinanceProduction.tsx')
after(async () => { await vite.close(); dom.window.close() })

function input(node, value) {
  const proto = node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value)
  node.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
}
function button(text) { return [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(text)) }
const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

test('BL09 TOP_UP waits for HTTP acknowledgement and keeps the receipt operation key', async () => {
  const root = createRoot(document.getElementById('root'))
  const student = '00000000-0000-4000-8000-000000000001'
  const calls = []
  let finish
  const response = new Promise((resolve) => { finish = resolve })
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), options })
    if (options.method === 'POST') return response
    if (String(url).includes('/finance/students?')) return Response.json({ items: [{ id: student, name: 'Lan', code: 'S1' }], total: 1 })
    return Response.json({ studentId: student, studentName: 'Lan', balanceVnd: '0', verifiedCashVnd: '0', walletDebitsVnd: '0', internalCreditsVnd: '0', reversedTopUpsVnd: '0', canTopUp: true, canReverse: true,
      canAdjust: true, canCancel: true, transactions: [], invoices: [], asOf: new Date().toISOString() })
  })
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'BL09', tenantId: 'tenant-a', token: 'token-a', api, navigate() {} })); await wait() })
    const fields = [...document.querySelectorAll('input')]
    await act(async () => {
      input(fields[0], '1000000'); input(fields[1], 'receipt-1'); input(fields[2], 'Bank statement checked'); input(fields[3], 'Verified intake')
      fields[4].click()
    })
    assert.equal(button('Ghi nhận TOP_UP').disabled, false)
    await act(async () => button('Ghi nhận TOP_UP').click())
    const post = calls.find((call) => call.options.method === 'POST')
    assert.match(post.url, new RegExp(`/students/${student}/wallet/top-ups$`))
    assert.equal(post.options.headers.Authorization, 'Bearer token-a')
    assert.ok(post.options.headers['Idempotency-Key'])
    assert.equal(JSON.parse(post.options.body).confirmed, true)
    assert.match(document.body.textContent, /Số dư khả dụng:\s*0/)
    await act(async () => { finish(Response.json({ id: 'top-up-a', balanceVnd: '1000000' })); await wait() })
    assert.match(document.body.textContent, /Đã ghi nhận TOP_UP/)
  } finally { await act(async () => root.unmount()) }
})

test('OP05 sends a decision and a later explicit execution as separate mutations', async () => {
  const root = createRoot(document.getElementById('root'))
  const calls = []
  let state = 'PENDING_APPROVAL'
  const approval = { id: 'request-a', operationType: 'ADJUST_REQUEST', targetType: 'Invoice', targetId: 'invoice-a',
    studentId: 'student-a', reason: 'Correction', requesterMembershipId: 'member-a', createdAt: new Date().toISOString(),
    decidedAt: null, deltaVnd: '-100000', canDecide: true, canExecute: true, decisions: [], executionReceipt: null }
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), options })
    if (options.method === 'POST') {
      state = String(url).endsWith('/decisions') ? 'APPROVED' : 'COMPLETED'
      return Response.json({ id: approval.id, status: state })
    }
    return Response.json({ ...approval, status: state })
  })
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'OP05', tenantId: 'tenant-a',
      token: 'token-a', selectedId: approval.id, api, navigate() {} })); await wait() })
    await act(async () => { input(document.querySelector('textarea'), 'Manual approval reason'); document.querySelector('input[type="checkbox"]').click() })
    await act(async () => { button('Lưu quyết định').click(); await wait() })
    assert.equal(state, 'APPROVED')
    assert.match(document.body.textContent, /APPROVED đã lưu/)
    await act(async () => { input(document.querySelector('textarea'), 'Explicit execution reason'); document.querySelector('input[type="checkbox"]').click() })
    await act(async () => { button('Thực thi đã duyệt').click(); await wait() })
    assert.equal(state, 'COMPLETED')
    const posts = calls.filter((call) => call.options.method === 'POST')
    assert.equal(posts.length, 2)
    assert.match(posts[0].url, /\/decisions$/)
    assert.match(posts[1].url, /\/execute$/)
    assert.notEqual(posts[0].options.headers['Idempotency-Key'], posts[1].options.headers['Idempotency-Key'])
  } finally { await act(async () => root.unmount()) }
})

test('OP05 reconciles a committed APPROVE after lost reply and executes only on explicit action', async () => {
  const tenantId = 'tenant-lost-decision'
  const approvalId = 'request-lost'
  const decisionReason = 'Reviewed invoice correction'
  let status = 'PENDING_APPROVAL'
  let decisionCount = 0
  let effectCount = 0
  let receiptLookups = 0
  let decisionKey = ''
  const calls = []
  const approval = { id: approvalId, operationType: 'ADJUST_REQUEST', targetType: 'Invoice', targetId: 'invoice-a',
    studentId: 'student-a', reason: 'Correction', requesterMembershipId: 'member-a', createdAt: new Date().toISOString(),
    decidedAt: null, deltaVnd: '-100000', canDecide: true, canExecute: true, decisions: [], executionReceipt: null }
  const api = new ApiClient('', async (url, options) => {
    const path = String(url)
    calls.push({ path, options })
    if (path.endsWith('/decisions') && options.method === 'POST') {
      decisionCount++
      decisionKey = options.headers['Idempotency-Key']
      assert.deepEqual(JSON.parse(options.body), { reason: decisionReason, decision: 'APPROVE' })
      status = 'APPROVED'
      throw new TypeError('response lost after commit')
    }
    if (path.endsWith('/decision-outcomes') && options.method === 'POST') {
      receiptLookups++
      const request = JSON.parse(options.body)
      assert.deepEqual(request, { key: decisionKey, decision: 'APPROVE', reason: decisionReason })
      return Response.json(receiptLookups === 1 ? { status: 'PENDING_RECONCILIATION' }
        : { status: 'COMMITTED', approvalId, decision: 'APPROVE', decisionStatus: 'APPROVED' })
    }
    if (path.endsWith('/execute') && options.method === 'POST') {
      assert.equal(status, 'APPROVED')
      assert.notEqual(options.headers['Idempotency-Key'], decisionKey)
      effectCount++
      status = 'COMPLETED'
      return Response.json({ id: approvalId, status })
    }
    return Response.json({ ...approval, status,
      decisions: status === 'PENDING_APPROVAL' ? [] : [{ decision: 'APPROVE', reason: decisionReason,
        decidedAt: new Date().toISOString(), selfApproved: false }],
      executionReceipt: status === 'COMPLETED' ? { id: 'effect-a', status, refundVnd: '0' } : null })
  })
  let root = createRoot(document.getElementById('root'))
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'OP05', tenantId,
      token: 'token-a', selectedId: approvalId, api, navigate() {} })); await wait() })
    await act(async () => { input(document.querySelector('textarea'), decisionReason)
      document.querySelector('input[type="checkbox"]').click() })
    await act(async () => { document.querySelector('.billing-card button.billing-button').click(); await wait() })
    assert.equal(status, 'APPROVED')
    assert.equal(decisionCount, 1)
    assert.equal(effectCount, 0)
    assert.equal(JSON.parse(window.sessionStorage.getItem(`educore:finance:${tenantId}`)).key, decisionKey)
    assert.match(document.body.textContent, /No matching committed decision receipt is visible yet/)
    await act(async () => root.unmount())
    root = createRoot(document.getElementById('root'))
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'OP05', tenantId,
      token: 'token-a', selectedId: approvalId, api, navigate() {} })); await wait() })
    assert.match(document.body.textContent, /APPROVED/)
    assert.doesNotMatch(document.body.textContent, /COMPLETED/)
    assert.equal(effectCount, 0)
    await act(async () => { document.querySelector('button.billing-button-secondary').click(); await wait() })
    assert.equal(window.sessionStorage.getItem(`educore:finance:${tenantId}`), null)
    assert.equal(receiptLookups, 2)
    assert.equal(decisionCount, 1)
    assert.equal(effectCount, 0)
    assert.match(document.body.textContent, /Execution remains a separate action/)
    await act(async () => { input(document.querySelector('textarea'), 'Execute approved correction')
      document.querySelector('input[type="checkbox"]').click() })
    await act(async () => { document.querySelector('.billing-card button.billing-button').click(); await wait() })
    assert.equal(status, 'COMPLETED')
    assert.equal(decisionCount, 1)
    assert.equal(effectCount, 1)
    assert.equal(calls.filter((call) => call.path.endsWith('/execute')).length, 1)
  } finally { await act(async () => root.unmount()); window.sessionStorage.removeItem(`educore:finance:${tenantId}`) }
})

test('BL10 submits a signed adjustment request and opens the persisted approval ID', async () => {
  const root = createRoot(document.getElementById('root'))
  const calls = [], opened = []
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), options })
    if (options.method === 'POST') return Response.json({ id: 'approval-a', status: 'PENDING_APPROVAL' })
    if (String(url).includes('/receivable')) return Response.json({ netObligationVnd: '800000', netAllocatedVnd: '300000', outstandingVnd: '500000' })
    if (String(url).includes('/finance/students/')) return Response.json({ canAdjust: true, canCancel: true })
    return Response.json({ id: 'invoice-a', studentId: 'student-a', studentName: 'Lan', number: 'INV-1', status: 'ISSUED',
      totalVnd: '800000', payments: [], adjustments: [] })
  })
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'BL10', tenantId: 'tenant-a',
      token: 'token-a', selectedId: 'invoice-a', api, navigate: (path) => opened.push(path) })); await wait() })
    await act(async () => { input(document.querySelector('input[inputmode="numeric"]'), '700000')
      input(document.querySelector('textarea'), 'Reduce obligation'); document.querySelector('input[type="checkbox"]').click() })
    await act(async () => { button('Gửi yêu cầu').click(); await wait() })
    const post = calls.find((call) => call.options.method === 'POST')
    assert.match(post.url, /\/invoices\/invoice-a\/adjustment-requests$/)
    assert.deepEqual(JSON.parse(post.options.body), { reason: 'Reduce obligation', amountDeltaVnd: '-100000' })
    assert.deepEqual(opened, ['/app/tenant-a/approvals/approval-a'])
  } finally { await act(async () => root.unmount()) }
})

test('BL11 sends the exact original TOP_UP through a reversal request', async () => {
  const root = createRoot(document.getElementById('root'))
  const calls = [], opened = []
  const api = new ApiClient('', async (url, options) => {
    calls.push({ url: String(url), options })
    if (options.method === 'POST') return Response.json({ id: 'approval-r', status: 'PENDING_APPROVAL' })
    if (String(url).includes('/finance/students?')) return Response.json({ items: [{ id: 'student-a', name: 'Lan', code: 'S1' }], total: 1 })
    return Response.json({ studentId: 'student-a', studentName: 'Lan', balanceVnd: '500000', verifiedCashVnd: '500000', walletDebitsVnd: '0', internalCreditsVnd: '0', reversedTopUpsVnd: '0', canTopUp: true,
      canReverse: true, canAdjust: true, canCancel: true, invoices: [], asOf: new Date().toISOString(),
      transactions: [{ id: 'top-up-a', kind: 'TOP_UP', amountVnd: '500000', createdAt: new Date().toISOString(),
        receiptReference: 'R1', fundingMethod: 'CASH', evidence: 'Verified cash receipt', reversedTopUpId: null, paymentId: null }] })
  })
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'BL09', tenantId: 'tenant-b',
      token: 'token-b', api, navigate: (path) => opened.push(path) })); await wait() })
    await act(async () => button('Yêu cầu đảo').click())
    await act(async () => { input(document.querySelector('textarea'), 'Receipt invalid after review')
      document.querySelectorAll('input[type="checkbox"]')[1].click() })
    await act(async () => { button('Gửi yêu cầu đảo').click(); await wait() })
    const post = calls.find((call) => call.options.method === 'POST')
    assert.match(post.url, /\/wallet\/top-ups\/top-up-a\/reversal-requests$/)
    assert.deepEqual(JSON.parse(post.options.body), { reason: 'Receipt invalid after review', confirmed: true })
    assert.deepEqual(opened, ['/app/tenant-b/approvals/approval-r'])
  } finally { await act(async () => root.unmount()) }
})

test('OP04 opens the exact server approval and keeps approved distinct from completed', async () => {
  const root = createRoot(document.getElementById('root'))
  const opened = []
  const api = new ApiClient('', async () => Response.json({ page: 1, pageSize: 100, total: 1, items: [{
    id: 'approval-a', operationType: 'CANCEL_REQUEST', targetType: 'Invoice', targetId: 'invoice-a',
    status: 'APPROVED', reason: 'Cancel with approval', requesterMembershipId: 'member-a', createdAt: new Date().toISOString(),
  }] }))
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'OP04', tenantId: 'tenant-a',
      token: 'token-a', api, navigate: (path) => opened.push(path) })); await wait() })
    assert.match(document.body.textContent, /APPROVED/)
    assert.doesNotMatch(document.body.textContent, /COMPLETED/)
    await act(async () => button('CANCEL_REQUEST').click())
    assert.deepEqual(opened, ['/app/tenant-a/approvals/approval-a'])
  } finally { await act(async () => root.unmount()) }
})

test('uncertain TOP_UP result keeps the same key until server receipt reconciliation', async () => {
  const root = createRoot(document.getElementById('root'))
  let lookup = 0
  const posts = []
  const api = new ApiClient('', async (url, options) => {
    if (options.method === 'POST') { posts.push(options); throw new TypeError('lost reply') }
    if (String(url).includes('/finance/students/student-a/outcomes/TOP_UP/')) return Response.json(lookup++ ? { status: 'COMMITTED', receipt: { id: 'top-up-a' } } : { status: 'PENDING_RECONCILIATION' })
    if (String(url).includes('/finance/students?')) return Response.json({ items: [{ id: 'student-a', name: 'Lan', code: 'S1' }], total: 1 })
    return Response.json({ studentId: 'student-a', studentName: 'Lan', balanceVnd: '0', verifiedCashVnd: '0', walletDebitsVnd: '0', internalCreditsVnd: '0', reversedTopUpsVnd: '0', canTopUp: true,
      canReverse: true, canAdjust: true, canCancel: true, transactions: [], invoices: [], asOf: new Date().toISOString() })
  })
  try {
    await act(async () => { root.render(React.createElement(FinanceProduction, { id: 'BL09', tenantId: 'tenant-uncertain',
      token: 'token-a', api, navigate() {} })); await wait() })
    const fields = [...document.querySelectorAll('input')]
    await act(async () => { input(fields[0], '1000'); input(fields[1], 'R2'); input(fields[2], 'Verified receipt');
      input(fields[3], 'Manual intake'); fields[4].click() })
    await act(async () => { button('Ghi nhận TOP_UP').click(); await wait() })
    assert.equal(posts.length, 1)
    const key = posts[0].headers['Idempotency-Key']
    assert.equal(JSON.parse(window.sessionStorage.getItem('educore:finance:tenant-uncertain')).key, key)
    assert.match(document.body.textContent, /No committed receipt is visible yet/)
    await act(async () => { button('Kiểm tra biên nhận cùng khóa').click(); await wait() })
    assert.equal(window.sessionStorage.getItem('educore:finance:tenant-uncertain'), null)
    assert.equal(posts.length, 1)
    assert.match(document.body.textContent, /server confirms this operation committed/)
  } finally { await act(async () => root.unmount()); window.sessionStorage.removeItem('educore:finance:tenant-uncertain') }
})
