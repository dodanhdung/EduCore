/** Actual single-process PostgreSQL WASM smoke; never a server/P2 gate. */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type Query,
  baselineSql,
  migrationSql,
  seed,
  line,
  put,
  id,
  enter,
  authorized,
  audit,
} from './support.js';

let db: PGlite;
function queryAdapter(engine: PGlite): Query {
  // Transport adapter only. Every SQL statement is executed by PostgreSQL WASM;
  // no SQL result, constraint, transaction, permission or lock is mocked.
  return {
    unsafe: async (text: string, params?: unknown[]) =>
      (await engine.query(text, params)).rows,
  } as unknown as Query;
}
let q: Query;
async function rejected(action: () => Promise<unknown>, code = '23514') {
  await db.exec('SAVEPOINT negative_case');
  try {
    await expect(action()).rejects.toMatchObject({ code });
  } finally {
    await db.exec(
      'ROLLBACK TO SAVEPOINT negative_case; RELEASE SAVEPOINT negative_case',
    );
  }
}
beforeAll(async () => {
  db = new PGlite();
  q = queryAdapter(db);
  await db.exec(baselineSql());
  await db.exec(migrationSql());
  await db.exec(
    readFileSync(resolve('prisma/security/r1b-runtime-profile.sql'), 'utf8'),
  );
});
beforeEach(async () => {
  await db.exec('BEGIN');
});
afterEach(async () => {
  await db.exec('ROLLBACK');
});
afterAll(async () => {
  await db.close();
});

describe('R1b PostgreSQL WASM smoke ONLY (no independent backends)', () => {
  it('treats draft reason_code as metadata while preserving evidence and freezing it after issue', async () => {
    const f = await seed(q);
    const l = await line(q, f);
    const protectedRow = () =>
      db.query(
        "SELECT to_jsonb(l)-ARRAY['updated_at','reason_code'] AS evidence FROM invoice_lines l WHERE id=$1",
        [l],
      );
    const before = (await protectedRow()).rows;
    await db.query(
      "UPDATE invoice_lines SET reason_code='DRAFT_NOTE',updated_at=clock_timestamp() WHERE id=$1",
      [l],
    );
    expect((await protectedRow()).rows).toEqual(before);
    await db.query(
      "UPDATE invoices SET status='ISSUED',issued_at=clock_timestamp(),invoice_number='REASON-TEST' WHERE id=$1",
      [f.invoice],
    );
    await rejected(() =>
      db.query(
        "UPDATE invoice_lines SET reason_code='AFTER_ISSUE' WHERE id=$1",
        [l],
      ),
    );
    await rejected(() =>
      db.query("UPDATE invoices SET status='CANCELLED' WHERE id=$1", [
        f.invoice,
      ]),
    );
    expect((await protectedRow()).rows).toEqual(before);
  });
  it('executes current-auth SQL with stored grants/scopes and rejects revoked/cross-tenant access', async () => {
    const f = await seed(q),
      g = await seed(q);
    await enter(q, f);
    await authorized(q, f);
    await audit(q, f, f.tenant);
    await expect(authorized(q, f, g.tenant)).rejects.toMatchObject({
      code: '42501',
    });
    await db.query(
      'DELETE FROM role_permissions WHERE tenant_id=$1 AND role_id=$2',
      [f.tenant, f.role],
    );
    await expect(authorized(q, f)).rejects.toMatchObject({ code: '42501' });
  });
  it('freezes viable first-source paths and retains marker after deleting the last source', async () => {
    for (const firstSource of ['series', 'session', 'period'] as const) {
      const f = await seed(q, { firstSource });
      expect(
        (
          await db.query<{ marker: string | null }>(
            'SELECT timezone_frozen_at::text AS marker FROM tenants WHERE id=$1',
            [f.tenant],
          )
        ).rows[0].marker,
      ).not.toBeNull();
    }
    const tenant = await put(q, 'tenants', {
      code: id(),
      name: 'Empty',
      status: 'ACTIVE',
    });
    await db.query("UPDATE tenants SET timezone='UTC' WHERE id=$1", [tenant]);
    const period = await put(q, 'billing_periods', {
      tenant_id: tenant,
      month_start: '2099-09-01',
      month_end: '2099-10-01',
      status: 'OPEN',
    });
    const before = (
      await db.query<{ marker: string }>(
        'SELECT timezone_frozen_at::text AS marker FROM tenants WHERE id=$1',
        [tenant],
      )
    ).rows[0].marker;
    await db.query('DELETE FROM billing_periods WHERE id=$1', [period]);
    await rejected(() =>
      db.query("UPDATE tenants SET timezone='Asia/Ho_Chi_Minh' WHERE id=$1", [
        tenant,
      ]),
    );
    expect(
      (
        await db.query<{ marker: string }>(
          'SELECT timezone_frozen_at::text AS marker FROM tenants WHERE id=$1',
          [tenant],
        )
      ).rows[0].marker,
    ).toBe(before);
  });
  it('applies exact SQL and exposes the expected guard catalog', async () => {
    const t = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'r1b_%'",
    );
    expect(t.rows[0].n).toBe(13);
    const f = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_private'",
    );
    expect(f.rows[0].n).toBe(8);
  });
  it('captures valid live attribution, original chain and exact microseconds', async () => {
    const f = await seed(q, { start: '2099-09-30T16:59:59.999999Z' });
    const l = await line(q, f);
    const rows = await db.query<{
      source_snapshot_json: { r1bAttribution: Record<string, unknown> };
    }>('SELECT source_snapshot_json FROM invoice_lines WHERE id=$1', [l]);
    expect(rows.rows[0].source_snapshot_json.r1bAttribution).toMatchObject({
      studentId: f.student,
      courseId: f.course,
      enrollmentId: f.enrollment,
      localSessionDate: '2099-09-30',
      startsAtUtc: '2099-09-30T16:59:59.999999Z',
    });
  });
  it('rejects wrong student and wrong period without repairing scalars', async () => {
    const f = await seed(q);
    await rejected(() => line(q, f, { student_id: f.student2 }), '23503');
    const oct = await seed(q, { start: '2099-09-30T17:00:00Z' });
    await rejected(() =>
      line(q, oct, {
        source_snapshot_json:
          '{"r1bAttribution":{"localSessionDate":"2099-09-30"}}',
      }),
    );
    expect(
      (
        await db.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM invoice_lines',
        )
      ).rows[0].n,
    ).toBe(0);
  });
  it('uses tenant-local start for overnight and session TimeZone changes', async () => {
    const f = await seed(q);
    await db.exec("SET LOCAL TIME ZONE 'America/New_York'");
    const l = await line(q, f);
    expect(
      (
        await db.query<{ d: string }>(
          "SELECT source_snapshot_json->'r1bAttribution'->>'localSessionDate' AS d FROM invoice_lines WHERE id=$1",
          [l],
        )
      ).rows[0].d,
    ).toBe('2099-09-30');
  });
  it('accepts cancelled zero lines with NULL attendance', async () => {
    const f = await seed(q);
    await db.query("UPDATE class_sessions SET status='CANCELLED' WHERE id=$1", [
      f.session,
    ]);
    const l = await line(q, f, {
      charge_units: 0,
      base_amount_vnd: '0',
      source_status: 'CANCELLED',
    });
    expect(
      (
        await db.query<{ attendance_id: string | null }>(
          'SELECT attendance_id FROM invoice_lines WHERE id=$1',
          [l],
        )
      ).rows[0].attendance_id,
    ).toBeNull();
  });
  it('rejects billed source/parent rewrites and allows metadata-only changes', async () => {
    const f = await seed(q);
    const l = await line(q, f);
    await rejected(() =>
      db.query("UPDATE class_sessions SET starts_at='2099-09-29' WHERE id=$1", [
        f.session,
      ]),
    );
    await rejected(() =>
      db.query('UPDATE invoices SET student_id=$2 WHERE id=$1', [
        f.invoice,
        f.student2,
      ]),
    );
    await rejected(() =>
      db.query(
        "UPDATE invoice_lines SET source_snapshot_json='{}' WHERE id=$1",
        [l],
      ),
    );
    await db.query(
      "UPDATE class_sessions SET status='COMPLETED',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",
      [f.session],
    );
  });
  it('protects Enrollment/Class inverse source lineage', async () => {
    const f = await seed(q);
    await rejected(() =>
      db.query('UPDATE enrollments SET class_id=$2 WHERE id=$1', [
        f.enrollment,
        f.class2,
      ]),
    );
    await rejected(() =>
      db.query('UPDATE classes SET course_id=$2 WHERE id=$1', [
        f.classId,
        id(),
      ]),
    );
    const wrong = await put(q, 'enrollments', {
      tenant_id: f.tenant,
      student_id: f.student,
      class_id: f.class2,
      status: 'ACTIVE',
      effective_from: '2099-01-01',
      created_by_membership_id: f.member,
    });
    await rejected(() =>
      db.query('UPDATE session_participants SET enrollment_id=$2 WHERE id=$1', [
        f.participant,
        wrong,
      ]),
    );
  });
  it('enforces monthly shape and permanently frozen timezone', async () => {
    const f = await seed(q);
    await rejected(() =>
      put(q, 'billing_periods', {
        tenant_id: f.tenant,
        month_start: '2100-01-31',
        month_end: '2100-02-01',
        status: 'OPEN',
      }),
    );
    await rejected(() =>
      db.query("UPDATE tenants SET timezone='UTC' WHERE id=$1", [f.tenant]),
    );
    await rejected(() =>
      db.query('UPDATE tenants SET timezone_frozen_at=NULL WHERE id=$1', [
        f.tenant,
      ]),
    );
    const empty = await put(q, 'tenants', {
      code: id(),
      name: 'Empty',
      status: 'ACTIVE',
    });
    await rejected(
      () =>
        db.query(
          'UPDATE tenants SET timezone_frozen_at=clock_timestamp() WHERE id=$1',
          [empty],
        ),
      '42501',
    );
  });
  it('executes invoker/definer boundaries under ordinary runtime identity', async () => {
    const f = await seed(q);
    await db.exec(
      'SAVEPOINT ordinary_role; SET SESSION AUTHORIZATION educore_r1b_api',
    );
    try {
      await expect(
        db.query(
          'UPDATE public.tenants SET timezone_frozen_at=NULL WHERE id=$1',
          [f.tenant],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await db.exec(
        'ROLLBACK TO SAVEPOINT ordinary_role; RESET SESSION AUTHORIZATION',
      );
    }
  });
  it('keeps optional finalization, freezes billed attendance facts and permits lock metadata', async () => {
    const f = await seed(q);
    const record = await put(q, 'attendance_records', {
      tenant_id: f.tenant,
      session_id: f.session,
      participant_id: f.participant,
      attendance_status: 'ATTENDED',
      recorded_by_membership_id: f.member,
      recorded_at: '2099-10-01',
      revision: 1,
    });
    const finalization = await put(q, 'attendance_finalizations', {
      tenant_id: f.tenant,
      session_id: f.session,
      confirmed_by_membership_id: f.member,
      confirmed_at: '2099-10-01',
      revision: 1,
    });
    await db.query(
      'UPDATE attendance_records SET finalization_id=$2 WHERE id=$1',
      [record, finalization],
    );
    await db.query(
      'UPDATE attendance_records SET finalization_id=NULL WHERE id=$1',
      [record],
    );
    await db.query(
      'UPDATE attendance_records SET finalization_id=$2 WHERE id=$1',
      [record, finalization],
    );
    await line(q, f, { attendance_id: record });
    await rejected(() =>
      db.query(
        'UPDATE attendance_records SET finalization_id=NULL WHERE id=$1',
        [record],
      ),
    );
    await db.query(
      'UPDATE attendance_records SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
      [record],
    );
    await db.query(
      'UPDATE attendance_finalizations SET locked_at=clock_timestamp(),revision=revision+1 WHERE id=$1',
      [finalization],
    );
    await rejected(() =>
      db.query(
        'UPDATE attendance_finalizations SET locked_at=NULL WHERE id=$1',
        [finalization],
      ),
    );
  });
  it('protects was-issued header/Line and permanent participation claim', async () => {
    const f = await seed(q);
    const l = await line(q, f);
    await db.query(
      "UPDATE invoices SET status='ISSUED',issued_at=clock_timestamp(),invoice_number='TEST-1' WHERE id=$1",
      [f.invoice],
    );
    const claim = await put(q, 'invoiced_participation_claims', {
      tenant_id: f.tenant,
      participant_id: f.participant,
      invoice_line_id: l,
      claimed_at: '2099-10-01',
    });
    await rejected(() =>
      db.query(
        "UPDATE invoices SET status='DRAFT',issued_at=NULL,invoice_number=NULL WHERE id=$1",
        [f.invoice],
      ),
    );
    await rejected(() =>
      db.query('DELETE FROM invoice_lines WHERE id=$1', [l]),
    );
    await rejected(() =>
      db.query('DELETE FROM invoiced_participation_claims WHERE id=$1', [
        claim,
      ]),
    );
  });
  it('rolls back injected DDL failure and safely blocks populated legacy upgrade', async () => {
    const other = new PGlite();
    const oq = queryAdapter(other);
    try {
      const fault =
        'BEGIN;\n' +
        baselineSql() +
        '\n' +
        migrationSql()
          .replace(/^BEGIN;$/m, '')
          .replace(/^COMMIT;$/m, 'SELECT 1/0;\nCOMMIT;');
      await expect(other.exec(fault)).rejects.toMatchObject({ code: '22012' });
      await other.exec('ROLLBACK');
      expect(
        (
          await other.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'",
          )
        ).rows[0].n,
      ).toBe(0);
      await other.exec(baselineSql());
      const f = await seed(oq, { start: '2099-09-30T17:00:00Z' });
      const l = await line(oq, f);
      await other.query(
        "UPDATE invoices SET status='ISSUED',issued_at=clock_timestamp() WHERE id=$1",
        [f.invoice],
      );
      const before = (
        await other.query(
          'SELECT source_snapshot_json FROM invoice_lines WHERE id=$1',
          [l],
        )
      ).rows;
      await expect(other.exec(migrationSql())).rejects.toMatchObject({
        code: '23514',
      });
      await other.exec('ROLLBACK');
      expect(
        (
          await other.query(
            'SELECT source_snapshot_json FROM invoice_lines WHERE id=$1',
            [l],
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await other.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='tenants' AND column_name='timezone_frozen_at'",
          )
        ).rows[0].n,
      ).toBe(0);
    } finally {
      await other.close();
    }
  });
});
