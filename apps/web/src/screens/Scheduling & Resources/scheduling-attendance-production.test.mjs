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
  const startsAt = new Date(Date.now() - 3600000).toISOString(), endsAt = new Date(Date.now() + 3600000).toISOString()
  responseOverride = async (url, options) => {
    const path = String(url)
    const response = (body, status = 200) => new Response(JSON.stringify(body),
      { status, headers: { 'content-type': 'application/json' } })
    if (path.endsWith(`/attendance/sessions/${session}`) && options.method === 'GET') return response({
      sessionId: session, classId: 'class', startsAt, endsAt, status: 'CONFIRMED',
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
const fixtureStartsAt = new Date(Date.now() - 4 * 86400000).toISOString(), fixtureEndsAt = new Date(Date.now() - 4 * 86400000 + 3600000).toISOString()
const sheetValue = (patch = {}) => ({ sessionId: session, classId: 'class', startsAt: fixtureStartsAt, endsAt: fixtureEndsAt, status: 'CONFIRMED', timeZone: 'Asia/Ho_Chi_Minh', finalized: false, participants: [participant()], ...patch })
async function attendanceCase(handler, run, props = {}) {
  const root = createRoot(document.getElementById('root'))
  responseOverride = handler
  const render = async extra => { await act(async () => { root.render(React.createElement(SchedulingAttendanceProduction, { id: 'AT02', tenantId: tenant, token: 'token-a', selectedId: session, navigate() {}, ...props, ...extra })); await pause() }) }
  try { await render(); await run(render) } finally { await act(async () => root.unmount()); responseOverride = null }
}

test('AT02 explicit view mode shows persisted results for future/past/finalized/cancelled without any write controls', async () => {
  const original = window.location.href
  window.history.replaceState(null, '', '/app/tenant/sessions/x/attendance?view=read&from=SC05')
  try { for (const patch of [{}, { startsAt: new Date(Date.now() + 86400000).toISOString() }, { finalized: true }, { status: 'CANCELLED' }]) {
    const writes = []
    await attendanceCase((url, options) => { if (options.method !== 'GET') writes.push(url); return Response.json(String(url).includes('/scheduling/') ? { className: 'Toán 8A' } : sheetValue(patch)) }, async () => {
      assert.match(document.body.textContent, /Chế độ xem/)
      assert.match(document.body.textContent, /Học viên p1|Có mặt/)
      assert.equal(document.querySelectorAll('select').length, 0)
      assert.equal(findButton('Lưu nháp'), undefined)
      assert.equal(findButton('Xác nhận đầy đủ'), undefined)
      assert.equal(findButton('Gửi điều chỉnh'), undefined)
      assert.deepEqual(writes, [])
    })
  } } finally { window.history.replaceState(null, '', original) }
})

test('AT02 returns to its real session/calendar in the current tenant, ignores arbitrary redirects and gates navigation', async () => {
  const original = window.location.href, paths = []
  window.history.replaceState(null, '', '/app/tenant/sessions/x/attendance?view=read&from=SC05&date=2026-11-03&mode=day&classId=class&returnTo=https://evil.test&tenantId=other')
  const handler = url => Response.json(String(url).includes('/scheduling/') ? { className: 'Toán 8A' } : sheetValue())
  try {
    await attendanceCase(handler, async () => {
      await act(async () => findButton('Về chi tiết buổi').click())
      const next = new URL(paths.at(-1), 'https://local.test')
      assert.equal(next.pathname, `/app/${tenant}/schedule/sessions/${session}`)
      assert.equal(next.searchParams.get('date'), '2026-11-03')
      assert.equal(next.searchParams.get('returnTo'), null)
      await act(async () => findButton('← Lịch trung tâm').click())
      assert.ok(paths.at(-1).startsWith(`/app/${tenant}/schedule?`))
      assert.ok(paths.every(p => !p.includes('evil') && !p.includes('/app/other/')))
    }, { allowed: ['SC05', 'SC01', 'AC08'], navigate: p => paths.push(p) })
    await attendanceCase(handler, async () => {
      assert.equal(findButton('Về chi tiết buổi'), undefined)
      assert.equal(findButton('Về danh sách'), undefined)
      assert.equal(findButton('← Lịch trung tâm'), undefined)
      assert.equal(findButton('← Chi tiết lớp học'), undefined)
    }, { allowed: [] })
  } finally { window.history.replaceState(null, '', original) }
})

test('AT01 opens its selected session read-only and retains an explicitly chosen month', async () => {
  const original = window.location.href, paths = [], urls = []
  window.history.replaceState(null, '', '/app/tenant/attendance?month=2026-09')
  const handler = url => { urls.push(String(url)); return Response.json({ items: [{ id: 'non-first-session', classId: 'class', className: 'Lớp tháng 9', startsAt: '2026-09-10T10:00:00Z', teacherName: 'Cô Mai', expectedCount: 1, finalized: false }], total: 1, timeZone: 'Asia/Ho_Chi_Minh' }) }
  try {
    await attendanceCase(handler, async () => {
      assert.equal(document.querySelector('input[type=month]').value, '2026-09')
      await act(async () => findButton('Mở bảng điểm danh').click())
      const next = new URL(paths.at(-1), 'https://local.test')
      assert.equal(next.pathname, `/app/${tenant}/sessions/non-first-session/attendance`)
      assert.equal(next.searchParams.get('month'), '2026-09')
      assert.equal(next.searchParams.get('view'), 'read')
      assert.equal(next.searchParams.get('from'), 'AT01')
      assert.ok(urls.every(u => !u.includes('2026-11')))
    }, { id: 'AT01', selectedId: undefined, allowed: ['AT02'], navigate: p => paths.push(p) })
    await attendanceCase(handler, async () => assert.equal(findButton('Mở bảng điểm danh'), undefined), { id: 'AT01', selectedId: undefined, allowed: [] })
  } finally { window.history.replaceState(null, '', original) }
})

test('AT02 warns before discarding unsaved marks through its return navigation and never writes on leave', async () => {
  const original = window.location.href, paths = [], writes = [], oldConfirm = window.confirm
  window.history.replaceState(null, '', '/app/tenant/sessions/x/attendance')
  try { await attendanceCase((url, options) => { if (options.method !== 'GET') writes.push(url); return Response.json(String(url).includes('/scheduling/') ? { className: 'Toán 8A' } : sheetValue()) }, async () => {
    await act(async () => { const select = document.querySelector('select'); select.value = 'UNEXCUSED'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
    window.confirm = () => false
    await act(async () => findButton('Về danh sách').click())
    assert.deepEqual(paths, [])
    window.confirm = () => true
    await act(async () => findButton('Về danh sách').click())
    assert.deepEqual(paths, [`/app/${tenant}/attendance`])
    assert.deepEqual(writes, [])
  }, { allowed: ['AT01'], navigate: p => paths.push(p) }) } finally { window.confirm = oldConfirm; window.history.replaceState(null, '', original) }
})

test('AT02 handles missing/error sheets and isolates a deferred old-tenant response', async () => {
  for (const status of [404, 500]) await attendanceCase(() => Response.json({ code: 'FAILED' }, { status }), async () => {
    assert.ok(document.querySelector('[role=alert]'))
    assert.equal(document.querySelectorAll('tbody tr').length, 0)
    assert.equal(findButton('Xác nhận đầy đủ'), undefined)
    assert.equal(Boolean(findButton('Thử lại')), status === 500)
  })
  let oldReply
  await attendanceCase(url => String(url).includes('/scheduling/') ? Response.json({ className: 'Lớp tenant mới' }) : String(url).includes(`/tenants/${tenant}/`) ? new Promise(resolve => { oldReply = resolve }) : Response.json(sheetValue({ participants: [participant('new-tenant')] })), async render => {
    assert.match(document.body.textContent, /Đang tải/)
    await render({ tenantId: 'tenant-new', token: 'new-token' })
    assert.match(document.body.textContent, /Học viên new-tenant/)
    await act(async () => { oldReply(Response.json(sheetValue({ participants: [participant('old-tenant')] }))); await pause() })
    assert.doesNotMatch(document.body.textContent, /Học viên old-tenant/)
  })
})

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

async function chooseStatus(id, value = 'ATTENDED') {
  await act(async () => {
    const select = document.querySelector(`select[aria-label="Điểm danh Học viên ${id}"]`)
    select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
}
const ok = body => Response.json(body)
const classReply = url => String(url).includes('/scheduling/')

test('AT02 saves a partial draft without marking the remaining roster or allowing finalize', async () => {
  const rows = [participant('p1', null), participant('p2', null)], writes = []
  await attendanceCase((url, options) => {
    if (classReply(url)) return ok({ className: 'Toán 8A' })
    if (String(url).endsWith('/marks')) {
      const body = JSON.parse(options.body); writes.push(body)
      rows[0] = { ...rows[0], status: body.status, revision: 2 }
      return ok({ id: rows[0].attendanceId, status: body.status, revision: 2 })
    }
    return ok(sheetValue({ participants: rows }))
  }, async () => {
    await chooseStatus('p1')
    assert.equal(findButton('Lưu nháp').disabled, false)
    await act(async () => { findButton('Lưu nháp').click(); await pause() })
    assert.deepEqual(writes.map(b => [b.participantId, b.revision, b.status]), [['p1', 1, 'ATTENDED']])
    assert.match(document.body.textContent, /Đã lưu và đọc lại 1\/1 thay đổi/)
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.equal(document.querySelectorAll('select')[1].value, '')
  })
})

test('AT02 preserves choices when acknowledged MARK is absent or has a different revision on readback', async () => {
  for (const patch of [{ status: null, revision: 1 }, { status: 'ATTENDED', revision: 3 }]) {
    let saved = false
    await attendanceCase((url, options) => {
      if (classReply(url)) return ok({ className: 'Toán 8A' })
      if (options.method === 'POST') { saved = true; return ok({ id: 'a-p1', revision: 2, status: 'ATTENDED' }) }
      return ok(sheetValue({ participants: [{ ...participant('p1', null), ...(saved ? patch : {}) }] }))
    }, async () => {
      await chooseStatus('p1')
      await act(async () => { findButton('Lưu nháp').click(); await pause() })
      assert.ok(document.querySelector('[role=alert]'))
      assert.doesNotMatch(document.body.textContent, /Bản nháp đã lưu|Đã lưu và đọc lại 1\/1/)
      assert.equal(document.querySelector('select').value, 'ATTENDED')
      assert.ok(findButton('Xác nhận đầy đủ').disabled)
    })
  }
})

test('AT02 explains partial success, retains failed choice, and retry sends only the unresolved mark', async () => {
  const rows = [participant('p1', null), participant('p2', null)], writes = []
  let failed = false
  await attendanceCase((url, options) => {
    if (classReply(url)) return ok({ className: 'Toán 8A' })
    if (String(url).endsWith('/marks')) {
      const body = JSON.parse(options.body); writes.push(body)
      if (body.participantId === 'p2' && !failed) { failed = true; return Response.json({ code: 'CONFLICT' }, { status: 409 }) }
      const i = rows.findIndex(p => p.id === body.participantId)
      rows[i] = { ...rows[i], status: body.status, revision: 2 }
      return ok({ id: rows[i].attendanceId, revision: 2 })
    }
    return ok(sheetValue({ participants: rows }))
  }, async () => {
    await chooseStatus('p1'); await chooseStatus('p2')
    await act(async () => { findButton('Lưu nháp').click(); await pause() })
    assert.match(document.body.textContent, /Đã đọc lại 1\/2 thay đổi dự kiến/)
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.equal(document.querySelectorAll('select')[1].value, 'ATTENDED')
    await act(async () => { findButton('Lưu nháp').click(); await pause() })
    assert.deepEqual(writes.map(b => b.participantId), ['p1', 'p2', 'p2'])
    assert.ok(writes.every(b => b.revision === 1))
    assert.equal(findButton('Xác nhận đầy đủ').disabled, false)
  })
})

test('AT02 stops immediately on MARK 401/403/404 without reloading or revealing the old roster', async () => {
  for (const status of [401, 403, 404]) {
    const operations = []
    await attendanceCase((url, options) => {
      if (classReply(url)) return ok({ className: 'Toán 8A' })
      operations.push(options.method)
      if (options.method === 'POST') return Response.json({ code: 'DENIED' }, { status })
      return ok(sheetValue({ participants: [participant('p1', null), participant('p2', null)] }))
    }, async () => {
      await chooseStatus('p1'); await chooseStatus('p2')
      await act(async () => { findButton('Lưu nháp').click(); await pause() })
      assert.deepEqual(operations, ['GET', 'POST'])
      assert.doesNotMatch(document.body.textContent, /Học viên p1|Học viên p2/)
      assert.equal(findButton('Lưu nháp'), undefined)
    })
  }
})

test('AT02 requires a successful read after lost MARK response/read failure before another write', async () => {
  let wrote = false, reads = 0
  const writes = []
  await attendanceCase((url, options) => {
    if (classReply(url)) return ok({ className: 'Toán 8A' })
    if (options.method === 'POST') { writes.push(options); wrote = true; throw new TypeError('Connection lost') }
    reads++
    if (wrote && reads === 2) throw new DOMException('Timed out', 'TimeoutError')
    return ok(sheetValue({ participants: [participant('p1', wrote ? 'ATTENDED' : null)] }))
  }, async () => {
    await chooseStatus('p1')
    await act(async () => { findButton('Lưu nháp').click(); await pause() })
    assert.equal(writes.length, 1)
    assert.ok(findButton('Lưu nháp').disabled)
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.ok(findButton('Đọc lại kết quả'))
    await act(async () => { findButton('Đọc lại kết quả').click(); await pause() })
    assert.equal(reads, 3)
    assert.equal(writes.length, 1)
    assert.equal(findButton('Xác nhận đầy đủ').disabled, false)
  })
})

test('AT02 does not claim FINALIZE success from an ACK when the persisted sheet is still unfinalized', async () => {
  const writes = []
  await attendanceCase((url, options) => {
    if (classReply(url)) return ok({ className: 'Toán 8A' })
    if (options.method === 'POST') { writes.push(url); return ok({ id: 'finalization', status: 'FINALIZED' }) }
    return ok(sheetValue())
  }, async () => {
    await act(async () => findButton('Xác nhận đầy đủ').click())
    await act(async () => { findButton('Xác nhận điểm danh').click(); await pause() })
    assert.equal(writes.length, 1)
    assert.doesNotMatch(document.body.textContent, /Đã lưu trên máy chủ\.|Kết quả đã xác nhận trên máy chủ/)
    assert.ok(document.querySelector('[role=alert]'))
    assert.ok(findButton('Xác nhận đầy đủ').disabled)
    assert.ok(findButton('Đọc lại kết quả'))
  })
})

test('AT02 rechecks session state, roster, approved leave and billing locks immediately before finalize', async () => {
  for (const patch of [
    { status: 'CANCELLED' }, { participants: [] },
    { participants: [{ ...participant(), billingSourceLocked: true }] },
    { participants: [participant(), participant('p2', null)] },
    { participants: [{ ...participant(), approvedLeave: true }] },
  ]) {
    let reads = 0; const writes = []
    await attendanceCase((url, options) => {
      if (classReply(url)) return ok({ className: 'Toán 8A' })
      if (options.method !== 'GET') writes.push(url)
      return ok(sheetValue(++reads > 1 ? patch : {}))
    }, async () => {
      await act(async () => findButton('Xác nhận đầy đủ').click())
      await act(async () => { findButton('Xác nhận điểm danh').click(); await pause() })
      assert.deepEqual(writes, [])
      assert.ok(document.querySelector('[role=alert]'))
    })
  }
})

test('AT02 finalized/cancelled/empty/missing-result sheets cannot finalize and invalid EXCUSED never reaches MARK', async () => {
  for (const patch of [{ finalized: true }, { status: 'CANCELLED' }, { participants: [] }, { participants: [participant('p1', null)] }]) {
    const writes = []
    await attendanceCase((url, options) => {
      if (options.method !== 'GET') writes.push(url)
      return ok(classReply(url) ? { className: 'Toán 8A' } : sheetValue(patch))
    }, async () => {
      assert.ok(!findButton('Xác nhận đầy đủ') || findButton('Xác nhận đầy đủ').disabled)
      assert.deepEqual(writes, [])
    })
  }
  const writes = []
  await attendanceCase((url, options) => {
    if (options.method !== 'GET') writes.push(url)
    return ok(classReply(url) ? { className: 'Toán 8A' } : sheetValue({ participants: [participant('p1', null)] }))
  }, async () => {
    await chooseStatus('p1', 'EXCUSED')
    await act(async () => { findButton('Lưu nháp').click(); await pause() })
    assert.deepEqual(writes, [])
    assert.match(document.querySelector('[role=alert]').textContent, /đơn nghỉ đã duyệt/)
  })
})

test('AT02 reconciles failed or lost FINALIZE responses, suppresses duplicates and never retries the command automatically', async () => {
  for (const failure of [409, 422, 500, 'connection', 'timeout']) {
    let finalized = false, release; const writes = []
    await attendanceCase(async (url, options) => {
      if (classReply(url)) return ok({ className: 'Toán 8A' })
      if (options.method === 'POST') {
        writes.push(options)
        await new Promise(resolve => { release = resolve })
        if (failure === 'connection' || failure === 'timeout') { finalized = true; throw failure === 'timeout' ? new DOMException('Timeout', 'TimeoutError') : new TypeError('Offline') }
        return Response.json({ code: 'FAILED' }, { status: failure })
      }
      return ok(sheetValue({ finalized }))
    }, async () => {
      await act(async () => findButton('Xác nhận đầy đủ').click())
      await act(async () => { const confirm = findButton('Xác nhận điểm danh'); confirm.click(); confirm.click(); await pause() })
      assert.equal(writes.length, 1)
      await act(async () => { release(); await pause() })
      assert.ok(writes[0].headers['Idempotency-Key'])
      assert.ok(document.querySelector('[role=alert]'))
      if (finalized) {
        assert.match(document.body.textContent, /Kết quả đã xác nhận trên máy chủ/)
        assert.equal(findButton('Xác nhận đầy đủ'), undefined)
      } else {
        assert.ok(findButton('Xác nhận đầy đủ').disabled)
        assert.ok(findButton('Đọc lại kết quả'))
      }
      assert.equal(writes.length, 1)
    })
  }
})

test('AT02 rejects finalize 401/403/404 without reading the denied roster again', async () => {
  for (const status of [401, 403, 404]) {
    const ops = []
    await attendanceCase((url, options) => {
      if (classReply(url)) return ok({ className: 'Toán 8A' })
      ops.push(options.method)
      return options.method === 'POST' ? Response.json({ code: 'DENIED' }, { status }) : ok(sheetValue())
    }, async () => {
      await act(async () => findButton('Xác nhận đầy đủ').click())
      await act(async () => { findButton('Xác nhận điểm danh').click(); await pause() })
      assert.deepEqual(ops, ['GET', 'GET', 'POST'])
      assert.doesNotMatch(document.body.textContent, /Học viên p1/)
      assert.equal(findButton('Xác nhận đầy đủ'), undefined)
    })
  }
})

test('AT02 ignores an in-flight old-session MARK after navigation and does not send its remaining marks', async () => {
  let release; const writes = [], oldReads = []
  await attendanceCase(async (url, options) => {
    if (classReply(url)) return ok({ className: 'Toán 8A' })
    if (options.method === 'POST') {
      writes.push(JSON.parse(options.body).participantId)
      await new Promise(resolve => { release = resolve })
      return ok({ id: 'a-p1', revision: 2 })
    }
    if (String(url).endsWith('/new-session')) return ok(sheetValue({ sessionId: 'new-session', participants: [participant('new')] }))
    oldReads.push(url); return ok(sheetValue({ participants: [participant('p1', null), participant('p2', null)] }))
  }, async render => {
    await chooseStatus('p1'); await chooseStatus('p2')
    await act(async () => { findButton('Lưu nháp').click(); await pause() })
    await render({ selectedId: 'new-session' })
    await act(async () => { release(); await pause() })
    assert.deepEqual(writes, ['p1'])
    assert.equal(oldReads.length, 1)
    assert.match(document.body.textContent, /Học viên new/)
    assert.doesNotMatch(document.body.textContent, /Học viên p1|Đã lưu và đọc lại/)
  })
})

test('AT02 same-session query navigation applies read-only mode and clears the editable draft', async () => {
  const original = window.location.href, writes = []
  window.history.replaceState(null, '', '/app/tenant/sessions/x/attendance')
  try {
    await attendanceCase((url, options) => {
      if (options.method !== 'GET') writes.push(url)
      return ok(classReply(url) ? { className: 'Toán 8A' } : sheetValue())
    }, async () => {
      await chooseStatus('p1', 'UNEXCUSED')
      await act(async () => {
        window.history.replaceState(null, '', '/app/tenant/sessions/x/attendance?view=read&from=SC05')
        window.dispatchEvent(new dom.window.PopStateEvent('popstate'))
        await pause()
      })
      assert.match(document.body.textContent, /Chế độ xem/)
      assert.equal(document.querySelector('select'), null)
      assert.equal(findButton('Lưu nháp'), undefined)
      assert.equal(findButton('Xác nhận đầy đủ'), undefined)
      assert.match(document.body.textContent, /Có mặt/)
      assert.deepEqual(writes, [])
    })
  } finally { window.history.replaceState(null, '', original) }
})
