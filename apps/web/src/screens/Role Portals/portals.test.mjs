import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { matchRoute, routes } from '../../routes.ts'
import { resolveRoute } from '../../auth.ts'

const base = new JSDOM('<div></div>', { url: 'http://localhost/' })
globalThis.window = base.window; globalThis.document = base.window.document; globalThis.HTMLElement = base.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); base.window.close() })
const load = (name) => vite.ssrLoadModule(`/src/screens/Role Portals/${name}`)
const { portalFixtures: data } = await vite.ssrLoadModule('/src/ui-preview/portalFixtures.ts')
const { TeacherHomeScreen } = await load('PO01/TeacherHomeScreen.tsx')
const { StudentHomeScreen } = await load('PO02/StudentHomeScreen.tsx')
const { ParentHomeScreen } = await load('PO03/ParentHomeScreen.tsx')
const { ChildLearningScreen } = await load('PO04/ChildLearningScreen.tsx')
const { MyBillingScreen } = await load('PO05/MyBillingScreen.tsx')
const { portalPath, portalPreviewPath } = await load('PortalNavigation.ts')
const { InvoiceDetailScreen } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL07/InvoiceDetailScreen.tsx')
const { billingFixtures } = await vite.ssrLoadModule('/src/ui-preview/billingFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

const props = { data, navigate: () => undefined, path: portalPreviewPath }
function mount(Component, initial) {
  const view = new JSDOM('<div id="root"></div>', { url: 'http://localhost/__ui-preview/PO03' })
  globalThis.window = view.window; globalThis.document = view.window.document
  const root = createRoot(view.window.document.getElementById('root'))
  return { document: view.window.document, render: async (next = initial) => act(async () => root.render(React.createElement(Component, next))), close: async () => { await act(async () => root.unmount()); view.window.close() } }
}

test('PO01–PO05 giữ đúng năm business routes và guard hiện tại', () => {
  const paths = ['/teacher', '/student', '/parent', '/parent/children/student-minh-anh', '/my/billing']
  paths.forEach((suffix, index) => { const id = `PO0${index + 1}`; const path = `/app/demo${suffix}`; assert.equal(matchRoute(path)?.route.id, id); assert.equal(resolveRoute(path, { status: 'unauthenticated' }).kind, 'unauthenticated'); assert.equal(routes.filter((item) => item.id === id).length, 1) })
  assert.equal(portalPath('demo', 'SC05', 'a'), '/app/demo/schedule/sessions/a')
})
test('PO01 lọc teacherId và đếm điểm danh từ trạng thái cung cấp', () => {
  const html = renderToStaticMarkup(React.createElement(TeacherHomeScreen, { ...props, teacherId: data.teacherId }))
  assert.match(html, /Toán 8A/); assert.doesNotMatch(html, /Tiếng Anh B2/); assert.match(html, /Chưa xác nhận điểm danh/)
  assert.match(html, /__ui-preview\/AT02\?sessionId=portal-session-toan-8b-17/)
  assert.match(html, /__ui-preview\/AS04/)
})
test('PO02 chỉ có bài của học sinh hiện tại và điểm đã công bố', () => {
  const html = renderToStaticMarkup(React.createElement(StudentHomeScreen, { ...props, studentId: data.studentId }))
  assert.match(html, /Bài tập chương 3/); assert.doesNotMatch(html, /Bài tập lớp khác/); assert.match(html, /Điểm đã công bố: 9/); assert.doesNotMatch(html, /Cần bổ sung bước giải/)
})
test('PO03 đổi con trên cùng React root xóa dữ liệu của con trước', async () => {
  const view = mount(ParentHomeScreen, props)
  try { await view.render(); assert.match(view.document.body.textContent, /Trần Minh Anh/); assert.doesNotMatch(view.document.body.textContent, /2\.150\.000/)
    const select = view.document.querySelector('select'); await act(async () => { select.value = 'student-hai-dang'; select.dispatchEvent(new view.document.defaultView.Event('change', { bubbles: true })) })
    assert.match(view.document.body.textContent, /Nguyễn Hải Đăng/); assert.match(view.document.body.textContent, /2\.150\.000/); assert.doesNotMatch(view.document.querySelector('.portal-heading').textContent, /Trần Minh Anh/)
  } finally { await view.close() }
})
test('PO03 không fallback khi ID con tường minh không hợp lệ hoặc đã thu hồi', () => {
  for (const id of ['unknown', 'student-revoked', 'student-unverified']) { const html = renderToStaticMarkup(React.createElement(ParentHomeScreen, { ...props, initialChildId: id })); assert.match(html, /Không thể xem học sinh này/); assert.doesNotMatch(html, /2\.150\.000/) }
})
test('PO04 từ chối ID ngoài scope, không lộ nháp điểm và không có nút chấm', () => {
  const forbidden = renderToStaticMarkup(React.createElement(ChildLearningScreen, { ...props, studentId: 'student-revoked' }))
  assert.match(forbidden, /Không thể xem thông tin học tập/)
  const html = renderToStaticMarkup(React.createElement(ChildLearningScreen, { ...props, studentId: 'student-minh-anh' }))
  assert.doesNotMatch(html, /Cần bổ sung bước giải|Chấm bài|Sửa điểm/)
})
test('PO04 tab bài tập chỉ hiện điểm đã công bố trên cùng React root', async () => {
  const view = mount(ChildLearningScreen, { ...props, studentId: 'student-minh-anh' })
  try { await view.render(); const tab = [...view.document.querySelectorAll('[role=tab]')].find((item) => item.textContent.includes('Bài tập'))
    await act(async () => tab.dispatchEvent(new view.document.defaultView.MouseEvent('click', { bubbles: true })))
    assert.match(view.document.body.textContent, /Điểm đã công bố: 9/); assert.doesNotMatch(view.document.body.textContent, /Cần bổ sung bước giải|Sửa điểm/)
  } finally { await view.close() }
})
test('PO05 chỉ lấy hóa đơn ISSUED đúng học sinh, giữ ví tách khỏi công nợ', () => {
  const html = renderToStaticMarkup(React.createElement(MyBillingScreen, { ...props, data: { ...data, studentId: 'student-hai-dang', studentName: 'Nguyễn Hải Đăng' }, mode: 'student', studentId: 'student-hai-dang' }))
  assert.match(html, /INV-2026-00001/); assert.match(html, /1\.200\.000/); assert.match(html, /2\.150\.000/)
  assert.match(html, /__ui-preview\/BL07\?invoiceId=invoice-hai-dang-0926/)
  const document = new JSDOM(html).window.document
  assert.equal(document.querySelectorAll('button').length, 0)
  const other = renderToStaticMarkup(React.createElement(MyBillingScreen, { ...props, mode: 'student', studentId: 'student-other' }))
  assert.doesNotMatch(other, /INV-2026-00001/)
})
test('PO05 parent chặn revoked và BL07 learner giấu lịch sử điều chỉnh', () => {
  const denied = renderToStaticMarkup(React.createElement(MyBillingScreen, { ...props, mode: 'parent', initialChildId: 'student-revoked' }))
  assert.match(denied, /Không thể xem học phí/)
  const detail = renderToStaticMarkup(React.createElement(InvoiceDetailScreen, { data: billingFixtures, selectedId: 'invoice-hai-dang-0926', audience: 'learner', canManage: true }))
  assert.doesNotMatch(detail, /Điều chỉnh và hủy|Thao tác nhân sự|Generation:/)
})
test('PO05 đổi con trên cùng React root không giữ hóa đơn và ví cũ', async () => {
  const view = mount(MyBillingScreen, { ...props, mode: 'parent', initialChildId: 'student-hai-dang' })
  try { await view.render(); assert.match(view.document.body.textContent, /INV-2026-00001/)
    const select = view.document.querySelector('select'); await act(async () => { select.value = 'student-minh-anh'; select.dispatchEvent(new view.document.defaultView.Event('change', { bubbles: true })) })
    assert.doesNotMatch(view.document.body.textContent, /INV-2026-00001|1\.200\.000|2\.150\.000/); assert.match(view.document.body.textContent, /Chưa có hóa đơn đã phát hành/)
  } finally { await view.close() }
})
test('UI Preview gắn AppShell, nhãn dữ liệu mẫu và giữ route PO05', () => {
  const html = renderToStaticMarkup(React.createElement(PreviewApp, { screenId: 'PO05' }))
  assert.match(html, /Dữ liệu mẫu — UI Preview/); assert.match(html, /Học phí của con/); assert.match(html, /INV-2026-00001/)
})
test('route production không được bơm fixture Preview', () => {
  for (const [Screen, extra] of [[TeacherHomeScreen, {}], [StudentHomeScreen, {}], [ParentHomeScreen, {}], [ChildLearningScreen, {}], [MyBillingScreen, { mode: 'student' }]]) {
    const html = renderToStaticMarkup(React.createElement(Screen, { navigate: () => undefined, path: portalPreviewPath, ...extra }))
    assert.match(html, /Đang chờ/); assert.doesNotMatch(html, /Trần Minh Anh|INV-2026-00001/)
  }
})
