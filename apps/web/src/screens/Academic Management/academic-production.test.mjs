import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.HTMLElement = dom.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const requests = []
let respond = () => Response.json({})
globalThis.fetch = async (url, options) => { requests.push({ url: String(url), options }); return respond(String(url), options) }
const { createRoot } = await import('react-dom/client')
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { AcademicProduction } = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicProduction.tsx')
const root = createRoot(dom.window.document.getElementById('root'))
after(async () => { await act(async () => root.unmount()); await vite.close(); dom.window.close() })

const capabilities = {
  tenantTimezone: 'Asia/Ho_Chi_Minh',
  studentCreate: false, studentUpdate: false, teacherCreate: false, teacherUpdate: false,
  catalogManage: false, courseUpdate: false, classCreate: false, classUpdate: false,
  teacherAssign: false, enroll: false, transferRequest: false,
}
const page = (items) => ({ items, page: 1, pageSize: 20, total: items.length, asOf: new Date().toISOString() })
let mountSequence = 0
async function mount(id, selectedId, extra = {}) {
  await act(async () => {
    root.render(React.createElement(AcademicProduction, {
      key: `${id}:${selectedId ?? ''}:${++mountSequence}`, id, selectedId, tenantId: 'tenant-a', token: 'token-a', navigate: () => {}, ...extra,
    }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
}

test('production AC01 reads current tenant and renders live empty/list data', async () => {
  requests.length = 0
  respond = (url) => Response.json(url.includes('/permissions/') ? capabilities
    : page([{ id: 'student-a', code: 'S-01', name: 'Lan', status: 'ACTIVE' }]))
  await mount('AC01')
  assert.match(dom.window.document.body.textContent, /Lan/)
  assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 1)
  assert.ok(requests.every(({ url }) => url.includes('/tenants/tenant-a/academic/')))
  assert.ok(requests.every(({ options }) => options.headers.Authorization === 'Bearer token-a'))
  respond = (url) => Response.json(url.includes('/permissions/') ? capabilities : page([]))
  await mount('AC03')
  assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 0)
})

test('production AC02 keeps resource detail and mutation capability separate', async () => {
  requests.length = 0
  respond = (url) => Response.json(url.includes('/permissions/') ? capabilities : {
    id: 'student-a', code: 'S-01', name: 'Lan', status: 'ACTIVE', dateOfBirth: null, enrollments: [],
  })
  await mount('AC02', 'student-a')
  assert.match(dom.window.document.body.textContent, /Lan/)
  assert.equal(dom.window.document.querySelector('.academic-heading button'), null)
  assert.ok(requests.some(({ url }) => url.includes('/students/student-a')))
  assert.ok(requests.some(({ url }) => url.includes('studentId=student-a')))
  assert.ok(dom.window.document.querySelector('[data-screen-id="AC09"]'))
  assert.equal(dom.window.document.querySelector('[data-screen-id="AC09"] button').disabled, true)
})

test('production Academic renders forbidden state without stale prior records', async () => {
  respond = () => Response.json({ code: 'FORBIDDEN' }, { status: 403 })
  await mount('AC01')
  assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 0)
  assert.doesNotMatch(dom.window.document.body.textContent, /Lan/)
  assert.ok(dom.window.document.querySelector('[role="alert"]'))
})

test('production AC07 lists classes when the optional course catalog is forbidden', async () => {
  requests.length = 0
  respond = (url) => url.includes('/permissions/') ? Response.json(capabilities)
    : url.includes('/courses') ? Response.json({ code: 'FORBIDDEN' }, { status: 403 })
      : Response.json(page([{ id: 'class-a', code: 'CL-01', name: 'Planned Class', status: 'PLANNED' }]))
  await mount('AC07')
  assert.match(dom.window.document.body.textContent, /Planned Class/)
  assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 1)
  assert.ok(requests.some(({ url }) => url.includes('/classes')))
  assert.ok(requests.some(({ url }) => url.includes('/courses')))
})

test('AC01 uses server total and page, then resets to page 1 for a new q', async () => {
  requests.length = 0
  respond = (url) => {
    if (url.includes('/permissions/')) return Response.json(capabilities)
    const nextPage = Number(new URL(url, 'http://localhost').searchParams.get('page'))
    return Response.json({ ...page([{ id: `s-${nextPage}`, code: `S-${nextPage}`, name: `Student ${nextPage}`, status: 'ACTIVE' }]), page: nextPage, total: 41, pageSize: 20 })
  }
  await mount('AC01')
  assert.match(dom.window.document.body.textContent, /41 hồ sơ khớp/)
  assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 1)
  await act(async () => {
    [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Sau').click()
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  assert.ok(requests.some(({ url }) => url.includes('/students?page=2&q=')))
  const input = dom.window.document.querySelector('input[type="search"]')
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
    set.call(input, 'Lan')
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 20))
  })
  assert.ok(requests.some(({ url }) => url.includes('/students?page=1&q=Lan')))
  assert.equal(dom.window.document.querySelector('nav[aria-label^="Phân trang"] span').textContent, 'Trang 1 / 3')
})

test('AC02 renders server enrollment history and keeps restricted edit hidden', async () => {
  requests.length = 0
  const enrollment = (id, status, date) => ({ id, classId: `class-${id}`, className: `Lớp ${id}`, status, effectiveFrom: date, effectiveTo: null })
  respond = (url) => Response.json(url.includes('/permissions/') ? capabilities : {
    id: 'student-b', code: 'S-02', name: 'Học sinh B', status: 'INACTIVE', dateOfBirth: '2010-05-14',
    enrollments: [enrollment('one', 'ACTIVE', '2026-10-01'), enrollment('two', 'TRANSFERRED', '2025-09-01')],
  })
  let destination = ''
  await mount('AC02', 'student-b', { allowed: ['AC01', 'AC08'], navigate: (next) => { destination = next } })
  assert.equal(dom.window.document.querySelector('h1').textContent, 'Học sinh B')
  assert.match(dom.window.document.body.textContent, /Lớp one/)
  assert.match(dom.window.document.body.textContent, /Lớp two/)
  assert.match(dom.window.document.body.textContent, /14\/05\/2010/)
  assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => button.textContent === 'Chỉnh sửa hồ sơ'), false)
  assert.doesNotMatch(dom.window.document.body.textContent, /Nguyễn Thị Hạnh/)
  await act(async () => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Xem lớp').click())
  assert.equal(destination, '/app/tenant-a/classes/class-one')
})

test('AC03 gates creation and detail navigation by current capability and navigation evidence', async () => {
  requests.length = 0
  respond = (url) => Response.json(url.includes('/permissions/') ? capabilities : page([{ id: 'teacher-b', code: 'T-02', name: 'Giáo viên B', status: 'ACTIVE' }]))
  await mount('AC03', undefined, { allowed: [] })
  assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => button.textContent === 'Tạo hồ sơ'), false)
  assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => button.textContent === 'Xem chi tiết'), false)
  let destination = ''
  respond = (url) => Response.json(url.includes('/permissions/') ? { ...capabilities, teacherCreate: true } : page([{ id: 'teacher-b', code: 'T-02', name: 'Giáo viên B', status: 'ACTIVE' }]))
  await mount('AC03', undefined, { allowed: ['AC04'], navigate: (next) => { destination = next } })
  const create = [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Tạo hồ sơ')
  assert.ok(create)
  await act(async () => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Xem chi tiết').click())
  assert.equal(destination, '/app/tenant-a/teachers/teacher-b')
  create.focus()
  await act(async () => create.click())
  assert.ok(dom.window.document.querySelector('[role="dialog"]'))
  assert.equal(dom.window.document.activeElement.tagName, 'INPUT')
  await act(async () => dom.window.document.querySelector('[role="dialog"]').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(dom.window.document.querySelector('[role="dialog"]'), null)
  assert.equal(dom.window.document.activeElement, create)
})

test('AC04 shows only actual assignment intervals and does not infer skills or schedules', async () => {
  requests.length = 0
  respond = (url) => Response.json(url.includes('/permissions/') ? capabilities : {
    id: 'teacher-c', code: 'T-03', name: 'Cô Mai', status: 'ACTIVE', contact: null,
    assignments: [{ id: 'a1', classId: 'class-a', className: 'Lớp Văn', validFrom: '2026-10-01', validTo: '2026-12-31' }],
  })
  await mount('AC04', 'teacher-c', { allowed: [] })
  assert.equal(dom.window.document.querySelector('h1').textContent, 'Cô Mai')
  assert.match(dom.window.document.body.textContent, /Lớp Văn/)
  assert.match(dom.window.document.body.textContent, /01\/10\/2026/)
  assert.match(dom.window.document.body.textContent, /31\/12\/2026/)
  assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => button.textContent === 'Xem lớp'), false)
  assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => button.textContent === 'Chỉnh sửa hồ sơ'), false)
  assert.match(dom.window.document.body.textContent, /Năng lực xác minh, lịch dạy và audit cần API/)
})

test('AC01 create keeps reason mandatory and reports server duplicate without local success', async () => {
  requests.length = 0
  respond = (url, options) => options?.method === 'POST' ? Response.json({ code: 'DUPLICATE_CODE', message: 'Mã đã tồn tại' }, { status: 409 })
    : Response.json(url.includes('/permissions/') ? { ...capabilities, studentCreate: true } : page([]))
  await mount('AC01')
  await act(async () => [...dom.window.document.querySelectorAll('button')].find((button) => button.textContent === 'Tạo hồ sơ').click())
  const dialog = dom.window.document.querySelector('[role="dialog"]')
  assert.ok(dialog)
  await act(async () => [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Lưu').click())
  assert.match(dialog.textContent, /Nhập tên, mã và lý do hợp lệ/)
  assert.equal(requests.some(({ options }) => options.method === 'POST'), false)
  const inputs = [...dialog.querySelectorAll('input')]
  for (const [input, value] of [[inputs[0], 'S-01'], [inputs[1], 'Lan'], [inputs.at(-1), 'Tạo hồ sơ']]) {
    await act(async () => { const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set; set.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
  }
  await act(async () => { [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Lưu').click(); await new Promise((resolve) => setTimeout(resolve, 20)) })
  const post = requests.find(({ options }) => options.method === 'POST')
  assert.ok(post)
  assert.equal(JSON.parse(post.options.body).reason, 'Tạo hồ sơ')
  assert.ok(dom.window.document.querySelector('[role="dialog"]'))
  assert.doesNotMatch(dom.window.document.body.textContent, /Đã lưu theo xác nhận/)
  respond = (url, options) => options?.method === 'POST' ? Response.json({ id: 's-new', code: 'S-01', name: 'Lan', status: 'ACTIVE' }, { status: 201 })
    : Response.json(url.includes('/permissions/') ? { ...capabilities, studentCreate: true } : page([{ id: 's-new', code: 'S-01', name: 'Lan', status: 'ACTIVE' }]))
  await act(async () => { [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Lưu').click(); await new Promise((resolve) => setTimeout(resolve, 25)) })
  assert.equal(dom.window.document.querySelector('[role="dialog"]'), null)
  assert.match(dom.window.document.body.textContent, /Đã lưu theo xác nhận của máy chủ/)
  assert.match(dom.window.document.querySelector('tbody').textContent, /Lan/)
})

test('AC02 and AC04 map 401, 403, and 404 to terminal scoped states without prior profile', async () => {
  for (const [id, selectedId] of [['AC02', 'student-error'], ['AC04', 'teacher-error']]) {
    for (const [code, expected] of [[401, /Phiên đăng nhập đã hết hạn/], [403, /không có quyền/], [404, /Không tìm thấy hồ sơ/]]) {
      respond = () => Response.json({ code: 'DENIED' }, { status: code })
      await mount(id, selectedId)
      assert.match(dom.window.document.body.textContent, expected)
      assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 0)
      assert.doesNotMatch(dom.window.document.body.textContent, /Cô Mai|Học sinh B/)
      if (code === 403) assert.equal([...dom.window.document.querySelectorAll('button')].some((button) => button.textContent === 'Thử lại'), false)
    }
  }
})

test('AC02 discards an old tenant response after token and selected student change', async () => {
  requests.length = 0
  let resolveOld
  respond = (url) => {
    if (url.includes('/tenant-a/')) return new Promise((resolve) => { resolveOld = resolve })
    if (url.includes('/permissions/')) return Response.json(capabilities)
    return Response.json({ id: 'student-new', code: 'S-NEW', name: 'Người mới', status: 'ACTIVE', dateOfBirth: null, enrollments: [] })
  }
  const render = async (tenantId, token, selectedId) => act(async () => {
    root.render(React.createElement(AcademicProduction, { key: 'scope-race', id: 'AC02', tenantId, token, selectedId, navigate: () => {} }))
    await new Promise((resolve) => setTimeout(resolve, 15))
  })
  await render('tenant-a', 'token-old', 'student-old')
  assert.match(dom.window.document.body.textContent, /Đang tải/)
  await render('tenant-b', 'token-new', 'student-new')
  assert.equal(dom.window.document.querySelector('h1').textContent, 'Người mới')
  await act(async () => { resolveOld(Response.json({ id: 'student-old', code: 'S-OLD', name: 'Người cũ', status: 'ACTIVE', dateOfBirth: null, enrollments: [] })); await new Promise((resolve) => setTimeout(resolve, 15)) })
  assert.doesNotMatch(dom.window.document.body.textContent, /Người cũ|S-OLD/)
  assert.ok(requests.some(({ url, options }) => url.includes('/tenant-b/') && options.headers.Authorization === 'Bearer token-new'))
})
