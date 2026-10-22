import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { matchRoute, routes } from '../../routes.ts'
import { resolveRoute } from '../../auth.ts'

const dom = new JSDOM('<div></div>', { url: 'http://localhost/' })
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => { await vite.close(); dom.window.close() })
const load = (name) => vite.ssrLoadModule(`/src/screens/Assignments & Grading/${name}`)
const { assignmentFixtures: data } = await vite.ssrLoadModule('/src/ui-preview/assignmentFixtures.ts')
const { validScore, validateSelection, studentAssignments } = await load('AssignmentTypes.ts')
const { TeacherAssignmentListScreen } = await load('AS01/TeacherAssignmentListScreen.tsx')
const { AssignmentEditorScreen } = await load('AS02/AssignmentEditorScreen.tsx')
const { AssignmentDetailScreen } = await load('AS03/AssignmentDetailScreen.tsx')
const { GradingQueueScreen } = await load('AS04/GradingQueueScreen.tsx')
const { GradeSubmissionScreen } = await load('AS05/GradeSubmissionScreen.tsx')
const { MyAssignmentsScreen } = await load('AS06/MyAssignmentsScreen.tsx')
const { MyAssignmentDetailScreen } = await load('AS07/MyAssignmentDetailScreen.tsx')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

function mount(Component, props = {}) {
  const view = new JSDOM('<div id="root"></div>', { url: 'http://localhost/__ui-preview/AS01' })
  globalThis.window = view.window; globalThis.document = view.window.document
  const root = createRoot(view.window.document.getElementById('root'))
  return { document: view.window.document,
    render: async () => act(async () => root.render(React.createElement(Component, props))),
    click: async (node) => act(async () => node.dispatchEvent(new view.window.MouseEvent('click', { bubbles: true }))),
    close: async () => { await act(async () => root.unmount()); view.window.close() },
  }
}

test('AS01–AS07 dùng đúng bảy route có guard', () => {
  const expected = ['/teaching/assignments', '/teaching/assignments/new', '/teaching/assignments/assignment-chuong-3', '/teaching/grading', '/teaching/submissions/submission-minh-anh/grade', '/my/assignments', '/my/assignments/assignment-chuong-3']
  for (let i = 0; i < 7; i++) { const id = `AS0${i + 1}`; const path = `/app/demo${expected[i]}`; assert.equal(matchRoute(path)?.route.id, id); assert.equal(resolveRoute(path, { status: 'unauthenticated' }).kind, 'unauthenticated'); assert.equal(routes.filter((r) => r.id === id).length, 1) }
})
test('màn hình production không nhập dữ liệu mẫu', () => { for (const Screen of [TeacherAssignmentListScreen, AssignmentDetailScreen, GradingQueueScreen, GradeSubmissionScreen, MyAssignmentsScreen, MyAssignmentDetailScreen]) assert.doesNotMatch(renderToStaticMarkup(React.createElement(Screen)), /Trần Minh Anh|Bài tập chương 3/) })
test('AS01 chọn bản ghi không đầu tiên', async () => { let id; const v = mount(TeacherAssignmentListScreen, { data, onOpen: (value) => { id = value } }); try { await v.render(); const links = [...v.document.querySelectorAll('.as-table .as-link')]; await v.click(links[1]); assert.equal(id, 'assignment-hinh-hoc') } finally { await v.close() } })
test('AS03 và AS05 không thay ID sai bằng bản ghi đầu tiên', () => { for (const [Screen, key] of [[AssignmentDetailScreen, 'assignmentId'], [GradeSubmissionScreen, 'submissionId']]) { const html = renderToStaticMarkup(React.createElement(Screen, { data, selectedId: `invalid-${key}` })); assert.match(html, /Không tìm thấy/); assert.doesNotMatch(html, /Trần Minh Anh|Bài tập chương 3/) } })
test('AS03 trình bày học sinh chưa nộp trong phạm vi người nhận', () => { const html = renderToStaticMarkup(React.createElement(AssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3' })); assert.match(html, /Trần Bảo Ngọc/); assert.match(html, /Chưa nộp/); assert.doesNotMatch(html, /student-other/) })
test('AS02 phân biệt bước xem lại và không tuyên bố xuất bản', async () => { const v = mount(AssignmentEditorScreen, { data }); try { await v.render(); await v.click(v.document.querySelector('.as-heading button')); assert.ok(v.document.querySelector('[role="dialog"]')); assert.match(v.document.querySelector('[role="dialog"]').textContent, /PENDING_API/); assert.doesNotMatch(v.document.body.textContent, /Đã giao bài|Đã gửi thông báo/) } finally { await v.close() } })
test('AS04 chọn submission không đầu tiên', async () => { let id; const v = mount(GradingQueueScreen, { data, onOpen: (value) => { id = value } }); try { await v.render(); await v.click(v.document.querySelectorAll('.as-table .as-link')[1]); assert.equal(id, 'submission-gia-han') } finally { await v.close() } })
test('điểm 0–10 bước 0,1', () => { for (const value of ['0', '0.1', '8.5', '10']) assert.equal(validScore(value), true); for (const value of ['-1', '10.1', '8.55', 'abc', '']) assert.equal(validScore(value), false) })
test('AS05 giữ nháp và công bố riêng; không công bố cục bộ', () => { const draft = renderToStaticMarkup(React.createElement(GradeSubmissionScreen, { data, selectedId: 'submission-gia-han' })); const published = renderToStaticMarkup(React.createElement(GradeSubmissionScreen, { data, selectedId: 'submission-my-linh' })); assert.match(draft, /Nháp điểm/); assert.match(published, /Điểm đã công bố/); assert.match(draft, /PENDING_API/); assert.match(published, /Lý do điều chỉnh/) })
test('AS06 chỉ lấy người nhận, không rò điểm nháp', () => { assert.equal(studentAssignments(data, 'student-minh-anh').some((a) => a.id === 'assignment-unrelated' || a.status === 'DRAFT'), false); const html = renderToStaticMarkup(React.createElement(MyAssignmentsScreen, { data, studentId: 'student-gia-han' })); assert.doesNotMatch(html, /7,5|Cần bổ sung bước giải|Bài tập lớp khác/); assert.match(html, /Bài tập chương 3/) })
test('AS06 hiển thị hạn hôm nay và quá hạn theo thời điểm mẫu', () => { const today = renderToStaticMarkup(React.createElement(MyAssignmentsScreen, { data, studentId: 'student-minh-anh' })); const overdue = renderToStaticMarkup(React.createElement(MyAssignmentsScreen, { data: { ...data, sampleNow: '2026-10-22T12:00:00+07:00' }, studentId: 'student-minh-anh' })); assert.match(today, /Hạn hôm nay/); assert.match(overdue, /Quá hạn/) })
test('AS07 giới hạn loại, MIME, dung lượng, số lượng và trùng tệp', () => { const file = (name, size, type) => new File(['x'], name, { type }); const ok = file('a.pdf', 1, 'application/pdf'); Object.defineProperty(ok, 'size', { value: 10 * 1024 * 1024 }); assert.equal(validateSelection([], [ok]).files.length, 1); const bad = file('evil.exe', 1, 'application/octet-stream'); assert.match(validateSelection([], [bad]).errors.join(' '), /định dạng/); const huge = file('big.pdf', 1, 'application/pdf'); Object.defineProperty(huge, 'size', { value: 10 * 1024 * 1024 + 1 }); assert.match(validateSelection([], [huge]).errors.join(' '), /10 MB/); assert.match(validateSelection([ok], [ok]).errors.join(' '), /đã được chọn/); assert.match(validateSelection([ok, ok, ok, ok, ok], [file('b.png', 1, 'image/png')]).errors.join(' '), /5 tệp/) })
test('AS07 giữ lịch sử phiên bản và chỉ hiện điểm đã công bố', () => { const html = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh' })); assert.match(html, /v1/); assert.match(html, /v2/); assert.match(html, /NEEDS_SLICE_REVIEW/); const other = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-other' })); assert.match(other, /Không tìm thấy/); assert.doesNotMatch(other, /bai-lam-v1/) })
test('Preview mở AS01–AS07 trong AppShell với nhãn dữ liệu mẫu', async () => { for (const id of ['AS01', 'AS02', 'AS03', 'AS04', 'AS05', 'AS06', 'AS07']) { const v = mount(PreviewApp, { screenId: id }); try { await v.render(); assert.match(v.document.body.textContent, /Dữ liệu mẫu — UI Preview/); assert.ok(v.document.querySelector('.app-shell')); assert.ok(v.document.querySelector('.as-page')) } finally { await v.close() } } })
test('AS02 báo lỗi các trường bắt buộc trước khi mở review', async () => { const v = mount(AssignmentEditorScreen, { data, initialState: 'validation' }); try { await v.render(); await v.click(v.document.querySelector('.as-heading button')); assert.equal(v.document.querySelector('[role="dialog"]'), null); assert.match(v.document.body.textContent, /Cần nhập tiêu đề/); assert.match(v.document.body.textContent, /Cần chọn lớp/); assert.match(v.document.body.textContent, /Cần nhập hạn nộp/) } finally { await v.close() } })
test('AS07 tách nộp muộn, hết hạn và điểm đã công bố', () => { const late = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh', state: 'late' })); const expired = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh', state: 'expired' })); const graded = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-dai-so', studentId: 'student-minh-anh' })); assert.match(late, /Nộp muộn trong cửa sổ mẫu/); assert.match(expired, /Hết hạn nộp bài/); assert.match(graded, /Kết quả đã công bố/); assert.match(graded, /9\/10/); assert.doesNotMatch(late, /Kết quả đã công bố/) })
