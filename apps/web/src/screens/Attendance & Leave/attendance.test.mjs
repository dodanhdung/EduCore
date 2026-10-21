import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
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
const { AttendanceSessionListScreen } = await vite.ssrLoadModule('/src/screens/Attendance & Leave/AT01/AttendanceSessionListScreen.tsx')
const { AttendanceSheetScreen } = await vite.ssrLoadModule('/src/screens/Attendance & Leave/AT02/AttendanceSheetScreen.tsx')
const { LeaveRequestFormScreen } = await vite.ssrLoadModule('/src/screens/Attendance & Leave/AT03/LeaveRequestFormScreen.tsx')
const { LeaveRequestListScreen } = await vite.ssrLoadModule('/src/screens/Attendance & Leave/AT04/LeaveRequestListScreen.tsx')
const { attendanceFixtures } = await vite.ssrLoadModule('/src/ui-preview/attendanceFixtures.ts')
const { schedulingFixtures } = await vite.ssrLoadModule('/src/ui-preview/schedulingFixtures.ts')
const { academicFixtures } = await vite.ssrLoadModule('/src/ui-preview/academicFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

function mount(Component, props, url = 'http://localhost/') {
  const dom = new JSDOM('<div id="root"></div>', { url })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return { dom, document: dom.window.document, render: async () => act(async () => root.render(React.createElement(Component, props))), close: async () => { await act(async () => root.unmount()); dom.window.close() } }
}
async function click(view, element) { assert.ok(element); await act(async () => element.click()) }
async function change(view, element, value) {
  assert.ok(element)
  await act(async () => { const proto = element.tagName === 'SELECT' ? view.dom.window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? view.dom.window.HTMLTextAreaElement.prototype : view.dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new view.dom.window.Event('input', { bubbles: true })); element.dispatchEvent(new view.dom.window.Event('change', { bubbles: true })) })
}

test('routes keep AT05 embedded and tenant guard intact', () => {
  assert.equal(matchRoute('/app/t/attendance')?.route.id, 'AT01')
  assert.equal(matchRoute('/app/t/sessions/session-eng-26/attendance')?.params.sessionId, 'session-eng-26')
  assert.equal(matchRoute('/app/t/leave-requests/new')?.route.id, 'AT03')
  assert.equal(matchRoute('/app/t/leave-requests')?.route.id, 'AT04')
  assert.equal(routes.some((item) => item.id === 'AT05'), false)
  const state = { status: 'authenticated', session: { expiresAt: Date.now() + 60000, principal: { tenantId: 't', allowedTenants: [{ id: 't', name: 'Mẫu' }] } } }
  assert.equal(resolveRoute('/app/t/attendance', state).kind, 'forbidden')
})

test('AT01 tabs, empty state, and non-first session preserve ID', async () => {
  let id = ''; const view = mount(AttendanceSessionListScreen, { data: attendanceFixtures, preview: true, onOpenSession: (value) => { id = value } })
  try { await view.render(); assert.ok(view.document.querySelectorAll('tbody tr').length >= 1); await click(view, [...view.document.querySelectorAll('[role="tab"]')][2]); assert.match(view.document.body.textContent, /Quá hạn/); await click(view, view.document.querySelector('tbody button')); assert.equal(id, 'session-eng-19'); await change(view, view.document.querySelector('.attendance-search input'), 'không tồn tại'); assert.match(view.document.body.textContent, /Không có kết quả phù hợp/) } finally { await view.close() }
  const empty = mount(AttendanceSessionListScreen, { data: { ...attendanceFixtures, sessions: [] }, preview: true })
  try { await empty.render(); assert.match(empty.document.body.textContent, /Không có buổi được phân công/) } finally { await empty.close() }
})

test('AT02 rejects unknown ID instead of falling back and shows selected roster', async () => {
  const invalid = mount(AttendanceSheetScreen, { data: attendanceFixtures, sessionId: 'invalid', preview: true })
  try { await invalid.render(); assert.match(invalid.document.body.textContent, /Không tìm thấy buổi học/); assert.doesNotMatch(invalid.document.body.textContent, /Nguyễn Minh Anh/) } finally { await invalid.close() }
  const selected = mount(AttendanceSheetScreen, { data: attendanceFixtures, sessionId: 'session-jp-23', preview: true })
  try { await selected.render(); assert.match(selected.document.body.textContent, /Phạm Khánh Linh/); assert.doesNotMatch(selected.document.body.textContent, /Trần Bảo Ngọc/) } finally { await selected.close() }
})

test('AT02 local status, approved leave and pending draft do not mutate fixture', async () => {
  const view = mount(AttendanceSheetScreen, { data: attendanceFixtures, sessionId: 'session-eng-26', preview: true, canEdit: true })
  try { await view.render(); const attended = view.document.querySelector('input[value="ATTENDED"]'); await click(view, attended); assert.equal(attended.checked, true); assert.equal(view.document.querySelector('input[value="EXCUSED"]').disabled, false); await click(view, [...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Lưu bản nháp')); assert.match(view.document.body.textContent, /chờ API/); assert.equal(attendanceFixtures.records['session-eng-26'].length, 0) } finally { await view.close() }
  const pending = mount(AttendanceSheetScreen, { data: attendanceFixtures, sessionId: 'session-eng-21', preview: true, canEdit: true })
  try { await pending.render(); assert.equal(pending.document.querySelector('input[value="EXCUSED"]').disabled, true) } finally { await pending.close() }
})

test('AT02 confirmation requires a complete roster and remains pending API', async () => {
  const view = mount(AttendanceSheetScreen, { data: attendanceFixtures, sessionId: 'session-eng-26', preview: true, canEdit: true })
  try { await view.render(); await click(view, [...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Xác nhận điểm danh')); assert.match(view.document.body.textContent, /Vui lòng chọn kết quả cho tất cả học sinh/); assert.equal(view.document.querySelector('[role="dialog"]'), null); await click(view, view.document.querySelector('input[value="ATTENDED"]')); await click(view, [...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Xác nhận điểm danh')); assert.match(view.document.querySelector('[role="dialog"]').textContent, /Chờ kết nối API/); assert.equal(attendanceFixtures.sessions.find((item) => item.id === 'session-eng-26').phase, 'DRAFT') } finally { await view.close() }
})

test('AT02 finalized and locked records are read only; correction is embedded', async () => {
  for (const sessionId of ['session-eng-19', 'session-ielts-20']) { const data = sessionId === 'session-eng-19' ? { ...attendanceFixtures, sessions: attendanceFixtures.sessions.map((item) => item.id === sessionId ? { ...item, phase: 'FINALIZED' } : item) } : attendanceFixtures; const view = mount(AttendanceSheetScreen, { data, sessionId, preview: true, canEdit: true, initialCorrection: sessionId === 'session-ielts-20' }); try { await view.render(); assert.equal(view.document.querySelector('input[value="ATTENDED"]').disabled, true); if (sessionId === 'session-ielts-20') { const dialog = view.document.querySelector('[role="dialog"]'); assert.ok(dialog); assert.match(dialog.textContent, /Trạng thái gốc/); assert.match(dialog.textContent, /Đề xuất trạng thái mới/); assert.match(dialog.textContent, /chưa tính hoặc ghi nhận điều chỉnh tài chính/); assert.equal(attendanceFixtures.corrections.length, 2) } } finally { await view.close() } }
})

test('AT05 validates a changed status and reason without creating correction', async () => {
  const view = mount(AttendanceSheetScreen, { data: attendanceFixtures, sessionId: 'session-ielts-20', preview: true, initialCorrection: true })
  try { await view.render(); const dialog = view.document.querySelector('[role="dialog"]'); await click(view, [...dialog.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại đề nghị')); assert.match(dialog.textContent, /Chọn trạng thái mới khác trạng thái gốc/); await change(view, dialog.querySelector('select'), 'ATTENDED'); await click(view, [...dialog.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại đề nghị')); assert.match(dialog.textContent, /Vui lòng nhập lý do/); await change(view, dialog.querySelector('textarea'), 'Có chứng cứ dự học'); await click(view, [...dialog.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại đề nghị')); assert.match(dialog.textContent, /Vắng không phép → Có mặt/); assert.match(dialog.textContent, /chưa có correction/); assert.equal(attendanceFixtures.corrections.length, 2) } finally { await view.close() }
})

test('AT03 validates required fields and distinguishes late timing without approval', async () => {
  const view = mount(LeaveRequestFormScreen, { data: attendanceFixtures, role: 'parent', preview: true })
  try { await view.render(); await click(view, [...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại đơn')); assert.match(view.document.body.textContent, /Vui lòng chọn học sinh/); await change(view, view.document.querySelector('select'), 'HS-1031'); const options = [...view.document.querySelectorAll('select')][1].options; assert.equal([...options].some((item) => item.value === 'session-eng-26'), true); await change(view, [...view.document.querySelectorAll('select')][1], 'session-eng-26'); assert.match(view.document.body.textContent, /Trong hạn thông thường/); assert.doesNotMatch(view.document.body.textContent, /Đơn nộp muộn · cần xử lý ngoại lệ/); assert.equal(attendanceFixtures.leaveRequests.find((item) => item.id === 'leave-01').status, 'APPROVED') } finally { await view.close() }
})

test('AT03 late form shows exception warning, duplicate form blocks a second request', async () => {
  const data = { ...attendanceFixtures, sampleNow: '2026-10-26T10:00:00+07:00', leaveRequests: attendanceFixtures.leaveRequests.filter((item) => item.id !== 'leave-01') }
  const late = mount(LeaveRequestFormScreen, { data, role: 'student', preview: true })
  try { await late.render(); await change(late, late.document.querySelector('select'), 'session-eng-26'); assert.match(late.document.body.textContent, /Đơn nộp muộn · cần xử lý ngoại lệ/); assert.doesNotMatch(late.document.body.textContent, /tự được duyệt/) } finally { await late.close() }
  const duplicate = mount(LeaveRequestFormScreen, { data: attendanceFixtures, role: 'student', preview: true })
  try { await duplicate.render(); await change(duplicate, duplicate.document.querySelector('select'), 'session-eng-26'); assert.match(duplicate.document.body.textContent, /Đơn trùng còn hiệu lực/); assert.equal([...duplicate.document.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại đơn').disabled, true) } finally { await duplicate.close() }
})

test('AT03 parent selector includes only explicitly linked child', async () => {
  const view = mount(LeaveRequestFormScreen, { data: attendanceFixtures, role: 'parent', preview: true })
  try { await view.render(); const options = [...view.document.querySelector('select').options].map((item) => item.value); assert.deepEqual(options, ['', 'HS-1031']); assert.equal(options.includes('HS-1028'), false) } finally { await view.close() }
})

test('AT04 parent has no review controls and staff decision keeps fixture unchanged', async () => {
  const parent = mount(LeaveRequestListScreen, { data: attendanceFixtures, role: 'parent', preview: true, canReview: true })
  try { await parent.render(); assert.equal(parent.document.body.textContent.includes('Duyệt đơn'), false); assert.ok(parent.document.querySelectorAll('.attendance-request').length > 0) } finally { await parent.close() }
  const staff = mount(LeaveRequestListScreen, { data: attendanceFixtures, role: 'staff', preview: true, canReview: true })
  try { await staff.render(); const pending = [...staff.document.querySelectorAll('.attendance-request')].find((item) => item.textContent.includes('Chờ duyệt')); await click(staff, pending.querySelector('button')); assert.match(staff.document.body.textContent, /Cần quyền duyệt ngoại lệ/); assert.equal(staff.document.querySelector('button[disabled]').textContent, 'Duyệt ngoại lệ'); assert.equal(attendanceFixtures.leaveRequests.find((item) => item.id === 'leave-02').status, 'PENDING') } finally { await staff.close() }
})

test('AT04 nonlate decision dialog validates reason but never updates status', async () => {
  const staff = mount(LeaveRequestListScreen, { data: attendanceFixtures, role: 'staff', preview: true, canReview: true })
  try { await staff.render(); const row = [...staff.document.querySelectorAll('.attendance-request')].find((item) => item.textContent.includes('Nguyễn Minh Anh') && item.textContent.includes('Chờ duyệt')); assert.ok(row); await click(staff, row.querySelector('button')); await click(staff, [...staff.document.querySelectorAll('button')].find((item) => item.textContent === 'Duyệt đơn')); const dialog = staff.document.querySelector('[role="dialog"]'); assert.ok(dialog); await click(staff, [...dialog.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại quyết định')); assert.match(dialog.textContent, /Vui lòng nhập lý do/); assert.equal(attendanceFixtures.leaveRequests.find((item) => item.id === 'leave-05').status, 'PENDING') } finally { await staff.close() }
})

test('AT04 status tabs preserve approved, rejected and needs-info records', async () => {
  const view = mount(LeaveRequestListScreen, { data: attendanceFixtures, role: 'staff', preview: true, canReview: true })
  try { await view.render(); for (const [index, label] of [[2, 'Đã duyệt'], [3, 'Bị từ chối'], [4, 'Cần bổ sung']]) { await click(view, [...view.document.querySelectorAll('[role="tab"]')][index]); assert.ok(view.document.querySelectorAll('.attendance-request').length > 0); assert.match(view.document.querySelector('.attendance-request').textContent, new RegExp(label)) } } finally { await view.close() }
})

test('Preview AT05 opens real host and fixture IDs stay consistent', async () => {
  const view = mount(PreviewApp, { screenId: 'AT05' }, 'http://localhost/__ui-preview/AT05')
  try { await view.render(); assert.match(view.document.body.textContent, /Dữ liệu mẫu — UI Preview/); assert.match(view.document.body.textContent, /Điểm danh IELTS-03/); assert.ok(view.document.querySelector('[role="dialog"]')) } finally { await view.close() }
  for (const session of attendanceFixtures.sessions) assert.ok(schedulingFixtures.sessions.some((item) => item.id === session.id && item.classId === session.classId))
  for (const student of attendanceFixtures.students) assert.ok(academicFixtures.students.some((item) => item.id === student.id && item.activeClasses.some((entry) => entry.id === student.classId)))
  for (const [sessionId, studentIds] of Object.entries(attendanceFixtures.rosters)) { const session = attendanceFixtures.sessions.find((item) => item.id === sessionId); assert.ok(session); for (const studentId of studentIds) assert.equal(attendanceFixtures.students.find((item) => item.id === studentId)?.classId, session.classId) }
})

test('AT05 approved preview shows applied history in its locked host', async () => {
  const view = mount(PreviewApp, { screenId: 'AT05' }, 'http://localhost/__ui-preview/AT05?state=approved')
  try { await view.render(); assert.match(view.document.body.textContent, /Điểm danh ENG-B2/); assert.match(view.document.querySelector('[role="dialog"]').textContent, /Đã duyệt/); assert.match(view.document.querySelector('[role="dialog"]').textContent, /Đã quá 48 giờ/) } finally { await view.close() }
})
