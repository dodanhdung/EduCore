import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => vite.close())
const { TeacherHomeView } = await vite.ssrLoadModule('/src/screens/Role Portals/PO01/TeacherHomeView.tsx')
const { fromTeacherLive } = await vite.ssrLoadModule('/src/screens/Role Portals/PO01/TeacherHomeViewModel.ts')

function data(completeness) {
  return { sampleNow: '2026-10-24T23:30:00Z', timeZone: 'Asia/Ho_Chi_Minh',
    teacherName: 'Cô An', sectionStates: { attendance: 'ready', grading: 'ready', teaching: 'forbidden' },
    completeness, sessions: [{ id: 'session-a', teacherId: 'teacher-a', className: 'Lớp 8A',
      classId: 'class-a', studentIds: [], startsAt: '2026-10-25T01:00:00Z',
      endsAt: '2026-10-25T02:00:00Z', room: 'Phòng chưa cập nhật', status: 'CONFIRMED', attendance: 'PENDING' }],
    assignments: { assignments: [], submissions: [] } }
}
test('PO01 uses tenant-local today and keeps partial projections distinct', () => {
  const partial = fromTeacherLive(data({ calendar: false, attendance: true, grading: false }), 'teacher-a', true)
  assert.equal(partial.today.length, 1)
  assert.deepEqual([partial.todayCount, partial.pendingCount, partial.gradingCount], [null, null, null])
  assert.equal(partial.partialGrading, true)
  const complete = fromTeacherLive(data({ calendar: true, attendance: true, grading: true }), 'teacher-a', false)
  assert.deepEqual([complete.todayCount, complete.pendingCount, complete.gradingCount], [1, 1, 0])
  const html = renderToStaticMarkup(React.createElement(TeacherHomeView,
    { model: complete, navigate() {}, path: id => id === 'SC05' ? '/app/tenant/schedule/sessions/session-a' : '' }))
  assert.match(html, /Phòng chưa cập nhật/)
  assert.match(html, /Xem buổi học/)
  assert.doesNotMatch(html, /href=""/)
  assert.equal((html.match(/Lớp 8A/g) ?? []).length >= 2, true)
})
