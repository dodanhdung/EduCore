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
const assignment = { id: 'a1', title: 'Bài tập thật', description: 'Trả lời câu hỏi', className: 'Lớp A', deadlineAt: '2099-01-01T00:00:00Z', priority: 3, recipientId: 'r1', submissionId: null, versionNo: null, isLate: null, canSubmit: true, score: null, feedback: null }
globalThis.fetch = async (url, init = {}) => {
  calls.push({ url: String(url), init })
  const path = String(url)
  const value = path.endsWith('/my/assignments') ? { items: [assignment], timezone: 'Asia/Ho_Chi_Minh' }
    : path.endsWith('/grading/queue') ? { items: [{ submissionId: 's1', versionId: 'v1', versionNo: 1, submittedAt: '2026-10-25T00:00:00Z', isLate: false, assignmentId: 'a1', assignmentTitle: 'Bài tập thật', studentName: 'Học sinh A', gradeStatus: gradeState?.status ?? null }], timezone: 'Asia/Ho_Chi_Minh' }
      : path.endsWith('/submissions/s1/grading-context') ? { submissionId: 's1', recipientId: 'r1', assignmentTitle: 'Bài tập thật', studentName: 'Học sinh A', currentVersionId: 'v1', timezone: 'Asia/Ho_Chi_Minh', versions: [{ id: 'v1', version_no: 1, submitted_at: '2026-10-25T00:00:00Z', answer_text: 'Bài giải', is_late: false, fileIds: [] }], grade: gradeState }
        : path.endsWith('/submission-versions/v1/grade-draft') && init.method === 'PUT' ? (gradeState = { id: 'g1', revision: 1, status: 'DRAFT', score: JSON.parse(init.body).score, feedback: JSON.parse(init.body).feedback })
          : path.endsWith('/submission-versions/v1/grades/publish') && init.method === 'POST' ? (gradeState = { ...gradeState, status: 'PUBLISHED' })
    : path.endsWith('/assignment-recipients/r1/submissions') && init.method !== 'POST' ? { submissionId: null, currentVersionId: null, versions: [] }
      : path.endsWith('/assignment-recipients/r1/submissions') ? { id: 'v1', submissionId: 's1', versionId: 'v1', versionNo: 1 }
        : {}
  return new Response(JSON.stringify(value), { status: init.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
}
const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { AssignmentsProduction } = await vite.ssrLoadModule('/src/screens/Assignments & Grading/AssignmentsProduction.tsx')
const { createRoot } = await import('react-dom/client')
after(async () => { await vite.close(); view.window.close() })

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
