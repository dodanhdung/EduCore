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
const { validScore, validateSelection, studentAssignments, upcomingDeadlineCount } = await load('AssignmentTypes.ts')
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
    render: async (nextProps = props) => act(async () => root.render(React.createElement(Component, nextProps))),
    click: async (node) => act(async () => node.dispatchEvent(new view.window.MouseEvent('click', { bubbles: true }))),
    close: async () => { await act(async () => root.unmount()); view.window.close() },
  }
}

test('AS01–AS07 dùng đúng bảy route có guard', () => {
  const expected = ['/teaching/assignments', '/teaching/assignments/new', '/teaching/assignments/assignment-chuong-3', '/teaching/grading', '/teaching/submissions/submission-minh-anh/grade', '/my/assignments', '/my/assignments/assignment-chuong-3']
  for (let i = 0; i < 7; i++) { const id = `AS0${i + 1}`; const path = `/app/demo${expected[i]}`; assert.equal(matchRoute(path)?.route.id, id); assert.equal(resolveRoute(path, { status: 'unauthenticated' }).kind, 'unauthenticated'); assert.equal(routes.filter((r) => r.id === id).length, 1) }
})
test('màn hình production không nhập dữ liệu mẫu', () => { for (const Screen of [TeacherAssignmentListScreen, AssignmentDetailScreen, GradingQueueScreen, GradeSubmissionScreen, MyAssignmentsScreen, MyAssignmentDetailScreen]) assert.doesNotMatch(renderToStaticMarkup(React.createElement(Screen)), /Trần Minh Anh|Bài tập chương 3/) })
test('AS01 chọn bản ghi không đầu tiên', async () => { let id; const v = mount(TeacherAssignmentListScreen, { data, onOpen: (value) => { id = value } }); try { await v.render(); const links = [...v.document.querySelectorAll('table .as-link')]; await v.click(links[1]); assert.equal(id, 'assignment-hinh-hoc') } finally { await v.close() } })
test('AS03 và AS05 không thay ID sai bằng bản ghi đầu tiên', () => { for (const [Screen, key] of [[AssignmentDetailScreen, 'assignmentId'], [GradeSubmissionScreen, 'submissionId']]) { const html = renderToStaticMarkup(React.createElement(Screen, { data, selectedId: `invalid-${key}` })); assert.match(html, /Không tìm thấy/); assert.doesNotMatch(html, /Trần Minh Anh|Bài tập chương 3/) } })
test('AS03 trình bày học sinh chưa nộp trong phạm vi người nhận', () => { const html = renderToStaticMarkup(React.createElement(AssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3' })); assert.match(html, /Trần Bảo Ngọc/); assert.match(html, /Chưa nộp/); assert.doesNotMatch(html, /student-other/) })
test('AS02 phân biệt bước xem lại và không tuyên bố xuất bản', async () => { const v = mount(AssignmentEditorScreen, { data, selectedId: 'assignment-draft' }); try { await v.render(); await v.click(v.document.querySelector('.as-heading button')); assert.ok(v.document.querySelector('[role="dialog"]')); assert.match(v.document.querySelector('[role="dialog"]').textContent, /PENDING_API/); assert.doesNotMatch(v.document.body.textContent, /Đã giao bài|Đã gửi thông báo/) } finally { await v.close() } })
test('AS04 chọn submission không đầu tiên', async () => { let id; const v = mount(GradingQueueScreen, { data, onOpen: (value) => { id = value } }); try { await v.render(); await v.click(v.document.querySelectorAll('.as-table .as-link')[1]); assert.equal(id, 'submission-gia-han') } finally { await v.close() } })
test('điểm 0–10 bước 0,1', () => { for (const value of ['0', '0.1', '8.5', '10']) assert.equal(validScore(value), true); for (const value of ['-1', '10.1', '8.55', 'abc', '']) assert.equal(validScore(value), false) })
test('AS05 giữ nháp và công bố riêng; không công bố cục bộ', () => { const draft = renderToStaticMarkup(React.createElement(GradeSubmissionScreen, { data, selectedId: 'submission-gia-han' })); const published = renderToStaticMarkup(React.createElement(GradeSubmissionScreen, { data, selectedId: 'submission-my-linh' })); assert.match(draft, /Nháp điểm/); assert.match(published, /Điểm đã công bố/); assert.match(draft, /PENDING_API/); assert.match(published, /Lý do điều chỉnh/) })
test('AS06 chỉ lấy người nhận, không rò điểm nháp', () => { assert.equal(studentAssignments(data, 'student-minh-anh').some((a) => a.id === 'assignment-unrelated' || a.status === 'DRAFT'), false); const html = renderToStaticMarkup(React.createElement(MyAssignmentsScreen, { data, studentId: 'student-gia-han' })); assert.doesNotMatch(html, /7,5|Cần bổ sung bước giải|Bài tập lớp khác/); assert.match(html, /Bài tập chương 3/) })
test('AS06 hiển thị hạn hôm nay và quá hạn theo thời điểm mẫu', () => { const today = renderToStaticMarkup(React.createElement(MyAssignmentsScreen, { data, studentId: 'student-minh-anh' })); const overdue = renderToStaticMarkup(React.createElement(MyAssignmentsScreen, { data: { ...data, sampleNow: '2026-10-22T12:00:00+07:00' }, studentId: 'student-minh-anh' })); assert.match(today, /Hạn hôm nay/); assert.match(overdue, /Quá hạn/) })
test('AS07 giới hạn loại, MIME, dung lượng, số lượng và trùng tệp', () => { const file = (name, size, type) => new File(['x'], name, { type }); const ok = file('a.pdf', 1, 'application/pdf'); Object.defineProperty(ok, 'size', { value: 10_000_000 }); assert.equal(validateSelection([], [ok]).files.length, 1); const bad = file('evil.exe', 1, 'application/octet-stream'); assert.match(validateSelection([], [bad]).errors.join(' '), /định dạng/); const huge = file('big.pdf', 1, 'application/pdf'); Object.defineProperty(huge, 'size', { value: 10_000_000 + 1 }); assert.match(validateSelection([], [huge]).errors.join(' '), /10 MB/); assert.match(validateSelection([ok], [ok]).errors.join(' '), /đã được chọn/); assert.match(validateSelection([ok, ok, ok, ok, ok], [file('b.png', 1, 'image/png')]).errors.join(' '), /5 tệp/) })
test('AS07 giữ lịch sử phiên bản và chỉ hiện điểm đã công bố', () => { const html = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh' })); assert.match(html, /v1/); assert.match(html, /v2/); assert.match(html, /NEEDS_SLICE_REVIEW/); const other = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-other' })); assert.match(other, /Không tìm thấy/); assert.doesNotMatch(other, /bai-lam-v1/) })
test('Preview mở AS01–AS07 trong AppShell với nhãn dữ liệu mẫu', async () => { for (const id of ['AS01', 'AS02', 'AS03', 'AS04', 'AS05', 'AS06', 'AS07']) { const v = mount(PreviewApp, { screenId: id }); try { await v.render(); assert.match(v.document.body.textContent, /Dữ liệu mẫu — UI Preview/); assert.ok(v.document.querySelector('.app-shell')); assert.ok(v.document.querySelector('.as-page')) } finally { await v.close() } } })
test('AS02 báo lỗi các trường bắt buộc trước khi mở review', async () => { const v = mount(AssignmentEditorScreen, { data, initialState: 'validation' }); try { await v.render(); await v.click(v.document.querySelector('.as-heading button')); assert.equal(v.document.querySelector('[role="dialog"]'), null); assert.match(v.document.body.textContent, /Cần nhập tiêu đề/); assert.match(v.document.body.textContent, /Cần chọn lớp/); assert.match(v.document.body.textContent, /Cần nhập hạn nộp/) } finally { await v.close() } })
test('AS07 tách nộp muộn, hết hạn và điểm đã công bố', () => { const late = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh', state: 'late' })); const expired = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh', state: 'expired' })); const graded = renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: 'assignment-dai-so', studentId: 'student-minh-anh' })); assert.match(late, /Nộp muộn/); assert.match(expired, /Hết hạn nộp bài/); assert.match(graded, /Kết quả đã công bố/); assert.match(graded, /9\/10/); assert.doesNotMatch(late, /Kết quả đã công bố/) })

function control(doc, labelText) {
  const label = [...doc.querySelectorAll('label')].find((item) => item.textContent.startsWith(labelText))
  assert.ok(label, `Missing label: ${labelText}`)
  return label.querySelector('input, textarea, select')
}
async function input(view, node, value) {
  await act(async () => {
    const proto = node.tagName === 'TEXTAREA' ? view.document.defaultView.HTMLTextAreaElement.prototype : node.tagName === 'SELECT' ? view.document.defaultView.HTMLSelectElement.prototype : view.document.defaultView.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(node, value)
    node.dispatchEvent(new view.document.defaultView.Event(node.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}

test('AS05 reset toàn bộ state ngay khi đổi submission trên cùng React root', async () => {
  const original = JSON.stringify(data.submissions)
  const v = mount(GradeSubmissionScreen, { data, selectedId: 'submission-gia-han' })
  try {
    await v.render()
    assert.equal(control(v.document, 'Điểm *').value, '7.5')
    await v.click([...v.document.querySelectorAll('button')].find((button) => button.textContent === 'Công bố điểm'))
    assert.ok(v.document.querySelector('[role="dialog"]'))
    await v.render({ data, selectedId: 'submission-my-linh', state: 'correction' })
    assert.equal(v.document.querySelector('[role="dialog"]'), null)
    assert.equal(control(v.document, 'Điểm *').value, '8.5')
    assert.equal(control(v.document, 'Phản hồi giáo viên').value, 'Trình bày rõ ràng.')
    assert.equal(control(v.document, 'Lý do điều chỉnh điểm đã công bố').value, '')
    assert.doesNotMatch(v.document.body.textContent, /Cần bổ sung bước giải|Chưa lưu hoặc công bố/)
    await v.render({ data, selectedId: 'invalid-submission' })
    assert.match(v.document.body.textContent, /Không tìm thấy/)
    assert.doesNotMatch(v.document.body.textContent, /Trình bày rõ ràng|Cần bổ sung bước giải/)
    await v.render({ data, selectedId: 'submission-gia-han' })
    assert.equal(control(v.document, 'Điểm *').value, '7.5')
    assert.equal(JSON.stringify(data.submissions), original)
  } finally { await v.close() }
})

test('AS05 đổi phiên bản về bản mới nhất khi đổi ID và không giữ điểm nháp chưa lưu', async () => {
  const v = mount(GradeSubmissionScreen, { data, selectedId: 'submission-minh-anh' })
  try {
    await v.render()
    await v.click([...v.document.querySelectorAll('button')].find((button) => button.textContent === 'v1'))
    assert.match(v.document.querySelector('.as-heading p').textContent, /v1/)
    await input(v, control(v.document, 'Điểm *'), '6.5')
    await v.render({ data, selectedId: 'submission-gia-han' })
    assert.equal(control(v.document, 'Điểm *').value, '7.5')
    await v.render({ data, selectedId: 'submission-minh-anh' })
    assert.match(v.document.querySelector('.as-heading p').textContent, /v2/)
    assert.equal(control(v.document, 'Điểm *').value, '')
  } finally { await v.close() }
})

test('AS01 đếm hạn trong 72 giờ theo instant và không đoán khi thiếu đồng hồ', () => {
  const now = '2026-10-17T12:00:00+07:00'
  const item = data.assignments[0]
  const cases = [
    { ...item, id: 'near', deadline: '2026-10-20T05:00:00Z' },
    { ...item, id: 'boundary', deadline: '2026-10-20T05:00:00+00:00' },
    { ...item, id: 'future', deadline: '2026-10-20T05:00:01Z' },
    { ...item, id: 'expired', deadline: '2026-10-17T04:59:59Z' },
    { ...item, id: 'draft', status: 'DRAFT', deadline: '2026-10-18T05:00:00Z' },
  ]
  assert.equal(upcomingDeadlineCount(cases, now), 2)
  assert.equal(upcomingDeadlineCount(cases, '2026-10-17T05:00:00Z'), 2)
  assert.equal(upcomingDeadlineCount(cases), undefined)
  assert.equal(upcomingDeadlineCount(cases, 'invalid'), undefined)
  const html = renderToStaticMarkup(React.createElement(TeacherAssignmentListScreen, { data }))
  assert.match(html, /Sắp đến hạn \(72 giờ\)/)
  assert.match(html, /Chưa có dữ liệu từ API/)
})

test('AS01/AS06 chỉ hiện nhãn mẫu khi preview được bật', () => {
  for (const [Screen, props] of [[TeacherAssignmentListScreen, { data, referenceTime: data.sampleNow }], [MyAssignmentsScreen, { data, studentId: data.studentId }]]) {
    assert.doesNotMatch(renderToStaticMarkup(React.createElement(Screen, props)), /Dữ liệu mẫu trong UI Preview|Chỉ hiển thị dữ liệu mẫu/)
    assert.match(renderToStaticMarkup(React.createElement(Screen, { ...props, preview: true })), /Dữ liệu mẫu trong UI Preview/)
  }
})

test('AS02 tạo mới rỗng, edit đúng ID, đổi ID không giữ trường cũ', async () => {
  const v = mount(AssignmentEditorScreen, { data })
  try {
    await v.render()
    for (const name of ['Tiêu đề *', 'Mô tả & yêu cầu *', 'Hạn nộp *', 'Độ ưu tiên *']) assert.equal(control(v.document, name).value, '')
    assert.equal(control(v.document, 'Lớp phụ trách *').value, '')
    await v.render({ data, selectedId: 'assignment-draft' })
    assert.equal(control(v.document, 'Tiêu đề *').value, 'Kiểm tra cuối chương')
    await input(v, control(v.document, 'Tiêu đề *'), 'Bản chưa lưu')
    await v.render({ data, selectedId: 'assignment-hinh-hoc' })
    assert.equal(control(v.document, 'Tiêu đề *').value, 'Ôn tập hình học')
    await v.render({ data, selectedId: 'assignment-draft' })
    assert.equal(control(v.document, 'Tiêu đề *').value, 'Kiểm tra cuối chương')
    await v.render({ data, selectedId: 'bad-id' })
    assert.match(v.document.body.textContent, /Không tìm thấy/)
    await v.render({ data })
    assert.equal(control(v.document, 'Tiêu đề *').value, '')
  } finally { await v.close() }
})

test('AS02 lấy số người nhận từ roster rõ ràng và báo thiếu khi không có roster', async () => {
  const v = mount(AssignmentEditorScreen, { data, selectedId: 'assignment-draft', preview: true })
  try {
    await v.render()
    assert.match(v.document.body.textContent, /4 học sinh trong Toán 8A/)
    assert.notEqual(data.assignments.find((item) => item.id === 'assignment-draft').recipientIds.length, 4)
    await v.render({ data: { ...data, classRosters: undefined }, selectedId: 'assignment-draft' })
    assert.match(v.document.body.textContent, /Chưa có danh sách người nhận được xác minh/)
    await v.click(v.document.querySelector('.as-heading button'))
    assert.match(v.document.querySelector('[role="dialog"]').textContent, /Chưa xác minh danh sách người nhận|PENDING_API/)
  } finally { await v.close() }
})

test('AS02 bài đã giao có bài nộp không mở thao tác xuất bản cục bộ', async () => {
  const v = mount(AssignmentEditorScreen, { data, selectedId: 'assignment-chuong-3' })
  try {
    await v.render()
    assert.equal(v.document.querySelector('.as-heading button').disabled, true)
    assert.equal(control(v.document, 'Tiêu đề *').disabled, true)
    assert.match(v.document.body.textContent, /PENDING_API/)
    assert.equal(v.document.querySelector('[role="dialog"]'), null)
  } finally { await v.close() }
})

test('AS07 tệp và thông báo theo assignment/student ID trên cùng React root', async () => {
  const original = JSON.stringify(data.submissions)
  const v = mount(MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh' })
  try {
    await v.render()
    const firstInput = control(v.document, 'Chọn tệp')
    const file = new v.document.defaultView.File(['answer'], 'answer.pdf', { type: 'application/pdf' })
    Object.defineProperty(firstInput, 'files', { configurable: true, value: [file] })
    await act(async () => firstInput.dispatchEvent(new v.document.defaultView.Event('change', { bubbles: true })))
    assert.match(v.document.body.textContent, /answer.pdf/)
    await v.render({ data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh' })
    assert.match(v.document.body.textContent, /answer.pdf/)
    await v.click([...v.document.querySelectorAll('button')].find((button) => button.textContent === 'Nộp phiên bản mới'))
    assert.match(v.document.body.textContent, /PENDING_API: Tệp chưa được tải lên/)
    const badFile = new v.document.defaultView.File(['bad'], 'bad.zip', { type: 'application/zip' })
    Object.defineProperty(firstInput, 'files', { configurable: true, value: [badFile] })
    await act(async () => firstInput.dispatchEvent(new v.document.defaultView.Event('change', { bubbles: true })))
    assert.match(v.document.body.textContent, /bad.zip: định dạng không hỗ trợ/)
    await v.render({ data, selectedId: 'assignment-hinh-hoc', studentId: 'student-minh-anh' })
    assert.notEqual(control(v.document, 'Chọn tệp'), firstInput)
    assert.equal(control(v.document, 'Chọn tệp').value, '')
    assert.doesNotMatch(v.document.body.textContent, /answer.pdf|bad.zip|Tệp chưa được tải lên/)
    await v.render({ data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh' })
    assert.doesNotMatch(v.document.body.textContent, /answer.pdf|bad.zip|Tệp chưa được tải lên/)
    await v.render({ data, selectedId: 'assignment-chuong-3', studentId: 'student-gia-han' })
    assert.doesNotMatch(v.document.body.textContent, /answer.pdf|Tệp chưa được tải lên/)
    assert.equal(JSON.stringify(data.submissions), original)
  } finally { await v.close() }
})

test('AS03 mở đúng submission thứ hai; AS06 mở đúng assignment thứ hai', async () => {
  let submissionId, assignmentId
  const teacher = mount(AssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', onGrade: (id) => { submissionId = id } })
  const student = mount(MyAssignmentsScreen, { data, studentId: 'student-minh-anh', onOpen: (id) => { assignmentId = id } })
  try {
    await teacher.render()
    await teacher.click(teacher.document.querySelectorAll('.as-table .as-link')[1])
    assert.equal(submissionId, 'submission-gia-han')
    assert.match(renderToStaticMarkup(React.createElement(GradeSubmissionScreen, { data, selectedId: submissionId })), /Nguyễn Gia Hân/)
    await student.render()
    await student.click(student.document.querySelectorAll('.as-student-card .as-button')[1])
    assert.equal(assignmentId, 'assignment-hinh-hoc')
    assert.match(renderToStaticMarkup(React.createElement(MyAssignmentDetailScreen, { data, selectedId: assignmentId, studentId: 'student-minh-anh' })), /Ôn tập hình học/)
  } finally { await teacher.close(); await student.close() }
})

test('AS03/AS05/AS07 production không gắn nhãn Preview vào dữ liệu hợp lệ', () => {
  const screens = [
    [AssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3' }],
    [GradeSubmissionScreen, { data, selectedId: 'submission-my-linh' }],
    [MyAssignmentDetailScreen, { data, selectedId: 'assignment-chuong-3', studentId: 'student-minh-anh', state: 'late' }],
  ]
  for (const [Screen, props] of screens) assert.doesNotMatch(renderToStaticMarkup(React.createElement(Screen, props)), /Preview|dữ liệu mẫu|snapshot mẫu|cửa sổ mẫu/)
})
