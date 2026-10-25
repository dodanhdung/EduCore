import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/schedule' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
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
      sessionId: session, classId: 'class', startsAt: new Date().toISOString(),
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
    assert.deepEqual(writes, ['mark', 'mark', 'finalize'])
  } finally { await act(async () => root.unmount()); responseOverride = null }
})
