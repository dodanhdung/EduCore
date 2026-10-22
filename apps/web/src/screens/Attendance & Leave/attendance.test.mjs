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
const { AttendanceCorrectionSheet } = await vite.ssrLoadModule('/src/screens/Attendance & Leave/AT05/AttendanceCorrectionSheet.tsx')
const { leaveHoursBefore, sessionStartInstant } = await vite.ssrLoadModule('/src/screens/Attendance & Leave/AttendanceLogic.ts')
const { attendanceFixtures } = await vite.ssrLoadModule('/src/ui-preview/attendanceFixtures.ts')
const { schedulingFixtures } = await vite.ssrLoadModule('/src/ui-preview/schedulingFixtures.ts')
const { academicFixtures } = await vite.ssrLoadModule('/src/ui-preview/academicFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

function sessionAt(date, start, id = 'timing-session') {
  return { ...attendanceFixtures.sessions[0], id, date, start, phase: 'DRAFT' }
}

function formData(sessions, sampleNow, overrides = {}) {
  return {
    ...attendanceFixtures,
    sessions,
    sampleNow,
    rosters: Object.fromEntries(sessions.map((session) => [session.id, ['HS-1031']])),
    leaveRequests: [],
    ...overrides,
  }
}

function mount(Component, props, url = 'http://localhost/') {
  const dom = new JSDOM('<div id="root"></div>', { url })
  globalThis.window = dom.window; globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return { dom, document: dom.window.document, render: async () => act(async () => root.render(React.createElement(Component, props))), rerender: async (nextProps) => act(async () => root.render(React.createElement(Component, nextProps))), close: async () => { await act(async () => root.unmount()); dom.window.close() } }
}
async function click(view, element) { assert.ok(element); await act(async () => element.click()) }
async function change(view, element, value) {
  assert.ok(element)
  await act(async () => { const proto = element.tagName === 'SELECT' ? view.dom.window.HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? view.dom.window.HTMLTextAreaElement.prototype : view.dom.window.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(element, value); element.dispatchEvent(new view.dom.window.Event('input', { bubbles: true })); element.dispatchEvent(new view.dom.window.Event('change', { bubbles: true })) })
}

test('AT03 timing uses actual instants at the 24-hour boundary regardless of host timezone', () => {
  const session = sessionAt('2026-10-22', '08:00')
  const submitted = ['2026-10-21T08:00:00+07:00', '2026-10-21T08:01:00+07:00', '2026-10-21T07:59:00+07:00']
  const previousZone = process.env.TZ
  try {
    for (const hostZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = hostZone
      const results = submitted.map((value) => leaveHoursBefore(session, value, 'Asia/Ho_Chi_Minh'))
      assert.deepEqual(results.map((result) => result.kind), ['resolved', 'resolved', 'resolved'])
      assert.deepEqual(results.map((result) => result.hours), [24, 24 - 1 / 60, 24 + 1 / 60])
      assert.deepEqual(sessionStartInstant(session, 'Asia/Ho_Chi_Minh'), { kind: 'resolved', instantMs: Date.parse('2026-10-22T01:00:00Z') })
    }
  } finally {
    if (previousZone === undefined) delete process.env.TZ
    else process.env.TZ = previousZone
  }
})

test('AT03 timing resolves spring and autumn DST using the session offset', () => {
  const spring = leaveHoursBefore(sessionAt('2026-03-08', '03:30'), '2026-03-07T08:30:00Z', 'America/New_York')
  assert.equal(spring.kind, 'resolved')
  assert.equal(spring.instantMs, Date.parse('2026-03-08T07:30:00Z'))
  assert.equal(spring.hours, 23)
  const autumn = leaveHoursBefore(sessionAt('2026-11-01', '02:30'), '2026-10-31T06:30:00Z', 'America/New_York')
  assert.equal(autumn.kind, 'resolved')
  assert.equal(autumn.instantMs, Date.parse('2026-11-01T07:30:00Z'))
  assert.equal(autumn.hours, 25)
  assert.deepEqual(sessionStartInstant(sessionAt('2026-03-08', '02:30'), 'America/New_York'), { kind: 'unresolved', reason: 'nonexistent-local-time' })
  assert.deepEqual(sessionStartInstant(sessionAt('2026-11-01', '01:30'), 'America/New_York'), { kind: 'unresolved', reason: 'ambiguous-local-time' })
})

test('AT03 timing leaves invalid inputs unresolved rather than guessing', () => {
  assert.deepEqual(sessionStartInstant(sessionAt('2026-02-30', '08:00'), 'UTC'), { kind: 'unresolved', reason: 'invalid-local-time' })
  assert.deepEqual(sessionStartInstant(sessionAt('2026-10-22', '24:00'), 'UTC'), { kind: 'unresolved', reason: 'invalid-local-time' })
  assert.deepEqual(sessionStartInstant(sessionAt('2026-10-22', '08:00'), 'Not/A_Zone'), { kind: 'unresolved', reason: 'invalid-time-zone' })
  assert.deepEqual(leaveHoursBefore(sessionAt('2026-10-22', '08:00'), '2026-10-21T08:00:00', 'UTC'), { kind: 'unresolved', reason: 'invalid-submitted-at' })
  assert.equal(sessionStartInstant(sessionAt('2026-10-22', '08:00'), 'America/Los_Angeles').instantMs, Date.parse('2026-10-22T15:00:00Z'))
})

test('AT03 offers only sessions whose tenant-local start is future', async () => {
  const sessions = [sessionAt('2026-10-20', '18:00', 'yesterday'), sessionAt('2026-10-21', '08:00', 'today-past'), sessionAt('2026-10-21', '15:00', 'now'), sessionAt('2026-10-21', '18:00', 'today-future'), sessionAt('2026-10-22', '15:00', 'exact-24')]
  const view = mount(LeaveRequestFormScreen, { data: formData(sessions, '2026-10-21T15:00:00+07:00'), role: 'student' })
  try {
    await view.render()
    const select = view.document.querySelector('select')
    assert.deepEqual([...select.options].map((option) => option.value), ['', 'today-future', 'exact-24'])
    await change(view, select, 'today-future')
    assert.match(view.document.body.textContent, /Đơn nộp muộn/)
    await change(view, select, 'exact-24')
    assert.match(view.document.body.textContent, /Trong hạn thông thường/)
    assert.doesNotMatch(view.document.body.textContent, /Đơn nộp muộn/)
  } finally { await view.close() }
})

test('AT03 clears stale selection and review when time passes start, retaining reason', async () => {
  const session = sessionAt('2026-10-21', '18:00', 'future')
  const data = formData([session], '2026-10-21T15:00:00+07:00')
  const view = mount(LeaveRequestFormScreen, { data, role: 'student' })
  try {
    await view.render()
    await change(view, view.document.querySelector('select'), 'future')
    await change(view, view.document.querySelector('textarea'), 'Lý do vẫn cần giữ')
    await click(view, [...view.document.querySelectorAll('button')].find((item) => item.textContent === 'Xem lại đơn'))
    assert.match(view.document.body.textContent, /Xem lại trước khi gửi/)
    await view.rerender({ data: { ...data, sampleNow: '2026-10-21T18:00:00+07:00' }, role: 'student' })
    assert.equal(view.document.querySelector('select').value, '')
    assert.equal(view.document.querySelector('textarea').value, 'Lý do vẫn cần giữ')
    assert.doesNotMatch(view.document.body.textContent, /Xem lại trước khi gửi/)
    assert.match(view.document.body.textContent, /Không có buổi sắp tới/)
  } finally { await view.close() }
})

test('AT03 parent switch recalculates sessions and ambiguous time stays unavailable', async () => {
  const sessions = [sessionAt('2026-11-01', '01:30', 'ambiguous'), sessionAt('2026-11-01', '02:30', 'valid')]
  const data = formData(sessions, '2026-10-31T06:30:00Z', {
    timeZone: 'America/New_York', linkedChildIds: ['HS-1031', 'HS-1042'],
    rosters: { ambiguous: ['HS-1031'], valid: ['HS-1042'] },
  })
  const view = mount(LeaveRequestFormScreen, { data, role: 'parent' })
  try {
    await view.render()
    const [studentSelect, sessionSelect] = view.document.querySelectorAll('select')
    await change(view, studentSelect, 'HS-1031')
    assert.deepEqual([...sessionSelect.options].map((option) => option.value), [''])
    assert.match(view.document.body.textContent, /Chưa xác định thời gian buổi/)
    await change(view, view.document.querySelectorAll('select')[0], 'HS-1042')
    assert.deepEqual([...view.document.querySelectorAll('select')[1].options].map((option) => option.value), ['', 'valid'])
    assert.doesNotMatch(view.document.body.textContent, /Chưa xác định thời gian buổi/)
  } finally { await view.close() }
})

test('AT03 đổi con và người xem trên cùng React root xóa toàn bộ đơn nháp', async () => {
  const data = formData([sessionAt('2026-10-22', '15:00', 'shared')], '2026-10-21T08:00:00+07:00', {
    linkedChildIds: ['HS-1031', 'HS-1042'], rosters: { shared: ['HS-1031', 'HS-1042'] },
  })
  const props = { data, role: 'parent', viewerId: 'parent-a', tenantId: 'tenant-a' }
  const view = mount(LeaveRequestFormScreen, props)
  const button = (label) => [...view.document.querySelectorAll('button')].find((item) => item.textContent === label)
  try {
    await view.render()
    await change(view, view.document.querySelectorAll('select')[0], 'HS-1031')
    await change(view, view.document.querySelectorAll('select')[1], 'shared')
    await change(view, view.document.querySelector('textarea'), 'Lý do riêng của con A')
    await click(view, button('Xem lại đơn'))
    await click(view, button('Gửi đơn xin nghỉ'))
    assert.match(view.document.body.textContent, /Gửi đơn đang chờ API/)
    await change(view, view.document.querySelectorAll('select')[0], 'HS-1042')
    assert.equal(view.document.querySelectorAll('select')[0].value, 'HS-1042')
    assert.equal(view.document.querySelectorAll('select')[1].value, '')
    assert.equal(view.document.querySelector('textarea').value, '')
    assert.doesNotMatch(view.document.body.textContent, /Lý do riêng của con A|Xem lại trước khi gửi|Gửi đơn đang chờ API/)
    await click(view, button('Xem lại đơn'))
    assert.match(view.document.body.textContent, /Vui lòng chọn học sinh và buổi học hợp lệ/)
    await view.rerender({ ...props, viewerId: 'parent-b', initialStudentId: 'HS-1042' })
    assert.equal(view.document.querySelector('textarea').value, '')
    assert.equal(view.document.querySelectorAll('select')[1].value, '')
    assert.doesNotMatch(view.document.body.textContent, /Vui lòng chọn học sinh và buổi học hợp lệ|Xem lại trước khi gửi|Gửi đơn đang chờ API/)
  } finally { await view.close() }
})

test('AT05 history label follows preview and empty history is neutral', async () => {
  const session = attendanceFixtures.sessions.find((item) => item.id === 'session-ielts-20')
  const data = { ...attendanceFixtures, corrections: attendanceFixtures.corrections.map((item) => ({ ...item })) }
  const props = { data, session, studentId: 'HS-1028', onClose: () => {} }
  const production = mount(AttendanceCorrectionSheet, props)
  try {
    await production.render()
    const history = production.document.querySelector('.attendance-history')
    assert.equal(history.querySelector('h3').textContent, 'Lịch sử điều chỉnh')
    assert.equal(history.querySelectorAll('li').length, 1)
    assert.doesNotMatch(history.textContent, /Dữ liệu mẫu/)
  } finally { await production.close() }
  const preview = mount(AttendanceCorrectionSheet, { ...props, preview: true })
  try {
    await preview.render()
    assert.equal(preview.document.querySelector('.attendance-history h3').textContent, 'Lịch sử điều chỉnh · Dữ liệu mẫu')
  } finally { await preview.close() }
  const empty = mount(AttendanceCorrectionSheet, { ...props, data: { ...data, corrections: [] } })
  try {
    await empty.render()
    const dialog = empty.document.querySelector('[role="dialog"]')
    assert.match(dialog.textContent, /Chưa có lịch sử điều chỉnh/)
    assert.equal(dialog.querySelector('.attendance-history'), null)
    assert.doesNotMatch(dialog.textContent, /Dữ liệu mẫu/)
    assert.equal(data.corrections.length, 2)
  } finally { await empty.close() }
})

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
