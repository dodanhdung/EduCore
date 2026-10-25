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
async function mount(id, selectedId) {
  await act(async () => {
    root.render(React.createElement(AcademicProduction, {
      key: `${id}:${selectedId ?? ''}`, id, selectedId, tenantId: 'tenant-a', token: 'token-a', navigate: () => {},
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
