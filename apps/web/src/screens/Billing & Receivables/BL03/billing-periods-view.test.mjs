import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
after(async () => vite.close())
const { BillingPeriodsView } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL03/BillingPeriodsView.tsx')
const { fromPeriodPage } = await vite.ssrLoadModule('/src/screens/Billing & Receivables/BL03/BillingPeriodsViewModel.ts')

test('BL03 keeps selected-student current generation separate from other students', () => {
  const period = { id: 'period-a', monthStart: '2026-09-01', status: 'OPEN', timezone: 'Asia/Ho_Chi_Minh',
    draftCount: 2, issuedCount: 1, generations: [
      { id: 'g-a', runId: 'run-a', studentId: 'student-a', status: 'NEEDS_INFORMATION',
        createdAt: '2026-10-01T00:00:00Z', reason: 'Rà nguồn', missing: ['Điểm danh'], invoiceId: null, current: true },
      { id: 'g-b', runId: 'run-b', studentId: 'student-b', status: 'DRAFT',
        createdAt: '2026-10-02T00:00:00Z', reason: 'Tạo nháp', missing: [], invoiceId: 'invoice-b', current: true },
    ] }
  const model = fromPeriodPage({ items: [period], page: 1, pageSize: 20, total: 24 },
    [{ id: 'student-a', name: 'A', code: 'A' }], 101, 'period-a', 'student-a')
  const html = renderToStaticMarkup(React.createElement(BillingPeriodsView, { model, onSelectPeriod() {} }))
  assert.match(html, /Generation g-a · Hiện tại/)
  assert.doesNotMatch(html, /Generation g-b · Hiện tại/)
  assert.match(html, /NEEDS_INFORMATION|Điểm danh/)
  assert.match(html, /Danh sách chọn mới có 1 \/ 101 học sinh/)
  assert.match(html, /Nguồn đủ dữ liệu/)
  assert.match(html, /Chưa có dữ liệu từ API/)
  assert.doesNotMatch(html, /Tạo lần tính toàn trung tâm/)
})
