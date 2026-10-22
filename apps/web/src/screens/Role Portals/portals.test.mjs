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
const { ParentAssignmentDetailScreen, MyAssignmentDetailScreen } = await vite.ssrLoadModule('/src/screens/Assignments & Grading/AS07/MyAssignmentDetailScreen.tsx')
const { assignmentFixtures } = await vite.ssrLoadModule('/src/ui-preview/assignmentFixtures.ts')
const { billingFixtures } = await vite.ssrLoadModule('/src/ui-preview/billingFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

const props = { data, navigate: () => undefined, path: portalPreviewPath }
function mount(Component, initial) {
  const view = new JSDOM('<div id="root"></div>', { url: 'http://localhost/__ui-preview/PO03' })
  globalThis.window = view.window; globalThis.document = view.window.document
  const root = createRoot(view.window.document.getElementById('root'))
  return { document: view.window.document, render: async (next = initial) => act(async () => root.render(React.createElement(Component, next))), close: async () => { await act(async () => root.unmount()); view.window.close() } }
}
function previewAt(screenId, search) {
  const previousWindow = globalThis.window, previousDocument = globalThis.document
  const view = new JSDOM('<div></div>', { url: `http://localhost/__ui-preview/${screenId}${search}` })
  globalThis.window = view.window; globalThis.document = view.window.document
  try { return renderToStaticMarkup(React.createElement(PreviewApp, { screenId })) } finally { globalThis.window = previousWindow; globalThis.document = previousDocument; view.window.close() }
}

test('PO01–PO05 giữ đúng năm business routes và guard hiện tại', () => {
  const paths = ['/teacher', '/student', '/parent', '/parent/children/student-minh-anh', '/my/billing']
  paths.forEach((suffix, index) => { const id = `PO0${index + 1}`; const path = `/app/demo${suffix}`; assert.equal(matchRoute(path)?.route.id, id); assert.equal(resolveRoute(path, { status: 'unauthenticated' }).kind, 'unauthenticated'); assert.equal(routes.filter((item) => item.id === id).length, 1) })
  assert.equal(portalPath('demo', 'SC05', 'a'), '/app/demo/schedule/sessions/a')
  assert.equal(resolveRoute('/app/demo/finance/invoices/invoice-hai-dang-0926?role=parent&source=portal', { status: 'unauthenticated' }).kind, 'unauthenticated')
  assert.equal(resolveRoute('/app/demo/my/assignments/assignment-dai-so?role=parent', { status: 'unauthenticated' }).kind, 'unauthenticated')
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
  assert.match(html, /Chờ xác thực quyền xem/)
  const document = new JSDOM(html).window.document
  assert.equal(document.querySelectorAll('button').length, 0)
  const other = renderToStaticMarkup(React.createElement(MyBillingScreen, { ...props, mode: 'student', studentId: 'student-other' }))
  assert.doesNotMatch(other, /INV-2026-00001/)
})
test('PO05 parent chặn revoked và BL07 learner giấu lịch sử điều chỉnh', () => {
  const denied = renderToStaticMarkup(React.createElement(MyBillingScreen, { ...props, mode: 'parent', initialChildId: 'student-revoked' }))
  assert.match(denied, /Không thể xem học phí/)
  const detail = renderToStaticMarkup(React.createElement(InvoiceDetailScreen, { data: billingFixtures, selectedId: 'invoice-hai-dang-0926', audience: 'learner', learnerStudentId: 'student-hai-dang', canManage: true }))
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
test('PO03/PO05 đổi ID tường minh và người xem trên cùng root chặn dữ liệu cũ ngay', async () => {
  for (const [Screen, extra] of [[ParentHomeScreen, props], [MyBillingScreen, { data, mode: 'parent' }]]) {
    const common = { ...extra, viewerId: 'parent-demo', tenantId: 'demo-hcm-01' }
    const view = mount(Screen, { ...common, initialChildId: 'student-hai-dang' })
    try {
      await view.render(); assert.match(view.document.body.textContent, /Nguyễn Hải Đăng/)
      await view.render({ ...common, initialChildId: 'student-minh-anh' }); assert.match(view.document.body.textContent, /Trần Minh Anh/); assert.doesNotMatch(view.document.body.textContent, /2\.150\.000/)
      await view.render({ ...common, initialChildId: 'student-hai-dang', viewerId: 'other-parent' }); assert.match(view.document.body.textContent, /Đang chờ phạm vi xem mới/); assert.doesNotMatch(view.document.body.textContent, /Nguyễn Hải Đăng|2\.150\.000/)
      await view.render({ ...common, initialChildId: 'student-hai-dang', tenantId: 'other-tenant' }); assert.match(view.document.body.textContent, /Đang chờ phạm vi xem mới/)
      await view.render({ ...common, initialChildId: 'student-hai-dang', data: { ...data, links: data.links.map((link) => link.studentId === 'student-hai-dang' ? { ...link, status: 'REVOKED' } : link) } }); assert.match(view.document.body.textContent, /Không thể xem/); assert.doesNotMatch(view.document.body.textContent, /2\.150\.000/)
      await view.render({ ...common, initialChildId: 'student-hai-dang', data: { ...data, links: data.links.map((link) => link.studentId === 'student-hai-dang' ? { ...link, status: 'INACTIVE' } : link) } }); assert.match(view.document.body.textContent, /Không thể xem/)
      await view.render({ ...common, initialChildId: undefined, data: { ...data, links: [] } }); assert.doesNotMatch(view.document.body.textContent, /Nguyễn Hải Đăng|2\.150\.000/)
    } finally { await view.close() }
  }
})
test('PO04 chỉ mở bản AS07 phụ huynh khi Preview cấp callback và đúng con', async () => {
  const paths = []
  const view = mount(ChildLearningScreen, { ...props, studentId: 'student-minh-anh', onOpenAssignment: (id, childId) => paths.push([id, childId]) })
  try { await view.render(); const tab = [...view.document.querySelectorAll('[role=tab]')].find((item) => item.textContent.includes('Bài tập')); await act(async () => tab.click()); const link = [...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Xem bài tập'); await act(async () => link.click()); assert.deepEqual(paths[0], ['assignment-chuong-3', 'student-minh-anh']) } finally { await view.close() }
  const parent = (id, student, source = assignmentFixtures) => renderToStaticMarkup(React.createElement(ParentAssignmentDetailScreen, { data: source, selectedId: id, studentId: student, scopedStudentId: 'student-minh-anh' }))
  assert.match(parent('assignment-dai-so', 'student-minh-anh'), /Kết quả đã công bố|9\/10|Chỉ xem/)
  assert.doesNotMatch(parent('assignment-dai-so', 'student-minh-anh'), /type="file"|Nộp phiên bản mới|Nộp bài/)
  assert.doesNotMatch(parent('assignment-chuong-3', 'student-minh-anh', { ...assignmentFixtures, submissions: assignmentFixtures.submissions.map((entry) => entry.id === 'submission-minh-anh' ? { ...entry, grade: { status: 'DRAFT', score: 7, feedback: 'Nháp bí mật' } } : entry) }), /Nháp bí mật|7\/10/)
  assert.doesNotMatch(parent('assignment-dai-so', 'student-other'), /Luyện tập đại số|Làm tốt/)
  assert.match(renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data: assignmentFixtures, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh' })), /type="file"/)
  assert.doesNotMatch(previewAt('AS07', '?source=portal&studentId=student-minh-anh&assignmentId=assignment-dai-so&state=revoked'), /Luyện tập đại số|Làm tốt/)
  assert.doesNotMatch(previewAt('AS07', '?source=portal&studentId=student-revoked&assignmentId=assignment-dai-so'), /Luyện tập đại số|Làm tốt/)
})
test('BL07 learner đòi đúng học sinh, ID và ISSUED; staff vẫn có nội dung nội bộ', () => {
  const show = (selectedId, learnerStudentId, audience = 'learner') => renderToStaticMarkup(React.createElement(InvoiceDetailScreen, { data: billingFixtures, selectedId, learnerStudentId, audience, canManage: true }))
  assert.match(show('invoice-hai-dang-0926', 'student-hai-dang'), /INV-2026-00001/)
  assert.doesNotMatch(show('invoice-hai-dang-0926', 'student-hai-dang'), /Thao tác nhân sự|Điều chỉnh và hủy|Policy snapshot|PRICE RULE/)
  for (const [id, student] of [['invoice-thao-vy-0926', 'student-hai-dang'], ['unknown', 'student-hai-dang'], ['invoice-mai-an-0926', 'student-mai-an'], [undefined, 'student-hai-dang']]) assert.match(show(id, student), /Không tìm thấy hóa đơn/)
  assert.match(show('invoice-hai-dang-0926', undefined, 'staff'), /Thao tác nhân sự|Điều chỉnh và hủy|Policy snapshot/)
  assert.doesNotMatch(previewAt('BL07', '?source=portal&role=staff&studentId=student-hai-dang&invoiceId=invoice-hai-dang-0926'), /Thao tác nhân sự|Policy snapshot|INV-2026-00001/)
  assert.doesNotMatch(previewAt('BL07', '?source=portal&role=parent&studentId=student-revoked&invoiceId=invoice-hai-dang-0926'), /INV-2026-00001/)
})
test('PO05 mở ID hóa đơn thứ hai trong Preview, không thay bằng bản ghi đầu', async () => {
  const extra = { ...data.invoices[0], id: 'invoice-hai-dang-second', number: 'INV-SECOND', studentId: 'student-hai-dang', studentName: 'Nguyễn Hải Đăng', status: 'ISSUED', payments: [] }
  const calls = [], view = mount(MyBillingScreen, { data: { ...data, invoices: [...data.invoices, extra] }, mode: 'parent', initialChildId: 'student-hai-dang', onOpenInvoice: (id, student) => calls.push([id, student]) })
  try { await view.render(); const row = [...view.document.querySelectorAll('tr')].find((item) => item.textContent.includes('INV-SECOND')); await act(async () => row.querySelector('button').click()); assert.deepEqual(calls, [['invoice-hai-dang-second', 'student-hai-dang']]) } finally { await view.close() }
})
test('PO03 truyền đúng con đã chọn sang PO05 và AT03; URL lạ không cấp quyền', async () => {
  const calls = [], view = mount(ParentHomeScreen, { ...props, onOpenBilling: (id) => calls.push(['billing', id]), onOpenLeave: (id) => calls.push(['leave', id]) })
  try { await view.render(); for (const child of ['student-minh-anh', 'student-hai-dang']) { const select = view.document.querySelector('select'); await act(async () => { select.value = child; select.dispatchEvent(new view.document.defaultView.Event('change', { bubbles: true })) }); for (const [label, kind] of [['Xem học phí', 'billing'], ['Gửi đơn nghỉ cho con', 'leave']]) { const action = [...view.document.querySelectorAll('button')].find((item) => item.textContent === label); await act(async () => action.click()); assert.deepEqual(calls.at(-1), [kind, child]) } } } finally { await view.close() }
  assert.match(previewAt('PO05', '?source=portal&studentId=student-minh-anh'), /Trần Minh Anh/)
  assert.doesNotMatch(previewAt('PO05', '?source=portal&studentId=student-minh-anh'), /INV-2026-00001/)
  for (const child of ['student-minh-anh', 'student-hai-dang']) { const form = new JSDOM(previewAt('AT03', `?source=portal&role=parent&studentId=${child}`)).window.document; assert.equal(form.querySelector('select').value, child); assert.equal(form.querySelectorAll('select option[value^="student-"]').length, 1) }
  assert.doesNotMatch(previewAt('AT03', '?source=portal&role=parent&studentId=student-revoked'), /<option value="student-revoked"/)
  assert.doesNotMatch(previewAt('AT03', '?source=portal&role=parent&studentId=unknown'), /<option value="student-minh-anh"/)
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(ParentHomeScreen, props)), /<a[^>]+(?:\/my\/billing|\/leave-requests\/new)/)
})
test('PO05 phân biệt thiếu ví, ví 0 và ví dương độc lập với hóa đơn', () => {
  const show = (patch) => renderToStaticMarkup(React.createElement(MyBillingScreen, { data: { ...data, ...patch }, mode: 'parent', initialChildId: 'student-hai-dang' }))
  const balance = (html) => [...new JSDOM(html).window.document.querySelectorAll('.portal-kpi')].find((item) => item.querySelector('span').textContent === 'Số dư ví khả dụng').querySelector('strong').textContent
  const missing = show({ wallets: [] }); assert.equal(balance(missing), 'Chưa có dữ liệu ví'); assert.match(missing, /INV-2026-00001/)
  const zero = show({ wallets: data.wallets.map((wallet) => wallet.studentId === 'student-hai-dang' ? { ...wallet, availableVnd: '0', transactions: [] } : wallet) }); assert.equal(balance(zero), '0 ₫')
  assert.equal(balance(show({})), '1.200.000 ₫')
  assert.equal(balance(show({ invoices: [] })), '1.200.000 ₫')
  assert.equal(new JSDOM(show({})).window.document.querySelectorAll('button').length, 0)
})
