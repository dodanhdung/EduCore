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
