import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createServer } from 'vite'

const view = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
globalThis.window = view.window
globalThis.document = view.window.document
globalThis.HTMLElement = view.window.HTMLElement
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const calls = []
let gradeState = null
let assignmentStatus = 'PUBLISHED'
let gateTransport
const assignment = { id: 'a1', title: 'Bài tập thật', description: 'Trả lời câu hỏi', className: 'Lớp A', deadlineAt: '2099-01-01T00:00:00Z', priority: 3, recipientId: 'r1', submissionId: null, versionNo: null, isLate: null, canSubmit: true, score: null, feedback: null }
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init })
  if (gateTransport) return gateTransport(String(url), init)
  const path = String(url)
  if (path.endsWith('/teaching/assignment-classes')) return Response.json({ timezone: 'Asia/Ho_Chi_Minh', classes: [{ id: 'class-a', name: 'Lớp A' }, { id: 'class-b', name: 'Lớp B' }] })
  if (path.endsWith('/teaching/assignments')) return Response.json([
    { id: 'a1', title: 'Đại số', class_id: 'class-a', deadline_at: '2099-01-01T00:00:00Z', priority: 3, status: 'PUBLISHED' },
    { id: 'a2', title: 'Hình học', class_id: 'class-b', deadline_at: '2099-01-02T00:00:00Z', priority: 5, status: 'DRAFT' },
  ])
  const value = path.endsWith('/my/assignments') ? { items: [{ ...assignment, status: assignmentStatus, canSubmit: assignmentStatus === 'PUBLISHED', score: assignmentStatus === 'ARCHIVED' ? '8.5' : null }], timezone: 'Asia/Ho_Chi_Minh' }
    : path.endsWith('/grading/queue') ? { items: [{ submissionId: 's1', versionId: 'v1', versionNo: 1, submittedAt: '2026-10-25T00:00:00Z', isLate: false, assignmentId: 'a1', assignmentTitle: 'Bài tập thật', studentName: 'Học sinh A', gradeStatus: gradeState?.status ?? null }], timezone: 'Asia/Ho_Chi_Minh' }
      : path.endsWith('/submissions/s1/grading-context') ? { submissionId: 's1', recipientId: 'r1', assignmentTitle: 'Bài tập thật', studentName: 'Học sinh A', currentVersionId: 'v1', timezone: 'Asia/Ho_Chi_Minh', versions: [{ id: 'v1', version_no: 1, submitted_at: '2026-10-25T00:00:00Z', answer_text: 'Bài giải', is_late: false, fileIds: [] }], grade: gradeState }
        : path.endsWith('/submission-versions/v1/grade-draft') && init.method === 'PUT' ? (gradeState = { id: 'g1', revision: 1, status: 'DRAFT', score: JSON.parse(init.body).score, feedback: JSON.parse(init.body).feedback })
          : path.endsWith('/submission-versions/v1/grades/publish') && init.method === 'POST' ? (gradeState = { ...gradeState, status: 'PUBLISHED' })
    : path.endsWith('/assignment-recipients/r1/submissions') && init.method !== 'POST' ? { submissionId: assignmentStatus === 'ARCHIVED' ? 's1' : null, currentVersionId: assignmentStatus === 'ARCHIVED' ? 'v1' : null, versions: assignmentStatus === 'ARCHIVED' ? [{ id: 'v1', version_no: 1, submitted_at: '2026-10-25T00:00:00Z', answer_text: 'Archived answer', is_late: false, fileIds: [] }] : [] }
      : path.endsWith('/assignment-recipients/r1/submissions') ? { id: 'v1', submissionId: 's1', versionId: 'v1', versionNo: 1 }
        : {}
  return new Response(JSON.stringify(value), { status: init.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
}
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { AssignmentsProduction } = await vite.ssrLoadModule('/src/screens/Assignments & Grading/AssignmentsProduction.tsx')
const { createRoot } = await import('react-dom/client')
after(async () => { await vite.close(); view.window.close() })

test('R10 AS01 class filter changes actual rows and empty reset; links require navigation evidence', async () => {
  const root = createRoot(document.getElementById('root'))
  const navigated = []
  try {
    const props = { id: 'AS01', tenantId: 'tenant1', token: 'session-token', allowed: ['AS02', 'AS03'], navigate: p => navigated.push(p) }
    await act(async () => root.render(React.createElement(AssignmentsProduction, props)))
    assert.equal(document.querySelectorAll('tbody tr').length, 2)
    assert.match(document.querySelector('tbody').textContent, /Đã giao/)
    assert.ok(document.querySelector('[aria-label="Ưu tiên 5 trên 5"]'))
    const selects = document.querySelectorAll('select')
    await act(async () => { selects[1].value = 'class-b'; selects[1].dispatchEvent(new window.Event('change', { bubbles: true })) })
    assert.equal(document.querySelectorAll('tbody tr').length, 1)
    assert.match(document.querySelector('tbody').textContent, /Hình học/)
    await act(async () => [...document.querySelectorAll('tbody button')][0].click())
    assert.equal(navigated.at(-1), '/app/tenant1/teaching/assignments/a2')
    await act(async () => { selects[0].value = 'PUBLISHED'; selects[0].dispatchEvent(new window.Event('change', { bubbles: true })) })
    assert.match(document.body.textContent, /Không có bài tập phù hợp/)
    await act(async () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Xóa bộ lọc').click())
    assert.equal(document.querySelectorAll('tbody tr').length, 2)
    await act(async () => root.render(React.createElement(AssignmentsProduction, { ...props, allowed: [] })))
    assert.equal(document.querySelector('tbody button'), null)
    assert.ok(![...document.querySelectorAll('button')].some(b => b.textContent === 'Tạo bài tập'))
  } finally { await act(async () => root.unmount()) }
})

test('AS07 resolves the authenticated assignment to its server supplied recipient before submitting', async () => {
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(React.createElement(AssignmentsProduction, { id: 'AS07', tenantId: 'tenant1', token: 'session-token', selectedId: 'a1', navigate: () => {} })))
    assert.match(document.body.textContent, /Bài tập thật/)
    const answer = document.querySelector('textarea')
    assert.ok(answer)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
      setter.call(answer, 'Bài giải của em')
      answer.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    const submit = [...document.querySelectorAll('button')].find(button => button.textContent === 'Nộp bài')
    assert.ok(submit)
    await act(async () => submit.click())
    const request = calls.find(call => call.init.method === 'POST')
    assert.ok(request)
    assert.match(request.url, /assignment-recipients\/r1\/submissions$/)
    assert.equal(request.init.headers.Authorization, 'Bearer session-token')
    assert.equal(JSON.parse(request.init.body).answerText, 'Bài giải của em')
    assert.match(document.body.textContent, /Đã nộp bài thành công/)
  } finally { await act(async () => root.unmount()) }
})

test('AS05 saves a decimal-string draft and requires a separate publish request', async () => {
  gradeState = null
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(React.createElement(AssignmentsProduction, { id: 'AS05', tenantId: 'tenant1', token: 'teacher-token', selectedId: 's1', navigate: () => {} })))
    const input = document.querySelector('input[inputmode="decimal"]')
    assert.ok(input)
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '8.5')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Lưu nháp').click())
    const draft = calls.find(call => call.init.method === 'PUT')
    assert.ok(draft)
    assert.match(draft.url, /submission-versions\/v1\/grade-draft$/)
    assert.equal(JSON.parse(draft.init.body).score, '8.5')
    assert.equal(draft.init.headers['If-Match'], '0')
    assert.equal(calls.some(call => call.url.endsWith('/grades/publish')), false)
    window.confirm = () => true
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Công bố điểm').click())
    const publish = calls.find(call => call.url.endsWith('/grades/publish'))
    assert.ok(publish)
    assert.equal(JSON.parse(publish.init.body).revision, 1)
  } finally { await act(async () => root.unmount()) }
})

test('AS07 keeps an archived assignment, history and published result visible while disabling submission', async () => {
  assignmentStatus = 'ARCHIVED'
  calls.length = 0
  const root = createRoot(document.getElementById('root'))
  try {
    await act(async () => root.render(React.createElement(AssignmentsProduction, { id: 'AS07', tenantId: 'tenant1', token: 'session-token', selectedId: 'a1', navigate: () => {} })))
    assert.match(document.body.textContent, /Archived answer/)
    assert.match(document.body.textContent, /8\.5\/10/)
    assert.match(document.body.textContent, /lưu trữ/)
    const submit = [...document.querySelectorAll('button')].find(button => button.textContent === 'Nộp bài')
    assert.equal(submit.disabled, true)
    assert.equal(calls.some(call => call.init.method === 'POST'), false)
  } finally { await act(async () => root.unmount()); assignmentStatus = 'PUBLISHED' }
})

test('authenticated download uses safe original filename from private metadata', async () => {
  const { ApiClient, ApiError } = await vite.ssrLoadModule('/src/api.ts')
  const requests = []
  const transport = async (url, init) => {
    requests.push({ url: String(url), init })
    return String(url).endsWith('/download')
      ? new Response(new Blob(['file-bytes']), { status: 200 })
      : new Response(JSON.stringify({ originalFilename: 'student-work.pdf' }), { status: 200 })
  }
  const originalClick = window.HTMLAnchorElement.prototype.click
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let savedName = null
  window.HTMLAnchorElement.prototype.click = function () { savedName = this.download }
  URL.createObjectURL = () => 'blob:test-file'
  URL.revokeObjectURL = () => {}
  try {
    await new ApiClient('', transport).downloadAssignmentFile('tenant1', 'file1', 'session-token')
    assert.equal(savedName, 'student-work.pdf')
    assert.equal(requests.length, 2)
    assert.ok(requests.every(call => call.init.headers.Authorization === 'Bearer session-token'))
    const invalid = new ApiClient('', async () => new Response(JSON.stringify({ originalFilename: '../unsafe.pdf' }), { status: 200 }))
    await assert.rejects(() => invalid.downloadAssignmentFile('tenant1', 'file2', 'session-token'), error => error instanceof ApiError && error.code === 'INVALID_FILENAME')
  } finally {
    window.HTMLAnchorElement.prototype.click = originalClick
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  }
})

const gateProps = { id: 'AS01', tenantId: 'gate-a', token: 'token-a', allowed: ['AS02', 'AS03'], navigate() {} }
const gateAssignment = (title = 'Protected assignment') => ({ id: 'a1', title, description: 'Protected description', class_id: 'c1', deadline_at: '2099-01-01T00:00:00Z', priority: 3, status: 'PUBLISHED', revision: 1 })
const gateResponse = (url, title) => Response.json(url.endsWith('/teaching/assignment-classes')
  ? { classes: [{ id: 'c1', name: 'Protected class' }], timezone: 'Asia/Ho_Chi_Minh' } : [gateAssignment(title)])
const gateError = status => Response.json({ code: 'GATE_TEST_ERROR' }, { status })
async function assignmentFixture(run) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const render = async props => act(async () => root.render(React.createElement(AssignmentsProduction, props)))
  try { await run({ container, render }) }
  finally { await act(async () => root.unmount()); container.remove(); gateTransport = undefined }
}

for (const status of [401, 403]) test('Gate0 AS01 loaded rows become safe terminal state on ' + status, async () => {
  await assignmentFixture(async ({ container, render }) => {
    gateTransport = url => gateResponse(url)
    await render(gateProps)
    assert.match(container.textContent, /Protected assignment/)
    gateTransport = () => gateError(status)
    await render({ ...gateProps, token: 'token-revalidated' })
    assert.doesNotMatch(container.textContent, /Protected assignment|Protected class|Tạo bài tập|Chi tiết/)
    assert.equal(container.querySelector('table, input, select'), null)
    assert.ok(![...container.querySelectorAll('button')].some(b => /Thử lại/.test(b.textContent)))
    assert.match(container.textContent, status === 401 ? /đăng nhập lại/i : /không có quyền/i)
    if (status === 401) assert.equal(container.querySelector('a')?.getAttribute('href'), '/login')
  })
})

for (const boundary of ['tenantId', 'token', 'selectedId']) test('Gate0 AS01 discards late response across ' + boundary, async () => {
  await assignmentFixture(async ({ container, render }) => {
    let release
    let first = true
    const signals = []
    gateTransport = (url, init) => {
      signals.push(init.signal)
      if (url.endsWith('/teaching/assignments') && first) {
        first = false
        return new Promise(resolve => { release = () => resolve(gateResponse(url, 'OLD protected row')) })
      }
      return gateResponse(url, 'CURRENT protected row')
    }
    await render(gateProps)
    await render({ ...gateProps, [boundary]: 'scope-b' })
    assert.match(container.textContent, /CURRENT protected row/)
    assert.equal(signals[0].aborted, true)
    await act(async () => release())
    assert.doesNotMatch(container.textContent, /OLD protected row/)
    assert.match(container.textContent, /CURRENT protected row/)
  })
})

test('Gate0 AS01 A-B-A navigation rejects the first A response even if transport ignores abort', async () => {
  await assignmentFixture(async ({ container, render }) => {
    let release
    let count = 0
    gateTransport = url => {
      if (url.endsWith('/teaching/assignments') && ++count === 1)
        return new Promise(resolve => { release = () => resolve(gateResponse(url, 'Obsolete A')) })
      return gateResponse(url, 'Latest scope')
    }
    await render(gateProps)
    await render({ ...gateProps, tenantId: 'gate-b' })
    await render(gateProps)
    await act(async () => release())
    assert.doesNotMatch(container.textContent, /Obsolete A/)
    assert.match(container.textContent, /Latest scope/)
  })
})

test('Gate0 AS01 retries a transient read explicitly and keeps error/empty/ready exclusive', async () => {
  await assignmentFixture(async ({ container, render }) => {
    let fail = true
    let requests = 0
    gateTransport = url => { requests++; return fail ? gateError(503) : gateResponse(url) }
    await render(gateProps)
    assert.equal(container.querySelector('table'), null)
    const retry = [...container.querySelectorAll('button')].find(b => b.textContent === 'Thử lại')
    assert.ok(retry)
    const before = requests
    fail = false
    await act(async () => retry.click())
    assert.ok(requests > before)
    assert.match(container.textContent, /Protected assignment/)
    assert.equal(container.querySelector('[role="alert"]'), null)
  })
})

test('Gate0 AS01 same-scope retry ignores an older request generation', async () => {
  await assignmentFixture(async ({ container, render }) => {
    gateTransport = () => gateError(503)
    await render(gateProps)
    const pending = []
    gateTransport = url => url.endsWith('/teaching/assignments')
      ? new Promise(resolve => pending.push(title => resolve(gateResponse(url, title))))
      : gateResponse(url)
    const retry = [...container.querySelectorAll('button')].find(b => b.textContent === 'Thử lại')
    await act(async () => { retry.click(); retry.click() })
    assert.equal(pending.length, 2)
    await act(async () => pending[1]('Latest retry'))
    await act(async () => pending[0]('Stale retry'))
    assert.match(container.textContent, /Latest retry/)
    assert.doesNotMatch(container.textContent, /Stale retry/)
  })
})

test('Gate0 AS03 late recipient history cannot restore detail after navigation to AS05', async () => {
  await assignmentFixture(async ({ container, render }) => {
    let release
    gateTransport = url => {
      if (url.endsWith('/recipients')) return Response.json([{ id: 'r-private', studentName: 'Old recipient', assignment_id: 'a1' }])
      if (url.endsWith('/r-private/submissions')) return new Promise(resolve => { release = () => resolve(Response.json({ versions: [{ id: 'v1', answer_text: 'OLD secret history', fileIds: [] }] })) })
      if (url.endsWith('/grading-context')) return Response.json({ submissionId: 's-new', studentName: 'New student', assignmentTitle: 'New grade scope', currentVersionId: 'v-new', timezone: 'Asia/Ho_Chi_Minh', versions: [], grade: null })
      return gateResponse(url)
    }
    await render({ ...gateProps, id: 'AS03', selectedId: 'a1' })
    assert.ok(release)
    await render({ ...gateProps, id: 'AS05', selectedId: 's-new' })
    await act(async () => release())
    assert.match(container.textContent, /New grade scope/)
    assert.doesNotMatch(container.textContent, /Old recipient|OLD secret history|Protected assignment/)
  })
})

test('Gate0 AS07 clears answer draft/history/mine on token change but preserves a same-scope draft', async () => {
  await assignmentFixture(async ({ container, render }) => {
    let expired = false
    gateTransport = url => {
      if (expired) return gateError(401)
      return Response.json(url.endsWith('/my/assignments')
        ? { items: [{ ...assignment, status: 'PUBLISHED' }], timezone: 'Asia/Ho_Chi_Minh' }
        : { versions: [{ id: 'v1', version_no: 1, submitted_at: '2026-10-28T00:00:00Z', answer_text: 'Private history', fileIds: [] }] })
    }
    const props = { ...gateProps, id: 'AS07', selectedId: 'a1' }
    await render(props)
    await act(async () => {
      const input = container.querySelector('textarea')
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(input, 'Private draft')
      input.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    await render({ ...props, allowed: [] })
    assert.equal(container.querySelector('textarea').value, 'Private draft')
    expired = true
    await render({ ...props, token: 'new-token' })
    assert.equal(container.querySelector('textarea'), null)
    assert.doesNotMatch(container.textContent, /Private draft|Private history|Bài tập thật/)
  })
})

test('Gate0 AS02 does not publish or navigate from an old create continuation after token change', async () => {
  await assignmentFixture(async ({ container, render }) => {
    const writes = [], navigated = []
    let release
    gateTransport = (url, init) => {
      if (init.method === 'POST') {
        writes.push(url)
        return new Promise(resolve => { release = () => resolve(Response.json({ id: 'old-created', revision: 1, status: 'DRAFT' })) })
      }
      return gateResponse(url)
    }
    const props = { ...gateProps, id: 'AS02', navigate: p => navigated.push(p) }
    await render(props)
    await act(async () => {
      for (const [selector, value] of [['input:not([type])', 'Draft title'], ['textarea', 'Draft content'], ['input[type="datetime-local"]', '2099-01-01T09:00']]) {
        const input = container.querySelector(selector)
        const prototype = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(input, value)
        input.dispatchEvent(new window.Event('input', { bubbles: true }))
      }
      const select = container.querySelector('select'); select.value = 'c1'; select.dispatchEvent(new window.Event('change', { bubbles: true }))
    })
    const previousConfirm = window.confirm
    window.confirm = () => true
    try {
      await act(async () => [...container.querySelectorAll('button')].find(b => b.textContent === 'Xác nhận xuất bản').click())
      assert.equal(writes.length, 1)
      await render({ ...props, token: 'new-session' })
      await act(async () => release())
      assert.equal(writes.length, 1)
      assert.deepEqual(navigated, [])
      assert.equal(container.querySelector('input:not([type])').value, '')
    } finally { window.confirm = previousConfirm }
  })
})
