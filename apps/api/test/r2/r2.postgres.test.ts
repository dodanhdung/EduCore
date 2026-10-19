import 'reflect-metadata';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import postgres from 'postgres';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  seed,
  put,
  type Query,
  waitBlocked,
} from '../schema-integrity/support.js';
import { BillingModule } from '../../src/billing/billing.module.js';
import {
  GenerationService,
  InvoiceLifecycleService,
  WalletService,
  FinancialCoordinator,
} from '../../src/billing/billing-services.js';

let url = '';
let admin: postgres.Sql;
const clients: postgres.Sql[] = [];
const modules: TestingModule[] = [];
const evidence: Record<string, unknown> = {
  cases: {},
  races: [],
  migrations: [],
};
const cases = evidence.cases as Record<string, string>;
const native = (name: string, action: () => Promise<void>) =>
  it(name, async () => {
    try {
      await action();
      cases[name] = 'PASS';
    } catch (error) {
      cases[name] = 'FAIL';
      throw error;
    }
  });
const intent = () => ({
  key: randomUUID(),
  reason: 'Synthetic authorized R2 verification',
});

beforeAll(async () => {
  if (process.env.R2_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER')
    throw Error('R2_DISPOSABLE_CONFIRMATION_REQUIRED');
  const u = new URL(process.env.R2_TEST_URL ?? '');
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['127.0.0.1', '[::1]'].includes(u.hostname) ||
    !/^\/educore_r2_[a-z0-9_]+$/.test(u.pathname) ||
    u.search ||
    u.hash
  )
    throw Error('UNSAFE_R2_TARGET');
  url = u.toString();
  admin = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  const admission = await admin.unsafe(
    "SELECT current_database() name,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r') tables,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser",
  );
  if (admission[0].tables !== 0 || !admission[0].superuser)
    throw Error('R2_TARGET_NOT_EMPTY_DEDICATED_ADMIN');
  const require = createRequire(import.meta.url);
  const cli = require.resolve('prisma/build/index.js');
  const faultRoot = mkdtempSync(join(tmpdir(), 'educore-r2-migration-fault-'));
  const faultMigrations = join(faultRoot, 'migrations');
  mkdirSync(faultMigrations);
  writeFileSync(
    join(faultMigrations, 'migration_lock.toml'),
    readFileSync(resolve('prisma/migrations/migration_lock.toml')),
  );
  for (const name of readdirSync(resolve('prisma/migrations')).filter((n) =>
    /^\d{12}_/.test(n),
  )) {
    mkdirSync(join(faultMigrations, name));
    let sql = readFileSync(
      resolve('prisma/migrations', name, 'migration.sql'),
      'utf8',
    );
    if (name === '202610190004_r2_financial_integrity')
      sql = sql.replace(/COMMIT;\s*$/, 'SELECT 1/0;\nCOMMIT;');
    writeFileSync(join(faultMigrations, name, 'migration.sql'), sql);
  }
  const faultConfig = join(faultRoot, 'prisma.config.mjs');
  // File contains paths only. Private URL is passed by process environment.
  writeFileSync(
    faultConfig,
    'export default {schema:' +
      JSON.stringify(resolve('prisma/schema.prisma')) +
      ',migrations:{path:' +
      JSON.stringify(faultMigrations) +
      '},datasource:{url:process.env.DATABASE_URL}};',
  );
  let failed = false;
  let migrationFailure = '';
  try {
    execFileSync(
      process.execPath,
      [cli, 'migrate', 'deploy', '--config', faultConfig],
      {
        cwd: resolve('.'),
        env: { ...process.env, DATABASE_URL: url },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90_000,
      },
    );
  } catch (error) {
    failed = true;
    const failure = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    migrationFailure = (
      String(failure.stdout ?? '') + String(failure.stderr ?? '')
    )
      .replaceAll(url, '[REDACTED_URL]')
      .replaceAll(new URL(url).password, '[REDACTED]');
  }
  expect(failed).toBe(true);
  expect(
    (
      await admin.unsafe("SELECT to_regclass('public.wallet_accounts') object")
    )[0].object,
  ).toBeNull();
  expect(
    (
      await admin.unsafe(
        "SELECT count(*)::int n FROM pg_roles WHERE rolname IN ('educore_r2_owner','educore_r2_command')",
      )
    )[0].n,
  ).toBe(0);
  const failedHistory = await admin.unsafe(
    "SELECT finished_at,rolled_back_at,logs FROM _prisma_migrations WHERE migration_name='202610190004_r2_financial_integrity'",
  );
  expect(failedHistory).toHaveLength(1);
  expect(failedHistory[0].finished_at).toBeNull();
  expect(failedHistory[0].rolled_back_at).toBeNull();
  // Prisma may leave logs NULL after an explicitly aborted migration TX;
  // assert the actual CLI database error plus catalog rollback instead.
  expect(migrationFailure).toMatch(
    /division by zero|current transaction is aborted/,
  );
  let faultCode = '';
  try {
    await admin
      .unsafe(
        readFileSync(
          join(
            faultMigrations,
            '202610190004_r2_financial_integrity',
            'migration.sql',
          ),
          'utf8',
        ),
      )
      .simple();
  } catch (error) {
    faultCode = (error as { code: string }).code;
  } finally {
    await admin.unsafe('ROLLBACK');
  }
  expect(faultCode).toBe('22012');
  // Supported recovery ONLY after proof of rollback on this task-owned target.
  // No mark-applied, populated adoption or fabricated success history.
  execFileSync(
    process.execPath,
    [
      cli,
      'migrate',
      'resolve',
      '--rolled-back',
      '202610190004_r2_financial_integrity',
      '--config',
      faultConfig,
    ],
    {
      cwd: resolve('.'),
      env: { ...process.env, DATABASE_URL: url },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    },
  );
  evidence.migrationFault = {
    sqlstate: '22012',
    ddlRolledBack: true,
    rolesRolledBack: true,
    recovery:
      'Prisma resolve --rolled-back after catalog proof, followed by real deploy',
  };
  try {
    execFileSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
      {
        cwd: resolve('.'),
        env: { ...process.env, DATABASE_URL: url },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90_000,
      },
    );
  } catch {
    throw Error('R2_MIGRATE_FAILED_INSPECT_OWNED_TARGET');
  }
  await admin
    .unsafe(
      readFileSync(resolve('prisma/security/r1b-runtime-profile.sql'), 'utf8'),
    )
    .simple();
  evidence.server = (await admin.unsafe('SELECT version() version'))[0].version;
  evidence.migrations = await admin.unsafe(
    'SELECT migration_name,finished_at IS NOT NULL finished,rolled_back_at FROM _prisma_migrations ORDER BY migration_name',
  );
  evidence.r1aSha256 = createHash('sha256')
    .update(
      readFileSync(
        resolve('prisma/migrations/202610190001_r1a_baseline/migration.sql'),
      ),
    )
    .digest('hex');
  evidence.r1bSha256 = createHash('sha256')
    .update(
      readFileSync(
        resolve('prisma/migrations/202610190002_r1b_integrity/migration.sql'),
      ),
    )
    .digest('hex');
});
afterAll(async () => {
  for (const m of modules) await m.close();
  await Promise.all(clients.map((c) => c.end({ timeout: 2 })));
  if (admin) await admin.end({ timeout: 2 });
  const dir = mkdtempSync(join(tmpdir(), 'educore-r2-evidence-'));
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('R2 sanitized evidence: ' + join(dir, 'evidence.json'));
});

async function fixture(
  options: {
    price?: string;
    cancelled?: boolean;
    missing?: boolean;
    sibling?: boolean;
    zone?: string;
    start?: string;
    month?: string;
    tariffs?: { from: string; to?: string; price: string }[];
  } = {},
) {
  const f = await seed(admin as unknown as Query, {
    start: options.start ?? '2025-09-20T10:00:00Z',
    zone: options.zone,
    sessionStatus: options.cancelled ? 'CANCELLED' : 'DRAFT',
    enrollmentFrom: '2020-01-01T00:00:00Z',
  });
  // Synthetic original enrollment/price evidence precedes the old test session.
  // This is a fresh test dataset, never a historical production backfill.
  const policy = await put(admin as unknown as Query, 'policy_versions', {
    tenant_id: f.tenant,
    version_code: 'R2_CURRENT',
    effective_from: '2020-01-01',
    config_snapshot: '{}',
    content_hash: 'synthetic-r2-policy',
  });
  await admin.unsafe("UPDATE roles SET code='MANAGER' WHERE id=$1", [f.role]);
  for (const code of [
    'billing.generate_draft',
    'invoice.read',
    'invoice.issue',
    'invoice.adjust_request',
    'invoice.cancel_request',
    'payment.record',
    'payment.reverse',
    'approval.decide',
    'approval.execute',
  ]) {
    let permissions = await admin.unsafe(
      'SELECT id FROM permissions WHERE code=$1',
      [code],
    );
    if (!permissions.length) {
      const p = await put(admin as unknown as Query, 'permissions', {
        code,
        description: 'R2 approved catalog fixture',
      });
      permissions = [{ id: p }] as unknown as typeof permissions;
    }
    await put(admin as unknown as Query, 'role_permissions', {
      tenant_id: f.tenant,
      role_id: f.role,
      permission_id: permissions[0].id,
    });
  }
  for (const tariff of options.tariffs ?? [
    { from: '2020-01-01', price: options.price ?? '800000' },
  ])
    await put(admin as unknown as Query, 'price_rules', {
      tenant_id: f.tenant,
      scope_kind: 'COURSE',
      course_id: f.course,
      unit_price_vnd: tariff.price,
      effective_from: tariff.from,
      effective_to: tariff.to ?? null,
      policy_version_id: policy,
      created_by_membership_id: f.member,
      created_at: '2019-01-01',
    });
  if (!options.missing && !options.cancelled) {
    const af = await put(
      admin as unknown as Query,
      'attendance_finalizations',
      {
        tenant_id: f.tenant,
        session_id: f.session,
        confirmed_by_membership_id: f.member,
        confirmed_at: '2025-10-01',
        revision: 1,
      },
    );
    await put(admin as unknown as Query, 'attendance_records', {
      tenant_id: f.tenant,
      session_id: f.session,
      participant_id: f.participant,
      finalization_id: af,
      attendance_status: 'ATTENDED',
      recorded_by_membership_id: f.member,
      recorded_at: '2025-10-01',
      revision: 1,
    });
    // R1b forbids editing a past start, but harmless status completion is valid.
    await admin.unsafe(
      "UPDATE class_sessions SET status='COMPLETED' WHERE id=$1",
      [f.session],
    );
  }
  if (options.sibling) {
    await put(admin as unknown as Query, 'enrollments', {
      tenant_id: f.tenant,
      class_id: f.classId,
      student_id: f.student2,
      status: 'ACTIVE',
      effective_from: '2020-01-01',
      created_by_membership_id: f.member,
    });
    await put(admin as unknown as Query, 'verified_sibling_relationships', {
      tenant_id: f.tenant,
      student_a_id: f.student,
      student_b_id: f.student2,
      verified_by_membership_id: f.member,
      verified_at: '2020-01-01',
    });
  }
  // Existing R1b seed owns a synthetic future period/run/invoice. R2 uses a
  // different closed period and generates its own logical invoice from sources.
  const period = await put(admin as unknown as Query, 'billing_periods', {
    tenant_id: f.tenant,
    month_start: (options.month ?? '2025-09') + '-01',
    month_end: new Date(
      Date.UTC(
        Number((options.month ?? '2025-09').slice(0, 4)),
        Number((options.month ?? '2025-09').slice(5, 7)),
        1,
      ),
    )
      .toISOString()
      .slice(0, 10),
    status: 'OPEN',
  });
  const login = 'r2_' + randomBytes(8).toString('hex'),
    password = randomBytes(24).toString('hex');
  await admin.unsafe(
    'CREATE ROLE "' +
      login +
      '" LOGIN PASSWORD \'' +
      password +
      "' IN ROLE educore_r2_command",
  );
  await admin.unsafe(
    'INSERT INTO r2_principal_bindings(database_role,auth_session_id) VALUES($1,$2)',
    [login, f.authSession],
  );
  const runtime = new URL(url);
  runtime.username = login;
  runtime.password = password;
  const module = await Test.createTestingModule({
    imports: [BillingModule.register(runtime.toString())],
  }).compile();
  modules.push(module);
  const sql = postgres(runtime.toString(), {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(sql);
  const ctx = {
    f,
    period,
    policy,
    module,
    sql,
    runtimeUrl: runtime.toString(), // private in memory only; never evidence
    generation: module.get(GenerationService),
    invoice: module.get(InvoiceLifecycleService),
    wallet: module.get(WalletService),
    finance: module.get(FinancialCoordinator),
  };
  return ctx;
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function draft(c: Context) {
  return c.generation.initial(c.f.tenant, c.f.student, c.period, intent());
}
async function issued(c: Context) {
  const g = await draft(c);
  await c.invoice.issue(c.f.tenant, g.invoiceId as string, intent());
  return g;
}
async function top(c: Context, amount = '1000000', key = intent()) {
  return c.wallet.topUp(
    c.f.tenant,
    c.f.student,
    amount,
    'CASH',
    randomUUID(),
    'Synthetic verified cash receipt',
    key,
  );
}
async function approved(c: Context, id: string) {
  await c.finance.approve(c.f.tenant, id, intent());
}
async function adjust(c: Context, invoiceId: string, delta: string) {
  const r = await c.invoice.requestAdjustment(
    c.f.tenant,
    invoiceId,
    delta,
    intent(),
  );
  await approved(c, r.id!);
  return c.finance.execute(c.f.tenant, r.id!, intent());
}
async function balance(c: Context) {
  return (await c.wallet.summary(c.f.tenant, c.f.student)).balanceVnd;
}

async function secondSession(
  c: Context,
  start = '2025-09-21T10:00:00Z',
  price?: string,
  query: Query = admin as unknown as Query,
) {
  const session = await put(query, 'class_sessions', {
    tenant_id: c.f.tenant,
    class_id: c.f.classId,
    teacher_id: c.f.teacher,
    delivery_mode: 'ONLINE',
    starts_at: start,
    ends_at: new Date(new Date(start).getTime() + 3600000).toISOString(),
    status: 'COMPLETED',
    revision: 1,
    policy_version_id: c.policy,
  });
  const participant = await put(query, 'session_participants', {
    tenant_id: c.f.tenant,
    session_id: session,
    student_id: c.f.student,
    enrollment_id: c.f.enrollment,
    participant_kind: 'REGULAR',
  });
  const af = await put(query, 'attendance_finalizations', {
    tenant_id: c.f.tenant,
    session_id: session,
    confirmed_by_membership_id: c.f.member,
    confirmed_at: '2025-11-01',
    revision: 1,
  });
  await put(query, 'attendance_records', {
    tenant_id: c.f.tenant,
    session_id: session,
    participant_id: participant,
    finalization_id: af,
    attendance_status: 'ATTENDED',
    recorded_by_membership_id: c.f.member,
    recorded_at: '2025-11-01',
    revision: 1,
  });
  if (price)
    await put(query, 'price_rules', {
      tenant_id: c.f.tenant,
      scope_kind: 'SESSION',
      session_id: session,
      unit_price_vnd: price,
      effective_from: '2020-01-01',
      policy_version_id: c.policy,
      created_by_membership_id: c.f.member,
      created_at: '2019-01-01',
    });
  return { session, participant };
}

/** The first real command retains its transaction/locks while a second
 * independently authenticated backend waits. Observer checks actual wait edge.
 */
async function race(
  c: Context,
  name: string,
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  commit: boolean,
) {
  const a = postgres(c.runtimeUrl, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  const b = postgres(c.runtimeUrl, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(a, b);
  await a.unsafe('BEGIN');
  const apid = (await a.unsafe('SELECT pg_backend_pid() pid'))[0].pid as number;
  const bpid = (await b.unsafe('SELECT pg_backend_pid() pid'))[0].pid as number;
  let waiting: Promise<{ code: string | null; result?: unknown }> | undefined;
  try {
    const one = await a.unsafe(
      'SELECT educore_r2.execute($1::uuid,$2::text::jsonb) result',
      [c.f.tenant, JSON.stringify(first)],
    );
    waiting = b
      .unsafe('SELECT educore_r2.execute($1::uuid,$2::text::jsonb) result', [
        c.f.tenant,
        JSON.stringify(second),
      ])
      .then(
        (r) => ({ code: null, result: r[0].result }),
        (e) => ({ code: (e as { code: string }).code }),
      );
    await waitBlocked(admin as unknown as Query, bpid, apid);
    await a.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
    const two = await waiting;
    (evidence.races as unknown[]).push({
      name,
      apid,
      bpid,
      observedWait: true,
      commitFirst: commit,
      secondCode: two.code,
    });
    return { one: one[0].result, two };
  } finally {
    await a.unsafe('ROLLBACK');
    if (waiting) await waiting;
  }
}

describe('R2 actual NestJS services / restricted PostgreSQL LOGIN', () => {
  native(
    'G01 session-date price, exact snapshot, initial replay/hash conflict',
    async () => {
      const c = await fixture();
      const key = intent();
      const g = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        c.period,
        key,
      );
      expect(g.totalVnd).toBe('800000');
      expect(g.status).toBe('DRAFT');
      expect(
        await c.generation.initial(c.f.tenant, c.f.student, c.period, key),
      ).toEqual(g);
      await expect(
        c.generation.initial(c.f.tenant, c.f.student, c.period, {
          ...key,
          reason: 'changed',
        }),
      ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED/);
      expect(
        (g.source as { lines: { localDate: string }[] }).lines[0].localDate,
      ).toBe('2025-09-20');
    },
  );
  native(
    'G02 G2 retained, same invoice, old replay cannot reset current pointer',
    async () => {
      const c = await fixture();
      const key = intent();
      const a = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        c.period,
        key,
      );
      const b = await c.generation.recompute(
        c.f.tenant,
        c.f.student,
        c.period,
        a.id!,
        a.id!,
        intent(),
      );
      expect(b.invoiceId).toBe(a.invoiceId);
      expect(b.generationNo).toBe(2);
      await c.generation.initial(c.f.tenant, c.f.student, c.period, key);
      const rows = await admin.unsafe(
        'SELECT current_generation_id FROM billing_runs WHERE id=$1',
        [a.runId as string],
      );
      expect(rows[0].current_generation_id).toBe(b.id);
      expect(
        (
          await admin.unsafe(
            'SELECT id FROM billing_run_generations WHERE run_id=$1',
            [a.runId as string],
          )
        ).length,
      ).toBe(2);
    },
  );
  native(
    'G03 missing confirmation NEEDS_INFORMATION, ISSUE denied',
    async () => {
      const c = await fixture({ missing: true });
      const g = await draft(c);
      expect(g.status).toBe('NEEDS_INFORMATION');
      expect(g.invoiceId).toBeNull();
    },
  );
  native(
    'G04 cancelled source has tariff/zero units/no fabricated attendance',
    async () => {
      const c = await fixture({ cancelled: true });
      const g = await draft(c);
      expect(g.totalVnd).toBe('0');
      expect(
        (g.source as { lines: { attendanceId: unknown }[] }).lines[0]
          .attendanceId,
      ).toBeNull();
    },
  );
  native(
    'G05 verified sibling HALF_UP once, wallet funding is not prepaid',
    async () => {
      const c = await fixture({ price: '5', sibling: true });
      const g = await draft(c);
      expect(g.totalVnd).toBe('5');
      expect(g.discountVnd).toBe('0');
      await top(c);
      expect(await balance(c)).toBe('1000000');
    },
  );
  native(
    'I01 ISSUE atomic/permanent claims/replay/immutability/no debit',
    async () => {
      const c = await fixture();
      const g = await draft(c);
      const key = intent();
      const a = await c.invoice.issue(c.f.tenant, g.invoiceId as string, key);
      expect(a.invoiceNumber).toMatch(/^INV-\d{4}-\d{6,}$/);
      expect(
        await c.invoice.issue(c.f.tenant, g.invoiceId as string, key),
      ).toEqual(a);
      expect(await balance(c)).toBe('0');
      await expect(
        c.sql.unsafe('UPDATE invoices SET total_vnd=0 WHERE id=$1', [
          g.invoiceId as string,
        ]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        admin.unsafe('UPDATE invoices SET total_vnd=0 WHERE id=$1', [
          g.invoiceId as string,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
      expect(
        (
          await admin.unsafe(
            'SELECT * FROM invoiced_participation_claims WHERE tenant_id=$1',
            [c.f.tenant],
          )
        ).length,
      ).toBe(1);
      await expect(
        c.generation.recompute(
          c.f.tenant,
          c.f.student,
          c.period,
          g.id!,
          g.id!,
          intent(),
        ),
      ).rejects.toThrow(/ISSUED_RECOMPUTE_DENIED/);
    },
  );
  native('W01 top-up replay/receipt dedup and no invoice Payment', async () => {
    const c = await fixture();
    const key = intent(),
      receipt = randomUUID();
    const invoke = (i = key) =>
      c.wallet.topUp(
        c.f.tenant,
        c.f.student,
        '1000000',
        'BANK_TRANSFER',
        receipt,
        'Synthetic verified receipt',
        i,
      );
    const a = await invoke();
    expect(await invoke()).toEqual(a);
    await expect(invoke(intent())).rejects.toThrow();
    expect(await balance(c)).toBe('1000000');
    expect(
      (
        await admin.unsafe('SELECT id FROM payments WHERE tenant_id=$1', [
          c.f.tenant,
        ])
      ).length,
    ).toBe(0);
  });
  native(
    'W02 pay800k + approved down100k -> B300k/P700k; no double root',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      await c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent());
      const request = await c.invoice.requestAdjustment(
        c.f.tenant,
        g.invoiceId as string,
        '-100000',
        intent(),
      );
      await approved(c, request.id!);
      const a = await c.finance.execute(c.f.tenant, request.id!, intent());
      expect(a.refundVnd).toBe('100000');
      expect(await balance(c)).toBe('300000');
      expect(
        await c.finance.execute(c.f.tenant, request.id!, intent()),
      ).toEqual(a);
      expect(await balance(c)).toBe('300000');
    },
  );
  native('W03 partial pay300k then down100k -> no refund/due400k', async () => {
    const c = await fixture();
    const g = await issued(c);
    await top(c);
    await c.wallet.pay(c.f.tenant, g.invoiceId as string, '300000', intent());
    expect((await adjust(c, g.invoiceId as string, '-100000')).refundVnd).toBe(
      '0',
    );
    expect(await balance(c)).toBe('700000');
    expect(
      (await c.invoice.receivable(c.f.tenant, g.invoiceId as string))
        .outstandingVnd,
    ).toBe('400000');
  });
  native(
    'W04 insufficient balance and overpay reject whole transaction',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c, '500000');
      await expect(
        c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent()),
      ).rejects.toThrow();
      expect(await balance(c)).toBe('500000');
    },
  );
  native(
    'W05 repeated adjustments/increase/cancel refund only remaining',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      await c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent());
      await adjust(c, g.invoiceId as string, '-100000');
      await adjust(c, g.invoiceId as string, '-50000');
      await adjust(c, g.invoiceId as string, '250000');
      const request = await c.invoice.requestCancellation(
        c.f.tenant,
        g.invoiceId as string,
        intent(),
      );
      await approved(c, request.id!);
      expect(
        (await c.finance.execute(c.f.tenant, request.id!, intent())).refundVnd,
      ).toBe('650000');
      expect(await balance(c)).toBe('1000000');
      expect(
        (
          await admin.unsafe('SELECT status FROM invoices WHERE id=$1', [
            g.invoiceId as string,
          ])
        )[0].status,
      ).toBe('CANCELLED');
      expect(
        (
          await admin.unsafe(
            'SELECT id FROM invoiced_participation_claims WHERE tenant_id=$1',
            [c.f.tenant],
          )
        ).length,
      ).toBe(1);
    },
  );
  native(
    'W06 payment reversal after refund credits net700k, not nominal800k',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      const pay = await c.wallet.pay(
        c.f.tenant,
        g.invoiceId as string,
        '800000',
        intent(),
      );
      await adjust(c, g.invoiceId as string, '-100000');
      const request = await c.wallet.requestPaymentReversal(
        c.f.tenant,
        g.invoiceId as string,
        pay.id!,
        intent(),
      );
      await approved(c, request.id!);
      expect(
        (await c.finance.execute(c.f.tenant, request.id!, intent())).refundVnd,
      ).toBe('700000');
      expect(await balance(c)).toBe('1000000');
    },
  );
  native(
    'W07 invalid top-up full reversal with insufficient balance keeps APPROVED',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      const receipt = await top(c);
      await c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent());
      const request = await c.wallet.requestTopUpReversal(
        c.f.tenant,
        receipt.id!,
        intent(),
      );
      await approved(c, request.id!);
      await expect(
        c.finance.execute(c.f.tenant, request.id!, intent()),
      ).rejects.toThrow(/INSUFFICIENT_AVAILABLE_BALANCE/);
      expect(
        (
          await admin.unsafe(
            'SELECT status FROM approval_requests WHERE id=$1',
            [request.id!],
          )
        )[0].status,
      ).toBe('APPROVED');
      expect(await balance(c)).toBe('200000');
    },
  );
  native('W08 full top-up reversal one source/immutable original', async () => {
    const c = await fixture();
    const receipt = await top(c);
    const request = await c.wallet.requestTopUpReversal(
      c.f.tenant,
      receipt.id!,
      intent(),
    );
    await approved(c, request.id!);
    await c.finance.execute(c.f.tenant, request.id!, intent());
    expect(await balance(c)).toBe('0');
    await expect(
      admin.unsafe('DELETE FROM wallet_transactions WHERE id=$1', [
        receipt.id!,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  native(
    'S01 ordinary LOGIN cannot raw write/read private helpers or forge actor',
    async () => {
      const c = await fixture();
      for (const sql of [
        'SELECT * FROM wallet_accounts',
        'UPDATE wallet_accounts SET balance_vnd=1000000',
        'SELECT educore_r2.capture(NULL,NULL,NULL)',
        'SET ROLE educore_r2_owner',
      ])
        await expect(c.sql.unsafe(sql)).rejects.toMatchObject({
          code: '42501',
        });
      const other = await fixture();
      await expect(
        c.wallet.topUp(
          other.f.tenant,
          other.f.student,
          '10',
          'CASH',
          randomUUID(),
          'Proof',
          intent(),
        ),
      ).rejects.toThrow(/SESSION_NOT_CURRENT/);
    },
  );
  native('S02 current permission revocation denies replay', async () => {
    const c = await fixture();
    const key = intent(),
      receipt = randomUUID();
    await c.wallet.topUp(
      c.f.tenant,
      c.f.student,
      '100',
      'CASH',
      receipt,
      'Proof',
      key,
    );
    await admin.unsafe(
      'DELETE FROM role_permissions WHERE tenant_id=$1 AND role_id=$2 AND permission_id=(SELECT id FROM permissions WHERE code=$3)',
      [c.f.tenant, c.f.role, 'payment.record'],
    );
    await expect(
      c.wallet.topUp(
        c.f.tenant,
        c.f.student,
        '100',
        'CASH',
        receipt,
        'Proof',
        key,
      ),
    ).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
  });
  native(
    'C01 two independent payments wait on tenant then cannot overpay',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      const a = postgres(url, {
        max: 1,
        prepare: false,
        onnotice: () => undefined,
      });
      clients.push(a);
      await a.unsafe('BEGIN');
      await a.unsafe('SELECT id FROM users WHERE id=$1 FOR SHARE', [c.f.user]);
      await a.unsafe('SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE', [
        c.f.tenant,
      ]);
      const blocker = (await a.unsafe('SELECT pg_backend_pid() pid'))[0]
        .pid as number;
      const waiter = (await c.sql.unsafe('SELECT pg_backend_pid() pid'))[0]
        .pid as number;
      const first = c.sql
        .unsafe('SELECT educore_r2.execute($1::uuid,$2::text::jsonb) result', [
          c.f.tenant,
          JSON.stringify({
            ...intent(),
            operation: 'PAY',
            invoiceId: g.invoiceId,
            amountVnd: '600000',
          }),
        ])
        .then((r) => r);
      await waitBlocked(admin as unknown as Query, waiter, blocker);
      await a.unsafe('COMMIT');
      await first;
      await expect(
        c.wallet.pay(c.f.tenant, g.invoiceId as string, '600000', intent()),
      ).rejects.toThrow();
      (evidence.races as unknown[]).push({
        case: 'C01',
        blocker,
        waiter,
        observedWait: true,
      });
      expect(await balance(c)).toBe('400000');
    },
  );
  native(
    'G06 date windows/month boundaries/UTC differences/overnight',
    async () => {
      const tariffs = [
        { from: '2025-09-01', to: '2025-10-01', price: '100000' },
        { from: '2025-10-01', price: '150000' },
      ];
      for (const [start, month, expected, date] of [
        ['2025-09-30T16:30:00Z', '2025-09', '100000', '2025-09-30'],
        ['2025-09-30T17:00:00Z', '2025-10', '150000', '2025-10-01'],
        ['2025-09-30T18:00:00Z', '2025-10', '150000', '2025-10-01'],
      ]) {
        const c = await fixture({ start, month, tariffs });
        const g = await draft(c);
        expect(g.totalVnd).toBe(expected);
        expect(
          (g.source as { lines: { localDate: string }[] }).lines[0].localDate,
        ).toBe(date);
      }
    },
  );
  native('G07 SESSION > CLASS > COURSE, overlap rejected', async () => {
    const c = await fixture({ price: '100000' });
    await put(admin as unknown as Query, 'price_rules', {
      tenant_id: c.f.tenant,
      scope_kind: 'CLASS',
      class_id: c.f.classId,
      unit_price_vnd: '160000',
      effective_from: '2020-01-01',
      policy_version_id: c.policy,
      created_by_membership_id: c.f.member,
      created_at: '2019-01-01',
    });
    await put(admin as unknown as Query, 'price_rules', {
      tenant_id: c.f.tenant,
      scope_kind: 'SESSION',
      session_id: c.f.session,
      unit_price_vnd: '175000',
      effective_from: '2020-01-01',
      policy_version_id: c.policy,
      created_by_membership_id: c.f.member,
      created_at: '2019-01-01',
    });
    expect((await draft(c)).totalVnd).toBe('175000');
    await expect(
      put(admin as unknown as Query, 'price_rules', {
        tenant_id: c.f.tenant,
        scope_kind: 'SESSION',
        session_id: c.f.session,
        unit_price_vnd: '200000',
        effective_from: '2021-01-01',
        policy_version_id: c.policy,
        created_by_membership_id: c.f.member,
        created_at: '2019-01-01',
      }),
    ).rejects.toMatchObject({ code: '23P01' });
  });
  native(
    'G08 historical price protected; future window close does not reprice/stale',
    async () => {
      const c = await fixture({ price: '100000' });
      const a = await draft(c);
      await expect(
        admin.unsafe(
          'UPDATE price_rules SET unit_price_vnd=150000 WHERE tenant_id=$1',
          [c.f.tenant],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await admin.unsafe(
        "UPDATE price_rules SET effective_to='2090-01-01' WHERE tenant_id=$1",
        [c.f.tenant],
      );
      await put(admin as unknown as Query, 'price_rules', {
        tenant_id: c.f.tenant,
        scope_kind: 'COURSE',
        course_id: c.f.course,
        unit_price_vnd: '200000',
        effective_from: '2090-01-01',
        policy_version_id: c.policy,
        created_by_membership_id: c.f.member,
      });
      const b = await c.generation.recompute(
        c.f.tenant,
        c.f.student,
        c.period,
        a.id!,
        a.id!,
        intent(),
      );
      expect(b.totalVnd).toBe('100000');
      await c.invoice.issue(c.f.tenant, b.invoiceId as string, intent());
    },
  );
  native(
    'G09 missing tariff cannot use a newer rule or implicit zero',
    async () => {
      const c = await fixture({
        tariffs: [{ from: '2025-10-01', price: '150000' }],
      });
      expect((await draft(c)).status).toBe('NEEDS_INFORMATION');
      const cancelled = await fixture({
        cancelled: true,
        tariffs: [{ from: '2025-10-01', price: '150000' }],
      });
      expect((await draft(cancelled)).status).toBe('NEEDS_INFORMATION');
    },
  );
  native(
    'G10 source phantom invalidates ISSUE; explicit G2 retains old snapshot',
    async () => {
      const c = await fixture();
      const a = await draft(c);
      await secondSession(c);
      await expect(
        c.invoice.issue(c.f.tenant, a.invoiceId as string, intent()),
      ).rejects.toThrow(/STALE_OR_INCOMPLETE/);
      const b = await c.generation.recompute(
        c.f.tenant,
        c.f.student,
        c.period,
        a.id!,
        a.id!,
        intent(),
      );
      expect(b.totalVnd).toBe('1600000');
      await c.invoice.issue(c.f.tenant, b.invoiceId as string, intent());
      expect(
        (
          await admin.unsafe(
            'SELECT result_snapshot FROM billing_run_generations WHERE id=$1',
            [a.id!],
          )
        )[0].result_snapshot.totalVnd,
      ).toBe('800000');
    },
  );
  native(
    'G11 EXCUSED requires approved leave; missing G1 can resolve via G2',
    async () => {
      const c = await fixture({ missing: true });
      const af = await put(
        admin as unknown as Query,
        'attendance_finalizations',
        {
          tenant_id: c.f.tenant,
          session_id: c.f.session,
          confirmed_by_membership_id: c.f.member,
          confirmed_at: '2025-10-01',
          revision: 1,
        },
      );
      await put(admin as unknown as Query, 'attendance_records', {
        tenant_id: c.f.tenant,
        session_id: c.f.session,
        participant_id: c.f.participant,
        finalization_id: af,
        attendance_status: 'EXCUSED',
        recorded_by_membership_id: c.f.member,
        recorded_at: '2025-10-01',
        revision: 1,
      });
      await admin.unsafe(
        "UPDATE class_sessions SET status='COMPLETED' WHERE id=$1",
        [c.f.session],
      );
      const a = await draft(c);
      expect(a.status).toBe('NEEDS_INFORMATION');
      await put(admin as unknown as Query, 'absence_requests', {
        tenant_id: c.f.tenant,
        participant_id: c.f.participant,
        requester_membership_id: c.f.member,
        submitted_at: '2025-09-01',
        reason: 'Approved synthetic leave',
        is_late_notice: false,
        status: 'APPROVED',
        approved_by_membership_id: c.f.member,
        decided_at: '2025-09-02',
      });
      const b = await c.generation.recompute(
        c.f.tenant,
        c.f.student,
        c.period,
        a.id!,
        null,
        intent(),
      );
      expect(b.status).toBe('DRAFT');
      expect(b.totalVnd).toBe('0');
    },
  );
  native(
    'G12 missing participation is detected from enrollment/session inventory',
    async () => {
      const c = await fixture();
      await put(admin as unknown as Query, 'class_sessions', {
        tenant_id: c.f.tenant,
        class_id: c.f.classId,
        teacher_id: c.f.teacher,
        delivery_mode: 'ONLINE',
        starts_at: '2025-09-22',
        ends_at: '2025-09-23',
        status: 'COMPLETED',
        revision: 1,
        policy_version_id: c.policy,
      });
      const g = await draft(c);
      expect(g.status).toBe('NEEDS_INFORMATION');
      expect((g.source as { missing: string[] }).missing).toContain(
        'MISSING_PARTICIPANT',
      );
    },
  );
  native(
    'G13 money overflow rejects atomically; 64-bit max remains valid',
    async () => {
      const c = await fixture({ price: '9223372036854775807' });
      expect((await draft(c)).totalVnd).toBe('9223372036854775807');
      const overflow = await fixture({ price: '9223372036854775807' });
      await secondSession(overflow);
      await expect(draft(overflow)).rejects.toThrow(/MONEY_OVERFLOW/);
      expect(
        (
          await admin.unsafe(
            'SELECT id FROM billing_run_generations WHERE tenant_id=$1',
            [overflow.f.tenant],
          )
        ).length,
      ).toBe(0);
    },
  );
  native(
    'G14 two students share session, distinct invoice identities',
    async () => {
      // Construct the complete original roster before sealing finalization.
      const c = await fixture({ missing: true });
      await put(admin as unknown as Query, 'session_participants', {
        tenant_id: c.f.tenant,
        session_id: c.f.session,
        student_id: c.f.student2,
        enrollment_id: await put(admin as unknown as Query, 'enrollments', {
          tenant_id: c.f.tenant,
          class_id: c.f.classId,
          student_id: c.f.student2,
          status: 'ACTIVE',
          effective_from: '2020-01-01',
          created_by_membership_id: c.f.member,
        }),
        participant_kind: 'REGULAR',
      });
      const p = (
        await admin.unsafe(
          'SELECT id FROM session_participants WHERE session_id=$1 AND student_id=$2',
          [c.f.session, c.f.student2],
        )
      )[0].id as string;
      const af = await put(
        admin as unknown as Query,
        'attendance_finalizations',
        {
          tenant_id: c.f.tenant,
          session_id: c.f.session,
          confirmed_by_membership_id: c.f.member,
          confirmed_at: '2025-10-01',
          revision: 1,
        },
      );
      await put(admin as unknown as Query, 'attendance_records', {
        tenant_id: c.f.tenant,
        session_id: c.f.session,
        participant_id: c.f.participant,
        finalization_id: af,
        attendance_status: 'ATTENDED',
        recorded_by_membership_id: c.f.member,
        recorded_at: '2025-10-01',
        revision: 1,
      });
      await put(admin as unknown as Query, 'attendance_records', {
        tenant_id: c.f.tenant,
        session_id: c.f.session,
        participant_id: p,
        finalization_id: af,
        attendance_status: 'ATTENDED',
        recorded_by_membership_id: c.f.member,
        recorded_at: '2025-10-01',
        revision: 1,
      });
      await admin.unsafe(
        "UPDATE class_sessions SET status='COMPLETED' WHERE id=$1",
        [c.f.session],
      );
      const a = await draft(c),
        b = await c.generation.initial(
          c.f.tenant,
          c.f.student2,
          c.period,
          intent(),
        );
      expect(a.invoiceId).not.toBe(b.invoiceId);
      expect(b.totalVnd).toBe('800000');
    },
  );
  native(
    'G15 current policy pins on G2 while replay preserves G1 policy',
    async () => {
      const c = await fixture();
      const k = intent();
      const a = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        c.period,
        k,
      );
      const next = await put(admin as unknown as Query, 'policy_versions', {
        tenant_id: c.f.tenant,
        version_code: 'R2_NEW',
        effective_from: '2026-01-01',
        config_snapshot: '{}',
        content_hash: 'synthetic-new-policy',
      });
      const b = await c.generation.recompute(
        c.f.tenant,
        c.f.student,
        c.period,
        a.id!,
        a.id!,
        intent(),
      );
      expect(b.policyVersionId).toBe(next);
      expect(
        (await c.generation.initial(c.f.tenant, c.f.student, c.period, k))
          .policyVersionId,
      ).toBe(a.policyVersionId);
    },
  );
  native(
    'G16 transfer intervals retain original class/course price and same wallet',
    async () => {
      const c = await fixture({ price: '100000' });
      await top(c, '100');
      await admin.unsafe(
        "UPDATE enrollments SET status='TRANSFERRED',effective_to='2025-09-21' WHERE id=$1",
        [c.f.enrollment],
      );
      const original = (
        await admin.unsafe(
          'SELECT subject_id,level_id FROM courses WHERE id=$1',
          [c.f.course],
        )
      )[0];
      const course = await put(admin as unknown as Query, 'courses', {
        tenant_id: c.f.tenant,
        subject_id: original.subject_id,
        level_id: original.level_id,
        code: randomUUID(),
        name: 'New course synthetic',
        status: 'ACTIVE',
      });
      await admin.unsafe('UPDATE classes SET course_id=$1 WHERE id=$2', [
        course,
        c.f.class2,
      ]);
      await put(admin as unknown as Query, 'enrollments', {
        tenant_id: c.f.tenant,
        student_id: c.f.student,
        class_id: c.f.class2,
        status: 'ACTIVE',
        effective_from: '2025-09-21',
        created_by_membership_id: c.f.member,
      });
      await put(admin as unknown as Query, 'price_rules', {
        tenant_id: c.f.tenant,
        scope_kind: 'COURSE',
        course_id: course,
        unit_price_vnd: '200000',
        effective_from: '2020-01-01',
        policy_version_id: c.policy,
        created_by_membership_id: c.f.member,
        created_at: '2019-01-01',
      });
      const g = await draft(c);
      expect(g.totalVnd).toBe('100000');
      expect(
        (g.source as { lines: { courseId: string }[] }).lines[0].courseId,
      ).toBe(c.f.course);
      expect(await balance(c)).toBe('100');
    },
  );
  native(
    'G17 native final rounding and raw discount precision at BIGINT max',
    async () => {
      const tiny = await fixture({ price: '5', sibling: true });
      await secondSession(tiny);
      expect((await draft(tiny)).totalVnd).toBe('9');
      const c = await fixture({ price: '9223372036854775807', sibling: true });
      const g = await issued(c);
      expect(g.totalVnd).toBe('8301034833169298226');
      const raw = (
        await admin.unsafe(
          'SELECT raw_discount_decimal::text n FROM invoice_discounts WHERE tenant_id=$1',
          [c.f.tenant],
        )
      )[0].n;
      expect(raw).toBe('922337203685477580.700000');
      await expect(
        admin.unsafe('UPDATE invoice_discounts SET rate=0 WHERE tenant_id=$1', [
          c.f.tenant,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );
  native(
    'W09 LIFO refund across multiple payments and immutable allocations',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      const a = await c.wallet.pay(
        c.f.tenant,
        g.invoiceId as string,
        '300000',
        intent(),
      );
      const b = await c.wallet.pay(
        c.f.tenant,
        g.invoiceId as string,
        '500000',
        intent(),
      );
      await adjust(c, g.invoiceId as string, '-200000');
      const rows = await admin.unsafe(
        'SELECT payment_id,sum(amount_vnd)::text n FROM receivable_allocations WHERE tenant_id=$1 GROUP BY payment_id',
        [c.f.tenant],
      );
      expect(rows.find((r) => r.payment_id === a.id)?.n).toBe('300000');
      expect(rows.find((r) => r.payment_id === b.id)?.n).toBe('300000');
      await expect(
        admin.unsafe(
          'UPDATE receivable_allocations SET amount_vnd=1 WHERE tenant_id=$1',
          [c.f.tenant],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );
  native(
    'W10 fully refunded cancelled payment reversal records nominal, credit zero',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      const p = await c.wallet.pay(
        c.f.tenant,
        g.invoiceId as string,
        '800000',
        intent(),
      );
      const cancel = await c.invoice.requestCancellation(
        c.f.tenant,
        g.invoiceId as string,
        intent(),
      );
      await approved(c, cancel.id!);
      await c.finance.execute(c.f.tenant, cancel.id!, intent());
      const req = await c.wallet.requestPaymentReversal(
        c.f.tenant,
        g.invoiceId as string,
        p.id!,
        intent(),
      );
      await approved(c, req.id!);
      expect(
        (await c.finance.execute(c.f.tenant, req.id!, intent())).refundVnd,
      ).toBe('0');
      expect(await balance(c)).toBe('1000000');
    },
  );
  native(
    'W11 legacy or mixed invoice cannot receive wallet funds',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      await put(admin as unknown as Query, 'payments', {
        tenant_id: c.f.tenant,
        invoice_id: g.invoiceId,
        amount_vnd: '1',
        method: 'CASH',
        paid_at: '2025-11-01',
        recorded_by_membership_id: c.f.member,
        idempotency_key: randomUUID(),
      });
      await expect(
        c.wallet.pay(c.f.tenant, g.invoiceId as string, '1', intent()),
      ).rejects.toThrow(/UNSUPPORTED_LEGACY/);
      expect(await balance(c)).toBe('1000000');
    },
  );
  native(
    'W12 balance overflow never creates a receipt or partial credit',
    async () => {
      const c = await fixture();
      await top(c, '9223372036854775807');
      await expect(top(c, '1')).rejects.toThrow();
      expect(await balance(c)).toBe('9223372036854775807');
    },
  );
  native(
    'F01 failure after wallet debit insert rolls back every financial row',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      const trigger = 'r2_fault_' + randomBytes(6).toString('hex');
      await admin
        .unsafe(
          `CREATE FUNCTION pg_temp.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.tenant_id='${c.f.tenant}'::uuid THEN RAISE EXCEPTION 'R2_INJECTED_AUDIT_FAILURE' USING ERRCODE='23514'; END IF; RETURN NEW; END $f$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.${trigger}();`,
        )
        .simple();
      try {
        await expect(
          c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent()),
        ).rejects.toThrow(/R2_INJECTED_AUDIT_FAILURE/);
      } finally {
        await admin.unsafe(`DROP TRIGGER ${trigger} ON audit_logs`);
      }
      expect(await balance(c)).toBe('1000000');
      expect(
        (
          await admin.unsafe('SELECT id FROM payments WHERE tenant_id=$1', [
            c.f.tenant,
          ])
        ).length,
      ).toBe(0);
    },
  );
  native(
    'F02 approved decision survives failed refund, retry effect once',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      await c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent());
      const request = await c.invoice.requestAdjustment(
        c.f.tenant,
        g.invoiceId as string,
        '-100000',
        intent(),
      );
      await approved(c, request.id!);
      const key = intent();
      const trigger = 'r2_fault_' + randomBytes(6).toString('hex');
      await admin
        .unsafe(
          `CREATE FUNCTION pg_temp.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.tenant_id='${c.f.tenant}'::uuid AND NEW.kind='INVOICE_REFUND' THEN RAISE EXCEPTION 'R2_INJECTED_REFUND_FAILURE' USING ERRCODE='23514'; END IF; RETURN NEW; END $f$; CREATE TRIGGER ${trigger} AFTER INSERT ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION pg_temp.${trigger}();`,
        )
        .simple();
      try {
        await expect(
          c.finance.execute(c.f.tenant, request.id!, key),
        ).rejects.toThrow(/R2_INJECTED_REFUND_FAILURE/);
      } finally {
        await admin.unsafe(`DROP TRIGGER ${trigger} ON wallet_transactions`);
      }
      expect(
        (
          await admin.unsafe(
            'SELECT status FROM approval_requests WHERE id=$1',
            [request.id!],
          )
        )[0].status,
      ).toBe('APPROVED');
      expect(await balance(c)).toBe('200000');
      const receipt = await c.finance.execute(c.f.tenant, request.id!, key);
      expect(receipt.refundVnd).toBe('100000');
      expect(await c.finance.execute(c.f.tenant, request.id!, key)).toEqual(
        receipt,
      );
      expect(await balance(c)).toBe('300000');
    },
  );
  native(
    'F03 stale approved obligation rejected; payload cannot be overwritten',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      const a = await c.invoice.requestAdjustment(
        c.f.tenant,
        g.invoiceId as string,
        '-100000',
        intent(),
      );
      await approved(c, a.id!);
      await expect(
        admin.unsafe(
          "UPDATE approval_requests SET payload_snapshot_json='{}' WHERE id=$1",
          [a.id!],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await adjust(c, g.invoiceId as string, '100000');
      await expect(
        c.finance.execute(c.f.tenant, a.id!, intent()),
      ).rejects.toThrow(/APPROVED_BASIS_CHANGED/);
    },
  );
  native(
    'C02 competing payments, commit/rollback outcomes observed',
    async () => {
      for (const commit of [true, false]) {
        const c = await fixture();
        const g = await issued(c);
        await top(c);
        const r = await race(
          c,
          'same-invoice-pay',
          {
            ...intent(),
            operation: 'PAY',
            invoiceId: g.invoiceId,
            amountVnd: '600000',
          },
          {
            ...intent(),
            operation: 'PAY',
            invoiceId: g.invoiceId,
            amountVnd: '600000',
          },
          commit,
        );
        expect(r.two.code).toBe(commit ? '23514' : null);
        expect(await balance(c)).toBe('400000');
      }
    },
  );
  native('C03 duplicate receipt race, commit/rollback observed', async () => {
    for (const commit of [true, false]) {
      const c = await fixture();
      const body = {
        operation: 'TOP_UP',
        studentId: c.f.student,
        amountVnd: '100000',
        method: 'CASH',
        receiptReference: randomUUID(),
        evidence: 'Verified fixture',
      };
      const r = await race(
        c,
        'same-receipt',
        { ...body, ...intent() },
        { ...body, ...intent() },
        commit,
      );
      expect(r.two.code).toBe(commit ? '23505' : null);
      expect(await balance(c)).toBe('100000');
    }
  });
  native('C04 two recomputes CAS, commit/rollback and old replay', async () => {
    for (const commit of [true, false]) {
      const c = await fixture();
      const a = await draft(c);
      const body = {
        operation: 'RECOMPUTE',
        studentId: c.f.student,
        periodId: c.period,
        expectedBase: a.id,
        expectedApplied: a.id,
      };
      const r = await race(
        c,
        'generation-CAS',
        { ...body, ...intent() },
        { ...body, ...intent() },
        commit,
      );
      expect(r.two.code).toBe(commit ? '40001' : null);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM billing_run_generations WHERE tenant_id=$1',
            [c.f.tenant],
          )
        )[0].n,
      ).toBe(2);
    }
  });
  native(
    'C05 two ISSUE commands, commit/rollback and one number/claim',
    async () => {
      for (const commit of [true, false]) {
        const c = await fixture();
        const a = await draft(c);
        const body = { operation: 'ISSUE', invoiceId: a.invoiceId };
        const r = await race(
          c,
          'issue-once',
          { ...body, ...intent() },
          { ...body, ...intent() },
          commit,
        );
        expect(r.two.code).toBe(commit ? '23514' : null);
        expect(
          (
            await admin.unsafe(
              'SELECT count(*)::int n FROM invoiced_participation_claims WHERE tenant_id=$1',
              [c.f.tenant],
            )
          )[0].n,
        ).toBe(1);
      }
    },
  );
  native(
    'C06 pay vs approved adjustment/cancel, both orders and rollback',
    async () => {
      for (const cancel of [false, true])
        for (const payFirst of [false, true])
          for (const commit of [false, true]) {
            const c = await fixture();
            const g = await issued(c);
            await top(c);
            const req = cancel
              ? await c.invoice.requestCancellation(
                  c.f.tenant,
                  g.invoiceId as string,
                  intent(),
                )
              : await c.invoice.requestAdjustment(
                  c.f.tenant,
                  g.invoiceId as string,
                  '-100000',
                  intent(),
                );
            await approved(c, req.id!);
            const pay = {
                ...intent(),
                operation: 'PAY',
                invoiceId: g.invoiceId,
                amountVnd: '800000',
              },
              execute = {
                ...intent(),
                operation: 'EXECUTE_APPROVAL',
                approvalId: req.id,
              };
            const r = await race(
              c,
              cancel ? 'pay-vs-cancel' : 'pay-vs-adjust',
              payFirst ? pay : execute,
              payFirst ? execute : pay,
              commit,
            );
            expect(r.two.code).toBe(!payFirst && commit ? '23514' : null);
            const n = (
              await admin.unsafe(
                'SELECT educore_r2.net($1,$2)::text n,educore_r2.paid($1,$2)::text p',
                [g.invoiceId as string, c.f.tenant],
              )
            )[0];
            expect(BigInt(n.p)).toBeLessThanOrEqual(BigInt(n.n));
          }
    },
  );
  native(
    'C07 two executions of same approved refund never double-credit',
    async () => {
      for (const commit of [true, false]) {
        const c = await fixture();
        const g = await issued(c);
        await top(c);
        await c.wallet.pay(
          c.f.tenant,
          g.invoiceId as string,
          '800000',
          intent(),
        );
        const request = await c.invoice.requestAdjustment(
          c.f.tenant,
          g.invoiceId as string,
          '-100000',
          intent(),
        );
        await approved(c, request.id!);
        const body = { operation: 'EXECUTE_APPROVAL', approvalId: request.id };
        const r = await race(
          c,
          'same-financial-root',
          { ...body, ...intent() },
          { ...body, ...intent() },
          commit,
        );
        expect(r.two.code).toBeNull();
        expect(await balance(c)).toBe('300000');
      }
    },
  );
  native(
    'C08 permission revoke waits/fresh authorization after commit or rollback',
    async () => {
      for (const commit of [true, false]) {
        const c = await fixture();
        const g = await issued(c);
        await top(c);
        const a = postgres(url, {
          max: 1,
          prepare: false,
          onnotice: () => undefined,
        });
        clients.push(a);
        await a.unsafe('BEGIN');
        await a.unsafe('SELECT id FROM users WHERE id=$1 FOR UPDATE', [
          c.f.user,
        ]);
        await a.unsafe('SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE', [
          c.f.tenant,
        ]);
        await a.unsafe(
          "DELETE FROM role_permissions WHERE tenant_id=$1 AND role_id=$2 AND permission_id=(SELECT id FROM permissions WHERE code='payment.record')",
          [c.f.tenant, c.f.role],
        );
        const apid = (await a.unsafe('SELECT pg_backend_pid() pid'))[0]
            .pid as number,
          bpid = (await c.sql.unsafe('SELECT pg_backend_pid() pid'))[0]
            .pid as number;
        const pending = c.sql
          .unsafe('SELECT educore_r2.execute($1::uuid,$2::text::jsonb)', [
            c.f.tenant,
            JSON.stringify({
              ...intent(),
              operation: 'PAY',
              invoiceId: g.invoiceId,
              amountVnd: '100',
            }),
          ])
          .then(
            () => null,
            (e) => (e as { code: string }).code,
          );
        try {
          await waitBlocked(admin as unknown as Query, bpid, apid);
          await a.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
          expect(await pending).toBe(commit ? '42501' : null);
        } finally {
          await a.unsafe('ROLLBACK');
          await pending;
        }
        (evidence.races as unknown[]).push({
          name: 'permission-revoke',
          apid,
          bpid,
          observedWait: true,
          commitFirst: commit,
        });
      }
    },
  );
  native('C09 two invoices compete for one wallet balance', async () => {
    for (const commit of [true, false]) {
      const c = await fixture();
      const a = await issued(c);
      await secondSession(c, '2025-10-20T10:00:00Z');
      const period = await put(admin as unknown as Query, 'billing_periods', {
        tenant_id: c.f.tenant,
        month_start: '2025-10-01',
        month_end: '2025-11-01',
        status: 'OPEN',
      });
      const b = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        period,
        intent(),
      );
      await c.invoice.issue(c.f.tenant, b.invoiceId as string, intent());
      await top(c);
      const r = await race(
        c,
        'shared-wallet-different-invoices',
        {
          ...intent(),
          operation: 'PAY',
          invoiceId: a.invoiceId,
          amountVnd: '600000',
        },
        {
          ...intent(),
          operation: 'PAY',
          invoiceId: b.invoiceId,
          amountVnd: '600000',
        },
        commit,
      );
      expect(r.two.code).toBe(commit ? '23514' : null);
      expect(await balance(c)).toBe('400000');
    }
  });
  native(
    'C10 G1 replay vs G2, both transaction orders and rollback',
    async () => {
      for (const recomputeFirst of [true, false])
        for (const commit of [true, false]) {
          const c = await fixture();
          const key = intent();
          const a = await c.generation.initial(
            c.f.tenant,
            c.f.student,
            c.period,
            key,
          );
          const replay = {
            ...key,
            operation: 'GENERATE',
            studentId: c.f.student,
            periodId: c.period,
          };
          const recompute = {
            ...intent(),
            operation: 'RECOMPUTE',
            studentId: c.f.student,
            periodId: c.period,
            expectedBase: a.id,
            expectedApplied: a.id,
          };
          const r = await race(
            c,
            'replay-vs-G2',
            recomputeFirst ? recompute : replay,
            recomputeFirst ? replay : recompute,
            commit,
          );
          expect(r.two.code).toBeNull();
          const pointer = (
            await admin.unsafe(
              'SELECT current_generation_id FROM billing_runs WHERE id=$1',
              [a.runId as string],
            )
          )[0].current_generation_id;
          expect(pointer === a.id).toBe(recomputeFirst && !commit);
        }
    },
  );
  native(
    'C11 source phantom vs ISSUE/G2, source first commit/rollback',
    async () => {
      for (const issue of [true, false])
        for (const commit of [true, false]) {
          const c = await fixture();
          const a = await draft(c);
          const writer = postgres(url, {
            max: 1,
            prepare: false,
            onnotice: () => undefined,
          });
          clients.push(writer);
          await writer.unsafe('BEGIN');
          await writer.unsafe('SELECT id FROM users WHERE id=$1 FOR SHARE', [
            c.f.user,
          ]);
          await writer.unsafe(
            'SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE',
            [c.f.tenant],
          );
          await secondSession(
            c,
            '2025-09-21T10:00:00Z',
            undefined,
            writer as unknown as Query,
          );
          const apid = (await writer.unsafe('SELECT pg_backend_pid() pid'))[0]
              .pid as number,
            bpid = (await c.sql.unsafe('SELECT pg_backend_pid() pid'))[0]
              .pid as number;
          const body = issue
            ? { ...intent(), operation: 'ISSUE', invoiceId: a.invoiceId }
            : {
                ...intent(),
                operation: 'RECOMPUTE',
                studentId: c.f.student,
                periodId: c.period,
                expectedBase: a.id,
                expectedApplied: a.id,
              };
          const waiting = c.sql
            .unsafe(
              'SELECT educore_r2.execute($1::uuid,$2::text::jsonb) result',
              [c.f.tenant, JSON.stringify(body)],
            )
            .then(
              (r) => ({ code: null, result: r[0].result }),
              (e) => ({ code: (e as { code: string }).code, result: null }),
            );
          try {
            await waitBlocked(admin as unknown as Query, bpid, apid);
            await writer.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
            const r = await waiting;
            expect(r.code).toBe(issue && commit ? '23514' : null);
          } finally {
            await writer.unsafe('ROLLBACK');
            await waiting;
          }
          (evidence.races as unknown[]).push({
            name: issue ? 'source-first-issue' : 'source-first-G2',
            apid,
            bpid,
            observedWait: true,
            commitFirst: commit,
          });
        }
    },
  );
  native(
    'C12 ISSUE/G2 first vs late source, issued completeness remains sealed',
    async () => {
      for (const issue of [true, false])
        for (const commit of [true, false]) {
          const c = await fixture();
          const a = await draft(c);
          const first = postgres(c.runtimeUrl, {
              max: 1,
              prepare: false,
              onnotice: () => undefined,
            }),
            writer = postgres(url, {
              max: 1,
              prepare: false,
              onnotice: () => undefined,
            });
          clients.push(first, writer);
          await first.unsafe('BEGIN');
          await writer.unsafe('BEGIN');
          const body = issue
            ? { ...intent(), operation: 'ISSUE', invoiceId: a.invoiceId }
            : {
                ...intent(),
                operation: 'RECOMPUTE',
                studentId: c.f.student,
                periodId: c.period,
                expectedBase: a.id,
                expectedApplied: a.id,
              };
          await first.unsafe(
            'SELECT educore_r2.execute($1::uuid,$2::text::jsonb)',
            [c.f.tenant, JSON.stringify(body)],
          );
          const apid = (await first.unsafe('SELECT pg_backend_pid() pid'))[0]
              .pid as number,
            bpid = (await writer.unsafe('SELECT pg_backend_pid() pid'))[0]
              .pid as number;
          const pending = secondSession(
            c,
            '2025-09-21T10:00:00Z',
            undefined,
            writer as unknown as Query,
          ).then(
            () => null,
            (e) => (e as { code: string }).code,
          );
          try {
            await waitBlocked(admin as unknown as Query, bpid, apid);
            await first.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
            const code = await pending;
            expect(code).toBe(issue && commit ? '23514' : null);
            await writer.unsafe(code ? 'ROLLBACK' : 'COMMIT');
          } finally {
            await first.unsafe('ROLLBACK');
            await writer.unsafe('ROLLBACK');
            await pending;
          }
          (evidence.races as unknown[]).push({
            name: issue ? 'issue-first-source' : 'G2-first-source',
            apid,
            bpid,
            observedWait: true,
            commitFirst: commit,
          });
        }
    },
  );
  native(
    'I02 local-year counter rollover and seven local calendar days/DST',
    async () => {
      const c = await fixture();
      const one = (
        await admin.unsafe(
          "SELECT educore_r2.invoice_number($1,'2030-12-31T16:59:59Z') n",
          [c.f.tenant],
        )
      )[0].n;
      const two = (
        await admin.unsafe(
          "SELECT educore_r2.invoice_number($1,'2030-12-31T17:00:00Z') n",
          [c.f.tenant],
        )
      )[0].n;
      expect(one).toBe('INV-2030-000001');
      expect(two).toBe('INV-2031-000001');
      const ny = await fixture({ zone: 'America/New_York' });
      for (const [instant, hours] of [
        ['2025-03-03T17:00:00Z', 167],
        ['2025-10-27T16:00:00Z', 169],
      ] as const) {
        const r = (
          await admin.unsafe(
            'SELECT extract(epoch FROM (educore_r2.due_date($1,$2::text::timestamptz)-$2::text::timestamptz))/3600 h',
            [ny.f.tenant, instant],
          )
        )[0];
        expect(Number(r.h)).toBe(hours);
      }
      const leap = (
        await admin.unsafe(
          "SELECT (educore_r2.due_date($1,'2024-02-25T05:00:00Z') AT TIME ZONE 'Asia/Ho_Chi_Minh')::text due",
          [c.f.tenant],
        )
      )[0].due;
      expect(leap).toBe('2024-03-03 12:00:00');
    },
  );
  native(
    'S03 Student cannot mutate even with accidental financial grant; scoped read',
    async () => {
      const c = await fixture();
      await top(c);
      await admin.unsafe("UPDATE roles SET code='STUDENT' WHERE id=$1", [
        c.f.role,
      ]);
      await admin.unsafe(
        'UPDATE student_profiles SET membership_id=$1 WHERE id=$2',
        [c.f.member, c.f.student],
      );
      expect(await balance(c)).toBe('1000000');
      await expect(
        c.wallet.topUp(
          c.f.tenant,
          c.f.student,
          '10',
          'CASH',
          randomUUID(),
          'Proof',
          intent(),
        ),
      ).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
      await expect(c.wallet.summary(c.f.tenant, c.f.student2)).rejects.toThrow(
        /PERMISSION_OR_SCOPE_DENIED/,
      );
    },
  );
  native(
    'S04 Parent read requires current verified link and hides receipt evidence',
    async () => {
      const c = await fixture();
      await top(c);
      await admin.unsafe("UPDATE roles SET code='PARENT' WHERE id=$1", [
        c.f.role,
      ]);
      const link = await put(
        admin as unknown as Query,
        'parent_student_links',
        {
          tenant_id: c.f.tenant,
          parent_membership_id: c.f.member,
          student_id: c.f.student,
          relationship: 'PARENT',
          verified_at: '2025-01-01',
          verified_by_membership_id: c.f.member,
        },
      );
      const read = await c.wallet.summary(c.f.tenant, c.f.student);
      expect(JSON.stringify(read)).not.toContain('Synthetic verified');
      await admin.unsafe(
        'UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=$1',
        [link],
      );
      await expect(balance(c)).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
    },
  );
  native(
    'F04 lost reply replay preserves committed payment and root identity',
    async () => {
      const c = await fixture();
      const g = await issued(c);
      await top(c);
      const k = intent();
      const committed = await c.wallet.pay(
        c.f.tenant,
        g.invoiceId as string,
        '300000',
        k,
      );
      // Adapter discards a successful response. This is not a simulation of all
      // transport/COMMIT windows; the next call checks durable server receipt.
      const replay = await c.wallet.pay(
        c.f.tenant,
        g.invoiceId as string,
        '300000',
        k,
      );
      expect(replay).toEqual(committed);
      expect(await balance(c)).toBe('700000');
      expect(
        (
          await admin.unsafe('SELECT id FROM payments WHERE tenant_id=$1', [
            c.f.tenant,
          ])
        ).length,
      ).toBe(1);
    },
  );
  native(
    'I03 failed ISSUE rolls back counter/claims/header, retry allocates once',
    async () => {
      const c = await fixture();
      const g = await draft(c);
      const k = intent(),
        trigger = 'r2_fault_' + randomBytes(6).toString('hex');
      await admin
        .unsafe(
          `CREATE FUNCTION pg_temp.${trigger}() RETURNS trigger LANGUAGE plpgsql AS $f$ BEGIN IF NEW.tenant_id='${c.f.tenant}'::uuid AND NEW.event_type='ISSUE' THEN RAISE EXCEPTION 'R2_INJECTED_ISSUE_FAILURE' USING ERRCODE='23514'; END IF; RETURN NEW; END $f$; CREATE TRIGGER ${trigger} BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION pg_temp.${trigger}();`,
        )
        .simple();
      try {
        await expect(
          c.invoice.issue(c.f.tenant, g.invoiceId as string, k),
        ).rejects.toThrow(/R2_INJECTED_ISSUE_FAILURE/);
      } finally {
        await admin.unsafe(`DROP TRIGGER ${trigger} ON audit_logs`);
      }
      expect(
        (
          await admin.unsafe(
            'SELECT invoice_number,status FROM invoices WHERE id=$1',
            [g.invoiceId as string],
          )
        )[0],
      ).toMatchObject({ invoice_number: null, status: 'DRAFT' });
      expect(
        (
          await admin.unsafe(
            'SELECT id FROM invoiced_participation_claims WHERE tenant_id=$1',
            [c.f.tenant],
          )
        ).length,
      ).toBe(0);
      const issued = await c.invoice.issue(
        c.f.tenant,
        g.invoiceId as string,
        k,
      );
      expect(issued.invoiceNumber).toMatch(/-000001$/);
    },
  );
  native(
    'F05 failed execution leaves reconciled no-effect audit then completes on retry',
    async () => {
      const c = await fixture();
      const receipt = await top(c);
      const g = await issued(c);
      await c.wallet.pay(c.f.tenant, g.invoiceId as string, '800000', intent());
      const req = await c.wallet.requestTopUpReversal(
        c.f.tenant,
        receipt.id!,
        intent(),
      );
      await approved(c, req.id!);
      const k = intent();
      await expect(c.finance.execute(c.f.tenant, req.id!, k)).rejects.toThrow(
        /INSUFFICIENT_AVAILABLE_BALANCE/,
      );
      const audits = await admin.unsafe(
        "SELECT after_json FROM audit_logs WHERE tenant_id=$1 AND entity_id=$2 AND action='EXECUTION_NO_EFFECT'",
        [c.f.tenant, req.id!],
      );
      expect(audits.length).toBe(1);
      await top(c, '800000');
      await c.finance.execute(c.f.tenant, req.id!, k);
      expect(await balance(c)).toBe('0');
    },
  );
  native(
    'F06 calculator verification failure inside transaction leaves no generation',
    async () => {
      const c = await fixture();
      const repository = c.module.get(
        (await import('../../src/billing/r2-repository.js')).R2Repository,
      );
      await expect(
        repository.command(
          c.f.tenant,
          {
            ...intent(),
            operation: 'GENERATE',
            studentId: c.f.student,
            periodId: c.period,
          },
          () => {
            throw Error('VERIFY_REJECT');
          },
        ),
      ).rejects.toThrow('VERIFY_REJECT');
      expect(
        (
          await admin.unsafe(
            'SELECT id FROM billing_run_generations WHERE tenant_id=$1',
            [c.f.tenant],
          )
        ).length,
      ).toBe(0);
    },
  );
  native(
    'I04 due-time gap blocks rather than silently changing approved wall time',
    async () => {
      const ny = await fixture({ zone: 'America/New_York' });
      await expect(
        admin.unsafe("SELECT educore_r2.due_date($1,'2025-03-02T07:30:00Z')", [
          ny.f.tenant,
        ]),
      ).rejects.toMatchObject({ code: '23514' });
    },
  );
  native(
    'D02 native schema drift is empty against current Prisma model',
    async () => {
      const require = createRequire(import.meta.url);
      try {
        execFileSync(
          process.execPath,
          [
            require.resolve('prisma/build/index.js'),
            'migrate',
            'diff',
            '--from-config-datasource',
            '--to-schema',
            'prisma/schema.prisma',
            '--exit-code',
          ],
          {
            cwd: resolve('.'),
            env: { ...process.env, DATABASE_URL: url },
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 30_000,
          },
        );
      } catch (error) {
        const output = String(
          (error as { stdout?: string | Buffer }).stdout ?? '',
        );
        throw new Error(
          'R2_SCHEMA_DRIFT: ' + output.replaceAll(url, '[REDACTED]'),
        );
      }
      evidence.schemaDrift = 'EMPTY';
    },
  );
  native(
    'D01 migration catalog, immutable history and arithmetic reconciliation',
    async () => {
      const migrations = await admin.unsafe(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL',
      );
      expect(
        migrations
          .map((m) => m.migration_name)
          .sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual(
        readdirSync(resolve('prisma/migrations'))
          .filter((n) => /^\d{12}_/.test(n))
          .sort((a, b) => a.localeCompare(b)),
      );
      const invalid = await admin.unsafe(
        'SELECT w.id FROM wallet_accounts w WHERE balance_vnd<>(SELECT COALESCE(sum(amount_vnd),0) FROM wallet_transactions x WHERE x.tenant_id=w.tenant_id AND x.wallet_id=w.id)',
      );
      expect(invalid).toHaveLength(0);
      const functions =
        await admin.unsafe(`SELECT p.proname,p.prosecdef,p.proconfig,r.rolname,
      EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
      has_function_privilege('educore_r2_command',p.oid,'EXECUTE') command_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='educore_r2' ORDER BY p.proname`);
      const expectedFunctions = (
        readFileSync(
          resolve(
            'prisma/migrations/202610190004_r2_financial_integrity/migration.sql',
          ),
          'utf8',
        ).match(/^CREATE FUNCTION educore_r2\./gm) ?? []
      ).length;
      expect(functions).toHaveLength(expectedFunctions);
      for (const fn of functions) {
        expect(fn.rolname).toBe('educore_r2_owner');
        expect(fn.public_execute).toBe(false);
        expect(fn.command_execute).toBe(
          ['execute', 'summary', 'execution_outcome', 'receivable'].includes(
            fn.proname as string,
          ),
        );
        expect(fn.prosecdef).toBe(
          ![
            'immutable',
            'fingerprint',
            'approval_guard',
            'pointer_guard',
          ].includes(fn.proname as string),
        );
        expect(fn.proconfig).toContain(
          'search_path=pg_catalog, educore_r2, pg_temp',
        );
      }
      const owner = (
        await admin.unsafe(
          "SELECT rolsuper,rolcanlogin,rolcreaterole,rolcreatedb,rolbypassrls FROM pg_roles WHERE rolname='educore_r2_owner'",
        )
      )[0];
      expect(Object.values(owner).every((v) => v === false)).toBe(true);
      expect(
        (
          await admin.unsafe(
            "SELECT has_table_privilege('educore_r2_command','public.r2_principal_bindings','INSERT') allowed",
          )
        )[0].allowed,
      ).toBe(false);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM educore_r2.effect_permits',
          )
        )[0].n,
      ).toBe(0);
      evidence.catalog = {
        functions,
        owner,
        permitRows: 0,
        walletReconciliation: 'PASS',
      };
    },
  );
});
