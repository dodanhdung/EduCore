import { expect, it } from 'vitest';
import { projectRow } from '../scripts/staging-demo-live.js';
import {
  requireImportTarget,
  RENDER_HOST,
} from '../scripts/staging-data-transfer.js';

it('redacts profile identifiers and dates using a hash of the entire UUID', () => {
  const row = (id: string) => ({
    table: 'public.student_profiles',
    key: id,
    json: JSON.stringify({
      id,
      tenant_id: 'tenant',
      full_name: 'PRIVATE PERSON',
      student_code: 'PRIVATE-ID',
      date_of_birth: '2000-01-01',
    }),
  });
  const first = projectRow(
    row('00000000-0000-4000-8000-000000000001'),
    new Set(),
    new Set(),
  );
  const second = projectRow(
    row('00000000-0000-4000-8000-000000000002'),
    new Set(),
    new Set(),
  );
  expect(first.patch.full_name).not.toContain('PRIVATE');
  expect(first.patch.student_code).not.toContain('PRIVATE');
  expect(first.patch.date_of_birth).toBeNull();
  expect(first.patch.student_code).not.toBe(second.patch.student_code);
});
it('holds financial/historical records and funded wallets instead of changing amounts or history', () => {
  for (const table of [
    'invoices',
    'billing_runs',
    'submission_versions',
    'audit_logs',
    'wallet_transactions',
  ]) {
    const original =
      '{"id":"i","tenant_id":"t","total_vnd":9007199254740999,"snapshot_json":{"fixtureOnly":true}}';
    const r = projectRow(
      { table: 'public.' + table, key: 'i', json: original },
      new Set(),
      new Set(),
    );
    expect(r.hold.length).toBeGreaterThan(0);
    expect(r.json).toBe(original);
  }
  expect(
    projectRow(
      {
        table: 'public.wallet_accounts',
        key: 'w',
        json: '{"id":"w","balance_vnd":1}',
      },
      new Set(),
      new Set(),
    ).hold.length,
  ).toBeGreaterThan(0);
  expect(
    projectRow(
      {
        table: 'public.wallet_accounts',
        key: 'w',
        json: '{"id":"w","balance_vnd":0}',
      },
      new Set(),
      new Set(),
    ).hold,
  ).toHaveLength(0);
});
it('accepts the pinned decimal-string policy rate without weakening the free-text policy check', () => {
  const row = (v: string) => ({
    table: 'public.policy_versions',
    key: 'p',
    json: JSON.stringify({
      id: 'p',
      config_snapshot: { siblingDiscountRate: v },
    }),
  });
  expect(projectRow(row('0.10'), new Set(), new Set()).hold).toHaveLength(0);
  expect(
    projectRow(row('PERSONAL FREE TEXT'), new Set(), new Set()).hold.length,
  ).toBeGreaterThan(0);
});
it('requires both owner scope and the exact rehearsed digest for the allowlisted live target', () => {
  const raw = `postgresql://operator:synthetic-test-value@${RENDER_HOST}/educore_staging_k80x`;
  const digest = 'a'.repeat(64);
  expect(() =>
    requireImportTarget(raw, {
      scope: 'OWNER_APPROVED_DEMO_20261030',
      plan: digest,
      rehearsed: 'b'.repeat(64),
    }),
  ).toThrow();
  expect(() =>
    requireImportTarget(raw, {
      scope: 'UNAPPROVED',
      plan: digest,
      rehearsed: digest,
    }),
  ).toThrow();
  expect(
    requireImportTarget(raw, {
      scope: 'OWNER_APPROVED_DEMO_20261030',
      plan: digest,
      rehearsed: digest,
    }).database,
  ).toBe('educore_staging_k80x');
  expect(() =>
    requireImportTarget(raw.replace('staging_k80x', 'production'), {
      scope: 'OWNER_APPROVED_DEMO_20261030',
      plan: digest,
      rehearsed: digest,
    }),
  ).toThrow();
});
