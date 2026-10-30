import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const calls = []
let reply = () => Response.json({})
globalThis.fetch = async (url, options) => { calls.push({ url: String(url), options }); return reply(String(url), options) }
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { AcademicCatalogProduction } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicCatalogProduction.tsx')
const { AcademicCatalogView } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicCatalogViews.tsx')
const { AcademicClassSchedule } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicClassSchedule.tsx')
const { AcademicAdmission } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicAdmission.tsx')
const { courseModel, classesModel, classModel, pageOf, completeChoices, editorBody, editorError, newEditor } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicCatalogModel.ts')
const root = createRoot(dom.window.document.getElementById('root'))
after(async () => { await act(async () => root.unmount()); await vite.close(); dom.window.close() })
const caps = { tenantTimezone: 'Asia/Ho_Chi_Minh', studentCreate: false, studentUpdate: false, teacherCreate: false, teacherUpdate: false,
  catalogManage: false, courseUpdate: false, classCreate: false, classUpdate: false, teacherAssign: false, enroll: false, transferRequest: false }
const page = (items, total = items.length, index = 1) => ({ items, page: index, pageSize: 20, total, asOf: '2026-10-29T00:00:00Z' })
let seq = 0
async function mount(id, extra = {}) {
  await act(async () => { root.render(React.createElement(AcademicCatalogProduction, { key: ++seq, id, tenantId: 'tenant-a', token: 'token-a', navigate: () => {}, ...extra })); await new Promise(resolve => setTimeout(resolve, 25)) })
}
async function click(button) { assert.ok(button, 'expected button'); await act(async () => button.click()) }
const find = (text) => [...dom.window.document.querySelectorAll('button')].find(button => button.textContent.trim() === text)

test('AC08 schedule filters the authorized calendar by class, deduplicates windows and navigates with class context', async () => {
  const stamp = new Date().toISOString()
  const session = { id: 'session-one', classId: 'class-a', className: 'Toán 8A', teacherName: 'Mai Phương', startsAt: stamp, endsAt: stamp, status: 'CONFIRMED' }
  reply = () => Response.json(page([session, { ...session, id: 'other-session', classId: 'other-class', teacherName: 'Other teacher' }]))
  const navigation = []
  await act(async () => { root.render(React.createElement(AcademicClassSchedule, { key: ++seq, tenantId: 'tenant-a', token: 'token-a', classId: 'class-a', timezone: 'Asia/Ho_Chi_Minh', allowed: ['SC03', 'SC05', 'AT02'], navigate: path => navigation.push(path) })); await new Promise(resolve => setTimeout(resolve, 35)) })
  assert.equal(document.querySelectorAll('tbody tr').length, 1)
  assert.match(document.body.textContent, /Mai Phương/)
  assert.doesNotMatch(document.body.textContent, /Other teacher/)
  await click(find('Tạo buổi cho lớp'))
  assert.equal(navigation.at(-1), '/app/tenant-a/schedule/create?classId=class-a')
  await click(find('Bảng điểm danh'))
  assert.equal(navigation.at(-1), '/app/tenant-a/sessions/session-one/attendance')
})

test('AC08 enrollment uses API names and scoped placement, sends UUID only in business payload', async () => {
  const writes = []
  reply = (url, options) => {
    if (options.method === 'POST') { writes.push(options); return Response.json({ id: 'enrollment-new', status: 'ACTIVE' }) }
    if (url.includes('/permissions/')) return Response.json({ ...caps, enroll: true, tenantTimezone: 'UTC' })
    if (url.includes('/placement-context')) return Response.json({ targetSubjectId: 'subject-a', targetLevelId: 'level-a', publishedAssessments: [] })
    return Response.json(page([{ id: 'student-one', code: 'HS01', name: 'Trần Bảo Ngọc', status: 'ACTIVE' }]))
  }
  await act(async () => { root.render(React.createElement(AcademicAdmission, { key: ++seq, tenantId: 'tenant-a', token: 'token-a', classId: 'class-a', enrollments: [], onChanged() {} })); await new Promise(resolve => setTimeout(resolve, 35)) })
  assert.match(document.body.textContent, /Trần Bảo Ngọc/)
  assert.doesNotMatch(document.body.textContent, /Mã định danh/)
  async function enter(selector, value, type = 'input') {
    await act(async () => { const element = document.querySelector(selector); const proto = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new dom.window.Event(type, { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 20)) })
  }
  // Select explicitly by its API option rather than depending on presentation order.
  const studentSelect = [...document.querySelectorAll('select')].find(s => s.querySelector('option[value="student-one"]'))
  await act(async () => { studentSelect.value = 'student-one'; studentSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true })); await new Promise(resolve => setTimeout(resolve, 25)) })
  await enter('input[type="datetime-local"]', new Date(Date.now() + 86400000).toISOString().slice(0, 16))
  await enter('textarea', 'Xác nhận đầu vào phù hợp')
  await act(async () => document.querySelector('input[type="checkbox"]').click())
  await click(find('Xác nhận ghi danh'))
  assert.equal(writes.length, 1)
  const body = JSON.parse(writes[0].body)
  assert.equal(body.classId, 'class-a')
  assert.equal(body.studentId, 'student-one')
  assert.equal(body.placement.subjectId, 'subject-a')
  assert.equal(body.confirmed, true)
  assert.ok(writes[0].headers['Idempotency-Key'])
})

test('AC05 keeps tab data independent, level order only, and sends exact catalog update body', async () => {
  calls.length = 0
  reply = (url, options) => {
    if (url.includes('/permissions/')) return Response.json({ ...caps, catalogManage: true })
    if (options.method === 'PATCH') return Response.json({ id: 'level-a' })
    if (url.includes('/levels')) return Response.json(page([{ id: 'level-a', code: 'B2', name: 'B2', sortOrder: 2, active: false }]))
    return Response.json(page([{ id: 'subject-a', code: 'ENG', name: 'English', active: true }], 41))
  }
  await mount('AC05')
  assert.match(dom.window.document.body.textContent, /English/)
  assert.doesNotMatch(dom.window.document.querySelector('table').textContent, /Thứ tự/)
  await click(find('Sau'))
  assert.ok(calls.some(call => call.url.includes('/subjects?page=2')))
  await click(dom.window.document.querySelector('[data-catalog-tab="levels"]'))
  assert.ok(calls.some(call => call.url.includes('/levels?page=1')))
  assert.match(dom.window.document.querySelector('table').textContent, /Thứ tự/)
  assert.match(dom.window.document.body.textContent, /Đã ẩn/)
  await click(find('Chỉnh sửa'))
  assert.equal(dom.window.document.querySelector('[role="dialog"] input[type="text"]').value, 'B2')
  const draft = newEditor('level', { id: 'level-a', name: 'B2', sortOrder: 2, active: false })
  draft.values.reason = 'Cập nhật danh mục'
  assert.equal(editorError(draft), null)
  assert.deepEqual(editorBody(draft), { name: 'B2', reason: 'Cập nhật danh mục', sortOrder: 2, active: false })
})

test('AC06 keeps course history from DTO and treats a 100-row choice page as partial', async () => {
  const old = { id: 'course-a', code: 'OLD', name: 'Historical course', status: 'INACTIVE', subjectId: 's-old', subjectName: 'Retired subject', levelId: 'l-old', levelName: 'Retired level', description: null }
  const option = { id: 's-new', code: 'NEW', name: 'New subject', active: true }
  assert.equal(completeChoices(pageOf(Array.from({ length: 100 }, () => option), 1, 100, 101)), false)
  const html = renderToStaticMarkup(React.createElement(AcademicCatalogView, { model: courseModel(page([old]), '', false, true, false, pageOf([option], 1, 100, 101), pageOf([])) }))
  assert.match(html, /Retired subject/)
  assert.match(html, /Retired level/)
  assert.match(html, /chưa tải đủ/)
  assert.doesNotMatch(html, /Chỉnh sửa<\/button>/)
  const draft = newEditor('course')
  draft.values = { ...draft.values, code: 'NEW', name: 'New course', reason: 'Tạo khóa', subjectId: '', levelId: 'l-new' }
  assert.match(editorError(draft), /Chọn môn học/)
})

test('AC07 keeps class list when optional courses 403 and displays server count/capacity', async () => {
  calls.length = 0
  reply = url => url.includes('/permissions/') ? Response.json({ ...caps, classCreate: true })
    : url.includes('/courses') ? Response.json({ code: 'FORBIDDEN' }, { status: 403 })
      : Response.json(page([{ id: 'class-a', code: 'CL-01', name: 'Class A', status: 'PLANNED', courseId: 'course-a', courseName: 'Course A', capacity: 18, enrollmentCount: 18 }], 41))
  await mount('AC07')
  assert.match(dom.window.document.body.textContent, /18 \/ 18/)
  assert.match(dom.window.document.body.textContent, /chưa đủ hoặc không được cấp/)
  assert.ok(dom.window.document.querySelector('table'))
  await click(find('Sau'))
  assert.ok(calls.some(call => call.url.includes('/classes?page=2')))
  const row = { id: 'class-a', code: 'CL-01', name: 'Class A', status: 'COMPLETED', courseId: 'course-a', courseName: 'Course A', capacity: 18, enrollmentCount: 0 }
  const html = renderToStaticMarkup(React.createElement(AcademicCatalogView, { model: classesModel(page([row]), '', false, false, false, false) }))
  assert.match(html, /0 \/ 18/)
  assert.match(html, /Đã hoàn tất/)
})

test('AC08 distinguishes omitted arrays from empty arrays and keeps history ranges', () => {
  const base = { id: 'class-a', code: 'CL-01', name: 'Class A', status: 'ACTIVE', capacity: 20, courseId: 'course-a', courseName: 'Course A', subjectId: 'subject-a', levelId: 'level-a', startDate: null, endDate: null }
  const hidden = renderToStaticMarkup(React.createElement(AcademicCatalogView, { model: classModel(base, false, false, false) }))
  assert.match(hidden, /Chưa được cấp dữ liệu ghi danh/)
  assert.match(hidden, /Chưa được cấp dữ liệu phân công/)
  assert.doesNotMatch(hidden, /Chưa có ghi danh/)
  assert.match(hidden, /Chưa có lịch buổi học/)
  const empty = renderToStaticMarkup(React.createElement(AcademicCatalogView, { model: classModel({ ...base, enrollments: [], teacherAssignments: [] }, false, false, false) }))
  assert.match(empty, /Chưa có ghi danh/)
  assert.match(empty, /Chưa có phân công/)
  const history = renderToStaticMarkup(React.createElement(AcademicCatalogView, { model: classModel({ ...base, enrollments: [{ id: 'e-1', studentCode: 'HS-01', studentName: 'Lan', status: 'PENDING', effectiveFrom: '2026-11-01', effectiveTo: null, priorEnrollmentId: 'e-0' }], teacherAssignments: [{ id: 'a-1', teacherName: 'Mai', validFrom: '2026-09-01', validTo: '2026-10-01' }] }, false, false, false) }))
  assert.match(history, /Chờ xử lý/)
  assert.match(history, /e-0/)
  assert.match(history, /01\/11\/2026/)
  assert.match(history, /01\/10\/2026/)
  assert.doesNotMatch(history, /Buổi tiếp theo/)
  const zone = renderToStaticMarkup(React.createElement(AcademicCatalogView, { model: classModel({ ...base, enrollments: [{ id: 'e-z', studentName: 'Lan', status: 'ACTIVE', effectiveFrom: '2026-10-31T18:30:00Z', effectiveTo: null }], teacherAssignments: [] }, false, false, false, 'Asia/Ho_Chi_Minh') }))
  assert.match(zone, /01\/11\/2026/)
  assert.match(zone, /01:30/)
})

test('AC05 production keeps duplicate conflict in editor and reloads only after server acknowledgement', async () => {
  let conflict = true
  calls.length = 0
  reply = (url, options) => {
    if (url.includes('/permissions/')) return Response.json({ ...caps, catalogManage: true })
    if (options.method === 'POST') return conflict ? Response.json({ code: 'DUPLICATE_CODE' }, { status: 409 }) : Response.json({ id: 'subject-new' })
    return Response.json(page([{ id: 'subject-a', code: 'ENG', name: 'English', active: true }]))
  }
  await mount('AC05')
  await click(find('Thêm danh mục'))
  const dialog = dom.window.document.querySelector('[role="dialog"]')
  const inputs = dialog.querySelectorAll('input')
  async function enter(element, value) {
    await act(async () => { const set = Object.getOwnPropertyDescriptor(element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype, 'value').set; set.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
  }
  await enter(inputs[0], 'ENG')
  await enter(inputs[1], 'New English')
  await enter(dialog.querySelector('textarea'), 'Kiểm tra trùng mã')
  await click(find('Lưu'))
  assert.ok(dom.window.document.querySelector('[role="dialog"]'))
  assert.doesNotMatch(dom.window.document.body.textContent, /Đã lưu theo xác nhận/)
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1)
  assert.deepEqual(JSON.parse(calls.find(call => call.options.method === 'POST').options.body), { code: 'ENG', name: 'New English', reason: 'Kiểm tra trùng mã' })
  conflict = false
  await click(find('Lưu'))
  assert.equal(dom.window.document.querySelector('[role="dialog"]'), null)
  assert.match(dom.window.document.body.textContent, /Đã lưu theo xác nhận/)
})

test('AC08 production 403 and missing class ID render terminal states without stale class detail', async () => {
  reply = url => url.includes('/permissions/') ? Response.json(caps) : Response.json({ id: 'class-a', code: 'CL-01', name: 'Secret Class', status: 'ACTIVE', capacity: 20, courseId: 'course-a', courseName: 'Course A', subjectId: 's', levelId: 'l', startDate: null, endDate: null, enrollments: [], teacherAssignments: [] })
  await mount('AC08', { selectedId: 'class-a' })
  assert.match(dom.window.document.body.textContent, /Secret Class/)
  reply = () => Response.json({ code: 'FORBIDDEN' }, { status: 403 })
  await mount('AC08', { selectedId: 'class-b' })
  assert.doesNotMatch(dom.window.document.body.textContent, /Secret Class/)
  assert.match(dom.window.document.body.textContent, /Không có quyền/)
  assert.equal(find('Thử lại'), undefined)
  await mount('AC08', { selectedId: undefined })
  assert.match(dom.window.document.body.textContent, /Không tìm thấy/)
})
