import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/app/tenant/parent' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const originalFetch = globalThis.fetch
let handler = async () => { throw Error('UNEXPECTED_REQUEST') }
globalThis.fetch = (...args) => handler(...args)
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { PortalProduction } = await vite.ssrLoadModule('/src/screens/Role Portals/PortalProduction.tsx')
const { MyBillingScreen } = await vite.ssrLoadModule('/src/screens/Role Portals/PO05/MyBillingScreen.tsx')
const { DashboardProduction } = await vite.ssrLoadModule('/src/screens/Management & Operations/G01/DashboardProduction.tsx')
after(async () => { globalThis.fetch = originalFetch; await vite.close(); dom.window.close() })
const context = { tenantId: 'tenant', tenantName: 'Center', timeZone: 'Asia/Ho_Chi_Minh',
  asOf: '2026-10-26T00:00:00Z', teacher: null, student: null,
  children: [{ id: 'child-a', name: 'Child Alpha' }, { id: 'child-b', name: 'Child Beta' }] }
const child = (id, name) => ({ id, name, timeZone: context.timeZone, asOf: context.asOf,
  scheduleAvailable: true, assignmentsAvailable: true, gradesAvailable: true, leaveAvailable: true,
  classes: [{ id: `class-${id}`, name: `Class ${name}` }], sessions: [], assignments: [], leaves: [] })
const billing = (id, amount) => ({ id, name: id, timeZone: context.timeZone, asOf: context.asOf,
  status: 'PARTIAL', wallet: null, invoiceCount: 1, invoiceLimit: 20,
  invoices: [{ id: `invoice-${id}`, number: `INV-${id}`, dueAt: '2026-11-01T00:00:00Z',
    netObligationVnd: amount, allocatedVnd: '0', outstandingVnd: amount }],
  totals: { netObligationVnd: amount, allocatedVnd: '0', outstandingVnd: amount } })
const respond = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } })
const deny = (status) => new Response(JSON.stringify({ code: status === 401 ? 'AUTH_REQUIRED' : 'FORBIDDEN' }),
  { status, headers: { 'content-type': 'application/json' } })
const page = (items = []) => ({ items, total: items.length, asOf: context.asOf })
const session = (teacherId = 'teacher', className = 'Class One') => ({
  id: 'session-1', classId: 'class-1', className, teacherId, roomId: null,
  deliveryMode: 'OFFLINE', startsAt: '2026-10-26T04:00:00Z', endsAt: '2026-10-26T05:00:00Z', status: 'CONFIRMED',
})
const tick = async () => act(async () => { await new Promise(resolve => setTimeout(resolve, 15)) })
const root = createRoot(document.getElementById('root'))
const props = (id, selectedId) => ({ id, selectedId, tenantId: 'tenant', token: 'token', viewerId: 'viewer',
  allowed: ['PO03', 'PO04', 'PO05'], navigate: () => undefined })

test('PO04 ignores a late response for a previously selected child', async () => {
  let resolveA
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond(context)
    if (url.endsWith('/portal/children/child-a')) return new Promise(resolve => { resolveA = resolve })
    if (url.endsWith('/portal/children/child-b')) return respond(child('child-b', 'Beta'))
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO04', 'child-a'))))
  await tick()
  assert.equal(typeof resolveA, 'function')
  await act(async () => root.render(React.createElement(PortalProduction, props('PO04', 'child-b'))))
  await tick()
  assert.match(document.body.textContent, /Child Beta/)
  await act(async () => resolveA(respond(child('child-a', 'Alpha'))))
  await tick()
  assert.match(document.body.textContent, /Child Beta/)
  assert.doesNotMatch(document.body.textContent, /Class Alpha/)
  await act(async () => root.render(null))
})

test('PO03 clears the previous child before loading the new scoped read', async () => {
  let resolveB
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond(context)
    if (url.endsWith('/portal/children/child-a')) return respond(child('child-a', 'Alpha'))
    if (url.endsWith('/portal/billing/child-a')) return respond(billing('child-a', '1234567890123456'))
    if (url.endsWith('/portal/children/child-b')) return new Promise(resolve => { resolveB = resolve })
    if (url.endsWith('/portal/billing/child-b')) return respond(billing('child-b', '42'))
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO03'))))
  await tick()
  assert.match(document.body.textContent, /Child Alpha.*1\.234\.567\.890\.123\.456/)
  const select = document.querySelector('select')
  await act(async () => { select.value = 'child-b'; select.dispatchEvent(new window.Event('change', { bubbles: true })) })
  assert.doesNotMatch(document.body.textContent, /1\.234\.567\.890\.123\.456/)
  await tick()
  await act(async () => resolveB(respond(child('child-b', 'Beta'))))
  await tick()
  assert.match(document.body.textContent, /Child Beta.*42/)
  assert.doesNotMatch(document.body.textContent, /1\.234\.567\.890\.123\.456/)
  await act(async () => root.render(null))
})

test('PO05 renders exact large VND totals and unavailable wallet separately', () => {
  const html = renderToStaticMarkup(React.createElement(MyBillingScreen, { mode: 'unresolved',
    live: { context, billing: billing('child-a', '9007199254740993'), selectedId: 'child-a', onSelectChild: () => undefined } }))
  assert.match(html, /9\.007\.199\.254\.740\.993/)
  assert.match(html, /Chưa có hợp đồng đọc ví/)
  assert.doesNotMatch(html, /Nạp ví|Thanh toán ngay/)
})

test('G01 drops prior tenant KPIs and distinguishes unavailable from measured zero', async () => {
  let resolveNewTenant
  handler = async (url) => {
    if (url.includes('/tenants/tenant-a/portal/overview')) return respond({
      tenantId: 'tenant-a', tenantName: 'First center', timeZone: 'Asia/Ho_Chi_Minh',
      asOf: context.asOf, scope: 'Effective grants', students: 99, classes: 4, outstandingVnd: '1234',
    })
    if (url.includes('/tenants/tenant-b/portal/overview')) return new Promise(resolve => { resolveNewTenant = resolve })
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(DashboardProduction, { tenantId: 'tenant-a', token: 'first' })))
  await tick()
  assert.match(document.body.textContent, /First center.*99/)
  await act(async () => root.render(React.createElement(DashboardProduction, { tenantId: 'tenant-b', token: 'second' })))
  assert.doesNotMatch(document.body.textContent, /First center|1234/)
  await tick()
  await act(async () => resolveNewTenant(respond({
    tenantId: 'tenant-b', tenantName: 'Second center', timeZone: 'Asia/Ho_Chi_Minh',
    asOf: context.asOf, scope: 'Effective grants', students: null, classes: 0, outstandingVnd: null,
  })))
  await tick()
  assert.match(document.body.textContent, /Second center/)
  assert.match(document.body.textContent, /Chưa có quyền xem/)
  assert.match(document.body.textContent, /0/)
  assert.doesNotMatch(document.body.textContent, /First center|1234/)
  await act(async () => root.render(null))
})

test('PO01 keeps sessions when grading is forbidden and attendance has a network error', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, teacher: { id: 'teacher', name: 'Teacher One' }, children: [] })
    if (url.endsWith('/portal/teacher-sessions')) return respond(page([session()]))
    if (url.includes('/attendance/due')) throw Error('OFFLINE')
    if (url.endsWith('/teaching/assignments')) return respond([])
    if (url.endsWith('/teaching/assignment-classes')) return respond({ classes: [] })
    if (url.endsWith('/grading/queue')) return deny(403)
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO01'))))
  await tick()
  assert.match(document.body.textContent, /Class One/)
  assert.match(document.body.textContent, /Không thể tải điểm danh/)
  assert.match(document.body.textContent, /Chưa có quyền xem hàng chờ chấm/)
  const kpis = [...document.querySelectorAll('.portal-kpi')]
  assert.doesNotMatch(kpis[1].textContent, /\b0\b/)
  assert.doesNotMatch(kpis[2].textContent, /\b0\b/)
  await act(async () => root.render(null))
})

test('R10 PO01 never presents a paginated fragment as complete KPI totals', async () => {
  handler = async url => {
    if (url.endsWith('/portal/context')) return respond({ ...context, teacher: { id: 'teacher', name: 'Teacher One' }, children: [] })
    if (url.endsWith('/portal/teacher-sessions')) return respond({ ...page([session()]), total: 101 })
    if (url.includes('/attendance/due')) return respond(page([]))
    if (url.endsWith('/teaching/assignments')) return respond([])
    if (url.endsWith('/teaching/assignment-classes')) return respond({ classes: [] })
    if (url.endsWith('/grading/queue')) return respond({ ...page([]), total: 200 })
    throw Error(`Unexpected ${url}`)
  }
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(React.createElement(PortalProduction, props('PO01'))))
    assert.deepEqual([...document.querySelectorAll('.portal-kpi strong')].map(n => n.textContent), ['Chưa đủ dữ liệu', 'Chưa đủ dữ liệu', 'Chưa đủ dữ liệu'])
    assert.match(document.body.textContent, /Danh sách đang giới hạn/)
    assert.doesNotMatch(document.body.textContent, /Không có bài nộp đang chờ chấm/)
  } finally { await act(async () => root.unmount()) }
})

test('PO01 teaching summary denial does not hide authorized grading work', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, teacher: { id: 'teacher', name: 'Teacher One' }, children: [] })
    if (url.endsWith('/portal/teacher-sessions')) return respond(page([session()]))
    if (url.includes('/attendance/due')) return respond(page())
    if (url.endsWith('/teaching/assignments')) return deny(403)
    if (url.endsWith('/teaching/assignment-classes')) return respond({ classes: [] })
    if (url.endsWith('/grading/queue')) return respond(page([{ submissionId: 'submission-1', assignmentId: 'assignment-1',
      studentId: 'student-1', gradeStatus: null, versionNo: 1, submittedAt: context.asOf }]))
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO01'))))
  await tick()
  assert.match(document.body.textContent, /Class One/)
  assert.match(document.body.textContent, /Chưa có quyền xem bài tập/)
  assert.match(document.body.textContent, /1 bài nộp đang chờ chấm/)
  assert.doesNotMatch(document.body.textContent, /0 bản nháp/)
  await act(async () => root.render(null))
})

test('PO02 keeps schedule when notifications are forbidden and assignments fail', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, student: { id: 'student', name: 'Student One' }, children: [] })
    if (url.endsWith('/portal/student-sessions')) return respond(page([session('teacher', 'Student Class')]))
    if (url.endsWith('/my/assignments')) throw Error('OFFLINE')
    if (url.includes('/notifications?')) return deny(403)
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO02'))))
  await tick()
  assert.match(document.body.textContent, /Student Class/)
  assert.match(document.body.textContent, /Không thể tải bài tập/)
  assert.match(document.body.textContent, /Chưa có quyền xem thông báo/)
  assert.doesNotMatch(document.body.textContent, /Hiện chưa có bài tập sắp hạn|Chưa có thông báo/)
  await act(async () => root.render(null))
})

test('PO02 successful empty sections remain true empty states', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, student: { id: 'student', name: 'Student One' }, children: [] })
    if (url.endsWith('/portal/student-sessions')) return respond(page())
    if (url.endsWith('/my/assignments')) return respond({ items: [] })
    if (url.includes('/notifications?')) return respond(page())
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO02'))))
  await tick()
  assert.match(document.body.textContent, /Chưa có buổi học sắp tới/)
  assert.match(document.body.textContent, /Hiện chưa có bài tập sắp hạn/)
  assert.match(document.body.textContent, /Chưa có thông báo/)
  await act(async () => root.render(null))
})

test('PO02 schedule denial leaves authorized assignment summary visible', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, student: { id: 'student', name: 'Student One' }, children: [] })
    if (url.endsWith('/portal/student-sessions')) return deny(403)
    if (url.endsWith('/my/assignments')) return respond({ items: [{ id: 'assignment-1', title: 'Homework One',
      description: '', className: 'Class One', deadlineAt: '2026-10-30T00:00:00Z', priority: 1,
      status: 'PUBLISHED', submissionId: null, versionNo: null, score: null, feedback: null, submittedAt: null }] })
    if (url.includes('/notifications?')) return respond(page())
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO02'))))
  await tick()
  assert.match(document.body.textContent, /Chưa có quyền xem lịch học/)
  assert.match(document.body.textContent, /Homework One/)
  assert.doesNotMatch(document.body.textContent, /Chưa có buổi học sắp tới/)
  await act(async () => root.render(null))
})

test('PO02 a session-invalid optional response fails the page closed', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, student: { id: 'student', name: 'Student One' }, children: [] })
    if (url.endsWith('/portal/student-sessions')) return respond(page([session('teacher', 'Private Class')]))
    if (url.endsWith('/my/assignments')) return respond({ items: [] })
    if (url.includes('/notifications?')) return deny(401)
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO02'))))
  await tick()
  assert.match(document.body.textContent, /Phiên đăng nhập đã hết hạn/)
  assert.doesNotMatch(document.body.textContent, /Private Class/)
  await act(async () => root.render(null))
})

test('PO01 a 401 in one teaching read is not masked by another optional 403', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond({ ...context, teacher: { id: 'teacher', name: 'Teacher One' }, children: [] })
    if (url.endsWith('/portal/teacher-sessions')) return respond(page([session()]))
    if (url.includes('/attendance/due')) return deny(403)
    if (url.endsWith('/teaching/assignments')) return deny(403)
    if (url.endsWith('/teaching/assignment-classes')) return deny(401)
    if (url.endsWith('/grading/queue')) return respond(page())
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO01'))))
  await tick()
  assert.match(document.body.textContent, /Phiên đăng nhập đã hết hạn/)
  assert.doesNotMatch(document.body.textContent, /Class One/)
  await act(async () => root.render(null))
})

test('PO02 old optional response cannot restore previous tenant data', async () => {
  let resolveOld
  handler = async (url) => {
    if (url.includes('/tenants/tenant-a/portal/context')) return respond({ ...context,
      tenantId: 'tenant-a', student: { id: 'student-a', name: 'Student A' }, children: [] })
    if (url.includes('/tenants/tenant-b/portal/context')) return respond({ ...context,
      tenantId: 'tenant-b', student: { id: 'student-b', name: 'Student B' }, children: [] })
    if (url.includes('/tenants/tenant-a/portal/student-sessions')) return new Promise(resolve => { resolveOld = resolve })
    if (url.includes('/tenants/tenant-b/portal/student-sessions')) return respond(page([session('teacher', 'New Tenant Class')]))
    if (url.endsWith('/my/assignments')) return respond({ items: [] })
    if (url.includes('/notifications?')) return respond(page())
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction,
    { ...props('PO02'), tenantId: 'tenant-a', token: 'old' })))
  await tick()
  assert.equal(typeof resolveOld, 'function')
  await act(async () => root.render(React.createElement(PortalProduction,
    { ...props('PO02'), tenantId: 'tenant-b', token: 'new' })))
  await tick()
  assert.match(document.body.textContent, /New Tenant Class/)
  await act(async () => resolveOld(respond(page([session('teacher', 'Old Tenant Class')]))))
  await tick()
  assert.doesNotMatch(document.body.textContent, /Old Tenant Class|Student A/)
  await act(async () => root.render(null))
})

test('PO03 keeps child learning when the independent billing summary fails', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond(context)
    if (url.endsWith('/portal/children/child-a')) return respond(child('child-a', 'Alpha'))
    if (url.endsWith('/portal/billing/child-a')) throw Error('OFFLINE')
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO03'))))
  await tick()
  assert.match(document.body.textContent, /Child Alpha/)
  assert.match(document.body.textContent, /Không thể tải công nợ/)
  assert.doesNotMatch(document.body.textContent, /Không thể tải dữ liệu/)
  await act(async () => root.render(null))
})

test('PO03 denies previously loaded child data when the billing read reports revoked access', async () => {
  handler = async (url) => {
    if (url.endsWith('/portal/context')) return respond(context)
    if (url.endsWith('/portal/children/child-a')) return respond(child('child-a', 'Alpha'))
    if (url.endsWith('/portal/billing/child-a')) return deny(404)
    throw Error(url)
  }
  await act(async () => root.render(React.createElement(PortalProduction, props('PO03'))))
  await tick()
  assert.match(document.body.textContent, /Không tìm thấy nội dung yêu cầu/)
  assert.doesNotMatch(document.body.textContent, /Class Alpha|Child Alpha/)
  await act(async () => root.render(null))
})

test('PO05 reports displayed invoice count and uses authoritative totals', () => {
  const invoices = Array.from({ length: 20 }, (_, index) => ({
    id: `invoice-${index}`, number: `INV-${index}`, dueAt: null,
    netObligationVnd: '1', allocatedVnd: '0', outstandingVnd: '1',
  }))
  const limited = { ...billing('child-a', '1'), invoiceCount: 25, invoices,
    totals: { netObligationVnd: '9007199254740993', allocatedVnd: '0', outstandingVnd: '9007199254740993' } }
  const view = value => renderToStaticMarkup(React.createElement(MyBillingScreen, { mode: 'unresolved',
    live: { context, billing: value, selectedId: 'child-a', onSelectChild: () => undefined } }))
  const truncated = view(limited)
  assert.match(truncated, /Đang hiển thị 20\/25 hóa đơn đã phát hành/)
  assert.match(truncated, /9\.007\.199\.254\.740\.993/)
  assert.doesNotMatch(view({ ...limited, invoiceCount: 20 }), /Đang hiển thị/)
  assert.match(view({ ...limited, invoiceCount: 0, invoices: [],
    totals: { netObligationVnd: '0', allocatedVnd: '0', outstandingVnd: '0' } }), /Chưa có hóa đơn đã phát hành/)
  const unavailable = view({ ...limited, status: 'UNAVAILABLE', invoices: null, totals: undefined })
  assert.doesNotMatch(unavailable, /INV-0|20\/25|9\.007\.199\.254\.740\.993/)
})
