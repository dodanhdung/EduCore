/** Test-only PostgreSQL harness. Never imported by application code. */
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import postgres from 'postgres';

export type Db = postgres.Sql;
export type Tx = postgres.TransactionSql;
export type Query = Db | Tx;
export const baselinePath = resolve(
  'prisma/migrations/202610190001_r1a_baseline/migration.sql',
);
export const migrationPath = resolve(
  'prisma/migrations/202610190002_r1b_integrity/migration.sql',
);
export const baselineSql = () => readFileSync(baselinePath, 'utf8');
export const migrationSql = () => readFileSync(migrationPath, 'utf8');

export function safeTarget(env: NodeJS.ProcessEnv): string {
  if (env.R1B_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER') {
    throw new Error(
      'R1B_POSTGRESQL_NOT_RUN: explicitly confirm a disposable cluster first',
    );
  }
  let u: URL;
  try {
    u = new URL(env.R1B_TEST_URL ?? '');
  } catch {
    throw new Error('R1B_TEST_URL required; DATABASE_URL is never used');
  }
  if (
    !['postgres:', 'postgresql:'].includes(u.protocol) ||
    !['127.0.0.1', '[::1]'].includes(u.hostname) ||
    !/^\/educore_r1b_[a-z0-9_]+$/.test(u.pathname) ||
    u.search ||
    u.hash
  ) {
    throw new Error(
      'R1b tests require a literal loopback host, educore_r1b_* database, and no URL options',
    );
  }
  return u.toString();
}

export function connect(url: string): Db {
  return postgres(url, {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: 5,
    connection: { application_name: 'educore_r1b_disposable_tests' },
    onnotice: () => undefined,
  });
}

export async function sqlstate(
  action: () => PromiseLike<unknown>,
  code: string,
  constraint?: string,
) {
  try {
    await action();
  } catch (e) {
    const error = e as { code?: string; constraint_name?: string };
    if (
      error.code !== code ||
      (constraint && error.constraint_name !== constraint)
    )
      throw e;
    return;
  }
  throw new Error(
    `Expected SQLSTATE ${code}${constraint ? '/' + constraint : ''}, command succeeded`,
  );
}

/** Savepoint keeps expected negative statements from aborting the outer test TX. */
export async function rejected(
  tx: Tx,
  text: string,
  params: postgres.ParameterOrJSON<never>[] = [],
  code = '23514',
  constraint?: string,
) {
  await sqlstate(
    () =>
      tx.savepoint(async (sp) => {
        await sp.unsafe(text, params);
      }),
    code,
    constraint,
  );
}

let sequence = 0;
export function id(): string {
  return `00000000-0000-4000-8000-${(++sequence).toString(16).padStart(12, '0')}`;
}
export async function put(
  q: Query,
  table: string,
  values: Record<string, unknown>,
): Promise<string> {
  if (
    !/^[a-z_]+$/.test(table) ||
    Object.keys(values).some((k) => !/^[a-z_]+$/.test(k))
  )
    throw new Error('Fixture identifier');
  const row: Record<string, unknown> = { id: id(), ...values };
  const cols = await q.unsafe(
    "SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
    [table],
  );
  if (cols.some((c) => c.column_name === 'updated_at'))
    row.updated_at ??= new Date('2090-01-01T00:00:00Z');
  const keys = Object.keys(row);
  // Force textual transport for serialized JSON and date edge cases. Otherwise
  // postgres.js JSON-stringifies an already serialized fixture again, tries
  // to turn date 'infinity' into a JS Date, and truncates timestamp microseconds.
  const typeOf = (key: string) =>
    cols.find((c) => c.column_name === key)?.data_type;
  const placeholder = (key: string, index: number) => {
    const parameter = '$' + (index + 1);
    if (typeOf(key) === 'jsonb') return parameter + '::text::jsonb';
    if (typeOf(key) === 'date') return parameter + '::text::date';
    if (typeOf(key) === 'timestamp with time zone')
      return parameter + '::text::timestamptz';
    if (typeOf(key) === 'timestamp without time zone')
      return parameter + '::text::timestamp';
    return parameter;
  };
  const parameters = keys.map((key) => {
    const value = row[key];
    if (typeOf(key) === 'jsonb' && value !== null && typeof value !== 'string')
      return JSON.stringify(value);
    return value instanceof Date ? value.toISOString() : value;
  });
  await q.unsafe(
    `INSERT INTO public."${table}" (${keys.map((k) => '"' + k + '"').join(',')}) VALUES (${keys.map(placeholder).join(',')})`,
    parameters as postgres.ParameterOrJSON<never>[],
  );
  return row.id as string;
}

export interface Fixture {
  tenant: string;
  user: string;
  authSession: string;
  member: string;
  role: string;
  membershipRole: string;
  permission: string;
  scope: string;
  student: string;
  student2: string;
  teacher: string;
  course: string;
  classId: string;
  class2: string;
  enrollment: string;
  policy: string;
  session: string;
  participant: string;
  period: string;
  run: string;
  invoice: string;
}

/** Synthetic future DRAFT is a guard fixture, NOT early monthly admission. */
export async function seed(
  q: Query,
  opts: {
    start?: string;
    zone?: string;
    firstSource?: 'series' | 'session' | 'period';
    sessionStatus?: 'DRAFT' | 'CANCELLED';
  } = {},
): Promise<Fixture> {
  const start = opts.start ?? '2099-09-30T16:30:00.000000Z';
  const tenant = await put(q, 'tenants', {
    code: id(),
    name: 'R1b fixture',
    timezone: opts.zone ?? 'Asia/Ho_Chi_Minh',
    status: 'ACTIVE',
  });
  const user = await put(q, 'users', {
    email_normalized: id() + '@r1b.invalid',
    display_name: 'Test actor',
    status: 'ACTIVE',
  });
  const member = await put(q, 'tenant_memberships', {
    tenant_id: tenant,
    user_id: user,
    status: 'ACTIVE',
  });
  const authSession = await put(q, 'auth_sessions', {
    user_id: user,
    active_tenant_id: tenant,
    refresh_token_hash: 'SYNTHETIC-NOT-A-CREDENTIAL',
    expires_at: '2200-01-01T00:00:00Z',
  });
  const role = await put(q, 'roles', {
    tenant_id: tenant,
    code: 'R1B_FIXTURE',
    name: 'Fixture actor',
  });
  let permissions = await q.unsafe(
    "SELECT id FROM public.permissions WHERE code='r1b.fixture.mutate'",
  );
  const permission =
    (permissions[0]?.id as string | undefined) ??
    (await put(q, 'permissions', {
      code: 'r1b.fixture.mutate',
      description: 'Test-only command permission',
    }));
  await put(q, 'role_permissions', {
    tenant_id: tenant,
    role_id: role,
    permission_id: permission,
  });
  const membershipRole = await put(q, 'membership_roles', {
    tenant_id: tenant,
    membership_id: member,
    role_id: role,
    assigned_by_membership_id: member,
  });
  const scope = await put(q, 'access_scopes', {
    tenant_id: tenant,
    membership_role_id: membershipRole,
    scope_kind: 'TENANT',
  });
  const student = await put(q, 'student_profiles', {
    tenant_id: tenant,
    student_code: 'S1',
    full_name: 'Student One',
    status: 'ACTIVE',
  });
  const student2 = await put(q, 'student_profiles', {
    tenant_id: tenant,
    student_code: 'S2',
    full_name: 'Student Two',
    status: 'ACTIVE',
  });
  const teacher = await put(q, 'teacher_profiles', {
    tenant_id: tenant,
    teacher_code: 'T1',
    full_name: 'Teacher',
    status: 'ACTIVE',
  });
  const subject = await put(q, 'subjects', {
    tenant_id: tenant,
    code: 'SUB',
    name: 'Subject',
    active: true,
  });
  const level = await put(q, 'levels', {
    tenant_id: tenant,
    code: 'L1',
    name: 'Level',
    active: true,
    sort_order: 1,
  });
  const course = await put(q, 'courses', {
    tenant_id: tenant,
    code: 'C1',
    name: 'Course',
    subject_id: subject,
    level_id: level,
    status: 'ACTIVE',
  });
  const classId = await put(q, 'classes', {
    tenant_id: tenant,
    code: 'CL1',
    name: 'Class One',
    course_id: course,
    capacity: 10,
    status: 'ACTIVE',
  });
  const class2 = await put(q, 'classes', {
    tenant_id: tenant,
    code: 'CL2',
    name: 'Class Two',
    course_id: course,
    capacity: 10,
    status: 'ACTIVE',
  });
  const enrollment = await put(q, 'enrollments', {
    tenant_id: tenant,
    student_id: student,
    class_id: classId,
    status: 'ACTIVE',
    effective_from: '2099-01-01T00:00:00Z',
    created_by_membership_id: member,
  });
  const policy = await put(q, 'policy_versions', {
    tenant_id: tenant,
    version_code: 'TEST1',
    effective_from: '2090-01-01T00:00:00Z',
    config_snapshot: JSON.stringify({ fixtureOnly: true }),
    content_hash: 'fixture-known-policy',
  });
  if (opts.firstSource === 'series')
    await put(q, 'schedule_series', {
      tenant_id: tenant,
      class_id: classId,
      weekday: 1,
      local_start_time: '10:00',
      duration_minutes: 60,
      valid_from: '2099-01-01',
      valid_to: '2099-02-01',
      timezone: opts.zone ?? 'Asia/Ho_Chi_Minh',
      status: 'DRAFT',
    });
  let period =
    opts.firstSource === 'period'
      ? await put(q, 'billing_periods', {
          tenant_id: tenant,
          month_start: '2099-09-01',
          month_end: '2099-10-01',
          status: 'OPEN',
        })
      : undefined;
  const session = await put(q, 'class_sessions', {
    tenant_id: tenant,
    class_id: classId,
    teacher_id: teacher,
    delivery_mode: 'ONLINE',
    starts_at: start,
    ends_at: new Date(new Date(start).getTime() + 3600000).toISOString(),
    status: opts.sessionStatus ?? 'DRAFT',
    revision: 1,
    policy_version_id: policy,
  });
  const participant = await put(q, 'session_participants', {
    tenant_id: tenant,
    session_id: session,
    student_id: student,
    enrollment_id: enrollment,
    participant_kind: 'REGULAR',
  });
  period ??= await put(q, 'billing_periods', {
    tenant_id: tenant,
    month_start: '2099-09-01',
    month_end: '2099-10-01',
    status: 'OPEN',
  });
  const run = await put(q, 'billing_runs', {
    tenant_id: tenant,
    student_id: student,
    period_id: period,
    operation_key: id(),
    state: 'DRAFT',
    policy_version_id: policy,
    input_snapshot_hash: createHash('sha256')
      .update(
        JSON.stringify({ fixtureOnly: true, session, participant, start }),
      )
      .digest('hex'),
  });
  const invoice = await put(q, 'invoices', {
    tenant_id: tenant,
    student_id: student,
    period_id: period,
    billing_run_id: run,
    status: 'DRAFT',
    gross_vnd: '100000',
    discount_vnd: '0',
    total_vnd: '100000',
    policy_version_id: policy,
    snapshot_json: JSON.stringify({ fixtureOnly: true }),
  });
  return {
    tenant,
    user,
    authSession,
    member,
    role,
    membershipRole,
    permission,
    scope,
    student,
    student2,
    teacher,
    course,
    classId,
    class2,
    enrollment,
    policy,
    session,
    participant,
    period,
    run,
    invoice,
  };
}

export async function line(
  q: Query,
  f: Fixture,
  extra: Record<string, unknown> = {},
) {
  return put(q, 'invoice_lines', {
    tenant_id: f.tenant,
    invoice_id: f.invoice,
    student_id: f.student,
    participant_id: f.participant,
    session_id: f.session,
    source_status: 'DRAFT',
    charge_units: 1,
    unit_price_vnd: '100000',
    base_amount_vnd: '100000',
    reason_code: 'FIXTURE',
    source_snapshot_json: '{}',
    ...extra,
  });
}

// Principal comes from the trusted test harness, not a DB GUC/client actor claim.
export async function enter(
  q: Query,
  f: Fixture,
  mode: 'SHARE' | 'UPDATE' = 'SHARE',
) {
  await q.unsafe(`SELECT id FROM public.users WHERE id=$1 FOR ${mode}`, [
    f.user,
  ]);
  await q.unsafe(
    'SELECT id FROM public.tenants WHERE id=$1 FOR NO KEY UPDATE',
    [f.tenant],
  );
}
export async function authorized(q: Query, f: Fixture, tenant = f.tenant) {
  const rows = await q.unsafe(
    `SELECT m.id FROM public.users u
    JOIN public.auth_sessions s ON s.user_id=u.id
    JOIN public.tenant_memberships m ON m.user_id=u.id AND m.tenant_id=$3
    JOIN public.tenants t ON t.id=m.tenant_id
    JOIN public.membership_roles mr ON mr.tenant_id=m.tenant_id AND mr.membership_id=m.id AND mr.revoked_at IS NULL
    JOIN public.roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id
    JOIN public.role_permissions rp ON rp.tenant_id=r.tenant_id AND rp.role_id=r.id
    JOIN public.permissions p ON p.id=rp.permission_id AND p.code='r1b.fixture.mutate'
    JOIN public.access_scopes a ON a.tenant_id=mr.tenant_id AND a.membership_role_id=mr.id
    WHERE u.id=$1 AND s.id=$2 AND u.status='ACTIVE' AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      AND (s.active_tenant_id IS NULL OR s.active_tenant_id=$3) AND m.status='ACTIVE' AND m.left_at IS NULL AND t.status='ACTIVE'
      AND (a.scope_kind='TENANT' OR (a.scope_kind='CLASS' AND a.class_id=$4) OR (a.scope_kind='STUDENT' AND a.student_id=$5))`,
    [f.user, f.authSession, tenant, f.classId, f.student],
  );
  if (!rows.length)
    throw Object.assign(new Error('Current fixture authorization denied'), {
      code: '42501',
    });
}
export async function audit(q: Query, f: Fixture, entity: string) {
  return put(q, 'audit_logs', {
    tenant_id: f.tenant,
    actor_user_id: f.user,
    actor_membership_id: f.member,
    actor_kind: 'USER',
    event_type: 'R1B_FIXTURE_MUTATION',
    entity_type: 'Tenant',
    entity_id: entity,
    action: 'TEST',
    correlation_id: id(),
    after_json: JSON.stringify({ fixtureOnly: true }),
  });
}

/** Finite retry adapter for tests only; no production command framework. */
export async function fixtureCommand(
  url: string,
  f: Fixture,
  effect: (q: Tx) => Promise<void>,
  onRetry: (attempt: number) => Promise<void> = async () => undefined,
) {
  const q = connect(url),
    deadline = Date.now() + 15_000;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await q.begin(async (tx) => {
          await tx
            .unsafe(
              "SET LOCAL lock_timeout='100ms'; SET LOCAL statement_timeout='5s'",
            )
            .simple();
          await enter(tx, f);
          await authorized(tx, f);
          await effect(tx);
          await audit(tx, f, f.tenant);
        });
        return attempt;
      } catch (e) {
        if (
          !['40P01', '40001', '55P03'].includes((e as { code: string }).code) ||
          attempt >= 2 ||
          Date.now() + 200 >= deadline
        )
          throw e;
        await onRetry(attempt + 1); // test controller can release an observed blocker here
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  } finally {
    await q.end({ timeout: 2 });
  }
}

export const evidence: Record<string, unknown> = { cases: {}, races: [] };
export async function waitBlocked(
  observer: Db,
  waiter: number,
  blocker: number,
) {
  const deadline = Date.now() + 2500;
  while (Date.now() < deadline) {
    const rows = await observer.unsafe(
      'SELECT $2::int = ANY(pg_catalog.pg_blocking_pids($1::int)) AS blocked',
      [waiter, blocker],
    );
    if (rows[0].blocked) return;
    // Polling is only the observer scheduling interval, never the race barrier.
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`No observed PostgreSQL wait edge ${waiter}->${blocker}`);
}

export async function initialize(url: string) {
  const q = connect(url);
  try {
    const catalog = await q.unsafe(`SELECT current_database() AS name,
      (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) AS tables,
      (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS superuser`);
    if (
      !String(catalog[0].name).startsWith('educore_r1b_') ||
      catalog[0].tables !== 0 ||
      !catalog[0].superuser
    ) {
      throw new Error(
        'Refusing nonempty/non-disposable target or fixture role lacking dedicated-cluster privileges',
      );
    }
    const role = await q.unsafe(
      "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname IN ('educore_r1b_guard_owner','educore_r1b_api','educore_r1b_worker')",
    );
    if (role.length)
      throw new Error(
        'Cluster already contains R1b roles: refuse role adoption/drop',
      );
    // A real wrong-month legacy source is allowed by baseline but must block
    // automatic R1b adoption. Entire fixture transaction is rolled back.
    await q.unsafe('BEGIN;\n' + baselineSql()).simple();
    const legacy = await seed(q, { start: '2099-09-30T17:00:00Z' });
    await line(q, legacy);
    await sqlstate(
      () => q.unsafe(migrationSql().replace(/^BEGIN;$/m, '')).simple(),
      '23514',
      'r1b_legacy_adoption_required',
    );
    await q.unsafe('ROLLBACK');
    evidence.legacyUpgradeRefused = true;
    // Fault before COMMIT: actual baseline+guard DDL must roll back atomically.
    const fault =
      'BEGIN;\n' +
      baselineSql() +
      '\n' +
      migrationSql()
        .replace(/^BEGIN;$/m, '')
        .replace(/^COMMIT;$/m, 'SELECT 1/0;\nCOMMIT;');
    await sqlstate(() => q.unsafe(fault).simple(), '22012');
    await q.unsafe('ROLLBACK');
    const left = await q.unsafe(
      "SELECT count(*)::int AS n FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r'",
    );
    if (left[0].n !== 0)
      throw new Error('Failed migration left partial baseline');
    const require = createRequire(import.meta.url);
    try {
      execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        {
          cwd: resolve('.'),
          env: { ...process.env, DATABASE_URL: url },
          encoding: 'utf8',
          timeout: 60_000,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      throw new Error(
        'Disposable Prisma migrate deploy failed; inspect target locally without printing credentials',
      );
    }
    await q
      .unsafe(
        readFileSync(
          resolve('prisma/security/r1b-runtime-profile.sql'),
          'utf8',
        ),
      )
      .simple();
    const migrations = await q.unsafe(
      'SELECT migration_name, finished_at IS NOT NULL AS finished, rolled_back_at FROM public._prisma_migrations ORDER BY migration_name',
    );
    evidence.migrations = migrations;
    evidence.faultRollback = true;
    evidence.baselineSha256 = createHash('sha256')
      .update(baselineSql())
      .digest('hex');
    evidence.r1bSha256 = createHash('sha256')
      .update(migrationSql())
      .digest('hex');
    evidence.server = (
      await q.unsafe('SELECT version() AS version')
    )[0].version;
  } finally {
    await q.end({ timeout: 2 });
  }
}

export function saveEvidence() {
  const dir = mkdtempSync(join(tmpdir(), 'educore-r1b-pg-evidence-'));
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('R1b disposable evidence: ' + join(dir, 'evidence.json'));
}
