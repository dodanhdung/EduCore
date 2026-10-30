import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/schedule' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
const tenant = '00000000-0000-4000-8000-000000000001'
const session = '00000000-0000-4000-8000-000000000002'
const calls = []
let responseOverride = null
globalThis.fetch = async (url, options) => {
  if (responseOverride) return responseOverride(url, options)
  calls.push({ url, authorization: options.headers.Authorization })
  const body = url.includes('/capabilities')
    ? { scheduleCreate: false, scheduleConfirm: false, scheduleUpdate: false, scheduleCancel: false, roomManage: false, resourceManage: false }
    : url.includes('/calendar')
      ? { items: [{ id: session, classId: 'class', className: 'Real Class', teacherId: 'teacher', teacherName: 'Teacher',
        roomId: null, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 3600_000).toISOString(),
        status: 'CONFIRMED', revision: 2, seriesId: null, deliveryMode: 'ONLINE' }], page: 1, pageSize: 100, total: 1,
        timeZone: 'Asia/Ho_Chi_Minh' }
      : { items: [{ id: 'leave', participantId: 'participant', studentId: 'student', sessionId: session,
        reason: 'Family', submittedAt: new Date().toISOString(), late: false, status: 'PENDING_APPROVAL',
        canDecide: false, canApproveLate: false }], page: 1, pageSize: 100, total: 1, timeZone: 'Asia/Ho_Chi_Minh' }
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { SchedulingAttendanceProduction } = await vite.ssrLoadModule('/src/screens/Scheduling & Resources/SchedulingAttendanceProduction.tsx')
after(async () => { await vite.close(); dom.window.close() })

test('SC01 uses tenant-bound calendar data and hides create without capability', async () => {
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => { root.render(React.createElement(SchedulingAttendanceProduction,
      { id: 'SC01', tenantId: tenant, token: 'live-token', navigate() {} })); await new Promise((resolve) => setTimeout(resolve, 30)) })
    assert.match(document.body.textContent, /Real Class/)
    assert.ok(calls.some((call) => call.url.startsWith(`/api/v1/tenants/${tenant}/scheduling/calendar?`)))
    assert.ok(calls.every((call) => call.authorization === 'Bearer live-token'))
    assert.equal([...document.querySelectorAll('button')].some((button) => button.textContent === 'Tạo buổi học'), false)
  } finally { await act(async () => root.unmount()) }
})

test('AT04 scoped read never presents approval controls when canDecide is false', async () => {
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => { root.render(React.createElement(SchedulingAttendanceProduction,
      { id: 'AT04', tenantId: tenant, token: 'live-token', navigate() {} })); await new Promise((resolve) => setTimeout(resolve, 30)) })
    assert.match(document.body.textContent, /Family/)
    assert.ok(calls.some((call) => call.url.startsWith(`/api/v1/tenants/${tenant}/attendance/leaves?`)))
    assert.equal([...document.querySelectorAll('button')].some((button) => button.textContent === 'Duyệt'), false)
  } finally { await act(async () => root.unmount()) }
})

test('AT02 blocks finalization until changed marks are saved and confirmed by the server', async () => {
  const root = createRoot(document.getElementById('root'))
  const writes = []
  let persistedStatus = 'ATTENDED'
  let revision = 1
  let failFirstSave = true
  responseOverride = async (url, options) => {
    const path = String(url)
    const response = (body, status = 200) => new Response(JSON.stringify(body),
      { status, headers: { 'content-type': 'application/json' } })
    if (path.endsWith(`/attendance/sessions/${session}`) && options.method === 'GET') return response({
      sessionId: session, classId: 'class', startsAt: new Date(Date.now() - 3600000).toISOString(),
      endsAt: new Date(Date.now() + 3600_000).toISOString(), status: 'CONFIRMED',
      timeZone: 'Asia/Ho_Chi_Minh', finalized: false,
      participants: [{ id: 'participant', studentId: 'student', name: 'Learner', enrollmentId: 'enrollment',
        attendanceId: 'record', status: persistedStatus, revision, approvedLeave: false,
        billingSourceLocked: false, invoiceIssued: false }],
    })
    if (path.endsWith(`/attendance/sessions/${session}/marks`)) {
      writes.push('mark')
      if (failFirstSave) { failFirstSave = false; return response({ code: 'REVISION_STALE' }, 409) }
      persistedStatus = JSON.parse(options.body).status
      revision += 1
      return response({ id: 'record', revision }, 201)
    }
    if (path.endsWith(`/attendance/sessions/${session}/finalize`)) {
      writes.push('finalize')
      return response({ id: session }, 201)
    }
    throw Error(`Unexpected API call: ${path}`)
  }
  const button = (label) => [...document.querySelectorAll('button')].find((element) => element.textContent === label)
  try {
    await act(async () => { root.render(React.createElement(SchedulingAttendanceProduction,
      { id: 'AT02', tenantId: tenant, token: 'live-token', selectedId: session, navigate() {} }));
    await new Promise((resolve) => setTimeout(resolve, 30)) })
    assert.equal(button('Xác nhận đầy đủ').disabled, false)
    await act(async () => {
      const select = document.querySelector('select[aria-label="Điểm danh Learner"]')
      select.value = 'UNEXCUSED'
      select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
    })
    assert.equal(button('Xác nhận đầy đủ').disabled, true)
    await act(async () => { button('Lưu nháp').click(); await new Promise((resolve) => setTimeout(resolve, 30)) })
    assert.deepEqual(writes, ['mark'])
    assert.equal(button('Xác nhận đầy đủ').disabled, true)
    await act(async () => { button('Lưu nháp').click(); await new Promise((resolve) => setTimeout(resolve, 30)) })
    assert.deepEqual(writes, ['mark', 'mark'])
    assert.equal(button('Xác nhận đầy đủ').disabled, false)
    await act(async () => { button('Xác nhận đầy đủ').click(); await new Promise((resolve) => setTimeout(resolve, 30)) })
    assert.deepEqual(writes, ['mark', 'mark'])
    assert.ok(document.querySelector('dialog[open]'))
    await act(async () => { button('Xác nhận điểm danh').click(); await new Promise(resolve => setTimeout(resolve, 30)) })
    assert.deepEqual(writes, ['mark', 'mark', 'finalize'])
  } finally { await act(async () => root.unmount()); responseOverride = null }
})

const pause = () => new Promise(resolve => setTimeout(resolve, 35))
const findButton = label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)
const participant = (id = 'p1', status = 'ATTENDED') => ({ id, studentId: id, name: `Học viên ${id}`, enrollmentId: `e-${id}`, attendanceId: `a-${id}`, status, revision: 1, approvedLeave: false, billingSourceLocked: false, invoiceIssued: false })
const sheetValue = (patch = {}) => ({ sessionId: session, classId: 'class', startsAt: new Date(Date.now() - 4 * 86400000).toISOString(), endsAt: new Date(Date.now() - 4 * 86400000 + 3600000).toISOString(), status: 'CONFIRMED', timeZone: 'Asia/Ho_Chi_Minh', finalized: false, participants: [participant()], ...patch })
async function attendanceCase(handler, run, props = {}) {
  const root = createRoot(document.getElementById('root'))
  responseOverride = handler
  const render = async extra => { await act(async () => { root.render(React.createElement(SchedulingAttendanceProduction, { id: 'AT02', tenantId: tenant, token: 'token-a', selectedId: session, navigate() {}, ...props, ...extra })); await pause() }) }
  try { await render(); await run(render) } finally { await act(async () => root.unmount()); responseOverride = null }
}

test('AT02 future session stays read-only and EXCUSED requires approved leave', async () => {
  const writes = []
  await attendanceCase((url, options) => {
    if (options.method !== 'GET') writes.push(url)
    return Response.json(String(url).includes('/scheduling/') ? { className: 'Toán 8A' } : sheetValue({ startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString() }))
  }, async () => {
    assert.match(document.body.textContent, /chưa đủ điều kiện/)
    assert.ok(document.querySelector('select').disabled)
    assert.ok(document.querySelector('option[value="EXCUSED"]').disabled)
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.deepEqual(writes, [])
  })
})

test('AT02 token change and 401/403 remove the old roster and do not offer read retry', async () => {
  for (const status of [401, 403]) await attendanceCase((url, options) => options.headers.Authorization === 'Bearer token-a'
    ? Response.json(String(url).includes('/scheduling/') ? { className: 'Toán 8A' } : sheetValue())
    : Response.json({ code: 'DENIED' }, { status }), async render => {
    assert.match(document.body.textContent, /Học viên p1/)
    await render({ token: 'token-b' })
    assert.doesNotMatch(document.body.textContent, /Học viên p1/)
    assert.equal(document.querySelector('select'), null)
    assert.equal(findButton('Thử lại'), undefined)
  })
})

test('AT02 saves a batch sequentially, suppresses double click and reconciles partial failure', async () => {
  const rows = [participant('p1', null), participant('p2', null)]
  const writes = []
  let release
  await attendanceCase(async (url, options) => {
    if (String(url).includes('/scheduling/')) return Response.json({ className: 'Toán 8A' })
    if (String(url).endsWith('/marks')) {
      const body = JSON.parse(options.body); writes.push(body.participantId)
      if (body.participantId === 'p2') return Response.json({ code: 'REVISION_STALE' }, { status: 409 })
      await new Promise(resolve => { release = resolve })
      rows[0] = { ...rows[0], status: body.status, revision: 2 }
      return Response.json({ id: rows[0].attendanceId, revision: 2 })
    }
    return Response.json(sheetValue({ participants: rows }))
  }, async () => {
    await act(async () => { for (const s of document.querySelectorAll('select')) { s.value = 'ATTENDED'; s.dispatchEvent(new dom.window.Event('change', { bubbles: true })) } })
    await act(async () => { findButton('Lưu nháp').click(); findButton('Lưu nháp').click(); await pause() })
    assert.deepEqual(writes, ['p1'])
    await act(async () => { release(); await pause() })
    assert.deepEqual(writes, ['p1', 'p2'])
    assert.match(document.body.textContent, /1\/2/)
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.doesNotMatch(document.body.textContent, /Bản nháp đã lưu/)
  })
})

test('AT02 rechecks revisions before finalize and never posts when another actor changed a row', async () => {
  let reads = 0
  const writes = []
  await attendanceCase((url, options) => {
    if (String(url).includes('/scheduling/')) return Response.json({ className: 'Toán 8A' })
    if (options.method !== 'GET') writes.push(url)
    const value = sheetValue(); value.participants[0].revision = ++reads
    return Response.json(value)
  }, async () => {
    await act(async () => findButton('Xác nhận đầy đủ').click())
    assert.ok(document.querySelector('dialog[open]'))
    await act(async () => { findButton('Xác nhận điểm danh').click(); await pause() })
    assert.match(document.body.textContent, /đã thay đổi/)
    assert.deepEqual(writes, [])
  })
})

test('AT02 confirmed success reloads persisted result; billed rows cannot be edited', async () => {
  let finalized = false
  const writes = []
  await attendanceCase((url, options) => {
    if (String(url).includes('/scheduling/')) return Response.json({ className: 'Toán 8A' })
    if (String(url).endsWith('/finalize')) { finalized = true; writes.push(options); return Response.json({ id: session, status: 'FINALIZED' }) }
    return Response.json(sheetValue({ finalized }))
  }, async () => {
    await act(async () => findButton('Xác nhận đầy đủ').click())
    await act(async () => { findButton('Xác nhận điểm danh').click(); await pause() })
    assert.equal(writes.length, 1)
    assert.ok(writes[0].headers['Idempotency-Key'])
    assert.match(document.body.textContent, /Kết quả đã xác nhận trên máy chủ/)
    assert.equal(findButton('Xác nhận đầy đủ'), undefined)
  })
  await attendanceCase(() => Response.json(sheetValue({ participants: [{ ...participant(), billingSourceLocked: true }] })), async () => {
    assert.ok(document.querySelector('select').disabled)
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.match(document.body.textContent, /đã được tính phí/)
  })
})
