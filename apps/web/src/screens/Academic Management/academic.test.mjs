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
const { AcademicScreen } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicScreens.tsx')
const { academicFixtures } = await vite.ssrLoadModule('/src/ui-preview/academicFixtures.ts')
const { AcademicMoreScreen } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicMoreScreens.tsx')
const { academicMoreFixtures } = await vite.ssrLoadModule('/src/ui-preview/academicMoreFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

function mount(id, navigate = () => {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return {
    dom,
    document: dom.window.document,
    render: async () => act(async () => root.render(React.createElement(AcademicScreen, { id, data: academicFixtures, preview: true, navigate, pathForDetail: (target) => `/__ui-preview/${target}` }))),
    close: async () => { await act(async () => root.unmount()); dom.window.close() },
  }
}

function mountMore(id, props = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return {
    dom,
    document: dom.window.document,
    render: async () => act(async () => root.render(React.createElement(AcademicMoreScreen, { id, data: academicMoreFixtures, preview: true, ...props }))),
    close: async () => { await act(async () => root.unmount()); dom.window.close() },
  }
}

test('Academic routes retain parameters and AC09 stays embedded', () => {
  assert.equal(matchRoute('/app/tenant-a/students/HS-1028')?.params.studentId, 'HS-1028')
  assert.equal(matchRoute('/app/tenant-a/teachers/GV-018')?.route.id, 'AC04')
  assert.equal(routes.some((route) => route.id === 'AC09'), false)
  const state = { status: 'authenticated', session: { expiresAt: Date.now() + 60000, principal: { tenantId: 'tenant-a', allowedTenants: [{ id: 'tenant-a', name: 'Mẫu' }] } } }
  assert.equal(resolveRoute('/app/tenant-a/students', state).kind, 'forbidden')
})

test('AC01 search, filter, empty state and preview navigation', async () => {
  let path = ''
  const view = mount('AC01', (next) => { path = next })
  try {
    await view.render()
    assert.equal(view.document.querySelectorAll('tbody tr').length, 4)
    await act(async () => { const input = view.document.querySelector('input'); const set = Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set; set.call(input, 'không có'); input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true })) })
    assert.match(view.document.body.textContent, /Không tìm thấy hồ sơ phù hợp/)
    await act(async () => { const input = view.document.querySelector('input'); const set = Object.getOwnPropertyDescriptor(view.dom.window.HTMLInputElement.prototype, 'value').set; set.call(input, 'Minh Anh'); input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true })) })
    assert.equal(view.document.querySelectorAll('tbody tr').length, 1)
    await act(async () => view.document.querySelector('.academic-link').click())
    assert.equal(path, '/__ui-preview/AC02')
  } finally { await view.close() }
})

test('AC02 tabs and edit dialog validation never claim save', async () => {
  const view = mount('AC02')
  try {
    await view.render()
    await act(async () => view.document.querySelector('[role="tab"]:nth-child(2)').click())
    assert.equal(view.document.querySelector('[role="tab"][aria-selected="true"]').textContent, 'Ghi danh')
    await act(async () => view.document.querySelector('.academic-heading button').click())
    assert.ok(view.document.querySelector('[role="dialog"]'))
    await act(async () => view.document.querySelector('.academic-dialog-actions .academic-primary').click())
    assert.equal(view.document.querySelector('input[aria-invalid="true"]') !== null, true)
    assert.doesNotMatch(view.document.body.textContent, /đã lưu thành công/i)
    await act(async () => view.document.querySelector('[aria-label="Đóng hộp thoại"]').click())
    assert.equal(view.document.querySelector('[role="dialog"]'), null)
  } finally { await view.close() }
})

test('AC05 catalog tabs, no-results and form validation work locally', async () => {
  const view = mountMore('AC05')
  try {
    await view.render()
    assert.equal(view.document.querySelectorAll('tbody tr').length, 4)
    await act(async () => view.document.querySelector('[role="tab"]:nth-child(2)').click())
    assert.equal(view.document.querySelectorAll('tbody tr').length, 3)
    await act(async () => view.document.querySelector('.academic-heading button').click())
    await act(async () => view.document.querySelector('.academic-form .academic-primary').click())
    assert.match(view.document.body.textContent, /Vui lòng nhập mã, tên/)
    assert.doesNotMatch(view.document.body.textContent, /đã lưu thành công/i)
  } finally { await view.close() }
})

test('AC06 course form and AC07 class navigation remain preview-only', async () => {
  const course = mountMore('AC06')
  try {
    await course.render()
    await act(async () => course.document.querySelector('.academic-heading button').click())
    await act(async () => course.document.querySelector('.academic-form .academic-primary').click())
    assert.match(course.document.body.textContent, /Vui lòng nhập mã và tên khóa/)
  } finally { await course.close() }
  let path = ''
  const classes = mountMore('AC07', { navigate: (next) => { path = next }, pathForDetail: () => '/__ui-preview/AC08' })
  try {
    await classes.render()
    await act(async () => classes.document.querySelector('.academic-link').click())
    assert.equal(path, '/__ui-preview/AC08')
  } finally { await classes.close() }
})

test('AC08 opens embedded AC09; validation and conflict states do not claim enrollment', async () => {
  const view = mountMore('AC08')
  try {
    await view.render()
    await act(async () => view.document.querySelector('.academic-heading button').click())
    assert.ok(view.document.querySelector('[role="dialog"]'))
    assert.match(view.document.querySelector('[role="dialog"]').textContent, /Ghi danh \/ chuyển lớp/)
    await act(async () => { const select = view.document.querySelector('.academic-sheet select'); select.value = 'Lớp đã đủ chỗ'; select.dispatchEvent(new view.dom.window.Event('change', { bubbles: true })) })
    assert.match(view.document.querySelector('[role="dialog"]').textContent, /Lớp đã đủ chỗ/)
    await act(async () => view.document.querySelector('.academic-steps button:last-child').click())
    assert.equal(view.document.querySelector('.academic-sheet-actions button:last-child').disabled, true)
    await act(async () => view.document.querySelector('.academic-sheet-head button').click())
    assert.equal(view.document.querySelector('[role="dialog"]'), null)
  } finally { await view.close() }
})

test('Preview includes AC01–AC09 while AC09 has no business route', () => {
  const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: 'AC09' }))
  for (let i = 1; i <= 9; i++) assert.match(html, new RegExp('/__ui-preview/AC0' + i))
  assert.match(html, /role="dialog"/)
  assert.equal(routes.some((route) => route.id === 'AC09'), false)
})
