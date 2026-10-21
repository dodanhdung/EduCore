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
