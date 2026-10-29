import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => vite.close())
const model = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicPersonViewModel.ts')
const list = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicPersonListView.tsx')
const detail = await vite.ssrLoadModule('/src/screens/Academic Management/AcademicPersonDetailView.tsx')
const { academicFixtures } = await vite.ssrLoadModule('/src/ui-preview/academicFixtures.ts')

test('AC01 and AC03 use authoritative server total while preview is explicitly sample scoped', () => {
  const page = { items: [{ id: 's1', code: 'S-01', name: 'Tên dài của học sinh', status: 'ACTIVE' }],
    page: 2, pageSize: 20, total: 41, asOf: '2026-10-29T00:00:00Z' }
  const actual = model.fromPersonPage('student', page, 'Tên')
  assert.equal(actual.total, 41)
  assert.equal(actual.page, 2)
  assert.equal(actual.rows.length, 1)
  assert.equal(actual.sample, false)
  const preview = model.fromPersonFixture('teacher', academicFixtures)
  assert.equal(preview.total, academicFixtures.teachers.length)
  assert.equal(preview.sample, true)
  assert.notEqual(preview.total, Number(academicFixtures.teacherMetrics[0][1]))
  for (const [component, input, id] of [
    [list.StudentListView, actual, 'AC01'],
    [list.TeacherListView, preview, 'AC03'],
  ]) {
    const html = renderToStaticMarkup(React.createElement(component, { model: input, onQueryChange: () => {} }))
    assert.match(html, new RegExp(`data-screen-id="${id}"`))
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1)
    assert.match(html, /Tên hoặc mã|Hồ sơ giáo viên/)
  }
})

test('AC02 and AC04 detail mappers never invent guardian, contact, or assignment data', () => {
  const student = model.fromStudentFixture(academicFixtures.students[0])
  const teacher = model.fromTeacherFixture(academicFixtures.teachers[0])
  assert.equal(student.dateOfBirth, null)
  assert.equal(student.enrollments.length, 1)
  assert.equal(teacher.contact, null)
  assert.equal(teacher.assignments.length, 0)
  const studentHtml = renderToStaticMarkup(React.createElement(detail.StudentDetailView, { model: student }))
  const teacherHtml = renderToStaticMarkup(React.createElement(detail.TeacherDetailView, { model: teacher }))
  assert.match(studentHtml, /Dữ liệu mẫu — UI Preview/)
  assert.match(teacherHtml, /Chưa có phân công/)
  assert.equal((studentHtml.match(/<h1\b/g) ?? []).length, 1)
  assert.equal((teacherHtml.match(/<h1\b/g) ?? []).length, 1)
})

test('production and DEV preview import the same four presentation exports', async () => {
  const base = new URL('./', import.meta.url)
  const production = await readFile(new URL('AcademicProduction.tsx', base), 'utf8')
  const wrappers = await Promise.all([
    'AC01/StudentListScreen.tsx', 'AC02/StudentDetailScreen.tsx',
    'AC03/TeacherListScreen.tsx', 'AC04/TeacherDetailScreen.tsx',
  ].map((file) => readFile(new URL(file, base), 'utf8')))
  for (const [index, name] of ['StudentListView', 'StudentDetailView', 'TeacherListView', 'TeacherDetailView'].entries()) {
    assert.match(production, new RegExp(`\\b${name}\\b`))
    assert.match(wrappers[index], new RegExp(`\\b${name}\\b`))
  }
  assert.doesNotMatch(production, /academicFixtures|fromPersonFixture|fromStudentFixture|fromTeacherFixture/)
})
