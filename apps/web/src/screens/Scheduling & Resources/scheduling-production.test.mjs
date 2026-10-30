import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/schedule' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
let fetchHandler
globalThis.fetch = (...args) => fetchHandler(...args)
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { SchedulingProduction } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SchedulingProduction.tsx')
const { apiWeekday, futureSessionStart, localInstant, schedulingView } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SchedulingAdapter.ts')
after(async () => { await vite.close(); dom.window.close() })

const tenant = '00000000-0000-4000-8000-000000000001'
const sessionId = '00000000-0000-4000-8000-000000000002'
const now = new Date()
const startsAt = new Date(now.getTime() + 60_000).toISOString()
const endsAt = new Date(now.getTime() + 3_660_000).toISOString()
const record = { id: sessionId, classId: 'class-1', className: 'Lớp thật', teacherId: 'teacher-1', teacherName: 'Giáo viên thật', roomId: null, deliveryMode: 'ONLINE', startsAt, endsAt, status: 'CONFIRMED', revision: 4, seriesId: null }
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
const page = (items) => ({ items, page: 1, pageSize: 100, total: items.length, timeZone: 'UTC' })
const caps = { scheduleCreate: false, scheduleConfirm: false, scheduleUpdate: false, scheduleCancel: false, roomManage: false, resourceManage: false }
const flush = () => new Promise((resolve) => setTimeout(resolve, 70))
async function change(element, value) {
  await act(async () => {
    const prototype = element.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value)
    element.dispatchEvent(new dom.window.Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
  })
}
async function mounted(props, run) {
  const root = createRoot(document.getElementById('root'))
  try { await act(async () => { root.render(React.createElement(SchedulingProduction, { tenantId: tenant, token: 'live-token', navigate() {}, ...props })); await flush() }); await run() }
  finally { await act(async () => root.unmount()) }
}

test('adapter respects tenant wall time, server room status and real resource identity', () => {
  assert.equal(apiWeekday([0]), 7)
  assert.equal(apiWeekday([1]), 1)
  assert.equal(apiWeekday([1, 3]), null)
  assert.equal(apiWeekday([]), null)
  assert.equal(localInstant('2026-10-21', '18:30', 'Asia/Ho_Chi_Minh'), '2026-10-21T11:30:00.000Z')
  assert.equal(localInstant('2026-03-08', '02:30', 'America/New_York'), null)
  assert.equal(futureSessionStart('2026-10-20T20:00:00Z', 'Asia/Ho_Chi_Minh', new Date('2026-10-20T19:00:00Z')), true)
  assert.equal(futureSessionStart('2026-10-20T20:00:00Z', 'Invalid/Zone', new Date('2026-10-20T19:00:00Z')), false)
  const value = schedulingView('Asia/Ho_Chi_Minh', [{ ...record, startsAt: '2026-10-20T18:30:00Z', endsAt: '2026-10-20T19:30:00Z' }],
    [{ id: 'room-1', code: 'P.201', name: 'Phòng thật', capacity: 20, active: false, location: null }],
    [{ id: 'busy-1', resourceId: 'resource-1', roomId: 'room-1', resourceKind: 'ROOM', startsAt: '2026-10-20T18:30:00Z', endsAt: '2026-10-20T19:30:00Z', status: 'CONFIRMED', reason: 'Bảo trì' }], undefined,
    [{ id: 'resource-1', name: 'Phòng thật', kind: 'ROOM' }])
  assert.equal(value.sessions[0].date, '2026-10-21')
  assert.equal(value.sessions[0].start, '01:30')
  assert.equal(value.rooms[0].status, 'INACTIVE')
  assert.equal(value.blocks[0].roomId, 'room-1')
  assert.equal(value.blocks[0].resourceName, 'Phòng thật')
})

test('SC01 and SC06 render scoped REST sessions through the same presentation as preview', async () => {
  const calls = []
  fetchHandler = async (url, options) => { calls.push({ url: String(url), method: options.method, token: options.headers.Authorization }); return response(String(url).endsWith('/capabilities') ? caps : page([record])) }
  await mounted({ id: 'SC01' }, async () => {
    assert.match(document.querySelector('.scheduling-page').textContent, /Lớp thật/)
    assert.equal(document.querySelector('.scheduling-heading button'), null)
    assert.ok(document.querySelector('.scheduling-week-grid'))
    assert.equal(document.body.textContent.includes('Dữ liệu mẫu'), false)
  })
  await mounted({ id: 'SC06' }, async () => {
    assert.match(document.querySelector('.scheduling-personal').textContent, /Lớp thật/)
    assert.ok(document.querySelector('.scheduling-personal-table'))
    assert.equal(document.querySelector('.scheduling-personal').textContent.includes('Dữ liệu minh họa'), false)
  })
  assert.ok(calls.some((call) => call.url.includes(`/tenants/${tenant}/scheduling/calendar?`)))
  assert.ok(calls.some((call) => call.url.includes(`/tenants/${tenant}/scheduling/personal?`)))
  assert.ok(calls.every((call) => call.token === 'Bearer live-token' && call.method === 'GET'))
})

test('SC05 sends cancellation with revision, reason and idempotency only after explicit action', async () => {
  const writes = []
  const future = new Date(Date.now() + 4 * 24 * 3600_000)
  const futureSession = { ...record, startsAt: future.toISOString(), endsAt: new Date(future.getTime() + 3600_000).toISOString() }
  fetchHandler = async (url, options) => {
    const path = String(url)
    if (options.method === 'POST') { writes.push({ path, body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] }); return response({ id: sessionId }) }
    if (path.endsWith('/capabilities')) return response({ ...caps, scheduleCancel: true })
    if (path.endsWith(`/sessions/${sessionId}`)) return response({ ...futureSession, timeZone: 'UTC' })
    throw Error(`Unexpected ${path}`)
  }
  await mounted({ id: 'SC05', selectedId: sessionId }, async () => {
    assert.equal(writes.length, 0)
    await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Hủy buổi học').click() })
    const reason = [...document.querySelectorAll('.scheduling-dialog input')].at(-1)
    await change(reason, 'Lịch thay đổi')
    await act(async () => { [...document.querySelectorAll('.scheduling-dialog button')].find((button) => button.textContent === 'Lưu trên máy chủ').click(); await flush() })
    assert.equal(writes.length, 1)
    assert.match(writes[0].path, new RegExp(`/sessions/${sessionId}/cancel$`))
    assert.deepEqual(writes[0].body, { reason: 'Lịch thay đổi', revision: 4 })
    assert.ok(writes[0].key)
  })
})

test('SC05 same-day production reschedule sends tenant instant and rejects stale cancellation', async () => {
  const writes = []
  let current = new Date('2026-10-21T03:00:00Z')
  const session = { ...record, startsAt: '2026-10-21T11:00:00Z', endsAt: '2026-10-21T12:00:00Z', timeZone: 'Asia/Ho_Chi_Minh' }
  fetchHandler = async (url, options) => {
    const path = String(url)
    if (options.method === 'POST') { writes.push({ path, body: JSON.parse(options.body), key: options.headers['Idempotency-Key'] }); return response({ id: sessionId }) }
    if (path.endsWith('/capabilities')) return response({ ...caps, scheduleUpdate: true, scheduleCancel: true })
    if (path.endsWith(`/sessions/${sessionId}`)) return response(session)
    throw Error(`Unexpected ${path}`)
  }
  await mounted({ id: 'SC05', selectedId: sessionId, clock: () => current }, async () => {
    assert.equal(document.querySelectorAll('.scheduling-action-stack button').length, 2)
    await act(async () => document.querySelector('.scheduling-action-stack .scheduling-primary').click())
    const fields = [...document.querySelectorAll('.scheduling-dialog .scheduling-field input')]
    await change(fields[0], '2026-10-21')
    await change(fields[1], '19:00')
    await change(fields[2], '20:00')
    await change(fields[3], 'Điều chỉnh giờ')
    await act(async () => { document.querySelector('.scheduling-dialog .scheduling-primary').click(); await flush() })
    assert.equal(writes.length, 1)
    assert.match(writes[0].path, new RegExp(`/sessions/${sessionId}/reschedule$`))
    assert.deepEqual(writes[0].body, { startsAt: '2026-10-21T12:00:00.000Z', endsAt: '2026-10-21T13:00:00.000Z', reason: 'Điều chỉnh giờ', revision: 4 })
    assert.ok(writes[0].key)
  })
  await mounted({ id: 'SC05', selectedId: sessionId, clock: () => current }, async () => {
    await act(async () => [...document.querySelectorAll('.scheduling-action-stack button')].find((button) => button.textContent === 'Hủy buổi học').click())
    await change(document.querySelector('.scheduling-dialog input'), 'Đổi lịch')
    current = new Date('2026-10-21T11:00:00Z')
    await act(async () => { document.querySelector('.scheduling-dialog .scheduling-primary').click(); await flush() })
    assert.equal(writes.length, 1)
    assert.match(document.querySelector('.scheduling-dialog [role="alert"]').textContent, /đã bắt đầu/)
  })
})

test('SC05 surfaces 403 and 409 write failures without a success state', async () => {
  const session = { ...record, startsAt: '2026-10-21T11:00:00Z', endsAt: '2026-10-21T12:00:00Z', timeZone: 'Asia/Ho_Chi_Minh' }
  for (const [status, expected] of [[403, /không có quyền/i], [409, /thay đổi|xung đột/i]]) {
    let writes = 0
    fetchHandler = async (url, options) => {
      const path = String(url)
      if (options.method === 'POST') { writes++; return response({ code: status === 403 ? 'FORBIDDEN' : 'SCHEDULE_CONFLICT' }, status) }
      if (path.endsWith('/capabilities')) return response({ ...caps, scheduleUpdate: true })
      if (path.endsWith(`/sessions/${sessionId}`)) return response(session)
      throw Error(`Unexpected ${path}`)
    }
    await mounted({ id: 'SC05', selectedId: sessionId, clock: () => new Date('2026-10-21T03:00:00Z') }, async () => {
      await act(async () => document.querySelector('.scheduling-action-stack .scheduling-primary').click())
      const fields = [...document.querySelectorAll('.scheduling-dialog .scheduling-field input')]
      await change(fields[0], '2026-10-21')
      await change(fields[1], '19:00')
      await change(fields[2], '20:00')
      await change(fields[3], 'Điều chỉnh giờ')
      await act(async () => { document.querySelector('.scheduling-dialog .scheduling-primary').click(); await flush() })
      assert.equal(writes, 1)
      assert.match(document.body.textContent, expected)
      assert.doesNotMatch(document.body.textContent, /Đã lưu trên máy chủ/)
    })
  }
})

test('SC03 creates one draft with local time, blocks conflicts and confirms only after fresh server preview', async () => {
  const writes = []
  let ready = false
  const futureDate = new Date(Date.now() + 8 * 24 * 3600_000).toISOString().slice(0, 10)
  const options = { timeZone: 'Asia/Ho_Chi_Minh', classes: [{ id: 'class-1', name: 'Lớp thật', enrollmentCount: 10 }], teachers: [{ id: 'teacher-1', name: 'Giáo viên thật' }], rooms: [{ id: 'room-1', name: 'Phòng thật', capacity: 20 }], resources: [], assignments: [{ classId: 'class-1', teacherId: 'teacher-1', validFrom: '2020-01-01', validTo: null }] }
  fetchHandler = async (url, request) => {
    const path = String(url)
    if (request.method === 'POST') { writes.push({ path, body: JSON.parse(request.body), key: request.headers['Idempotency-Key'] }); return response({ id: sessionId, sessionIds: [sessionId] }, 201) }
    if (path.endsWith('/choices')) return response(options)
    if (path.endsWith('/capabilities')) return response({ ...caps, scheduleCreate: true, scheduleConfirm: true })
    if (path.endsWith(`/drafts/${sessionId}/preview`)) return response({ ready, sessionIds: [sessionId], conflicts: ready ? [] : [{ sessionId, kind: 'ROOM' }], reserved: false, asOf: new Date().toISOString() })
    throw Error(`Unexpected ${path}`)
  }
  await mounted({ id: 'SC03' }, async () => {
    assert.equal(writes.length, 0)
    const fields = [...document.querySelectorAll('.scheduling-fields label')]
    await change(fields.find((field) => field.textContent.startsWith('Ngày bắt đầu')).querySelector('input'), futureDate)
    await change(fields.find((field) => field.textContent.startsWith('Lớp')).querySelector('select'), 'class-1')
    await change(fields.find((field) => field.textContent.startsWith('Giáo viên')).querySelector('select'), 'teacher-1')
    await change(fields.find((field) => field.textContent.startsWith('Phòng')).querySelector('select'), 'room-1')
    await change(fields.find((field) => field.textContent.startsWith('Giờ bắt đầu')).querySelector('input'), '17:00')
    await change(fields.find((field) => field.textContent.startsWith('Giờ kết thúc')).querySelector('input'), '18:30')
    await change([...document.querySelectorAll('label')].find((field) => field.textContent.startsWith('Lý do')).querySelector('input'), 'Mở lớp')
    await act(async () => { const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Lưu bản nháp'); button.click(); button.click(); await flush() })
    assert.equal(writes.length, 1)
    assert.match(writes[0].path, /\/sessions$/)
    assert.equal(writes[0].body.reason, 'Mở lớp')
    assert.equal(writes[0].body.startsAt, localInstant(futureDate, '17:00', 'Asia/Ho_Chi_Minh'))
    assert.equal(writes[0].body.endsAt, localInstant(futureDate, '18:30', 'Asia/Ho_Chi_Minh'))
    assert.ok(writes[0].key)
    assert.match(document.querySelector('.scheduling-sheet').textContent, /chặn xác nhận/)
    await act(async () => { document.querySelector('[aria-label="Đóng panel xung đột"]').click() })
    assert.equal([...document.querySelectorAll('button')].find((button) => button.textContent === 'Xác nhận buổi học'), undefined)
    ready = true
    await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Kiểm tra lại').click(); await flush() })
    await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Tiếp tục').click() })
    const confirm = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Xác nhận buổi học')
    assert.equal(confirm.disabled, false)
    await act(async () => { confirm.click(); await flush() })
    assert.equal(writes.length, 2)
    assert.match(writes[1].path, new RegExp(`/sessions/${sessionId}/confirm$`))
    assert.deepEqual(writes[1].body, { reason: 'Mở lớp' })
  })
})

test('SC03 weekly requires a weekday inline and sends Sunday as one API series weekday', async () => {
  const writes = []
  const start = new Date(Date.now() + 14 * 24 * 3600_000)
  start.setUTCDate(start.getUTCDate() + ((7 - start.getUTCDay()) % 7))
  const date = start.toISOString().slice(0, 10)
  const until = new Date(start.getTime() + 14 * 24 * 3600_000).toISOString().slice(0, 10)
  const options = { timeZone: 'Asia/Ho_Chi_Minh', classes: [{ id: 'class-1', name: 'Lớp thật', enrollmentCount: 10 }], teachers: [{ id: 'teacher-1', name: 'Giáo viên thật' }], rooms: [{ id: 'room-1', name: 'Phòng thật', capacity: 20 }], resources: [], assignments: [{ classId: 'class-1', teacherId: 'teacher-1', validFrom: '2020-01-01', validTo: null }] }
  fetchHandler = async (url, request) => {
    const path = String(url)
    if (request.method === 'POST') { writes.push({ path, body: JSON.parse(request.body), key: request.headers['Idempotency-Key'] }); return response({ id: sessionId, sessionIds: [sessionId] }, 201) }
    if (path.endsWith('/choices')) return response(options)
    if (path.endsWith('/capabilities')) return response({ ...caps, scheduleCreate: true, scheduleConfirm: true })
    if (path.includes('/preview')) return response({ ready: true, sessionIds: [sessionId], conflicts: [], reserved: false, asOf: '2026-10-30T00:00:00Z' })
    throw Error(`Unexpected ${path}`)
  }
  await mounted({ id: 'SC03' }, async () => {
    await act(async () => [...document.querySelectorAll('.scheduling-choice button')].find((button) => button.textContent === 'Hằng tuần').click())
    const fields = [...document.querySelectorAll('.scheduling-fields label')]
    await change(fields.find((field) => field.textContent.startsWith('Ngày bắt đầu')).querySelector('input'), date)
    await change(fields.find((field) => field.textContent.startsWith('Lớp')).querySelector('select'), 'class-1')
    await change(fields.find((field) => field.textContent.startsWith('Giáo viên')).querySelector('select'), 'teacher-1')
    await change(fields.find((field) => field.textContent.startsWith('Phòng')).querySelector('select'), 'room-1')
    await change(fields.find((field) => field.textContent.startsWith('Giờ bắt đầu')).querySelector('input'), '17:00')
    await change(fields.find((field) => field.textContent.startsWith('Giờ kết thúc')).querySelector('input'), '18:30')
    await change([...document.querySelectorAll('label')].find((field) => field.textContent.startsWith('Lặp đến')).querySelector('input'), until)
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Tiếp tục').click())
    assert.match(document.querySelector('.scheduling-weekdays [role="alert"]').textContent, /đúng một/)
    assert.equal(writes.length, 0)
    await act(async () => [...document.querySelectorAll('input[name="schedule-weekday"]')].at(-1).click())
    assert.equal(document.querySelectorAll('input[name="schedule-weekday"]:checked').length, 1)
    await change([...document.querySelectorAll('label')].find((field) => field.textContent.startsWith('Lý do')).querySelector('input'), 'Mở lớp')
    await act(async () => { [...document.querySelectorAll('button')].find((button) => button.textContent === 'Lưu bản nháp').click(); await flush() })
    assert.equal(writes.length, 1)
    assert.match(writes[0].path, /\/series$/)
    assert.equal(writes[0].body.weekday, 7)
    assert.equal(writes[0].body.weekdays, undefined)
    assert.ok(writes[0].key)
  })
})

test('SC02 uses server room code and sends authorized room creation with a reason', async () => {
  const writes = []
  fetchHandler = async (url, request) => {
    const path = String(url)
    if (request.method === 'POST') { writes.push({ path, body: JSON.parse(request.body), key: request.headers['Idempotency-Key'] }); return response({ id: 'room-2' }, 201) }
    if (path.endsWith('/capabilities')) return response({ ...caps, roomManage: true })
    if (path.includes('/rooms')) return response(page([{ id: 'room-1', code: 'P.201', name: 'Phòng thật', capacity: 20, active: true, location: 'Tầng 2' }]))
    if (path.includes('/unavailability')) return response(page([]))
    if (path.includes('/resources')) return response(page([{ id: 'resource-1', name: 'Phòng thật', kind: 'ROOM' }]))
    throw Error(`Unexpected ${path}`)
  }
  await mounted({ id: 'SC02' }, async () => {
    assert.match(document.querySelector('.scheduling-table').textContent, /P\.201 · Phòng thật/)
    assert.equal(writes.length, 0)
    await act(async () => { document.querySelector('.scheduling-heading button').click() })
    const fields = [...document.querySelectorAll('.scheduling-dialog .scheduling-field')]
    await change(fields.find((field) => field.textContent.startsWith('Mã phòng')).querySelector('input'), 'P.202')
    await change(fields.find((field) => field.textContent.startsWith('Tên phòng')).querySelector('input'), 'Phòng mới')
    await change(fields.find((field) => field.textContent.startsWith('Sức chứa')).querySelector('input'), '24')
    await change(fields.find((field) => field.textContent.startsWith('Lý do')).querySelector('input'), 'Bổ sung phòng')
    await act(async () => { [...document.querySelectorAll('.scheduling-dialog button')].find((button) => button.textContent === 'Lưu trên máy chủ').click(); await flush() })
    assert.equal(writes.length, 1)
    assert.match(writes[0].path, /\/rooms$/)
    assert.deepEqual(writes[0].body, { code: 'P.202', name: 'Phòng mới', capacity: 24, reason: 'Bổ sung phòng' })
    assert.ok(writes[0].key)
  })
})

test('SC06 forbidden read fails closed without retry or previously scoped rows', async () => {
  fetchHandler = async () => response({ code: 'FORBIDDEN' }, 403)
  await mounted({ id: 'SC06' }, async () => {
    assert.match(document.body.textContent, /Không có quyền truy cập/)
    assert.equal(document.querySelector('.scheduling-personal'), null)
    assert.equal([...document.querySelectorAll('button')].some((button) => button.textContent === 'Thử lại'), false)
  })
})
