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

function mount(id, navigate = () => {}, selectedId = undefined, data = academicFixtures) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return {
    dom,
    document: dom.window.document,
    render: async () => act(async () => root.render(React.createElement(AcademicScreen, { id, data, preview: true, navigate, selectedId: selectedId ?? (id === 'AC02' ? data.students[0].id : id === 'AC04' ? data.teachers[0].id : undefined), pathForDetail: (target, personId) => `/__ui-preview/${target}?${target === 'AC02' ? 'studentId' : 'teacherId'}=${encodeURIComponent(personId)}` }))),
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
    render: async () => act(async () => root.render(React.createElement(AcademicMoreScreen, { id, data: academicMoreFixtures, preview: true, selectedId: academicMoreFixtures.classes[0].code, ...props }))),
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
    await act(async () => [...view.document.querySelectorAll('button')].find((button) => button.textContent === 'Xem chi tiết').click())
    assert.equal(path, '/__ui-preview/AC02?studentId=HS-1028')
  } finally { await view.close() }
})

test('AC02 profile sections and preview edit validation never claim save', async () => {
  const view = mount('AC02')
  try {
    await view.render()
    assert.equal(view.document.querySelector('nav[aria-label^="Các phần hồ sơ"] a:nth-child(2)').textContent, 'Ghi danh')
    await act(async () => [...view.document.querySelectorAll('button')].find((button) => button.textContent === 'Chỉnh sửa hồ sơ').click())
    assert.ok(view.document.querySelector('[role="dialog"]'))
    await act(async () => view.document.querySelector('.academic-dialog-actions button:nth-child(2)').click())
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
    await act(async () => view.document.querySelector('.academic-form-actions button:nth-child(2)').click())
    assert.match(view.document.body.textContent, /Nhập tên, mã \(khi tạo\) và lý do/)
    assert.doesNotMatch(view.document.body.textContent, /đã lưu thành công/i)
  } finally { await view.close() }
})

test('AC06 course form and AC07 class navigation remain preview-only', async () => {
  const course = mountMore('AC06')
  try {
    await course.render()
    await act(async () => course.document.querySelector('.academic-heading button').click())
    await act(async () => course.document.querySelector('.academic-form-actions button:nth-child(2)').click())
    assert.match(course.document.body.textContent, /Nhập tên, mã \(khi tạo\) và lý do/)
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
    assert.equal(view.document.querySelector('.academic-steps button:last-child').disabled, true)
    await act(async () => view.document.querySelector('.academic-sheet-actions button:last-child').click())
    await act(async () => view.document.querySelector('.academic-sheet-actions button:last-child').click())
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

test('AC02 and AC04 preview read-only variants keep sample label and hide edit action', () => {
  globalThis.window = initialDom.window
  globalThis.document = initialDom.window.document
  for (const [id, param] of [['AC02', 'studentId=HS-1028'], ['AC04', 'teacherId=GV-018']]) {
    initialDom.window.history.replaceState(null, '', `/__ui-preview/${id}?${param}&state=read-only`)
    const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: id }))
    assert.match(html, /Dữ liệu mẫu — UI Preview/)
    assert.doesNotMatch(html, /<button[^>]*>Chỉnh sửa hồ sơ<\/button>/)
  }
  initialDom.window.history.replaceState(null, '', '/')
})

test('detail screens use the selected ID and never substitute the first fixture', async () => {
  for (const [id, selected, expected, wrong] of [
    ['AC02', 'HS-1031', 'Trần Bảo Ngọc', 'Nguyễn Minh Anh'],
    ['AC04', 'GV-023', 'Mai Phương', 'Đặng Văn Trân'],
  ]) {
    const view = mount(id, undefined, selected)
    try { await view.render(); assert.match(view.document.querySelector('h1').textContent, new RegExp(expected)); assert.doesNotMatch(view.document.querySelector('h1').textContent, new RegExp(wrong)) } finally { await view.close() }
    const invalid = mount(id, undefined, 'INVALID-ID')
    try { await invalid.render(); assert.match(invalid.document.body.textContent, /Không tìm thấy hồ sơ mẫu/); assert.equal(invalid.document.querySelector('.academic-heading button'), null) } finally { await invalid.close() }
  }
  const chosen = mountMore('AC08', { selectedId: academicMoreFixtures.classes[1].code })
  try { await chosen.render(); assert.match(chosen.document.querySelector('.academic-heading').textContent, new RegExp(academicMoreFixtures.classes[1].code)); assert.doesNotMatch(chosen.document.querySelector('.academic-heading').textContent, new RegExp(academicMoreFixtures.classes[0].code)) } finally { await chosen.close() }
  const invalidClass = mountMore('AC08', { selectedId: 'INVALID-ID' })
  try { await invalidClass.render(); assert.equal(invalidClass.document.querySelector('.academic-heading button'), null); assert.equal(invalidClass.document.querySelector('.academic-tabs'), null) } finally { await invalidClass.close() }
})

test('AC01 defers class filtering until a server scoped filter exists', async () => {
  const data = { ...academicFixtures, students: academicFixtures.students.map((student) => student.id === 'HS-1031' ? { ...student, activeClasses: [...student.activeClasses, { id: 'IELTS-03', name: 'IELTS Master 6.5+' }] } : student) }
  const view = mount('AC01', undefined, undefined, data)
  try {
    await view.render()
    assert.equal(view.document.querySelectorAll('select').length, 0)
    assert.match(view.document.body.textContent, /Bộ lọc lớp, môn và trình độ cần API hỗ trợ/)
    assert.equal(view.document.querySelectorAll('tbody tr').length, 4)
  } finally { await view.close() }
})

test('immediate filters have no Apply button and preview never offers server save', async () => {
  for (const id of ['AC05', 'AC06', 'AC07']) {
    const view = mountMore(id)
    try {
      await view.render()
      assert.equal([...view.document.querySelectorAll('button')].some((button) => button.textContent === 'Áp dụng'), false)
      await act(async () => view.document.querySelector('.academic-heading button').click())
      assert.ok([...view.document.querySelectorAll('button')].some((button) => button.textContent === 'Kiểm tra biểu mẫu'))
      assert.equal([...view.document.querySelectorAll('[role="dialog"] button')].some((button) => button.textContent === 'Lưu'), false)
    } finally { await view.close() }
  }
})

test('AC09 guards steps and preserves values when returning', async () => {
  const view = mountMore('AC08')
  try {
    await view.render()
    await act(async () => view.document.querySelector('.academic-heading button').click())
    const steps = view.document.querySelectorAll('.academic-steps button')
    assert.equal(steps[1].disabled, true)
    assert.equal(steps[2].disabled, true)
    await act(async () => view.document.querySelector('.academic-sheet-actions button:last-child').click())
    assert.equal(steps[1].disabled, false)
    assert.equal(steps[2].disabled, true)
    await act(async () => steps[0].click())
    assert.equal(view.document.querySelector('.academic-form input').value, academicMoreFixtures.wizard.student)
    assert.match(view.document.querySelector('[role="dialog"]').textContent, /Biến thể minh họa bằng dữ liệu mẫu/)
  } finally { await view.close() }
})

test('preview query IDs select the requested record and reject explicit bad IDs', () => {
  for (const [screen, query, selected] of [
    ['AC02', 'studentId=HS-1031', 'Trần Bảo Ngọc'],
    ['AC04', 'teacherId=GV-023', 'Mai Phương'],
    ['AC08', `classId=${encodeURIComponent(academicMoreFixtures.classes[1].code)}`, academicMoreFixtures.classes[1].name],
  ]) {
    initialDom.window.history.replaceState(null, '', `/__ui-preview/${screen}?${query}`)
    globalThis.window = initialDom.window
    const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: screen }))
    assert.match(html, new RegExp(selected))
  }
  initialDom.window.history.replaceState(null, '', '/__ui-preview/AC02?studentId=INVALID-ID')
  const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: 'AC02' }))
  assert.match(html, /Không tìm thấy hồ sơ mẫu/)
  assert.doesNotMatch(html, /Nguyễn Minh Anh/)
})

test('AC09 requires all fields before advancing and never enables confirmation', async () => {
  const view = mountMore('AC08', { data: { ...academicMoreFixtures, wizard: undefined } })
  try {
    await view.render()
    await act(async () => view.document.querySelector('.academic-heading button').click())
    const next = view.document.querySelector('.academic-sheet-actions button:last-child')
    await act(async () => next.click())
    assert.equal(view.document.querySelector('.academic-steps button:nth-child(2)').disabled, true)
    assert.match(view.document.querySelector('[role="dialog"] [role="alert"]').textContent, /Vui lòng nhập học sinh/)
    assert.equal(view.document.querySelector('input[aria-invalid="true"]').getAttribute('aria-describedby'), 'enrollment-error')
    assert.equal(view.document.querySelector('.academic-sheet-actions button:last-child').disabled, false)
  } finally { await view.close() }
})
