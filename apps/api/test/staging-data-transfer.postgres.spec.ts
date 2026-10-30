import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import { connection } from '../scripts/staging-data-transfer.js';
import { seed, put } from './schema-integrity/support.js';

const raw = process.env.EDUCORE_TRANSFER_TEST_URL;
const suite =
  raw &&
  process.env.EDUCORE_TRANSFER_TEST_DISPOSABLE ===
    'I_OWN_THIS_ISOLATED_TRANSFER_DATABASE'
    ? describe
    : describe.skip;
suite('isolated PG16 transfer guard evidence', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(async () => {
    const opts = connection(raw!, 'isolated');
    if (!opts.database.endsWith('_target'))
      throw Error('ONLY_RESTORED_EMPTY_TARGET_ALLOWED');
    sql = postgres({
      ...opts,
      max: 1,
      prepare: false,
      onnotice: () => {},
      connection: { statement_timeout: 30000, lock_timeout: 3000 },
    });
    const [r] =
      await sql`SELECT NOT rolsuper AND NOT rolbypassrls safe FROM pg_roles WHERE rolname=session_user`;
    expect(r.safe).toBe(true);
    expect((await sql`SELECT count(*)::int n FROM tenants`)[0].n).toBe(0);
  });
  afterAll(async () => {
    if (sql) await sql.end({ timeout: 3 });
  });
  it('resolves the nullable submission/version FK cycle but proves the active guard rewrites historical timestamps', async () => {
    const rollback = new Error('ROLLBACK_SYNTHETIC_FIXTURE');
    let stage = 'seed';
    try {
      await sql.begin(async (tx) => {
        const f = await seed(tx);
        stage = 'assignment';
        const assignment = await put(tx, 'assignments', {
          tenant_id: f.tenant,
          class_id: f.classId,
          created_by_teacher_id: f.teacher,
          title: 'Synthetic restore probe',
          description: 'No real data',
          priority: 1,
          deadline_at: '2099-10-01T00:00:00Z',
          published_at: '2020-01-01T00:00:00Z',
          status: 'PUBLISHED',
          revision: 1,
        });
        stage = 'recipient';
        const recipient = await put(tx, 'assignment_recipients', {
          tenant_id: f.tenant,
          assignment_id: assignment,
          student_id: f.student,
          class_id: f.classId,
          enrollment_id: f.enrollment,
          assigned_at: '2020-01-01T00:00:00Z',
        });
        stage = 'submission';
        const sub = await put(tx, 'submissions', {
          tenant_id: f.tenant,
          recipient_id: recipient,
          status: 'SUBMITTED',
          current_version_id: null,
        });
        stage = 'version';
        const version = await put(tx, 'submission_versions', {
          tenant_id: f.tenant,
          submission_id: sub,
          version_no: 1,
          submitted_at: '2020-01-02T03:04:05.123456Z',
          answer_text: 'Synthetic history',
          is_late: false,
          status: 'SUBMITTED',
        });
        stage = 'pointer';
        await tx`UPDATE submissions SET current_version_id=${version}::uuid,updated_at=clock_timestamp() WHERE id=${sub}::uuid`;
        await tx`SET CONSTRAINTS ALL IMMEDIATE`;
        const [r] =
          await tx`SELECT submitted_at='2020-01-02T03:04:05.123456Z'::timestamptz historical_timestamp_preserved FROM submission_versions WHERE id=${version}::uuid`;
        expect(r.historical_timestamp_preserved).toBe(false);
        const [guard] =
          await tx`SELECT tgenabled enabled FROM pg_trigger WHERE tgname='r5_version_immutable'`;
        expect(guard.enabled).toBe('O');
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback) {
        const code = String((e as { code?: string }).code ?? 'ASSERTION');
        const tag =
          e instanceof Error && /^[A-Z_]+$/.test(e.message)
            ? e.message
            : 'DETAILS_PRIVATE';
        throw Error(
          'SUBMISSION_GUARD_PROBE_FAILED:' + stage + ':' + code + ':' + tag,
        );
      }
    }
    expect((await sql`SELECT count(*)::int n FROM tenants`)[0].n).toBe(0);
  });
  it('enforces tenant FK boundaries and rolls back invalid scoped references', async () => {
    const rollback = new Error('ROLLBACK_SYNTHETIC_FIXTURE');
    try {
      await sql.begin(async (tx) => {
        await seed(tx);
        let state = '';
        try {
          await tx.savepoint(async (sp) => {
            await sp`INSERT INTO teacher_profiles(id,tenant_id,teacher_code,full_name,status,updated_at) VALUES(${randomUUID()}::uuid,${randomUUID()}::uuid,'ISOLATED','Synthetic','ACTIVE',now())`;
          });
        } catch (e) {
          state = String((e as { code?: string }).code ?? '');
        }
        expect(state).toBe('23503');
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback)
        throw Error(
          'TENANT_ISOLATION_PROBE_FAILED:' +
            String((e as { code?: string }).code ?? 'ASSERTION'),
        );
    }
    expect((await sql`SELECT count(*)::int n FROM tenants`)[0].n).toBe(0);
  });
  it('fresh isolated AUTH/API logins retain role boundaries and cannot read credentials', async () => {
    for (const [name, key] of [
      ['AUTH', 'EDUCORE_TRANSFER_TEST_AUTH_URL'],
      ['API', 'EDUCORE_TRANSFER_TEST_API_URL'],
    ] as const) {
      const url = process.env[key];
      if (!url) throw Error('FRESH_ISOLATED_RUNTIME_URL_REQUIRED');
      const runtime = postgres({
        ...connection(url, 'isolated'),
        max: 1,
        prepare: false,
        onnotice: () => {},
        connection: { default_transaction_read_only: true },
      });
      try {
        const [r] =
          await runtime`SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls attributes_safe,
        NOT has_schema_privilege(session_user,'public','CREATE') no_ddl,
        pg_has_role(session_user,'educore_r4_auth','MEMBER') auth,pg_has_role(session_user,'educore_r4_api','MEMBER') api
        FROM pg_roles WHERE rolname=session_user`;
        expect(r.attributes_safe && r.no_ddl).toBe(true);
        expect(r.auth).toBe(name === 'AUTH');
        expect(r.api).toBe(name === 'API');
        let state = '';
        try {
          await runtime`SELECT user_id FROM public.credentials LIMIT 1`;
        } catch (e) {
          state = String((e as { code?: string }).code ?? '');
        }
        expect(state).toBe('42501');
      } finally {
        await runtime.end({ timeout: 3 });
      }
    }
  });
  it('restored source preserves wallet totals and immutable audit history counts', async () => {
    const url = process.env.EDUCORE_TRANSFER_TEST_SOURCE_URL;
    if (!url) throw Error('ISOLATED_SOURCE_URL_REQUIRED');
    const opts = connection(url, 'isolated');
    if (!opts.database.endsWith('_source'))
      throw Error('ISOLATED_SOURCE_DATABASE_REQUIRED');
    const restored = postgres({
      ...opts,
      max: 1,
      onnotice: () => {},
      connection: { default_transaction_read_only: true },
    });
    try {
      const [r] =
        await restored`SELECT (SELECT sum(balance_vnd)::text FROM wallet_accounts) balance,
      (SELECT sum(amount_vnd)::text FROM wallet_transactions) signed_total,
      (SELECT count(*)::int FROM audit_logs) audits,
      (SELECT count(*)::int FROM wallet_accounts WHERE balance_vnd<0) negative,
      (SELECT count(*)::int FROM (SELECT id FROM audit_logs GROUP BY id HAVING count(*)>1) x) duplicate_audit_ids`;
      expect(r.balance).toBe('1002000');
      expect(r.signed_total).toBe(r.balance);
      expect(r.audits).toBe(652);
      expect(r.negative).toBe(0);
      expect(r.duplicate_audit_ids).toBe(0);
    } finally {
      await restored.end({ timeout: 3 });
    }
  });
});
