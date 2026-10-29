import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => vite.close())
const ui = await vite.ssrLoadModule('/src/shared/ui/SharedUI.tsx')
const management = await vite.ssrLoadModule('/src/screens/Management & Operations/ManagementPrimitives.tsx')
const billing = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BillingPrimitives.tsx')
const preview = await vite.ssrLoadModule('/src/ui-preview/SharedComponentsPreview.tsx')
const doc = element => new JSDOM(renderToStaticMarkup(element)).window.document
const e = React.createElement

test('PageHeader and both legacy heading facades keep one h1 and accessible actions', () => {
  for (const element of [
    e(ui.PageHeader, { title: 'Trang', action: e('button', null, 'Mở') }),
    e(management.Heading, { title: 'Trang', detail: 'Phạm vi', children: e('button', null, 'Mở') }),
    e(billing.BillingHeading, { title: 'Trang', subtitle: 'Phạm vi', action: e('button', null, 'Mở') }),
  ]) {
    const d = doc(element)
    assert.equal(d.querySelectorAll('h1').length, 1)
    assert.equal(d.querySelectorAll('[class*=breadcrumb]').length, 0)
    assert.equal(d.querySelector('button')?.textContent, 'Mở')
  }
})

test('StatusBadge requires label and domain; long text remains in DOM', () => {
  const label = 'Đang chờ hoàn tất xử lý trong phạm vi được cấp quyền'
  const d = doc(e(ui.StatusBadge, { label, domain: 'billing-generation', tone: 'warning' }))
  assert.equal(d.querySelector('[data-domain="billing-generation"]')?.textContent, label)
})

test('MetricCard distinguishes real zero, unavailable, forbidden and large VND string', () => {
  const zero = doc(e(ui.MetricCard, { label: 'Số lượng', value: { kind: 'available', display: '0' } }))
  assert.equal(zero.querySelector('strong')?.textContent, '0')
  for (const kind of ['unavailable', 'forbidden', 'pending-api']) {
    const d = doc(e(ui.MetricCard, { label: 'Số lượng', value: { kind } }))
    assert.notEqual(d.querySelector('strong')?.textContent, '0')
  }
  const amount = '900.000.000.000.000.000.000.000 ₫'
  assert.equal(doc(e(ui.MetricCard, { label: 'Công nợ', value: { kind: 'available', display: amount } })).querySelector('strong')?.textContent, amount)
})

test('ResourceState separates empty, filtered, auth, forbidden and GET retry', () => {
  assert.match(doc(e(ui.ResourceState, { kind: 'empty' })).body.textContent, /Chưa có bản ghi/)
  assert.match(doc(e(ui.ResourceState, { kind: 'filtered-empty' })).body.textContent, /Không có kết quả phù hợp/)
  for (const kind of ['forbidden', 'unauthenticated', 'conflict']) assert.equal(doc(e(ui.ResourceState, { kind, onRetry() {} })).querySelector('button'), null)
  assert.equal(doc(e(ui.ResourceState, { kind: 'error', onRetry() {} })).querySelector('button')?.textContent, 'Thử lại')
  assert.equal(doc(e(ui.ResourceState, { kind: 'unauthenticated', onSignIn() {} })).querySelector('button')?.textContent, 'Đăng nhập')
})

test('DataTable keeps caption, headers, row identity and server pagination controls', () => {
  const rows = [{ id: 'one', name: 'Tên dài' }]
  const columns = [{ key: 'name', header: 'Tên', cell: row => row.name }]
  const d = doc(e(ui.DataTable, { caption: 'Thành viên', columns, rows, rowKey: row => row.id, page: { index: 2, totalPages: 3, onPageChange() {} } }))
  assert.equal(d.querySelector('caption')?.textContent, 'Thành viên')
  assert.equal(d.querySelector('th[scope="col"]')?.textContent, 'Tên')
  assert.equal(d.querySelector('tbody tr')?.textContent, 'Tên dài')
  assert.equal(d.querySelector('td')?.getAttribute('data-label'), 'Tên')
  assert.equal(d.querySelectorAll('nav button').length, 2)
})

test('FilterToolbar labels loaded-page scope and reset; preview uses same components', () => {
  const d = doc(e(ui.FilterToolbar, { label: 'Bộ lọc', scope: 'loaded-page', onReset() {}, children: e('label', null, 'Tìm', e('input', { type: 'search' })) }))
  assert.match(d.body.textContent, /Tìm trong trang đã tải/)
  assert.equal(d.querySelector('button')?.textContent, 'Xóa bộ lọc')
  const p = doc(e(preview.SharedComponentsPreview))
  assert.equal(p.querySelectorAll('h1').length, 1)
  assert.equal(p.querySelectorAll('table').length, 1)
  assert.match(p.body.textContent, /WEB_FIXTURE/)
})

test('container callbacks alone control Retry, Reset and server page changes', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = await import('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  const calls = []
  try {
    await act(async () => root.render(e('div', null,
      e(ui.ResourceState, { kind: 'error', onRetry: () => calls.push('retry') }),
      e(ui.FilterToolbar, { label: 'Lọc', scope: 'loaded-page', onReset: () => calls.push('reset'), children: e('label', null, 'Tìm', e('input', { type: 'search' })) }),
      e(ui.DataTable, { caption: 'Dữ liệu', columns: [{ key: 'id', header: 'ID', cell: row => row.id }], rows: [{ id: 'one' }], rowKey: row => row.id, page: { index: 2, totalPages: 3, onPageChange: page => calls.push(page) } }),
    )))
    for (const label of ['Thử lại', 'Xóa bộ lọc', 'Trước', 'Sau']) {
      const button = [...document.querySelectorAll('button')].find(node => node.textContent === label)
      assert.ok(button)
      await act(async () => button.click())
    }
    assert.deepEqual(calls, ['retry', 'reset', 1, 3])
  } finally { await act(async () => root.unmount()); dom.window.close() }
})
