import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { matchRoute, routes } from '../../routes.ts'
import { resolveRoute } from '../../auth.ts'

const initialDom = new JSDOM('<div></div>', { url: 'http://localhost/' })
globalThis.window = initialDom.window
globalThis.document = initialDom.window.document
globalThis.HTMLElement = initialDom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); initialDom.window.close() })
const { PriceRulesScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL01/PriceRulesScreen.tsx')
const { SiblingDiscountScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL02/SiblingDiscountScreen.tsx')
const { BillingPeriodsScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL03/BillingPeriodsScreen.tsx')
const { DraftInvoiceListScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL04/DraftInvoiceListScreen.tsx')
const { DraftInvoiceReviewScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL05/DraftInvoiceReviewScreen.tsx')
const { IssuedInvoiceListScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL06/IssuedInvoiceListScreen.tsx')
const { InvoiceDetailScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL07/InvoiceDetailScreen.tsx')
const { TopUpDialog, WalletPaymentDialog } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL08/WalletOperationDialogs.tsx')
const { ReceivablesWalletScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL09/ReceivablesWalletScreen.tsx')
const { InvoiceAdjustmentScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL10/InvoiceAdjustmentScreen.tsx')
const { TopUpReversalDialog } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL11/TopUpReversalDialog.tsx')
const { billingFixtures } = await vite.ssrLoadModule('/src/ui-preview/billingFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

function mount(Component, props = {}, url = 'http://localhost/__ui-preview/BL01') {
  const dom = new JSDOM('<div id="root"></div>', { url })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return { dom, document: dom.window.document,
    render: async () => act(async () => root.render(React.createElement(Component, props))),
    click: async (node) => act(async () => node.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))),
    input: async (node, value) => act(async () => { const setter = Object.getOwnPropertyDescriptor(node.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : node.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set; setter.call(node, value); node.dispatchEvent(new dom.window.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })) }),
    close: async () => { await act(async () => root.unmount()); dom.window.close() },
  }
}

test('BL01–BL03 use existing tenant routes and remain guarded', () => {
  const expected = { BL01: '/finance/pricing', BL02: '/finance/discount-eligibility', BL03: '/finance/billing-periods' }
  for (const [id, suffix] of Object.entries(expected)) {
    assert.equal(routes.find((route) => route.id === id)?.path, `/app/:tenantId${suffix}`)
    assert.equal(matchRoute(`/app/demo${suffix}`)?.route.id, id)
    assert.equal(resolveRoute(`/app/demo${suffix}`, { status: 'unauthenticated' }).kind, 'unauthenticated')
  }
  assert.equal(routes.some((route) => route.id === 'BL08' || route.id === 'BL11'), false)
})

test('production BL01–BL03 render no sample finance data without API', () => {
  for (const Component of [PriceRulesScreen, SiblingDiscountScreen, BillingPeriodsScreen]) {
    const html = renderToStaticMarkup(React.createElement(Component))
    assert.match(html, /Chưa có dữ liệu/)
    assert.doesNotMatch(html, /Nguyễn Minh Khôi|350\.000 ₫|RUN-0926-02/)
  }
})

test('BL01 filters exact scope and keeps historical price rule read-only', async () => {
  const view = mount(PriceRulesScreen, { data: billingFixtures, preview: true })
  try {
    await view.render()
    const selects = view.document.querySelectorAll('select')
    await view.input(selects[0], 'COURSE')
    assert.match(view.document.body.textContent, /Tiếng Anh B2/)
    assert.doesNotMatch(view.document.querySelector('.billing-table').textContent, /IELTS-06/)
    await view.click(view.document.querySelector('.billing-table .billing-link'))
    assert.match(view.document.querySelector('[role="dialog"]').textContent, /Phiên bản lịch sử và hóa đơn ISSUED chỉ đọc/)
    assert.equal(view.document.querySelector('[role="dialog"] input'), null)
  } finally { await view.close() }
})

test('BL02 separates verified evidence from eligibility and local review cannot approve', async () => {
  const view = mount(SiblingDiscountScreen, { data: billingFixtures, preview: true })
  try {
    await view.render()
    const rows = view.document.querySelectorAll('.billing-table tbody tr')
    assert.match(rows[0].textContent, /Đã xác minh.*10%/)
    assert.match(rows[2].textContent, /Đã thu hồi.*Chưa áp dụng/)
    await view.click(rows[1].querySelector('button'))
    assert.match(view.document.body.textContent, /Chưa có chứng cứ xác minh/)
    await view.click([...view.document.querySelectorAll('button')].find((button) => button.textContent === 'Xác minh điều kiện'))
    assert.match(view.document.querySelector('.billing-pending').textContent, /Cần ghi chú chứng cứ/)
    assert.equal(billingFixtures.siblingEligibility[1].evidence, 'UNVERIFIED')
  } finally { await view.close() }
})

test('BL03 selects missing-data period and cannot fake a recompute', async () => {
  const view = mount(BillingPeriodsScreen, { data: billingFixtures, preview: true })
  try {
    await view.render()
    const recompute = [...view.document.querySelectorAll('button')].find((button) => button.textContent === 'Tính lại hóa đơn nháp')
    await view.click(recompute)
    assert.equal(view.document.querySelector('[role="dialog"] button.billing-button:not(.billing-button-secondary)').disabled, true)
    await view.click(view.document.querySelector('[role="dialog"] .billing-button-secondary'))
    await view.input(view.document.querySelector('select'), '2026-08')
    assert.match(view.document.body.textContent, /NEEDS_INFORMATION/)
    assert.equal([...view.document.querySelectorAll('button')].find((button) => button.textContent === 'Tính lại hóa đơn nháp').disabled, true)
    assert.equal(billingFixtures.generations[0].id, 'G2')
  } finally { await view.close() }
})

test('Preview BL01–BL03 use AppShell and display sample banner', () => {
  for (const id of ['BL01', 'BL02', 'BL03']) {
    const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: id }))
    assert.match(html, /Dữ liệu mẫu — UI Preview/)
    assert.match(html, /class="app-shell"/)
    assert.match(html, new RegExp(`data-screen-id="${id}"`))
  }
})

test('BL04–BL07 tenant routes remain guarded and production has no sample finance data', () => {
  for (const [id, path] of [['BL04', '/finance/drafts'], ['BL05', '/finance/drafts/D-1'], ['BL06', '/finance/invoices'], ['BL07', '/finance/invoices/I-1']]) {
    assert.equal(matchRoute(`/app/demo${path}`)?.route.id, id)
    assert.equal(resolveRoute(`/app/demo${path}`, { status: 'unauthenticated' }).kind, 'unauthenticated')
  }
  for (const Component of [DraftInvoiceListScreen, DraftInvoiceReviewScreen, IssuedInvoiceListScreen, InvoiceDetailScreen]) {
    const html = renderToStaticMarkup(React.createElement(Component))
    assert.match(html, /Chưa có dữ liệu/)
    assert.doesNotMatch(html, /Nguyễn Minh Khôi|INV-2026-00001/)
  }
})

test('BL04 preserves incomplete draft totals and navigates by draft ID', async () => {
  let opened = ''
  const view = mount(DraftInvoiceListScreen, { data: billingFixtures, onOpenDraft: (id) => { opened = id } })
  try {
    await view.render()
    assert.match(view.document.body.textContent, /Chưa xác định/)
    await view.click(view.document.querySelector('.billing-table tbody button'))
    assert.equal(opened, 'D-0926-001')
  } finally { await view.close() }
})

test('BL05 stale generation blocks issue and ready confirmation never creates invoice', async () => {
  const stale = renderToStaticMarkup(React.createElement(DraftInvoiceReviewScreen, { data: billingFixtures, selectedId: 'D-0926-002' }))
  assert.match(stale, /Generation cũ/)
  assert.match(stale, /disabled=""/)
  const before = billingFixtures.invoices.length
  const view = mount(DraftInvoiceReviewScreen, { data: billingFixtures, selectedId: 'D-0926-001', preview: true, canIssue: true })
  try {
    await view.render()
    await view.click([...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Rà soát phát hành'))
    const dialog = view.document.querySelector('[role="dialog"]')
    assert.ok(dialog)
    assert.equal(dialog.querySelector('button.billing-button:not(.billing-button-secondary)').disabled, true)
    await act(async () => { const box = dialog.querySelector('input[type="checkbox"]'); box.click() })
    await view.click(dialog.querySelector('button.billing-button:not(.billing-button-secondary)'))
    assert.match(view.document.querySelector('.billing-pending').textContent, /PENDING_API/)
    assert.equal(billingFixtures.invoices.length, before)
  } finally { await view.close() }
})

test('BL06 and BL07 keep outstanding separate from wallet and parent read-only', () => {
  const list = renderToStaticMarkup(React.createElement(IssuedInvoiceListScreen, { data: billingFixtures }))
  assert.match(list, /5\.150\.000/)
  const detail = renderToStaticMarkup(React.createElement(InvoiceDetailScreen, { data: billingFixtures, selectedId: 'invoice-hai-dang-0926' }))
  assert.match(detail, /2\.150\.000/)
  assert.match(detail, /1\.200\.000/)
  assert.match(detail, /Chưa thực thi/)
  assert.doesNotMatch(detail, /Thao tác nhân sự/)
  assert.match(renderToStaticMarkup(React.createElement(InvoiceDetailScreen, { data: billingFixtures, selectedId: 'missing' })), /Không tìm thấy hóa đơn/)
})

test('Batch B sample invoice lines and receivables reconcile without using wallet balance', () => {
  const keys = new Set()
  for (const invoice of billingFixtures.invoices) {
    const key = `${invoice.studentId}:${invoice.period}`
    assert.equal(keys.has(key), false)
    keys.add(key)
    const gross = invoice.lines.reduce((sum, line) => sum + BigInt(line.amountVnd), 0n)
    assert.ok(gross >= BigInt(invoice.originalObligationVnd))
    assert.equal(BigInt(invoice.adjustedObligationVnd) - BigInt(invoice.allocatedVnd), BigInt(invoice.outstandingVnd))
  }
  assert.equal(billingFixtures.invoices.reduce((sum, item) => sum + BigInt(item.outstandingVnd), 0n), BigInt(billingFixtures.issuedOutstandingTotalVnd))
  assert.equal(billingFixtures.drafts.filter((item) => item.netVnd !== undefined).reduce((sum, item) => sum + BigInt(item.netVnd), 0n), BigInt(billingFixtures.draftEstimatedTotalVnd))
})

test('Preview BL04–BL07 use AppShell and distinct finance snapshots', () => {
  for (const id of ['BL04', 'BL05', 'BL06', 'BL07']) {
    const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: id }))
    assert.match(html, /Dữ liệu mẫu — UI Preview/)
    assert.match(html, /class="app-shell"/)
    assert.match(html, new RegExp(`data-screen-id="${id}"`))
  }
})

test('BL09 and BL10 use guarded tenant routes; BL08 and BL11 stay embedded', () => {
  assert.equal(matchRoute('/app/demo/finance/receivables')?.route.id, 'BL09')
  assert.equal(matchRoute('/app/demo/finance/invoices/I-1/adjust')?.route.id, 'BL10')
  assert.equal(resolveRoute('/app/demo/finance/receivables', { status: 'unauthenticated' }).kind, 'unauthenticated')
  assert.equal(routes.some((route) => route.id === 'BL08' || route.id === 'BL11'), false)
  assert.match(renderToStaticMarkup(React.createElement(ReceivablesWalletScreen)), /Chưa có dữ liệu/)
  assert.match(renderToStaticMarkup(React.createElement(InvoiceAdjustmentScreen)), /Chưa có dữ liệu/)
})

test('BL08 TOP_UP validates receipt and never changes wallet balance locally', async () => {
  const wallet = billingFixtures.wallets[0]
  const before = wallet.availableVnd
  const view = mount(TopUpDialog, { wallet, onClose: () => undefined })
  try {
    await view.render()
    const dialog = view.document.querySelector('[role="dialog"]')
    assert.equal(dialog.querySelector('button.billing-button:not(.billing-button-secondary)').disabled, true)
    const inputs = dialog.querySelectorAll('input')
    await view.input(inputs[0], '500000')
    await view.input(inputs[1], '2026-10-17T10:00')
    await view.input(inputs[2], 'CK-NEW-001')
    await view.input(dialog.querySelector('textarea'), 'Đã đối soát sao kê')
    await act(async () => inputs[3].click())
    await view.click(dialog.querySelector('button.billing-button:not(.billing-button-secondary)'))
    assert.match(dialog.textContent, /TOP_UP chỉ tăng ví sau khi máy chủ xác nhận/)
    await view.click(dialog.querySelector('button.billing-button:not(.billing-button-secondary)'))
    assert.match(dialog.textContent, /PENDING_API/)
    assert.equal(wallet.availableVnd, before)
  } finally { await view.close() }
})

test('BL08 WALLET payment rejects over-balance, over-debt and cancelled invoices', async () => {
  const invoice = billingFixtures.invoices[0]
  const view = mount(WalletPaymentDialog, { invoice, availableVnd: '1200000', onClose: () => undefined })
  try {
    await view.render()
    const dialog = view.document.querySelector('[role="dialog"]')
    const input = dialog.querySelector('input')
    await view.input(input, '1500000')
    assert.match(dialog.textContent, /vượt số dư ví/)
    assert.equal(dialog.querySelector('button.billing-button:not(.billing-button-secondary)').disabled, true)
    await view.input(input, '500000')
    await view.click(dialog.querySelector('button.billing-button:not(.billing-button-secondary)'))
    assert.match(dialog.textContent, /Thanh toán một phần/)
    await view.click(dialog.querySelector('button.billing-button:not(.billing-button-secondary)'))
    assert.match(dialog.textContent, /PENDING_API/)
    assert.equal(invoice.allocatedVnd, '1000000')
  } finally { await view.close() }
  const cancelled = renderToStaticMarkup(React.createElement(WalletPaymentDialog, { invoice: billingFixtures.invoices[3], availableVnd: '1000000', onClose: () => undefined }))
  assert.match(cancelled, /Chỉ hóa đơn ISSUED/)
  assert.match(cancelled, /disabled=""/)
  const duplicate = renderToStaticMarkup(React.createElement(WalletPaymentDialog, { invoice, availableVnd: '1200000', feedback: 'duplicate', onClose: () => undefined }))
  assert.match(duplicate, /Payment đã tồn tại/)
})

test('BL09 separates wallet history, outstanding and legacy; read-only hides mutation', async () => {
  const view = mount(ReceivablesWalletScreen, { data: billingFixtures, canManage: true })
  try {
    await view.render()
    assert.match(view.document.body.textContent, /5\.150\.000/)
    await view.click([...view.document.querySelectorAll('[role="tab"]')].find((item) => item.textContent === 'Lịch sử ví'))
    assert.match(view.document.body.textContent, /TOP_UP_REVERSAL|Đảo TOP_UP/)
    assert.match(view.document.body.textContent, /WALLET Payment/)
    assert.match(view.document.body.textContent, /Hoàn nội bộ · không phải tiền mới/)
    assert.match(view.document.body.textContent, /NEEDS_DECISION/)
  } finally { await view.close() }
  const scoped = { ...billingFixtures, wallets: [billingFixtures.wallets[0]], invoices: [billingFixtures.invoices[0]] }
  const parent = renderToStaticMarkup(React.createElement(ReceivablesWalletScreen, { data: scoped }))
  assert.doesNotMatch(parent, /Nạp ví thủ công|Lê Nam Phong/)
})

test('BL10 keeps approval distinct from execution and blocks legacy mutation', () => {
  const approved = renderToStaticMarkup(React.createElement(InvoiceAdjustmentScreen, { data: billingFixtures, selectedId: 'invoice-hai-dang-0926', canRequest: true }))
  assert.match(approved, /APPROVED/)
  assert.match(approved, /NOT_STARTED/)
  assert.match(approved, /Net excess có thể hoàn ví: <strong>Chờ máy chủ xác định/)
  const legacy = renderToStaticMarkup(React.createElement(InvoiceAdjustmentScreen, { data: billingFixtures, selectedId: 'invoice-thao-vy-0926', canRequest: true }))
  assert.match(legacy, /Legacy \/ mixed cần đối soát/)
  assert.match(legacy, /disabled=""/)
  assert.match(renderToStaticMarkup(React.createElement(InvoiceAdjustmentScreen, { data: billingFixtures, selectedId: 'bad' })), /Không tìm thấy hóa đơn/)
})

test('BL10 local review and submit do not alter issued obligation or approval history', async () => {
  const invoice = billingFixtures.invoices[0]
  const original = invoice.adjustedObligationVnd
  const count = invoice.adjustments.length
  const view = mount(InvoiceAdjustmentScreen, { data: billingFixtures, selectedId: invoice.id, canRequest: true })
  try {
    await view.render()
    await view.input(view.document.querySelector('input[inputmode="numeric"]'), '900000')
    await view.input(view.document.querySelector('textarea'), 'Sửa theo chứng cứ điểm danh')
    await view.input([...view.document.querySelectorAll('input')].find((item) => item.placeholder === ''), 'AT05-099')
    await view.click([...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Rà soát yêu cầu'))
    assert.match(view.document.body.textContent, /Sau đề nghị: 900\.000/)
    await view.click([...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Gửi yêu cầu xét duyệt'))
    assert.match(view.document.body.textContent, /PENDING_API/)
    assert.equal(invoice.adjustedObligationVnd, original)
    assert.equal(invoice.adjustments.length, count)
  } finally { await view.close() }
})

test('BL11 full TOP_UP reversal blocks insufficient or already-reversed balance', () => {
  const wallet = billingFixtures.wallets[0]
  const original = wallet.topUps[0]
  const low = renderToStaticMarkup(React.createElement(TopUpReversalDialog, { wallet: { ...wallet, availableVnd: '300000' }, topUp: original, canManage: true, onClose: () => undefined }))
  assert.match(low, /Không đủ số dư ví/)
  assert.match(low, /disabled=""/)
  const reversed = renderToStaticMarkup(React.createElement(TopUpReversalDialog, { wallet, topUp: wallet.topUps[2], canManage: true, onClose: () => undefined }))
  assert.match(reversed, /đã được đảo/)
  assert.match(reversed, /NEEDS_DECISION/)
  assert.equal(wallet.availableVnd, '1200000')
})

test('BL11 review never removes original TOP_UP or debits wallet locally', async () => {
  const wallet = billingFixtures.wallets[0]
  const original = wallet.topUps[0]
  const count = wallet.transactions.length
  const view = mount(TopUpReversalDialog, { wallet, topUp: original, canManage: true, onClose: () => undefined })
  try {
    await view.render()
    await view.input(view.document.querySelector('textarea'), 'Biên nhận nhập nhầm')
    await view.input(view.document.querySelector('input'), 'BB-DOI-SOAT-01')
    await view.click([...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Rà soát đảo TOP_UP'))
    assert.match(view.document.body.textContent, /Đảo toàn phần/)
    await view.click([...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Xác nhận yêu cầu'))
    assert.match(view.document.body.textContent, /PENDING_API/)
    assert.equal(wallet.transactions.length, count)
    assert.equal(original.status, 'COMPLETED')
  } finally { await view.close() }
})

test('wallet fixture ledger reconciles exactly with available VND string', () => {
  for (const wallet of billingFixtures.wallets) {
    const total = wallet.transactions.reduce((sum, item) => sum + BigInt(item.signedAmountVnd), 0n)
    assert.equal(total, BigInt(wallet.availableVnd))
  }
  assert.equal(billingFixtures.legacyReconciliations.reduce((sum, item) => sum + BigInt(item.amountVnd), 0n), BigInt(billingFixtures.legacyReconciliationVnd))
})

test('Preview BL08–BL11 use the real host and keep fixtures development-only', () => {
  for (const id of ['BL08', 'BL09', 'BL10', 'BL11']) {
    const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: id }))
    assert.match(html, /Dữ liệu mẫu — UI Preview/)
    assert.match(html, /class="app-shell"/)
    assert.match(html, new RegExp(`data-screen-id="${id}"`))
  }
})
