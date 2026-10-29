import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => vite.close())
const { AssignmentListView } = await vite.ssrLoadModule('/src/screens/Assignments & Grading/AS01/AssignmentListView.tsx')
const { fromAssignmentRead, fromAssignmentFixture } = await vite.ssrLoadModule('/src/screens/Assignments & Grading/AS01/AssignmentListViewModel.ts')

test('AS01 shows only authorized complete assignment count and omits submission totals', () => {
  const model = fromAssignmentRead([{ id: 'a', title: 'Bài toán', class_id: 'c',
    deadline_at: '2026-10-24T23:00:00Z', priority: 5, status: 'PUBLISHED' }],
  [{ id: 'c', name: 'Lớp 8A' }], 'Asia/Ho_Chi_Minh')
  assert.deepEqual([model.published, model.upcoming, model.ungraded], [1, null, null])
  const html = renderToStaticMarkup(React.createElement(AssignmentListView, { model }))
  assert.match(html, /Lớp 8A/)
  assert.match(html, /Ưu tiên 5 trên 5/)
  assert.match(html, /Chưa có dữ liệu từ API/)
  assert.doesNotMatch(html, /bài nộp|Tạo bài tập|<button[^>]*>Chi tiết</)
})

test('AS01 fixture adapter filters teacher and never infers ungraded totals', () => {
  const item = { title: 'Bài tập', description: '', classId: 'c', className: 'Lớp',
    teacherName: '', recipientIds: ['s'], deadline: '2026-10-24T23:00:00Z', priority: 3, status: 'PUBLISHED' }
  const model = fromAssignmentFixture({ teacherId: 'teacher-a',
    assignments: [{ ...item, id: 'a', teacherId: 'teacher-a' }, { ...item, id: 'secret', teacherId: 'teacher-b' }],
    submissions: [{ assignmentId: 'a', versions: [{ number: 1 }] }] }, '2026-10-24T00:00:00Z')
  assert.deepEqual(model.rows.map(row => row.id), ['a'])
  assert.equal(model.ungraded, null)
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(AssignmentListView, { model })), /secret/)
})
