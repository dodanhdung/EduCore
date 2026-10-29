import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => vite.close())
const { MembersView } = await vite.ssrLoadModule('/src/screens/Management & Operations/OP01/MembersView.tsx')
const { fromMemberPage, fromMemberFixture } = await vite.ssrLoadModule('/src/screens/Management & Operations/OP01/MembersViewModel.ts')

test('OP01 keeps the server total distinct from a page and does not invent status totals', () => {
  const model = fromMemberPage({ page: 2, pageSize: 20, total: 81, items: [
    { id: 'a', displayName: 'Thành viên A', email: 'a@example.test', status: 'PENDING_ACTIVATION',
      assignments: [{ roleCode: 'Manager', scopeKind: 'TENANT' }, { roleCode: 'Teacher', scopeKind: 'CLASS' }] },
  ] })
  assert.equal(model.total, 81)
  assert.equal(model.rows.length, 1)
  assert.equal(model.pendingTotal, null)
  const html = renderToStaticMarkup(React.createElement(MembersView, { model }))
  assert.match(html, /81 thành viên được cấp/)
  assert.match(html, /Manager · TENANT, Teacher · CLASS/)
  assert.match(html, /Chưa có dữ liệu từ API/)
  assert.doesNotMatch(html, /<button[^>]*>(?:Tạo thành viên|Vô hiệu hóa|Xem)<\/button>/)
})

test('OP01 fixture adapter counts only its own tenant and uses the same view', () => {
  const model = fromMemberFixture({ tenantId: 'tenant-a', members: [
    { id: 'a', tenantId: 'tenant-a', name: 'A', email: 'a@example.test', status: 'ACTIVE', assignments: [], history: [] },
    { id: 'b', tenantId: 'tenant-a', name: 'B', email: 'b@example.test', status: 'DISABLED', assignments: [], history: [] },
    { id: 'secret', tenantId: 'tenant-b', name: 'SECRET_OTHER_TENANT', email: 'x@example.test', status: 'ACTIVE', assignments: [], history: [] },
  ] }, false)
  assert.equal(model.total, 2)
  assert.equal(model.disabledTotal, 1)
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(MembersView, { model })), /SECRET_OTHER_TENANT/)
})
