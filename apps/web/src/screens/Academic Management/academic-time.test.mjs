import assert from 'node:assert/strict'
import { test } from 'node:test'
import { tenantLocalToUtc } from './AcademicTime.ts'

test('tenant local dates use tenant zone regardless of browser zone', () => {
  assert.equal(tenantLocalToUtc('2099-02-01T09:30', 'Asia/Ho_Chi_Minh'), '2099-02-01T02:30:00.000Z')
  assert.equal(tenantLocalToUtc('2099-02-01T09:30', 'UTC'), '2099-02-01T09:30:00.000Z')
})

test('invalid, missing and ambiguous local dates fail closed', () => {
  assert.equal(tenantLocalToUtc('2099-02-30T09:30', 'UTC'), null)
  assert.equal(tenantLocalToUtc('2099-02-01T09:30', ''), null)
  assert.equal(tenantLocalToUtc('2026-03-08T02:30', 'America/New_York'), null)
  assert.equal(tenantLocalToUtc('2026-11-01T01:30', 'America/New_York'), null)
})
