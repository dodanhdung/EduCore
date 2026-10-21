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
const { CentralScheduleScreen } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SC01/CentralScheduleScreen.tsx')
const { ResourcesScreen } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SC02/ResourcesScreen.tsx')
const { CreateScheduleScreen } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SC03/CreateScheduleScreen.tsx')
const { SessionDetailScreen } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SC05/SessionDetailScreen.tsx')
const { PersonalScheduleScreen } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SC06/PersonalScheduleScreen.tsx')
const { validateDraft, candidateDates, sixMonthLimit } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SchedulingLogic.ts')
const { tenantLocalDate, formatInstant } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SchedulingDates.ts')
const { schedulingFixtures, schedulingConflictFixtures, personalScheduleScopes, schedulingPreviewClock } = await vite.ssrLoadModule('/src/ui-preview/schedulingFixtures.ts')
const { PreviewApp } = await vite.ssrLoadModule('/src/ui-preview/PreviewApp.tsx')

function mount(Component, props, url = 'http://localhost/') {
  const dom = new JSDOM('<div id="root"></div>', { url })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  const root = createRoot(dom.window.document.getElementById('root'))
  return {
    dom,
    document: dom.window.document,
    render: async () => act(async () => root.render(React.createElement(Component, props))),
    close: async () => { await act(async () => root.unmount()); dom.window.close() },
  }
}
async function click(view, selector) { const button = view.document.querySelector(selector); assert.ok(button, selector); await act(async () => button.click()) }
async function change(view, selector, value) {
  const input = view.document.querySelector(selector)
  assert.ok(input, selector)
  await act(async () => {
    const proto = input.tagName === 'SELECT' ? view.dom.window.HTMLSelectElement.prototype : view.dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value)
    input.dispatchEvent(new view.dom.window.Event('change', { bubbles: true }))
    input.dispatchEvent(new view.dom.window.Event('input', { bubbles: true }))
  })
}

test('canonical routes remain tenant guarded and SC04 has no business route', () => {
  assert.equal(matchRoute('/app/tenant-a/schedule')?.route.id, 'SC01')
  assert.equal(matchRoute('/app/tenant-a/resources')?.route.id, 'SC02')
  assert.equal(matchRoute('/app/tenant-a/schedule/sessions/session-eng-19')?.params.sessionId, 'session-eng-19')
  assert.equal(routes.some((route) => route.id === 'SC04'), false)
  const state = { status: 'authenticated', session: { expiresAt: Date.now() + 60000, principal: { tenantId: 'tenant-a', allowedTenants: [{ id: 'tenant-a', name: 'Mẫu' }] } } }
  assert.equal(resolveRoute('/app/tenant-a/schedule', state).kind, 'forbidden')
  assert.equal(resolveRoute('/app/tenant-b/resources', state, { tenantId: 'tenant-b', screenIds: ['SC02'] }).kind, 'forbidden')
})

test('SC01 changes calendar modes, periods and today; a non-first event opens its own details', async () => {
  const view = mount(CentralScheduleScreen, { data: schedulingFixtures, preview: true, ...schedulingPreviewClock })
  try {
    await view.render()
    assert.match(view.document.body.textContent, /19\/10–25\/10/)
    await click(view, '[role="tab"][aria-selected="false"]:nth-child(2)')
    assert.match(view.document.querySelector('.scheduling-card:nth-of-type(2) h2').textContent, /Lịch ngày/)
    await click(view, '[aria-label="Kỳ sau"]')
    assert.match(view.document.querySelector('.scheduling-period').textContent, /22\/10\/2026/)
    await click(view, '[aria-label="Kỳ trước"]')
    await click(view, '[role="tab"]:nth-child(3)')
    assert.ok(view.document.querySelector('.scheduling-month-grid'))
    await click(view, '[aria-label="Kỳ sau"]')
    assert.match(view.document.querySelector('.scheduling-period').textContent, /Tháng 11\/2026/)
    await click(view, '.scheduling-toolbar > button:last-child')
    await click(view, '[role="tab"]:nth-child(1)')
    const event = [...view.document.querySelectorAll('.scheduling-event')].find((node) => node.textContent.includes('IELTS-03'))
    assert.ok(event)
    await act(async () => event.click())
    assert.match(view.document.querySelector('[role="dialog"]').textContent, /Mai Phương · Phòng P.302/)
    assert.doesNotMatch(view.document.querySelector('[role="dialog"]').textContent, /Đã lưu thành công/)
  } finally { await view.close() }
})

test('SC01 filters and empty period preserve clear status', async () => {
  const view = mount(CentralScheduleScreen, { data: schedulingFixtures, preview: true, ...schedulingPreviewClock })
  try {
    await view.render()
    await change(view, '.scheduling-filters label:nth-child(1) select', 'ENG-B2')
    assert.equal(view.document.querySelectorAll('.scheduling-event').length, 2)
    await change(view, '.scheduling-filters label:nth-child(2) select', 'GV-023')
    assert.match(view.document.body.textContent, /Không có buổi học/)
    await change(view, '.scheduling-filters label:nth-child(2) select', '')
    await change(view, '.scheduling-filters label:nth-child(3) select', 'P.302')
    assert.match(view.document.body.textContent, /Không có buổi học/)
    await change(view, '.scheduling-filters label:nth-child(1) select', '')
    await change(view, '.scheduling-filters label:nth-child(3) select', '')
    await click(view, '[aria-label="Kỳ sau"]')
    await click(view, '[aria-label="Kỳ sau"]')
    assert.match(view.document.body.textContent, /Không có buổi học/)
  } finally { await view.close() }
})

test('SC02 tabs, non-first room and invalid explicit room ID do not fall back', async () => {
  const invalid = mount(ResourcesScreen, { data: schedulingFixtures, preview: true, initialRoomId: 'unknown-room' })
  try { await invalid.render(); assert.match(invalid.document.body.textContent, /Chọn “Xem lịch”/); assert.doesNotMatch(invalid.document.querySelector('.scheduling-detail-grid').textContent, /Sức chứa 20/) } finally { await invalid.close() }
  const view = mount(ResourcesScreen, { data: schedulingFixtures, preview: true })
  try {
    await view.render()
    await click(view, '.scheduling-table tbody tr:nth-child(2) button')
    assert.match(view.document.querySelector('.scheduling-detail-grid').textContent, /Phòng IELTS · P.302/)
    await click(view, '[role="tab"]:nth-child(2)')
    assert.match(view.document.querySelector('.scheduling-table').textContent, /Bảo trì thiết bị/)
    await click(view, '.scheduling-table tbody tr:nth-child(2) button')
    assert.match(view.document.querySelector('[role="dialog"]').textContent, /Đặng Văn Trần/)
  } finally { await view.close() }
})

test('SC02 validates capacity and time range without claiming a save', async () => {
  const view = mount(ResourcesScreen, { data: schedulingFixtures, preview: true })
  try {
    await view.render()
    await click(view, '.scheduling-heading button')
    await click(view, '.scheduling-form-actions button:last-child')
    assert.match(view.document.querySelector('[role="alert"]').textContent, /mã và tên phòng/)
    await change(view, '.scheduling-form label:nth-child(1) input', 'P.999')
    await change(view, '.scheduling-form label:nth-child(2) input', 'Phòng mẫu')
    await change(view, '.scheduling-form label:nth-child(3) input', '0')
    await click(view, '.scheduling-form-actions button:last-child')
    assert.match(view.document.querySelector('[role="alert"]').textContent, /Sức chứa/)
    await change(view, '.scheduling-form label:nth-child(3) input', '15')
    await click(view, '.scheduling-form-actions button:last-child')
    assert.match(view.document.querySelector('[role="status"]').textContent, /chờ kết nối API/)
    assert.doesNotMatch(view.document.body.textContent, /đã lưu thành công/i)
  } finally { await view.close() }
})

test('preview shows sample banner and scheduling navigation through AppShell', async () => {
  const view = mount(PreviewApp, { screenId: 'SC02' }, 'http://localhost/__ui-preview/SC02')
  try {
    await view.render()
    assert.match(view.document.querySelector('.ui-preview-banner').textContent, /Dữ liệu mẫu — UI Preview/)
    assert.equal(view.document.querySelectorAll('.sidebar nav a').length, 6)
    assert.equal(view.document.querySelector('.sidebar nav a[aria-current="page"]').textContent, 'Phòng & tài nguyên')
  } finally { await view.close() }
})

test('weekly draft validates a six-month limit and produces the full local date preview', () => {
  const draft = { classId: 'ENG-C1', teacherId: 'GV-018', roomId: 'P.304', format: 'IN_PERSON', date: '2026-10-23', start: '17:00', end: '18:30', repeat: 'WEEKLY', weekdays: [5], repeatUntil: '2026-12-11' }
  assert.deepEqual(validateDraft(draft), {})
  assert.equal(candidateDates(draft).length, 8)
  assert.equal(sixMonthLimit(draft.date), '2027-04-23')
  assert.match(validateDraft({ ...draft, repeatUntil: '2027-04-24' }).repeatUntil, /sáu tháng/)
  assert.match(validateDraft({ ...draft, weekdays: [] }).weekdays, /ít nhất một/)
  assert.match(validateDraft({ ...draft, end: '17:00' }).end, /sau giờ bắt đầu/)
})

test('SC03 keeps inputs between form and review; no local confirmation succeeds', async () => {
  const view = mount(CreateScheduleScreen, { data: schedulingFixtures, preview: true })
  try {
    await view.render()
    assert.equal(view.document.querySelector('input[type="date"]').value, '2026-10-23')
    await click(view, '.scheduling-create-actions .scheduling-primary')
    assert.match(view.document.querySelector('.scheduling-table').textContent, /08\/08/)
    await click(view, '.scheduling-create-actions .scheduling-primary')
    assert.ok(view.document.querySelector('[aria-label="Xác nhận lịch đang chờ API"]').disabled)
    await click(view, '.scheduling-create-actions button:first-child')
    await click(view, '.scheduling-create-actions button:first-child')
    assert.equal(view.document.querySelector('input[type="date"]').value, '2026-10-23')
    assert.doesNotMatch(view.document.body.textContent, /lịch đã được xác nhận|đã lưu thành công/i)
  } finally { await view.close() }
})

test('SC03 rejects invalid fields and too-long weekly range before review', async () => {
  const view = mount(CreateScheduleScreen, { data: schedulingFixtures })
  try {
    await view.render()
    await click(view, '.scheduling-create-actions .scheduling-primary')
    assert.ok(view.document.querySelector('select[aria-invalid="true"]'))
    assert.equal(view.document.querySelector('[role="tab"][aria-selected="true"]').textContent, '1 · Thông tin buổi')
  } finally { await view.close() }
  const weekly = mount(CreateScheduleScreen, { data: schedulingFixtures, preview: true })
  try {
    await weekly.render()
    await change(weekly, '.scheduling-create-grid .scheduling-card:first-child > .scheduling-field input', '2027-04-24')
    await click(weekly, '.scheduling-create-actions .scheduling-primary')
    assert.match(weekly.document.body.textContent, /Khoảng lặp tối đa sáu tháng/)
    assert.equal(weekly.document.querySelector('[role="tab"][aria-selected="true"]').textContent, '1 · Thông tin buổi')
  } finally { await weekly.close() }
})

test('SC04 is embedded for zero, one, multiple and race conflicts; never enables fake confirmation', async () => {
  for (const [conflicts, race, expected] of [[[], false, /Không phát hiện xung đột/], [schedulingConflictFixtures.one, false, /1 vấn đề/], [schedulingConflictFixtures.many, false, /5 vấn đề/], [schedulingConflictFixtures.race, true, /Dữ liệu vừa thay đổi/]]) {
    const view = mount(CreateScheduleScreen, { data: schedulingFixtures, preview: true, conflicts, race, initialConflictOpen: true })
    try {
      await view.render()
      const dialog = view.document.querySelector('[role="dialog"]')
      assert.match(dialog.textContent, expected)
      assert.equal(dialog.querySelector('[aria-label="Xác nhận lịch đang chờ API"]').disabled, true)
      assert.match(dialog.textContent, /Không buổi nào|Chưa buổi nào/)
      await click(view, '.scheduling-sheet .scheduling-primary')
      assert.equal(view.document.querySelector('[role="dialog"]'), null)
      assert.equal(view.document.querySelector('[role="tab"][aria-selected="true"]').textContent, '1 · Thông tin buổi')
    } finally { await view.close() }
  }
  assert.deepEqual(new Set(schedulingConflictFixtures.many.map((item) => item.source)), new Set(['room', 'teacher', 'capacity', 'student', 'unavailability']))
})

test('SC05 explicit unknown ID, cancelled and read-only views fail closed', async () => {
  for (const [selectedId, canEdit, expected] of [['unknown-session', true, /Không tìm thấy buổi học/], ['session-cancelled-21', true, /Buổi đã hủy/], ['session-eng-26', false, /Chế độ chỉ xem/]]) {
    const view = mount(SessionDetailScreen, { data: schedulingFixtures, selectedId, canEdit, preview: true, ...schedulingPreviewClock })
    try { await view.render(); assert.match(view.document.body.textContent, expected); assert.equal(view.document.querySelector('.scheduling-action-stack'), null) } finally { await view.close() }
  }
})

test('SC05 validates cancellation and reschedule locally; fixture status is unchanged', async () => {
  const view = mount(SessionDetailScreen, { data: schedulingFixtures, selectedId: 'session-eng-26', canEdit: true, preview: true, ...schedulingPreviewClock, conflicts: schedulingConflictFixtures.one })
  try {
    await view.render()
    await click(view, '.scheduling-action-stack button:last-child')
    await click(view, '.scheduling-form-actions .scheduling-primary')
    assert.match(view.document.querySelector('[role="alert"]').textContent, /nhập lý do/)
    await change(view, '.scheduling-form label input', 'Giáo viên vắng')
    await click(view, '.scheduling-form-actions .scheduling-primary')
    assert.match(view.document.querySelector('[role="status"]').textContent, /chờ kết nối API/)
    assert.equal(schedulingFixtures.sessions.find((item) => item.id === 'session-eng-26').status, 'CONFIRMED')
    await click(view, '[role="dialog"] [aria-label="Đóng"]')
    await click(view, '.scheduling-action-stack button:first-child')
    await change(view, '.scheduling-form label:nth-child(1) input', '2026-10-20')
    await change(view, '.scheduling-form label:nth-child(4) input', 'Đổi giờ')
    await click(view, '.scheduling-form-actions .scheduling-primary')
    assert.match(view.document.querySelector('[role="alert"]').textContent, /ở tương lai/)
    await click(view, '.scheduling-form > button')
    assert.match(view.document.querySelector('.scheduling-sheet').textContent, /Trùng phòng/)
  } finally { await view.close() }
})

test('SC06 teacher, student, parent and empty scopes show only explicit fixture sessions', async () => {
  const teacher = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: personalScheduleScopes.teacher, preview: true, ...schedulingPreviewClock })
  try {
    await teacher.render()
    assert.match(teacher.document.querySelector('.scheduling-table').textContent, /ENG-C1/)
    assert.doesNotMatch(teacher.document.querySelector('.scheduling-table').textContent, /Nhật N4/)
    await click(teacher, '[aria-label="Tuần sau"]')
    assert.match(teacher.document.body.textContent, /26\/10–01\/11/)
  } finally { await teacher.close() }
  const parent = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: personalScheduleScopes.parent, preview: true, ...schedulingPreviewClock })
  try {
    await parent.render()
    assert.match(parent.document.querySelector('.scheduling-table').textContent, /ENG-B2/)
    await change(parent, '.scheduling-field select', 'child-minh-an')
    assert.match(parent.document.querySelector('.scheduling-table').textContent, /Nhật N4/)
    assert.doesNotMatch(parent.document.querySelector('.scheduling-table').textContent, /ENG-B2/)
  } finally { await parent.close() }
  const invalid = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: personalScheduleScopes.parent, preview: true, ...schedulingPreviewClock, initialChildId: 'other-child' })
  try { await invalid.render(); assert.match(invalid.document.querySelector('[role="alert"]').textContent, /không nằm trong danh sách liên kết/) } finally { await invalid.close() }
  const empty = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: { ...personalScheduleScopes.student, allowedSessionIds: [] }, preview: true, ...schedulingPreviewClock })
  try { await empty.render(); assert.match(empty.document.body.textContent, /Chưa có buổi học trong tuần này/) } finally { await empty.close() }
})

test('SC06 carries a non-first session ID to its detail callback', async () => {
  let opened = ''
  const view = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: personalScheduleScopes.teacher, preview: true, ...schedulingPreviewClock, onOpenSession: (id) => { opened = id } })
  try {
    await view.render()
    await click(view, '.scheduling-table tbody tr:nth-child(2) button')
    assert.equal(opened, 'session-eng-21')
  } finally { await view.close() }
})

test('preview exposes SC03/SC05/SC06 and SC04 only as a hosted conflict state', async () => {
  const view = mount(PreviewApp, { screenId: 'SC03' }, 'http://localhost/__ui-preview/SC03?state=conflict')
  try {
    await view.render()
    assert.match(view.document.querySelector('.ui-preview-banner').textContent, /SC04/)
    assert.equal(view.document.querySelector('a[href="/__ui-preview/SC03?state=conflict"]').getAttribute('href'), '/__ui-preview/SC03?state=conflict')
    assert.match(view.document.querySelector('.scheduling-sheet').textContent, /Xung đột lịch học/)
  } finally { await view.close() }
  assert.equal(routes.some((route) => route.id === 'SC04'), false)
})

test('tenant calendar date follows an IANA timezone across UTC midnight', () => {
  const nearMidnight = new Date('2026-10-20T18:30:00Z')
  assert.equal(tenantLocalDate('UTC', nearMidnight), '2026-10-20')
  assert.equal(tenantLocalDate('Asia/Ho_Chi_Minh', nearMidnight), '2026-10-21')
  assert.equal(tenantLocalDate('America/Los_Angeles', new Date('2026-10-21T03:00:00Z')), '2026-10-20')
  assert.equal(tenantLocalDate('Not/A_Timezone', nearMidnight), null)
  assert.equal(tenantLocalDate(undefined, nearMidnight), null)
  assert.match(formatInstant('2026-10-20T18:30:00Z', 'Asia/Ho_Chi_Minh'), /21\/10\/2026/)
})

test('SC01 Today follows tenant date while preview stays fixed', async () => {
  const instant = new Date('2026-10-18T18:30:00Z')
  const hcm = mount(CentralScheduleScreen, { data: schedulingFixtures, timeZone: 'Asia/Ho_Chi_Minh', now: instant })
  try { await hcm.render(); assert.match(hcm.document.querySelector('.scheduling-period').textContent, /19\/10–25\/10/) } finally { await hcm.close() }
  const behind = mount(CentralScheduleScreen, { data: schedulingFixtures, timeZone: 'America/Los_Angeles', now: instant })
  try { await behind.render(); assert.match(behind.document.querySelector('.scheduling-period').textContent, /12\/10–18\/10/); await click(behind, '[aria-label="Kỳ sau"]'); await click(behind, '.scheduling-toolbar > button:last-child'); assert.match(behind.document.querySelector('.scheduling-period').textContent, /12\/10–18\/10/) } finally { await behind.close() }
  const preview = mount(PreviewApp, { screenId: 'SC01' }, 'http://localhost/__ui-preview/SC01')
  try { await preview.render(); assert.match(preview.document.querySelector('.scheduling-period').textContent, /19\/10–25\/10/) } finally { await preview.close() }
  const missing = mount(CentralScheduleScreen, { data: schedulingFixtures })
  try { await missing.render(); assert.match(missing.document.querySelector('[role="alert"]').textContent, /múi giờ tenant hợp lệ/) } finally { await missing.close() }
})

test('SC05 history belongs to the selected session and missing history remains empty', async () => {
  const expected = [
    ['session-eng-26', /Nguyễn Văn An xác nhận/, /Mai Phương rà soát/],
    ['session-ielts-20', /Mai Phương rà soát/, /Nguyễn Văn An xác nhận/],
    ['session-cancelled-21', /Buổi học bị hủy/, /Mai Phương rà soát/],
  ]
  for (const [selectedId, included, excluded] of expected) {
    const view = mount(SessionDetailScreen, { data: schedulingFixtures, selectedId, preview: true, ...schedulingPreviewClock })
    try { await view.render(); const history = view.document.querySelector('.scheduling-timeline').textContent; assert.match(history, included); assert.doesNotMatch(history, excluded) } finally { await view.close() }
  }
  const unknown = mount(SessionDetailScreen, { data: schedulingFixtures, selectedId: 'unknown-session', ...schedulingPreviewClock })
  try { await unknown.render(); assert.equal(unknown.document.querySelector('.scheduling-timeline'), null); assert.doesNotMatch(unknown.document.body.textContent, /Nguyễn Văn An|Mai Phương rà soát/) } finally { await unknown.close() }
  const noHistory = mount(SessionDetailScreen, { data: { ...schedulingFixtures, historyBySessionId: undefined }, selectedId: 'session-cancelled-21', timeZone: 'Asia/Ho_Chi_Minh' })
  try { await noHistory.render(); assert.match(noHistory.document.body.textContent, /Chưa có dữ liệu lịch sử/); assert.doesNotMatch(noHistory.document.body.textContent, /Nguyễn Văn An xác nhận|Buổi học bị hủy\. Dữ liệu mẫu/) } finally { await noHistory.close() }
})

test('SC05 future actions use tenant-local today and fail closed without timezone', async () => {
  const now = new Date('2026-10-21T03:00:00Z')
  for (const [timeZone, editable] of [['Asia/Ho_Chi_Minh', false], ['America/Los_Angeles', true], [undefined, false]]) {
    const view = mount(SessionDetailScreen, { data: schedulingFixtures, selectedId: 'session-eng-21', canEdit: true, timeZone, now })
    try { await view.render(); assert.equal(Boolean(view.document.querySelector('.scheduling-action-stack')), editable) } finally { await view.close() }
  }
})

test('SC06 defaults to runtime tenant week; preview week remains deterministic', async () => {
  const now = new Date('2026-10-28T03:00:00Z')
  const runtime = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: personalScheduleScopes.teacher, timeZone: 'America/Los_Angeles', now })
  try { await runtime.render(); assert.match(runtime.document.querySelector('.scheduling-period').textContent, /26\/10–01\/11/) } finally { await runtime.close() }
  const preview = mount(PreviewApp, { screenId: 'SC06' }, 'http://localhost/__ui-preview/SC06')
  try { await preview.render(); assert.match(preview.document.querySelector('.scheduling-period').textContent, /19\/10–25\/10/) } finally { await preview.close() }
  const missing = mount(PersonalScheduleScreen, { data: schedulingFixtures, scope: personalScheduleScopes.teacher })
  try { await missing.render(); assert.match(missing.document.querySelector('[role="alert"]').textContent, /múi giờ tenant hợp lệ/) } finally { await missing.close() }
})

test('SC01 and SC02 filters apply immediately without Apply controls or stale selection', async () => {
  const schedule = mount(CentralScheduleScreen, { data: schedulingFixtures, preview: true, ...schedulingPreviewClock })
  try {
    await schedule.render()
    assert.doesNotMatch(schedule.document.querySelector('.scheduling-filters').textContent, /Áp dụng/)
    await click(schedule, '.scheduling-event')
    assert.ok(schedule.document.querySelector('[role="dialog"]'))
    await change(schedule, '.scheduling-filters select', 'IELTS-03')
    assert.equal(schedule.document.querySelector('[role="dialog"]'), null)
    assert.equal(schedule.document.querySelectorAll('.scheduling-event').length, 2)
  } finally { await schedule.close() }
  const resources = mount(ResourcesScreen, { data: schedulingFixtures, preview: true })
  try {
    await resources.render()
    assert.doesNotMatch(resources.document.querySelector('.scheduling-filters').textContent, /Áp dụng/)
    await click(resources, '.scheduling-table tbody tr:first-child button')
    assert.match(resources.document.querySelector('.scheduling-detail-grid').textContent, /Phòng Giao tiếp/)
    await change(resources, '.scheduling-filters input:first-child', 'P.302')
    assert.match(resources.document.querySelector('.scheduling-table').textContent, /Phòng IELTS/)
    assert.doesNotMatch(resources.document.querySelector('.scheduling-detail-grid').textContent, /Sức chứa 20/)
  } finally { await resources.close() }
})

test('SC02 create, edit and block dialogs start with their own values and never mutate fixtures', async () => {
  const original = JSON.stringify(schedulingFixtures.rooms)
  const view = mount(ResourcesScreen, { data: schedulingFixtures, preview: true, initialRoomId: 'P.201' })
  try {
    await view.render()
    await click(view, '.scheduling-detail-grid .scheduling-card:first-child button')
    assert.match(view.document.querySelector('[role="dialog"]').getAttribute('aria-label'), /Sửa phòng P.201/)
    assert.equal(view.document.querySelector('.scheduling-form input').value, 'P.201')
    assert.equal(view.document.querySelector('.scheduling-form input').readOnly, true)
    await click(view, '.scheduling-form-actions button:first-child')
    await click(view, '.scheduling-table tbody tr:nth-child(2) button')
    await click(view, '.scheduling-detail-grid .scheduling-card:first-child button')
    assert.equal(view.document.querySelector('.scheduling-form input').value, 'P.302')
    assert.equal(view.document.querySelector('.scheduling-form label:nth-child(2) input').value, 'Phòng IELTS')
    await click(view, '.scheduling-form-actions button:first-child')
    await click(view, '.scheduling-heading button')
    assert.match(view.document.querySelector('[role="dialog"]').getAttribute('aria-label'), /Thêm phòng học/)
    assert.deepEqual([...view.document.querySelectorAll('.scheduling-form input')].map((item) => item.value), ['', '', ''])
    await change(view, '.scheduling-form label:nth-child(1) input', 'P.999')
    await click(view, '.scheduling-form-actions button:last-child')
    assert.ok(view.document.querySelector('[role="alert"]'))
    await click(view, '.scheduling-form-actions button:first-child')
    await click(view, '.scheduling-heading button')
    assert.deepEqual([...view.document.querySelectorAll('.scheduling-form input')].map((item) => item.value), ['', '', ''])
    assert.equal(view.document.querySelector('.scheduling-form [role="alert"]'), null)
    await click(view, '.scheduling-form-actions button:first-child')
    await click(view, '.scheduling-detail-grid .scheduling-card:nth-child(2) button')
    assert.deepEqual([...view.document.querySelectorAll('.scheduling-form input')].map((item) => item.value), ['', '', ''])
    await change(view, '.scheduling-form label:nth-child(2) input', '2026-10-21T12:00')
    await change(view, '.scheduling-form label:nth-child(3) input', '2026-10-21T11:00')
    await click(view, '.scheduling-form-actions button:last-child')
    assert.ok(view.document.querySelector('.scheduling-form [role="alert"]'))
    await click(view, '.scheduling-form-actions button:first-child')
    await click(view, '.scheduling-detail-grid .scheduling-card:nth-child(2) button')
    assert.deepEqual([...view.document.querySelectorAll('.scheduling-form input')].map((item) => item.value), ['', '', ''])
    assert.equal(JSON.stringify(schedulingFixtures.rooms), original)
    assert.doesNotMatch(view.document.body.textContent, /đã lưu thành công/i)
  } finally { await view.close() }
})
