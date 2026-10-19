import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Prisma } from '../../src/generated/prisma/client.js';
import { baselineSql, migrationSql, safeTarget } from './support.js';

const key = '00000000-0000-4000-8000-000000000001';
// These checked nested inputs prove generated-client type compatibility only;
// they do not execute Prisma's query engine or prove PostgreSQL behavior.
const optionalFinalization: Prisma.AttendanceRecordCreateInput = {
  attendanceStatus: 'ATTENDED',
  recordedAt: '2099-10-01',
  revision: 1,
  tenant: { connect: { id: key } },
  participant: {
    connect: {
      tenantId_sessionId_id: { tenantId: key, sessionId: key, id: key },
    },
  },
  recordedBy: { connect: { tenantId_id: { tenantId: key, id: key } } },
};
const nestedFinalization: Prisma.AttendanceRecordCreateInput = {
  ...optionalFinalization,
  finalization: {
    connect: {
      tenantId_sessionId_id: { tenantId: key, sessionId: key, id: key },
    },
  },
};
const disconnect: Prisma.AttendanceRecordUpdateInput = {
  finalization: { disconnect: true },
};
const nestedLine: Prisma.InvoiceLineCreateInput = {
  sourceStatus: 'CANCELLED',
  chargeUnits: 0,
  unitPriceVnd: 100000n,
  baseAmountVnd: 0n,
  reasonCode: 'TEST_ONLY',
  sourceSnapshotJson: {},
  tenant: { connect: { id: key } },
  invoice: {
    connect: {
      tenantId_id_studentId: { tenantId: key, id: key, studentId: key },
    },
  },
  participant: {
    connect: {
      tenantId_sessionId_studentId_id: {
        tenantId: key,
        sessionId: key,
        studentId: key,
        id: key,
      },
    },
  },
  session: { connect: { tenantId_id: { tenantId: key, id: key } } },
};

describe('R1b offline checks (not PostgreSQL verification)', () => {
  it('preserves the normalized exact R1a schema except one nullable marker', () => {
    const current = readFileSync(resolve('prisma/schema.prisma'), 'utf8');
    expect(current.match(/^model /gm)).toHaveLength(62);
    expect(current.match(/^enum /gm)).toHaveLength(28);
    const base = current
      .replace(/^.*timezoneFrozenAt[^\n]*\n/m, '')
      .replace(/[ \t]+/g, ' ')
      .replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(base).digest('hex')).toBe(
      'fffef9396622a395788126f3ed4e21d11908f73e0b8b38011cdefbf1e4abda39',
    );
    expect(current).toMatch(
      /timezoneFrozenAt\s+DateTime\?\s+@map\("timezone_frozen_at"\) @db.Timestamptz\(6\)/,
    );
  });
  it('keeps the generated R1a baseline immutable and without R1b or Wallet deltas', () => {
    expect(createHash('sha256').update(baselineSql()).digest('hex')).toBe(
      'c134fc7e71cc102236ee2c7c8e386f17467ef65d6050e3c7e75147413de37b20',
    );
    expect(baselineSql().match(/CREATE TABLE/g)).toHaveLength(62);
    expect(baselineSql()).not.toMatch(
      /timezone_frozen_at|CREATE TABLE "wallet|billing_run_generations/i,
    );
    for (const name of [
      'il_invoice_student_fk',
      'il_participant_student_fk',
      'ar_participant_session_fk',
      'ar_finalization_session_fk',
    ])
      expect(baselineSql()).toContain(`CONSTRAINT "${name}" FOREIGN KEY`);
  });
  it('retains optional generated nested relations, including zero-line shapes', () => {
    expect(optionalFinalization.finalization).toBeUndefined();
    expect(nestedFinalization.finalization).toBeDefined();
    expect(disconnect.finalization).toEqual({ disconnect: true });
    expect(nestedLine.chargeUnits).toBe(0);
  });
  it('requires explicit disposable-cluster confirmation before any connection', () => {
    expect(() => safeTarget({})).toThrow('confirm a disposable cluster');
    expect(() =>
      safeTarget({ DATABASE_URL: 'postgresql://hidden.invalid/private' }),
    ).toThrow();
  });
  it.each([
    'postgresql://example.com/educore_r1b_test',
    'postgresql://127.0.0.1/production',
    'postgresql://127.0.0.1/postgres',
    'postgresql://127.0.0.1/educore_r1b_test?host=remote.invalid',
    'postgresql://127.0.0.1/educore_r1b_test#fragment',
    'mysql://127.0.0.1/educore_r1b_test',
    'postgresql://127.0.0.1/educore_r1b_test%2fother',
  ])('rejects unsafe or ambiguous test URL: %s', (url) => {
    expect(() =>
      safeTarget({
        R1B_TEST_DISPOSABLE: 'I_OWN_THIS_DISPOSABLE_CLUSTER',
        R1B_TEST_URL: url,
      }),
    ).toThrow();
  });
  it('accepts only an explicitly named loopback disposable target', () => {
    const url = 'postgresql://127.0.0.1:15432/educore_r1b_case';
    expect(
      safeTarget({
        R1B_TEST_DISPOSABLE: 'I_OWN_THIS_DISPOSABLE_CLUSTER',
        R1B_TEST_URL: url,
      }),
    ).toBe(url);
  });
  it('keeps a bounded SQL inventory and a transactional fail-closed migration', () => {
    const sql = migrationSql();
    expect(sql.match(/^CREATE FUNCTION /gm)).toHaveLength(8);
    expect(sql.match(/^CREATE TRIGGER /gm)).toHaveLength(13);
    expect(sql.match(/ADD COLUMN/g)).toHaveLength(1);
    expect(sql).toContain('r1b_legacy_adoption_required');
    expect(sql).not.toMatch(
      /DISABLE TRIGGER|SET CONSTRAINTS|CREATE TABLE|DROP TABLE|TRUNCATE/i,
    );
    expect(sql).toMatch(/BEGIN;[\s\S]*COMMIT;\s*$/);
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("current_user <> 'educore_r1b_guard_owner'");
  });
  it('has no PUBLIC helper access or runtime broad-read grant in companion setup', () => {
    expect(migrationSql()).toContain(
      'REVOKE ALL ON ALL FUNCTIONS IN SCHEMA educore_private FROM PUBLIC',
    );
    const profile = readFileSync(
      resolve('prisma/security/r1b-runtime-profile.sql'),
      'utf8',
    );
    expect(profile).toContain('has_any_column_privilege');
    expect(profile).not.toMatch(/GRANT SELECT|CREATE FUNCTION|CREATE TRIGGER/);
    expect(profile).toContain('Runtime profile names already exist');
  });
});
