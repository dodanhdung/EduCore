import 'reflect-metadata';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import postgres from 'postgres';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  readdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  seed,
  changeFixtureRole,
  preserveFixtureManager,
  put,
  waitBlocked,
  sqlstate,
  type Query,
} from '../schema-integrity/support.js';
import { R3Module } from '../../src/academic/r3.module.js';
import {
  AcademicService,
  type PlacementEvidence,
} from '../../src/academic/academic.service.js';
import { R3Repository } from '../../src/academic/r3-repository.js';
import { SchedulingService } from '../../src/scheduling/scheduling.service.js';
import {
  AttendanceService,
  LeaveService,
} from '../../src/attendance/attendance.service.js';
import { BillingModule } from '../../src/billing/billing.module.js';
import {
  GenerationService,
  InvoiceLifecycleService,
} from '../../src/billing/billing-services.js';

let admin: postgres.Sql;
let url: string;
const clients: postgres.Sql[] = [],
  modules: TestingModule[] = [];
const evidence: Record<string, unknown> = { cases: {}, races: [] };
const native = (id: string, action: () => Promise<void>) =>
  it(id, async () => {
    try {
      await action();
      (evidence.cases as Record<string, string>)[id] = 'PASS';
    } catch (error) {
      (evidence.cases as Record<string, string>)[id] = 'FAIL';
      throw error;
    }
  });
const intent = () => ({ key: randomUUID(), reason: 'R3 native verification' });
function deploy(config?: string) {
  const require = createRequire(import.meta.url);
  try {
    execFileSync(
      process.execPath,
      [
        require.resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
        ...(config ? ['--config', config] : []),
      ],
      {
        cwd: resolve('.'),
        env: { ...process.env, DATABASE_URL: url },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 90_000,
      },
    );
  } catch (error) {
    const failure = error as { stdout?: Buffer; stderr?: Buffer };
    throw Error(
      (String(failure.stdout ?? '') + String(failure.stderr ?? ''))
        .replaceAll(url, '[URL]')
        .replaceAll(new URL(url).password, '[SECRET]'),
    );
  }
}
async function attendanceFunctionSecurity() {
  const [row] = await admin.unsafe(
    "SELECT p.proowner::regrole::text owner,p.proacl::text acl,p.prosecdef,p.proconfig FROM pg_proc p WHERE p.oid='educore_r3.attendance(uuid,jsonb)'::regprocedure",
  );
  return row;
}

beforeAll(async () => {
  if (process.env.R3_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER')
    throw Error('R3_DISPOSABLE_ADMISSION_REQUIRED');
  const target = new URL(process.env.R3_TEST_URL ?? '');
  if (
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    !['127.0.0.1', '[::1]'].includes(target.hostname) ||
    !/^\/educore_r3_[a-z0-9_]+$/.test(target.pathname) ||
    target.search ||
    target.hash
  )
    throw Error('UNSAFE_R3_TARGET');
  url = target.toString();
  admin = postgres(url, { max: 1, prepare: false, onnotice: () => undefined });
  const [admission] = await admin.unsafe(
    "SELECT current_database() name,current_setting('server_version_num')::int version,(SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')) tables,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser",
  );
  if (
    admission.tables ||
    !admission.superuser ||
    admission.version < 160000 ||
    admission.version >= 170000
  )
    throw Error('R3_TARGET_NOT_FRESH_POSTGRES16');
  // Exercise a real populated checkpoint007 -> 008/009 upgrade, keeping the
  // recorded migrations byte-identical. R1b/R2 suites separately deploy all nine
  // migrations on new databases, covering fresh deployment as well.
  const baselineRoot = mkdtempSync(
    join(tmpdir(), 'educore-r3-followup-baseline-'),
  );
  const baselineMigrations = join(baselineRoot, 'migrations');
  mkdirSync(baselineMigrations);
  copyFileSync(
    resolve('prisma/migrations/migration_lock.toml'),
    join(baselineMigrations, 'migration_lock.toml'),
  );
  const names = readdirSync(resolve('prisma/migrations'))
    .filter((n) => /^\d{12}_/.test(n) && n.slice(0, 12) <= '202610190007')
    .sort((a, b) => a.localeCompare(b));
  expect(names).toHaveLength(7);
  for (const name of names) {
    mkdirSync(join(baselineMigrations, name));
    copyFileSync(
      resolve('prisma/migrations', name, 'migration.sql'),
      join(baselineMigrations, name, 'migration.sql'),
    );
  }
  const config = join(baselineRoot, 'prisma.config.mjs');
  writeFileSync(
    config,
    'export default {schema:' +
      JSON.stringify(resolve('prisma/schema.prisma')) +
      ',migrations:{path:' +
      JSON.stringify(baselineMigrations) +
      '},datasource:{url:process.env.DATABASE_URL}};',
  );
  deploy(config);
  const originalSecurity = await attendanceFunctionSecurity();
  const reproductions = [];
  const legacyReceipts = [];
  for (const approve of [true, false]) {
    const c = await earlyIssueFixture();
    await finalized(c);
    const generation = await c.generation.initial(
      c.f.tenant,
      c.f.student,
      c.earlyPeriod,
      intent(),
    );
    await c.invoice.issue(c.f.tenant, generation.invoiceId as string, intent());
    const key = intent();
    const decision = await c.leave.decide(
      c.f.tenant,
      c.pendingLeave,
      approve,
      key,
    );
    expect(decision.status).toBe(approve ? 'APPROVED' : 'REJECTED');
    const [proof] = await admin.unsafe(
      'SELECT educore_r3.time_locked(clock_timestamp(),ends_at) time_locked,(SELECT count(*)::int FROM invoiced_participation_claims WHERE participant_id=$2) claims FROM class_sessions WHERE id=$1',
      [c.f.session, c.f.participant],
    );
    expect(proof).toMatchObject({ time_locked: false, claims: 1 });
    reproductions.push({
      operation: approve ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
      checkpoint007: 'BUG_REPRODUCED',
      proof,
    });
    legacyReceipts.push({ c, approve, key });
  }
  deploy();
  expect(await attendanceFunctionSecurity()).toEqual(originalSecurity);
  for (const { c, approve, key } of legacyReceipts) {
    const before = await sourceAndFinance(c);
    await expect(
      c.leave.decide(c.f.tenant, c.pendingLeave, approve, key),
    ).rejects.toThrow(/ISSUED_LEAVE_SOURCE/);
    expect(await sourceAndFinance(c)).toEqual(before);
  }
  const history = await admin.unsafe(
    'SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL',
  );
  for (const migration of history) {
    expect(migration.checksum).toBe(
      createHash('sha256')
        .update(
          readFileSync(
            resolve(
              'prisma/migrations',
              migration.migration_name,
              'migration.sql',
            ),
          ),
        )
        .digest('hex'),
    );
  }
  evidence.followupUpgrade = {
    baselineMigrations: names,
    reproductions,
    functionSecurity: originalSecurity,
    allChecksumsMatch: true,
    legacyReceiptReplaysBlockedWithoutEffects: true,
  };
  evidence.admission = admission;
  evidence.migrations = await admin.unsafe(
    'SELECT migration_name,finished_at FROM _prisma_migrations ORDER BY migration_name',
  );
  expect((evidence.migrations as unknown[]).length).toBe(
    readdirSync(resolve('prisma/migrations')).filter((n) => /^\d{12}_/.test(n))
      .length,
  );
});
afterAll(async () => {
  for (const m of modules) await m.close();
  await Promise.all(clients.map((c) => c.end({ timeout: 2 })));
  if (admin) await admin.end({ timeout: 2 });
  const path = join(
    mkdtempSync(join(tmpdir(), 'educore-r3-evidence-')),
    'evidence.json',
  );
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  console.log('R3 sanitized evidence: ' + path);
});

const permissions = [
  'class.assign_teacher',
  'enrollment.create',
  'enrollment.transfer',
  'room.manage',
  'resource.manage',
  'schedule.create',
  'schedule.confirm',
  'schedule.update',
  'schedule.cancel',
  'schedule.read',
  'attendance.mark',
  'attendance.finalize',
  'attendance.correct',
  'absence.create',
  'absence.approve',
  'absence.approve_late',
  'billing.generate_draft',
  'invoice.issue',
  'invoice.read',
  'payment.record',
];
async function fixture(
  options: {
    start?: string;
    end?: string;
    zone?: string;
    enrollmentFrom?: string;
  } = {},
) {
  const f = await seed(admin as unknown as Query, options);
  await admin.unsafe("UPDATE roles SET code='MANAGER' WHERE id=$1", [f.role]);
  for (const code of permissions) {
    const [p] = await admin.unsafe('SELECT id FROM permissions WHERE code=$1', [
      code,
    ]);
    const permissionId =
      p?.id ??
      (await put(admin as unknown as Query, 'permissions', {
        code,
        description: 'R3 test catalog',
      }));
    await put(admin as unknown as Query, 'role_permissions', {
      tenant_id: f.tenant,
      role_id: f.role,
      permission_id: permissionId,
    });
  }
  await put(admin as unknown as Query, 'policy_versions', {
    tenant_id: f.tenant,
    version_code: 'R3_CURRENT',
    effective_from: '2020-01-01',
    config_snapshot: {},
    content_hash: 'synthetic-r3',
  });
  return connectContext(f);
}
async function connectContext(f: Awaited<ReturnType<typeof seed>>) {
  const login = 'r3_' + randomBytes(8).toString('hex'),
    password = randomBytes(24).toString('hex');
  await admin.unsafe(
    `CREATE ROLE "${login}" LOGIN PASSWORD '${password}' IN ROLE educore_r3_command,educore_r2_command`,
  );
  await admin.unsafe(
    'INSERT INTO r2_principal_bindings(database_role,auth_session_id) VALUES($1,$2)',
    [login, f.authSession],
  );
  const runtime = new URL(url);
  runtime.username = login;
  runtime.password = password;
  const sql = postgres(runtime.toString(), {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(sql);
  const module = await Test.createTestingModule({
    imports: [
      R3Module.register(runtime.toString()),
      BillingModule.register(runtime.toString()),
    ],
  }).compile();
  modules.push(module);
  return {
    f,
    sql,
    module,
    academic: module.get(AcademicService),
    repository: module.get(R3Repository),
    scheduling: module.get(SchedulingService),
    attendance: module.get(AttendanceService),
    leave: module.get(LeaveService),
    generation: module.get(GenerationService),
    invoice: module.get(InvoiceLifecycleService),
    runtime: runtime.toString(),
  };
}
type Context = Awaited<ReturnType<typeof fixture>>;
async function actor(c: Context, roleCode: string) {
  const user = await put(admin as unknown as Query, 'users', {
    email_normalized: randomUUID() + '@r3.invalid',
    display_name: 'R3 actor',
    status: 'ACTIVE',
  });
  const member = await put(admin as unknown as Query, 'tenant_memberships', {
    tenant_id: c.f.tenant,
    user_id: user,
    status: 'ACTIVE',
  });
  const authSession = await put(admin as unknown as Query, 'auth_sessions', {
    user_id: user,
    active_tenant_id: c.f.tenant,
    refresh_token_hash: 'SYNTHETIC',
    expires_at: '2200-01-01',
  });
  const role = await put(admin as unknown as Query, 'roles', {
    tenant_id: c.f.tenant,
    code: roleCode,
    name: roleCode,
  });
  const membershipRole = await put(
    admin as unknown as Query,
    'membership_roles',
    {
      tenant_id: c.f.tenant,
      membership_id: member,
      role_id: role,
      assigned_by_membership_id: c.f.member,
    },
  );
  const scope = await put(admin as unknown as Query, 'access_scopes', {
    tenant_id: c.f.tenant,
    membership_role_id: membershipRole,
    scope_kind: 'TENANT',
  });
  for (const code of permissions) {
    const [permission] = await admin.unsafe(
      'SELECT id FROM permissions WHERE code=$1',
      [code],
    );
    await put(admin as unknown as Query, 'role_permissions', {
      tenant_id: c.f.tenant,
      role_id: role,
      permission_id: permission.id,
    });
  }
  return connectContext({
    ...c.f,
    user,
    member,
    authSession,
    role,
    membershipRole,
    scope,
  });
}
async function placement(c: Context) {
  const [co] = await admin.unsafe(
    'SELECT subject_id,level_id FROM courses WHERE id=$1',
    [c.f.course],
  );
  return {
    basis: 'STAFF_CONFIRMATION' as const,
    subjectId: co.subject_id as string,
    levelId: co.level_id as string,
    reason:
      'No published subject assessments; staff confirms target suitability',
  };
}
async function seedGrade(
  c: Context,
  options: {
    studentId?: string;
    classId?: string;
    versionId?: string;
    revision?: number;
    score?: string;
    status?: 'DRAFT' | 'PUBLISHED';
    gradedAt?: string;
    publishedAt?: string | null;
  } = {},
) {
  let versionId = options.versionId;
  if (!versionId) {
    const assignment = await put(admin as unknown as Query, 'assignments', {
      tenant_id: c.f.tenant,
      class_id: options.classId ?? c.f.classId,
      created_by_teacher_id: c.f.teacher,
      title: 'Published subject assessment',
      description:
        'Synthetic existing grading evidence; no R5 application code',
      priority: 1,
      deadline_at: '2026-09-01',
      status: 'PUBLISHED',
      published_at: '2026-08-01',
      revision: 1,
    });
    const recipient = await put(
      admin as unknown as Query,
      'assignment_recipients',
      {
        tenant_id: c.f.tenant,
        assignment_id: assignment,
        student_id: options.studentId ?? c.f.student,
        assigned_at: '2026-08-01',
      },
    );
    const submission = await put(admin as unknown as Query, 'submissions', {
      tenant_id: c.f.tenant,
      recipient_id: recipient,
      status: 'SUBMITTED',
    });
    versionId = await put(admin as unknown as Query, 'submission_versions', {
      tenant_id: c.f.tenant,
      submission_id: submission,
      version_no: 1,
      submitted_at: '2026-08-10',
      is_late: false,
      status: 'SUBMITTED',
    });
  }
  const gradeId = await put(admin as unknown as Query, 'grades', {
    tenant_id: c.f.tenant,
    submission_version_id: versionId,
    revision_no: options.revision ?? 1,
    score: options.score ?? '8.5',
    graded_by_teacher_id: c.f.teacher,
    graded_at: options.gradedAt ?? '2026-08-11',
    status: options.status ?? 'PUBLISHED',
    published_at:
      options.publishedAt === undefined ? '2026-08-12' : options.publishedAt,
  });
  return { gradeId, versionId };
}
async function gradePlacement(
  c: Context,
  student = c.f.student,
  classId = c.f.class2,
): Promise<PlacementEvidence & { basis: 'PUBLISHED_GRADES' }> {
  const context = await c.academic.placementContext(
    c.f.tenant,
    student,
    classId,
  );
  return {
    basis: 'PUBLISHED_GRADES',
    subjectId: context.targetSubjectId,
    levelId: context.targetLevelId,
    reason:
      'Authorized staff considers published scores, subject, assessment difficulty and dates',
    grades: context.publishedAssessments.map(
      ({ gradeId, revision, evidenceHash }) => ({
        gradeId,
        revision,
        evidenceHash,
      }),
    ),
  };
}
async function assessmentClass(c: Context, differentSubject = false) {
  const [source] = await admin.unsafe(
    'SELECT subject_id FROM courses WHERE id=$1',
    [c.f.course],
  );
  const subject = differentSubject
    ? await put(admin as unknown as Query, 'subjects', {
        tenant_id: c.f.tenant,
        code: randomUUID(),
        name: 'Other subject',
        active: true,
      })
    : source.subject_id;
  const level = await put(admin as unknown as Query, 'levels', {
    tenant_id: c.f.tenant,
    code: randomUUID(),
    name: 'Different assessment difficulty',
    sort_order: 7,
    active: true,
  });
  const course = await put(admin as unknown as Query, 'courses', {
    tenant_id: c.f.tenant,
    code: randomUUID(),
    name: 'Assessment course',
    subject_id: subject,
    level_id: level,
    status: 'ACTIVE',
  });
  const classId = await put(admin as unknown as Query, 'classes', {
    tenant_id: c.f.tenant,
    code: randomUUID(),
    name: 'Assessment class',
    course_id: course,
    capacity: 10,
    status: 'ACTIVE',
  });
  return { classId, course, subject, level };
}
async function assigned(
  c: Context,
  classId = c.f.classId,
  teacherId = c.f.teacher,
) {
  await put(admin as unknown as Query, 'class_teacher_assignments', {
    tenant_id: c.f.tenant,
    class_id: classId,
    teacher_id: teacherId,
    role_kind: 'PRIMARY',
    valid_from: '2020-01-01',
    assigned_by_membership_id: c.f.member,
  });
}
async function session(
  c: Context,
  startsAt = '2099-05-01T10:00:00Z',
  classId = c.f.classId,
  teacherId = c.f.teacher,
  roomId?: string,
) {
  return c.scheduling.create(
    c.f.tenant,
    {
      classId,
      teacherId,
      roomId,
      deliveryMode: roomId ? 'ONSITE' : 'ONLINE',
      startsAt,
      endsAt: new Date(new Date(startsAt).getTime() + 3600000).toISOString(),
    },
    intent(),
  );
}
async function prepared(c: Context, startsAt = '2099-05-01T10:00:00Z') {
  await assigned(c);
  const s = await session(c, startsAt);
  await c.scheduling.confirm(c.f.tenant, s.id, intent());
  return s;
}
async function historical(start = '2025-09-20T10:00:00Z') {
  const c = await fixture({ start, enrollmentFrom: '2020-01-01' });
  await assigned(c);
  await admin.unsafe(
    "UPDATE class_sessions SET status='COMPLETED' WHERE id=$1",
    [c.f.session],
  );
  return c;
}
async function billingPeriod(
  c: Context,
  monthStart = '2025-09-01',
  monthEnd = '2025-10-01',
) {
  await put(admin as unknown as Query, 'price_rules', {
    tenant_id: c.f.tenant,
    scope_kind: 'COURSE',
    course_id: c.f.course,
    unit_price_vnd: '100000',
    effective_from: '2020-01-01',
    policy_version_id: c.f.policy,
    created_by_membership_id: c.f.member,
    created_at: '2019-01-01',
  });
  return put(admin as unknown as Query, 'billing_periods', {
    tenant_id: c.f.tenant,
    month_start: monthStart,
    month_end: monthEnd,
    status: 'OPEN',
  });
}
async function earlyIssueFixture(lateNotice = false) {
  const [clock] =
    await admin.unsafe(`SELECT to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-interval '1 month','YYYY-MM-DD') month_start,
    to_char(date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC'),'YYYY-MM-DD') month_end,
    (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC')-interval '30 minutes') AT TIME ZONE 'UTC' starts,
    clock_timestamp()-interval '1 hour' ends`);
  // An intentionally long cross-period interval isolates ISSUE-before-48h with
  // the REAL DB clock and real R2 closed-period/start-month rules. No clock GUC,
  // time-dependent production function replacement or period bypass is used.
  const c = await fixture({
    start: new Date(clock.starts).toISOString(),
    end: new Date(clock.ends).toISOString(),
    zone: 'UTC',
    enrollmentFrom: '2020-01-01',
  });
  await assigned(c);
  await admin.unsafe(
    'UPDATE teacher_profiles SET membership_id=$2 WHERE id=$1',
    [c.f.teacher, c.f.member],
  );
  await admin.unsafe(
    "UPDATE class_sessions SET status='COMPLETED' WHERE id=$1",
    [c.f.session],
  );
  const requester = await actor(c, 'STUDENT');
  const [policy] = await admin.unsafe(
    "SELECT id FROM policy_versions WHERE tenant_id=$1 AND version_code='R3_CURRENT'",
    [c.f.tenant],
  );
  const pendingLeave = await put(
    admin as unknown as Query,
    'absence_requests',
    {
      tenant_id: c.f.tenant,
      participant_id: c.f.participant,
      requester_membership_id: requester.f.member,
      submitted_at: new Date(
        new Date(clock.starts).getTime() - (lateNotice ? 23 : 25) * 3600000,
      ).toISOString(),
      reason: 'Synthetic original notice before the session',
      is_late_notice: lateNotice,
      status: 'PENDING_APPROVAL',
      policy_version_id: policy.id,
    },
  );
  const earlyPeriod = await billingPeriod(
    c,
    String(clock.month_start),
    String(clock.month_end),
  );
  return { ...c, pendingLeave, earlyPeriod };
}
async function earlyDraft(lateNotice = false) {
  const c = await earlyIssueFixture(lateNotice),
    attendanceRecord = await finalized(c);
  const generation = await c.generation.initial(
    c.f.tenant,
    c.f.student,
    c.earlyPeriod,
    intent(),
  );
  const [lock] = await admin.unsafe(
    'SELECT educore_r3.time_locked(clock_timestamp(),ends_at) locked FROM class_sessions WHERE id=$1',
    [c.f.session],
  );
  expect(lock.locked).toBe(false);
  return { ...c, attendanceRecord, invoiceId: generation.invoiceId as string };
}
async function sourceAndFinance(c: Context) {
  const [row] = await admin.unsafe(
    `SELECT jsonb_build_object(
    'leave',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM absence_requests x WHERE tenant_id=$1),
    'attendance',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM attendance_records x WHERE tenant_id=$1),
    'invoices',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM invoices x WHERE tenant_id=$1),
    'lines',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM invoice_lines x WHERE tenant_id=$1),
    'generations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM billing_run_generations x WHERE tenant_id=$1),
    'claims',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM invoiced_participation_claims x WHERE tenant_id=$1),
    'wallets',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM wallet_accounts x WHERE tenant_id=$1),
    'transactions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM wallet_transactions x WHERE tenant_id=$1),
    'auditCount',(SELECT count(*) FROM audit_logs WHERE tenant_id=$1),
    'receipts',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM idempotency_records x WHERE tenant_id=$1)) snapshot`,
    [c.f.tenant],
  );
  return row.snapshot;
}
async function finalized(c: Context) {
  const ar = await c.attendance.mark(
    c.f.tenant,
    c.f.session,
    c.f.participant,
    'ATTENDED',
    0,
    intent(),
  );
  await c.attendance.finalize(c.f.tenant, c.f.session, intent());
  return ar;
}
async function command(
  q: Query,
  c: Context,
  domain: 'academic' | 'scheduling' | 'attendance' | 'billing',
  body: Record<string, unknown>,
) {
  const fn =
    domain === 'billing' ? 'educore_r2.execute' : `educore_r3.${domain}`;
  const [r] = await q.unsafe(`SELECT ${fn}($1::uuid,$2::text::jsonb) result`, [
    c.f.tenant,
    JSON.stringify(body),
  ]);
  return r.result as Record<string, unknown>;
}
async function race(
  c: Context,
  label: string,
  first: (q: Query) => Promise<unknown>,
  second: (q: Query) => Promise<unknown>,
  commit = true,
  adminFirst = false,
  adminSecond = false,
) {
  const a = postgres(adminFirst ? url : c.runtime, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  const b = postgres(adminSecond ? url : c.runtime, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(a, b);
  await a.unsafe('BEGIN');
  await b.unsafe('BEGIN');
  const [ap] = await a.unsafe('SELECT pg_backend_pid() pid'),
    [bp] = await b.unsafe('SELECT pg_backend_pid() pid');
  let waiting: Promise<{ code: string | null; result?: unknown }> | undefined;
  try {
    if (adminFirst) {
      await a.unsafe('SELECT id FROM users WHERE id=$1 FOR SHARE', [c.f.user]);
      await a.unsafe('SELECT id FROM tenants WHERE id=$1 FOR NO KEY UPDATE', [
        c.f.tenant,
      ]);
    }
    await first(a);
    await a.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
    waiting = (async () => {
      try {
        const result = await second(b);
        await b.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
        await b.unsafe('COMMIT');
        return { code: null, result };
      } catch (error) {
        await b.unsafe('ROLLBACK');
        return { code: (error as { code: string }).code };
      }
    })();
    await waitBlocked(admin, Number(bp.pid), Number(ap.pid));
    await a.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
    const outcome = await waiting;
    (evidence.races as unknown[]).push({
      label,
      observedWait: true,
      firstPid: ap.pid,
      secondPid: bp.pid,
      firstCommitted: commit,
      secondCode: outcome.code,
    });
    return outcome;
  } finally {
    await a.unsafe('ROLLBACK');
    await b.unsafe('ROLLBACK');
    if (waiting) await waiting;
  }
}

describe('R3-A Academic', () => {
  native(
    'A09 published assessment context preserves subject, difficulty and time without inventing thresholds',
    async () => {
      const c = await fixture();
      expect(
        (
          await c.academic.placementContext(
            c.f.tenant,
            c.f.student,
            c.f.classId,
          )
        ).state,
      ).toBe('FALLBACK_AVAILABLE');
      const assignment = await put(admin as unknown as Query, 'assignments', {
        tenant_id: c.f.tenant,
        class_id: c.f.classId,
        created_by_teacher_id: c.f.teacher,
        title: 'Assessment',
        description: 'Synthetic subject-level evidence',
        priority: 1,
        deadline_at: '2026-10-01',
        status: 'PUBLISHED',
        published_at: '2026-09-01',
        revision: 1,
      });
      const recipient = await put(
        admin as unknown as Query,
        'assignment_recipients',
        {
          tenant_id: c.f.tenant,
          assignment_id: assignment,
          student_id: c.f.student,
          enrollment_id: c.f.enrollment,
          assigned_at: '2026-09-01',
        },
      );
      const submission = await put(admin as unknown as Query, 'submissions', {
        tenant_id: c.f.tenant,
        recipient_id: recipient,
        status: 'SUBMITTED',
      });
      const version = await put(
        admin as unknown as Query,
        'submission_versions',
        {
          tenant_id: c.f.tenant,
          submission_id: submission,
          version_no: 1,
          submitted_at: '2026-09-10',
          is_late: false,
          status: 'SUBMITTED',
        },
      );
      await put(admin as unknown as Query, 'grades', {
        tenant_id: c.f.tenant,
        submission_version_id: version,
        revision_no: 1,
        score: '8.5',
        graded_by_teacher_id: c.f.teacher,
        graded_at: '2026-09-11',
        status: 'PUBLISHED',
        published_at: '2026-09-12',
      });
      const context = await c.academic.placementContext(
        c.f.tenant,
        c.f.student,
        c.f.classId,
      );
      expect(context.state).toBe('GRADE_CONFIRMATION_AVAILABLE');
      expect(context.publishedAssessments).toHaveLength(1);
      expect(context.publishedAssessments[0]).toMatchObject({
        score: '8.5',
        subjectId: context.targetSubjectId,
        assessmentLevelId: context.targetLevelId,
      });
      const enrolled = await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student,
        '2099-01-01',
        {
          basis: 'PUBLISHED_GRADES',
          subjectId: context.targetSubjectId,
          levelId: context.targetLevelId,
          reason: 'Staff reviews the published subject assessment',
          grades: context.publishedAssessments.map(
            ({ gradeId, revision, evidenceHash }) => ({
              gradeId,
              revision,
              evidenceHash,
            }),
          ),
        },
        intent(),
      );
      expect(enrolled.status).toBe('ACTIVE');
      expect(
        (enrolled.placementEvidence as { grades: unknown[] }).grades,
      ).toHaveLength(1);
    },
  );
  native(
    'A01 native exclusion rejects overlapping enrollment, adjacent accepted',
    async () => {
      const c = await fixture();
      await sqlstate(
        () =>
          put(admin as unknown as Query, 'enrollments', {
            tenant_id: c.f.tenant,
            student_id: c.f.student,
            class_id: c.f.classId,
            status: 'ACTIVE',
            effective_from: '2099-02-01',
            created_by_membership_id: c.f.member,
          }),
        '23P01',
      );
      await admin.unsafe(
        "UPDATE enrollments SET effective_to='2099-02-01' WHERE id=$1",
        [c.f.enrollment],
      );
      await put(admin as unknown as Query, 'enrollments', {
        tenant_id: c.f.tenant,
        student_id: c.f.student,
        class_id: c.f.classId,
        status: 'ACTIVE',
        effective_from: '2099-02-01',
        created_by_membership_id: c.f.member,
      });
    },
  );
  native('A02 capacity shrink cannot overfill class', async () => {
    const c = await fixture();
    await put(admin as unknown as Query, 'enrollments', {
      tenant_id: c.f.tenant,
      student_id: c.f.student2,
      class_id: c.f.classId,
      status: 'ACTIVE',
      effective_from: '2099-02-01',
      created_by_membership_id: c.f.member,
    });
    await sqlstate(
      () =>
        admin.begin(async (tx) => {
          await tx.unsafe('UPDATE classes SET capacity=1 WHERE id=$1', [
            c.f.classId,
          ]);
          await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
        }),
      '23514',
    );
  });
  native(
    'A03 transfer request has no enrollment effect and replay is durable',
    async () => {
      const c = await fixture(),
        key = intent();
      const a = await c.academic.requestTransfer(
        c.f.tenant,
        c.f.enrollment,
        c.f.class2,
        '2099-03-01',
        key,
      );
      expect(a.status).toBe('REQUESTED');
      expect(
        await c.academic.requestTransfer(
          c.f.tenant,
          c.f.enrollment,
          c.f.class2,
          '2099-03-01',
          key,
        ),
      ).toEqual(a);
      expect(
        (
          await admin.unsafe('SELECT status FROM enrollments WHERE id=$1', [
            c.f.enrollment,
          ])
        )[0].status,
      ).toBe('ACTIVE');
      await expect(
        c.academic.requestTransfer(
          c.f.tenant,
          c.f.enrollment,
          c.f.class2,
          '2099-04-01',
          key,
        ),
      ).rejects.toThrow();
    },
  );
  native(
    'A04 past transfer, cross tenant and permission revoke fail',
    async () => {
      const c = await fixture(),
        other = await fixture();
      await expect(
        c.academic.requestTransfer(
          c.f.tenant,
          c.f.enrollment,
          c.f.class2,
          '2020-01-01',
          intent(),
        ),
      ).rejects.toThrow();
      await expect(
        c.academic.requestTransfer(
          other.f.tenant,
          other.f.enrollment,
          other.f.class2,
          '2099-03-01',
          intent(),
        ),
      ).rejects.toThrow();
      await preserveFixtureManager(admin as unknown as Query,c.f);
      await admin.unsafe(
        'UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=$1',
        [c.f.membershipRole],
      );
      await expect(
        c.academic.requestTransfer(
          c.f.tenant,
          c.f.enrollment,
          c.f.class2,
          '2099-03-01',
          intent(),
        ),
      ).rejects.toThrow();
    },
  );
  native(
    'A05 assignment recorded; changing scheduled teacher rejected',
    async () => {
      const c = await fixture();
      const a = await c.academic.assignTeacher(
        c.f.tenant,
        c.f.classId,
        c.f.teacher,
        '2099-01-01',
        null,
        intent(),
      );
      expect(a.status).toBe('ASSIGNED');
      const teacher = await put(admin as unknown as Query, 'teacher_profiles', {
        tenant_id: c.f.tenant,
        teacher_code: randomUUID(),
        full_name: 'Other',
        status: 'ACTIVE',
      });
      await expect(
        c.academic.assignTeacher(
          c.f.tenant,
          c.f.classId,
          teacher,
          '2099-01-01',
          null,
          intent(),
        ),
      ).rejects.toThrow();
    },
  );
  native(
    'A06 restricted runtime cannot mutate tables or forge binding',
    async () => {
      const c = await fixture();
      await sqlstate(
        () =>
          c.sql.unsafe(
            "UPDATE enrollments SET status='TRANSFERRED' WHERE id=$1",
            [c.f.enrollment],
          ),
        '42501',
      );
      await sqlstate(
        () =>
          c.sql.unsafe('UPDATE r2_principal_bindings SET auth_session_id=$1', [
            c.f.authSession,
          ]),
        '42501',
      );
      await sqlstate(
        () =>
          c.sql.unsafe('SELECT educore_r3.finish($1,$2,$3,$4)', [
            c.f.tenant,
            c.f.member,
            '{}',
            '{}',
          ]),
        '42501',
      );
    },
  );
  native(
    'A07 confirmed enrollment synchronizes future roster, validates placement and capacity',
    async () => {
      const c = await fixture();
      const s = await prepared(c);
      const evidence = await placement(c);
      await expect(
        c.academic.enroll(
          c.f.tenant,
          c.f.classId,
          c.f.student2,
          '2099-01-01',
          { ...evidence, levelId: randomUUID() },
          intent(),
        ),
      ).rejects.toThrow();
      const e = await c.academic.enroll(
        c.f.tenant,
        c.f.classId,
        c.f.student2,
        '2099-01-01',
        evidence,
        intent(),
      );
      expect(e.status).toBe('ACTIVE');
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM session_participants WHERE session_id=$1 AND removed_at IS NULL',
            [s.id],
          )
        )[0].n,
      ).toBe(2);
      await expect(
        c.academic.enroll(
          c.f.tenant,
          c.f.classId,
          c.f.student2,
          '2099-01-01',
          evidence,
          intent(),
        ),
      ).rejects.toThrow();
    },
  );
  native(
    'A08 transfer confirmation closes source interval and retains old participant identity',
    async () => {
      const c = await fixture();
      await assigned(c);
      await assigned(c, c.f.class2);
      const before = await session(c, '2099-02-01T10:00:00Z'),
        after = await session(c, '2099-04-01T10:00:00Z'),
        dest = await session(c, '2099-04-01T10:00:00Z', c.f.class2);
      await c.scheduling.confirm(c.f.tenant, after.id, intent());
      const request = await c.academic.requestTransfer(
        c.f.tenant,
        c.f.enrollment,
        c.f.class2,
        '2099-03-01',
        intent(),
      );
      const result = await c.academic.confirmTransfer(
        c.f.tenant,
        request.id,
        await placement(c),
        intent(),
      );
      expect(result.status).toBe('CONFIRMED');
      expect(
        (
          await admin.unsafe(
            'SELECT enrollment_id FROM session_participants WHERE session_id=$1',
            [before.id],
          )
        )[0].enrollment_id,
      ).toBe(c.f.enrollment);
      expect(
        (
          await admin.unsafe(
            'SELECT removed_at FROM session_participants WHERE session_id=$1',
            [after.id],
          )
        )[0].removed_at,
      ).not.toBeNull();
      expect(
        (
          await admin.unsafe(
            'SELECT enrollment_id FROM session_participants WHERE session_id=$1',
            [dest.id],
          )
        )[0].enrollment_id,
      ).toBe(result.id);
    },
  );
});

describe('R3 follow-up leave claim guard', () => {
  native(
    'FU-A06 late approval replay rechecks the specific late permission without effects',
    async () => {
      const c = await earlyDraft(true),
        key = intent();
      await c.leave.decide(c.f.tenant, c.pendingLeave, true, key);
      await admin.unsafe(
        "DELETE FROM role_permissions WHERE role_id=$1 AND permission_id=(SELECT id FROM permissions WHERE code='absence.approve_late')",
        [c.f.role],
      );
      const before = await sourceAndFinance(c);
      await expect(
        c.leave.decide(c.f.tenant, c.pendingLeave, true, key),
      ).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
      expect(await sourceAndFinance(c)).toEqual(before);
    },
  );
  native(
    'FU-A01 valid pending decisions and replay before ISSUE retain authorization checks',
    async () => {
      for (const approve of [true, false]) {
        const c = await earlyDraft(),
          key = intent();
        const decision = await c.leave.decide(
          c.f.tenant,
          c.pendingLeave,
          approve,
          key,
        );
        expect(decision.status).toBe(approve ? 'APPROVED' : 'REJECTED');
        expect(
          await c.leave.decide(c.f.tenant, c.pendingLeave, approve, key),
        ).toEqual(decision);
        await preserveFixtureManager(admin as unknown as Query,c.f);
        await admin.unsafe(
          'UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=$1',
          [c.f.membershipRole],
        );
        await expect(
          c.leave.decide(c.f.tenant, c.pendingLeave, approve, key),
        ).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
      }
    },
  );
  native(
    'FU-A02 issued approval/rejection and forged target hints fail without any source or financial effects',
    async () => {
      for (const approve of [true, false]) {
        const c = await earlyDraft();
        await c.invoice.issue(c.f.tenant, c.invoiceId, intent());
        const before = await sourceAndFinance(c);
        await expect(
          c.leave.decide(c.f.tenant, c.pendingLeave, approve, intent()),
        ).rejects.toThrow(
          /ISSUED_LEAVE_SOURCE_REQUIRES_FINANCIAL_CORRECTION_PATH/,
        );
        await expect(
          c.repository.command('attendance', c.f.tenant, {
            ...intent(),
            operation: approve ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
            absenceId: c.pendingLeave,
            participantId: randomUUID(),
            sessionId: randomUUID(),
          }),
        ).rejects.toThrow(/ISSUED_LEAVE_SOURCE/);
        const other = await fixture();
        await expect(
          c.leave.decide(other.f.tenant, c.pendingLeave, approve, intent()),
        ).rejects.toThrow(/SESSION_NOT_CURRENT/);
        await expect(
          c.leave.decide(c.f.tenant, other.f.participant, approve, intent()),
        ).rejects.toThrow(/LEAVE_TARGET_NOT_ACCESSIBLE/);
        expect(await sourceAndFinance(c)).toEqual(before);
      }
    },
  );
  native(
    'FU-A03 real ISSUE before 48h locks ordinary teacher marking independently of elapsed-time lock',
    async () => {
      const c = await earlyDraft();
      await c.invoice.issue(c.f.tenant, c.invoiceId, intent());
      const [proof] = await admin.unsafe(
        'SELECT educore_r3.time_locked(clock_timestamp(),ends_at) time_locked,(SELECT count(*)::int FROM invoiced_participation_claims WHERE participant_id=$2) claims FROM class_sessions WHERE id=$1',
        [c.f.session, c.f.participant],
      );
      expect(proof).toMatchObject({ time_locked: false, claims: 1 });
      await changeFixtureRole(admin,c.f,'TEACHER');
      await expect(
        c.attendance.mark(
          c.f.tenant,
          c.f.session,
          c.f.participant,
          'UNEXCUSED',
          1,
          intent(),
        ),
      ).rejects.toThrow(/ASSIGNED_TEACHER_OR_OVERDUE_STAFF_REQUIRED/);
      evidence.earlyIssue = {
        time_locked: proof.time_locked,
        claims: proof.claims,
        clockOverride: false,
        fixture: 'cross-period interval, real closed local-start month',
      };
    },
  );
  native(
    'FU-A04 LEAVE_APPROVE/REJECT vs ISSUE both writer orders and first-writer rollback',
    async () => {
      for (const approve of [true, false])
        for (const issueFirst of [true, false])
          for (const commit of [true, false]) {
            const c = await earlyDraft();
            const decide = (q: Query) =>
              command(q, c, 'attendance', {
                ...intent(),
                operation: approve ? 'LEAVE_APPROVE' : 'LEAVE_REJECT',
                absenceId: c.pendingLeave,
              });
            const issue = (q: Query) =>
              command(q, c, 'billing', {
                ...intent(),
                operation: 'ISSUE',
                invoiceId: c.invoiceId,
              });
            const outcome = await race(
              c,
              `${approve ? 'approve' : 'reject'} vs ISSUE ${issueFirst ? 'ISSUE first' : 'leave first'}`,
              issueFirst ? issue : decide,
              issueFirst ? decide : issue,
              commit,
            );
            // Pending-leave decisions do not change this finalized ATTENDED
            // billing basis. Leave-first may therefore commit before ISSUE;
            // ISSUE-first must seal both approval and rejection operations.
            expect(outcome.code).toBe(commit && issueFirst ? '23514' : null);
            const [sealed] =
              await admin`SELECT count(*)::int n FROM invoiced_participation_claims WHERE tenant_id=${c.f.tenant}::uuid AND participant_id=${c.f.participant}::uuid`;
            expect(sealed.n).toBe(!issueFirst || commit ? 1 : 0);
          }
    },
  );
  native(
    'FU-A05 claim guard also denies replay of a previous valid rejection after ISSUE',
    async () => {
      const c = await earlyDraft(),
        key = intent();
      await c.leave.decide(c.f.tenant, c.pendingLeave, false, key);
      await c.invoice.issue(c.f.tenant, c.invoiceId, intent());
      const before = await sourceAndFinance(c);
      await expect(
        c.leave.decide(c.f.tenant, c.pendingLeave, false, key),
      ).rejects.toThrow(/ISSUED_LEAVE_SOURCE/);
      expect(await sourceAndFinance(c)).toEqual(before);
    },
  );
});

describe('R3 follow-up grade-backed placement', () => {
  native(
    'FU-B01 latest valid published revisions, multiple dates and assessment levels remain review evidence',
    async () => {
      const c = await fixture(),
        assessment = await assessmentClass(c);
      const first = await seedGrade(c, { score: '6.5' });
      const latest = await seedGrade(c, {
        versionId: first.versionId,
        revision: 2,
        score: '7.5',
        gradedAt: '2026-09-01',
        publishedAt: '2026-09-02',
      });
      await seedGrade(c, {
        versionId: first.versionId,
        revision: 3,
        score: '9.5',
        status: 'DRAFT',
        publishedAt: null,
      });
      const second = await seedGrade(c, {
        classId: assessment.classId,
        score: '8.1',
        gradedAt: '2026-10-01',
        publishedAt: '2026-10-02',
      });
      const context = await c.academic.placementContext(
        c.f.tenant,
        c.f.student,
        c.f.class2,
      );
      expect(context.state).toBe('GRADE_CONFIRMATION_AVAILABLE');
      expect(context.automaticRecommendation).toBe(
        'DEFERRED_NO_APPROVED_RUBRIC',
      );
      expect(context.publishedAssessments.map((g) => g.gradeId)).toEqual([
        second.gradeId,
        latest.gradeId,
      ]);
      expect(context.publishedAssessments.map((g) => g.score)).toEqual([
        '8.1',
        '7.5',
      ]);
      expect(
        new Set(context.publishedAssessments.map((g) => g.assessmentLevelId))
          .size,
      ).toBe(2);
      const result = await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student,
        '2099-01-01',
        await gradePlacement(c),
        intent(),
      );
      expect(result.status).toBe('ACTIVE');
      expect(
        (
          result.placementEvidence as { grades: { gradeId: string }[] }
        ).grades.map((g) => g.gradeId),
      ).toEqual([second.gradeId, latest.gradeId]);
    },
  );
  native(
    'FU-B02 wrong student, subject, tenant and unpublished grade IDs cannot be asserted by caller',
    async () => {
      const c = await fixture(),
        other = await fixture(),
        otherSubject = await assessmentClass(c, true);
      await seedGrade(c, { studentId: c.f.student2 });
      await seedGrade(c, { classId: otherSubject.classId });
      await seedGrade(other);
      const wrongStudent = await gradePlacement(c, c.f.student2),
        wrongSubject = await gradePlacement(
          c,
          c.f.student,
          otherSubject.classId,
        ),
        foreign = await gradePlacement(other);
      const draft = await seedGrade(c, { status: 'DRAFT', publishedAt: null });
      const base = await placement(c);
      const invalid = [
        wrongStudent.grades[0],
        wrongSubject.grades[0],
        foreign.grades[0],
        { gradeId: draft.gradeId, revision: 1, evidenceHash: '0'.repeat(64) },
      ];
      for (const reference of invalid) {
        await expect(
          c.academic.enroll(
            c.f.tenant,
            c.f.class2,
            c.f.student,
            '2099-01-01',
            { ...base, basis: 'PUBLISHED_GRADES', grades: [reference] },
            intent(),
          ),
        ).rejects.toThrow(/STALE_OR_INELIGIBLE/);
      }
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM enrollments WHERE class_id=$1',
            [c.f.class2],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (await c.academic.placementContext(c.f.tenant, c.f.student, c.f.class2))
          .publishedAssessments,
      ).toHaveLength(0);
    },
  );
  native(
    'FU-B03 changed score, latest revision or source metadata between context read and confirmation is stale',
    async () => {
      const c = await fixture(),
        grade = await seedGrade(c),
        old = await gradePlacement(c);
      await admin.unsafe(
        'UPDATE grades SET score=7.0,updated_at=clock_timestamp() WHERE id=$1',
        [grade.gradeId],
      );
      await expect(
        c.academic.enroll(
          c.f.tenant,
          c.f.class2,
          c.f.student,
          '2099-01-01',
          old,
          intent(),
        ),
      ).rejects.toThrow(/STALE_OR_INELIGIBLE/);
      const current = await gradePlacement(c);
      await seedGrade(c, {
        versionId: grade.versionId,
        revision: 2,
        score: '8.0',
      });
      await expect(
        c.academic.enroll(
          c.f.tenant,
          c.f.class2,
          c.f.student,
          '2099-01-01',
          current,
          intent(),
        ),
      ).rejects.toThrow(/STALE_OR_INELIGIBLE/);
      const assessment = await assessmentClass(c);
      await seedGrade(c, { classId: assessment.classId });
      const metadata = await gradePlacement(c);
      await admin.unsafe(
        'UPDATE courses SET level_id=(SELECT level_id FROM courses WHERE id=$2) WHERE id=$1',
        [assessment.course, c.f.course],
      );
      await expect(
        c.academic.enroll(
          c.f.tenant,
          c.f.class2,
          c.f.student,
          '2099-01-01',
          metadata,
          intent(),
        ),
      ).rejects.toThrow(/STALE_OR_INELIGIBLE/);
    },
  );
  native(
    'FU-B04 missing/duplicate evidence is denied; confirmed audit and replay retain DB-derived scores',
    async () => {
      const c = await fixture();
      await seedGrade(c);
      const valid = await gradePlacement(c);
      for (const placementInput of [
        undefined,
        { ...valid, grades: [] },
        { ...valid, grades: [valid.grades[0], valid.grades[0]] },
        {
          ...valid,
          grades: [{ gradeId: valid.grades[0].gradeId, revision: 1 }],
        },
      ]) {
        await expect(
          c.repository.command('academic', c.f.tenant, {
            ...intent(),
            operation: 'ENROLL',
            classId: c.f.class2,
            studentId: c.f.student,
            effectiveFrom: '2099-01-01',
            placement: placementInput,
          }),
        ).rejects.toThrow(/PLACEMENT_/);
      }
      const key = intent();
      const forged = {
        ...valid,
        grades: [{ ...valid.grades[0], score: '10.0' }],
      };
      const enrolled = await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student,
        '2099-01-01',
        forged,
        key,
      );
      const snapshot = enrolled.placementEvidence as {
        grades: { score: string }[];
        confirmedByMembershipId: string;
        confirmedAt: string;
        targetCourseId: string;
      };
      expect(snapshot.grades[0].score).toBe('8.5');
      expect(snapshot.confirmedByMembershipId).toBe(c.f.member);
      expect(snapshot.targetCourseId).toBe(c.f.course);
      expect(snapshot.confirmedAt).toBeTruthy();
      const [audit] = await admin.unsafe(
        "SELECT after_json FROM audit_logs WHERE tenant_id=$1 AND event_type='R3:ENROLL'",
        [c.f.tenant],
      );
      expect(audit.after_json.result.placementEvidence).toEqual(snapshot);
      await admin.unsafe('UPDATE grades SET score=5.0 WHERE id=$1', [
        valid.grades[0].gradeId,
      ]);
      expect(
        await c.academic.enroll(
          c.f.tenant,
          c.f.class2,
          c.f.student,
          '2099-01-01',
          forged,
          key,
        ),
      ).toEqual(enrolled);
    },
  );
  native(
    'FU-B05 grade-backed transfer confirms explicitly and preserves original historical enrollment',
    async () => {
      const c = await historical();
      await seedGrade(c);
      const evidence = await gradePlacement(c);
      const request = await c.academic.requestTransfer(
        c.f.tenant,
        c.f.enrollment,
        c.f.class2,
        '2099-01-01',
        intent(),
      );
      expect(
        (
          await admin.unsafe('SELECT status FROM enrollments WHERE id=$1', [
            c.f.enrollment,
          ])
        )[0].status,
      ).toBe('ACTIVE');
      const staff = await actor(c, 'ACADEMIC_STAFF');
      const confirmation = await staff.academic.confirmTransfer(
        c.f.tenant,
        request.id,
        evidence,
        intent(),
      );
      expect(confirmation.status).toBe('CONFIRMED');
      expect(
        (confirmation.placementEvidence as { confirmedByMembershipId: string })
          .confirmedByMembershipId,
      ).toBe(staff.f.member);
      expect(
        (
          await admin.unsafe(
            'SELECT enrollment_id FROM session_participants WHERE id=$1',
            [c.f.participant],
          )
        )[0].enrollment_id,
      ).toBe(c.f.enrollment);
      expect(
        (
          await admin.unsafe(
            'SELECT prior_enrollment_id FROM enrollments WHERE id=$1',
            [confirmation.id],
          )
        )[0].prior_enrollment_id,
      ).toBe(c.f.enrollment);
    },
  );
  native(
    'FU-B06 ENTRY_TEST and reasoned staff fallback work without certificates, including unsuitable existing grades',
    async () => {
      const c = await fixture();
      await seedGrade(c);
      const base = await placement(c);
      const entry = await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student,
        '2099-01-01',
        {
          ...base,
          basis: 'ENTRY_TEST',
          reason:
            'Published assessment does not cover the target difficulty; entry test reviewed by staff',
        },
        intent(),
      );
      expect((entry.placementEvidence as { basis: string }).basis).toBe(
        'ENTRY_TEST',
      );
      const noGrades = await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student2,
        '2099-01-01',
        base,
        intent(),
      );
      expect((noGrades.placementEvidence as { basis: string }).basis).toBe(
        'STAFF_CONFIRMATION',
      );
      const student = await actor(c, 'STUDENT');
      await admin.unsafe(
        'UPDATE student_profiles SET membership_id=$2 WHERE id=$1',
        [c.f.student, student.f.member],
      );
      await expect(
        student.academic.placementContext(c.f.tenant, c.f.student, c.f.class2),
      ).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
      await expect(
        student.academic.enroll(
          c.f.tenant,
          c.f.class2,
          c.f.student,
          '2099-01-01',
          base,
          intent(),
        ),
      ).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
    },
  );
  native(
    'FU-B07 concurrent published revision vs confirmation rejects stale input or preserves committed receipt',
    async () => {
      for (const gradeFirst of [true, false]) {
        const c = await fixture(),
          grade = await seedGrade(c),
          placementInput = await gradePlacement(c),
          key = intent();
        const publish = (q: Query) =>
          put(q, 'grades', {
            tenant_id: c.f.tenant,
            submission_version_id: grade.versionId,
            revision_no: 2,
            score: '9.0',
            graded_by_teacher_id: c.f.teacher,
            graded_at: '2026-09-01',
            published_at: '2026-09-02',
            status: 'PUBLISHED',
          });
        const enroll = (q: Query) =>
          command(q, c, 'academic', {
            ...key,
            operation: 'ENROLL',
            classId: c.f.class2,
            studentId: c.f.student,
            effectiveFrom: '2099-01-01',
            placement: placementInput,
          });
        const outcome = await race(
          c,
          'published grade revision vs enrollment',
          gradeFirst ? publish : enroll,
          gradeFirst ? enroll : publish,
          true,
          gradeFirst,
          !gradeFirst,
        );
        expect(outcome.code).toBe(gradeFirst ? '23514' : null);
        if (!gradeFirst) {
          const [receipt] = await admin.unsafe(
            "SELECT result_snapshot FROM idempotency_records WHERE tenant_id=$1 AND operation_type='R3:ENROLL' AND idempotency_key=$2",
            [c.f.tenant, key.key],
          );
          expect(
            receipt.result_snapshot.placementEvidence.grades[0].gradeId,
          ).toBe(grade.gradeId);
          expect(
            await c.academic.enroll(
              c.f.tenant,
              c.f.class2,
              c.f.student,
              '2099-01-01',
              placementInput,
              key,
            ),
          ).toEqual(receipt.result_snapshot);
        }
      }
    },
  );
  native(
    'FU-B08 grade-backed confirmation cannot change Billing generations, issued claims or wallet effects',
    async () => {
      const c = await historical(),
        period = await billingPeriod(c);
      await finalized(c);
      const generation = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        period,
        intent(),
      );
      await c.invoice.issue(
        c.f.tenant,
        generation.invoiceId as string,
        intent(),
      );
      await seedGrade(c);
      const [before] = await admin.unsafe(
        'SELECT input_snapshot,result_snapshot FROM billing_run_generations WHERE id=$1',
        [generation.id as string],
      );
      await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student,
        '2099-01-01',
        await gradePlacement(c),
        intent(),
      );
      const [after] = await admin.unsafe(
        'SELECT input_snapshot,result_snapshot FROM billing_run_generations WHERE id=$1',
        [generation.id as string],
      );
      expect(after).toEqual(before);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM billing_run_generations WHERE tenant_id=$1',
            [c.f.tenant],
          )
        )[0].n,
      ).toBe(1);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM wallet_transactions WHERE tenant_id=$1',
            [c.f.tenant],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM invoiced_participation_claims WHERE participant_id=$1',
            [c.f.participant],
          )
        )[0].n,
      ).toBe(1);
    },
  );
});

describe('R3-B Scheduling', () => {
  native(
    'B08 calendar filters assigned Teacher, own Student and class-scoped staff',
    async () => {
      const c = await fixture();
      const own = await prepared(c);
      const secondTeacher = await put(
        admin as unknown as Query,
        'teacher_profiles',
        {
          tenant_id: c.f.tenant,
          teacher_code: 'T2',
          full_name: 'Other teacher',
          status: 'ACTIVE',
        },
      );
      await assigned(c, c.f.class2, secondTeacher);
      await c.academic.enroll(
        c.f.tenant,
        c.f.class2,
        c.f.student2,
        '2099-01-01',
        await placement(c),
        intent(),
      );
      const other = await session(
        c,
        '2099-05-01T10:00Z',
        c.f.class2,
        secondTeacher,
      );
      await c.scheduling.confirm(c.f.tenant, other.id, intent());
      const teacher = await actor(c, 'TEACHER'),
        student = await actor(c, 'STUDENT');
      await admin.unsafe(
        'UPDATE teacher_profiles SET membership_id=$2 WHERE id=$1',
        [c.f.teacher, teacher.f.member],
      );
      await admin.unsafe(
        'UPDATE student_profiles SET membership_id=$2 WHERE id=$1',
        [c.f.student, student.f.member],
      );
      for (const scoped of [teacher, student]) {
        expect(
          await scoped.scheduling.calendar(
            c.f.tenant,
            '2099-05-01',
            '2099-05-02',
          ),
        ).toMatchObject([{ id: own.id }]);
        expect(
          await scoped.scheduling.calendar(
            c.f.tenant,
            '2099-05-01',
            '2099-05-02',
            c.f.student2,
          ),
        ).toHaveLength(0);
      }
      await preserveFixtureManager(admin as unknown as Query,c.f);
      await admin.unsafe(
        "UPDATE access_scopes SET scope_kind='CLASS',class_id=$2 WHERE id=$1",
        [c.f.scope, c.f.classId],
      );
      expect(
        await c.scheduling.calendar(c.f.tenant, '2099-05-01', '2099-05-02'),
      ).toMatchObject([{ id: own.id }]);
      await expect(
        c.scheduling.calendar(c.f.tenant, '2099-05-01', '2099-07-01'),
      ).rejects.toThrow();
    },
  );
  native(
    'B07 room and student conflicts are independently protected with distinct teachers',
    async () => {
      for (const shared of ['ROOM', 'STUDENT']) {
        const c = await fixture();
        await assigned(c);
        const teacher = await put(
          admin as unknown as Query,
          'teacher_profiles',
          {
            tenant_id: c.f.tenant,
            teacher_code: 'T2',
            full_name: 'Second teacher',
            status: 'ACTIVE',
          },
        );
        await assigned(c, c.f.class2, teacher);
        const room = await c.scheduling.room(
          c.f.tenant,
          { code: 'R', name: 'Room', capacity: 10 },
          intent(),
        );
        if (shared === 'STUDENT')
          await c.academic.enroll(
            c.f.tenant,
            c.f.class2,
            c.f.student,
            '2099-01-01',
            await placement(c),
            intent(),
          );
        const a = await session(
          c,
          '2099-05-01T10:00Z',
          c.f.classId,
          c.f.teacher,
          shared === 'ROOM' ? room.id : undefined,
        );
        const b = await session(
          c,
          '2099-05-01T10:30Z',
          c.f.class2,
          teacher,
          shared === 'ROOM' ? room.id : undefined,
        );
        await c.scheduling.confirm(c.f.tenant, a.id, intent());
        await sqlstate(
          () =>
            c.sql.begin((q) =>
              command(q, c, 'scheduling', {
                ...intent(),
                operation: 'CONFIRM',
                sessionId: b.id,
              }),
            ),
          '23P01',
        );
      }
    },
  );
  native(
    'B01 teacher conflict rejected and adjacent session accepted',
    async () => {
      const c = await fixture();
      await prepared(c);
      const overlap = await session(c, '2099-05-01T10:30:00Z');
      await expect(
        c.scheduling.confirm(c.f.tenant, overlap.id, intent()),
      ).rejects.toThrow();
      const adjacent = await session(c, '2099-05-01T11:00:00Z');
      expect(
        (await c.scheduling.confirm(c.f.tenant, adjacent.id, intent())).status,
      ).toBe('CONFIRMED');
    },
  );
  native(
    'B02 onsite room required, room capacity and missing/wrong booking rejected',
    async () => {
      const c = await fixture();
      await assigned(c);
      await expect(
        c.scheduling.create(
          c.f.tenant,
          {
            classId: c.f.classId,
            teacherId: c.f.teacher,
            deliveryMode: 'ONSITE',
            startsAt: '2099-05-01T10:00Z',
            endsAt: '2099-05-01T11:00Z',
          },
          intent(),
        ),
      ).rejects.toThrow();
      const room = await c.scheduling.room(
        c.f.tenant,
        { code: 'R1', name: 'Room', capacity: 1 },
        intent(),
      );
      const s = await session(
        c,
        '2099-05-01T10:00Z',
        c.f.classId,
        c.f.teacher,
        room.id,
      );
      await c.scheduling.confirm(c.f.tenant, s.id, intent());
      await expect(
        c.academic.enroll(
          c.f.tenant,
          c.f.classId,
          c.f.student2,
          '2099-01-01',
          await placement(c),
          intent(),
        ),
      ).rejects.toThrow();
      await sqlstate(
        () =>
          admin.begin(async (tx) => {
            await tx.unsafe(
              "UPDATE resource_bookings SET status='RELEASED' WHERE session_id=$1",
              [s.id],
            );
            await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
          }),
        '23514',
      );
      await sqlstate(
        () =>
          admin.begin(async (tx) => {
            await tx.unsafe(
              "UPDATE resource_bookings SET ends_at=ends_at+interval '1 minute' WHERE session_id=$1",
              [s.id],
            );
            await tx.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
          }),
        '23514',
      );
    },
  );
  native(
    'B03 confirmed unavailability blocks; cancellation releases it',
    async () => {
      const c = await fixture();
      await assigned(c);
      const busy = await c.scheduling.createUnavailability(
        c.f.tenant,
        {
          resourceKind: 'TEACHER',
          resourceId: c.f.teacher,
          startsAt: '2099-05-01T10:00Z',
          endsAt: '2099-05-01T11:00Z',
        },
        intent(),
      );
      await c.scheduling.decideUnavailability(
        c.f.tenant,
        busy.id,
        true,
        intent(),
      );
      const s = await session(c);
      await expect(
        c.scheduling.confirm(c.f.tenant, s.id, intent()),
      ).rejects.toThrow();
      await c.scheduling.decideUnavailability(
        c.f.tenant,
        busy.id,
        false,
        intent(),
      );
      expect(
        (await c.scheduling.confirm(c.f.tenant, s.id, intent())).status,
      ).toBe('CONFIRMED');
    },
  );
  native(
    'B04 reschedule/cancel revision, release, and transactional outbox',
    async () => {
      const c = await fixture();
      const s = await prepared(c);
      const moved = await c.scheduling.reschedule(
        c.f.tenant,
        s.id,
        2,
        '2099-05-01T12:00Z',
        '2099-05-01T13:00Z',
        intent(),
      );
      expect(moved.revision).toBe(3);
      await expect(
        c.scheduling.cancel(c.f.tenant, s.id, 2, intent()),
      ).rejects.toThrow();
      await c.scheduling.cancel(c.f.tenant, s.id, 3, intent());
      expect(
        (
          await admin.unsafe(
            "SELECT count(*)::int n FROM resource_bookings WHERE session_id=$1 AND status='ACTIVE'",
            [s.id],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1',
            [s.id],
          )
        )[0].n,
      ).toBe(2);
    },
  );
  native(
    'B05 six-month weekly bounds, all-or-nothing last occurrence conflict',
    async () => {
      const c = await fixture();
      await assigned(c);
      const config = {
        classId: c.f.classId,
        teacherId: c.f.teacher,
        deliveryMode: 'ONLINE' as const,
        weekday: 1,
        localStartTime: '17:00',
        durationMinutes: 60,
        validFrom: '2099-05-01',
        validTo: '2099-05-31',
      };
      expect(
        (
          await c.scheduling.createSeries(
            c.f.tenant,
            { ...config, validTo: '2099-11-01' },
            intent(),
          )
        ).status,
      ).toBe('DRAFT');
      await expect(
        c.scheduling.createSeries(
          c.f.tenant,
          { ...config, validTo: '2099-11-02' },
          intent(),
        ),
      ).rejects.toThrow();
      await expect(
        c.scheduling.createSeries(
          c.f.tenant,
          { ...config, validTo: '2100-01-01' },
          intent(),
        ),
      ).rejects.toThrow();
      const series = await c.scheduling.createSeries(
        c.f.tenant,
        config,
        intent(),
      );
      const sessions = await admin.unsafe(
        'SELECT id,starts_at FROM class_sessions WHERE series_id=$1 ORDER BY starts_at',
        [series.id],
      );
      const last = sessions.at(-1)!;
      const busy = await c.scheduling.createUnavailability(
        c.f.tenant,
        {
          resourceKind: 'TEACHER',
          resourceId: c.f.teacher,
          startsAt: new Date(last.starts_at).toISOString(),
          endsAt: new Date(
            new Date(last.starts_at).getTime() + 3600000,
          ).toISOString(),
        },
        intent(),
      );
      await c.scheduling.decideUnavailability(
        c.f.tenant,
        busy.id,
        true,
        intent(),
      );
      await expect(
        c.scheduling.confirmSeries(c.f.tenant, series.id, intent()),
      ).rejects.toThrow();
      expect(
        (
          await admin.unsafe(
            "SELECT count(*)::int n FROM class_sessions WHERE series_id=$1 AND status<>'DRAFT'",
            [series.id],
          )
        )[0].n,
      ).toBe(0);
      await c.scheduling.decideUnavailability(
        c.f.tenant,
        busy.id,
        false,
        intent(),
      );
      expect(
        (await c.scheduling.confirmSeries(c.f.tenant, series.id, intent()))
          .status,
      ).toBe('CONFIRMED');
    },
  );
  native(
    'B06 DST gaps/overlaps rejected; local weekly time survives DST transition',
    async () => {
      await sqlstate(
        () =>
          admin.unsafe(
            "SELECT educore_r3.local_instant('2026-03-08 02:30','America/New_York')",
          ),
        '22007',
      );
      await sqlstate(
        () =>
          admin.unsafe(
            "SELECT educore_r3.local_instant('2026-11-01 01:30','America/New_York')",
          ),
        '22007',
      );
      const c = await fixture({ zone: 'America/New_York' });
      await assigned(c);
      const series = await c.scheduling.createSeries(
        c.f.tenant,
        {
          classId: c.f.classId,
          teacherId: c.f.teacher,
          deliveryMode: 'ONLINE',
          weekday: 1,
          localStartTime: '10:00',
          durationMinutes: 60,
          validFrom: '2099-03-01',
          validTo: '2099-03-31',
        },
        intent(),
      );
      const rows = await admin.unsafe(
        "SELECT to_char(starts_at AT TIME ZONE 'America/New_York','HH24:MI') local_time,extract(hour FROM starts_at AT TIME ZONE 'UTC') utc_hour FROM class_sessions WHERE series_id=$1",
        [series.id],
      );
      expect(rows.every((r) => r.local_time === '10:00')).toBe(true);
      expect(new Set(rows.map((r) => r.utc_hour)).size).toBe(2);
    },
  );
});

describe('R3-C Attendance and leave', () => {
  native('C01 exact 24h and 48h boundaries use DB functions', async () => {
    const [r] = await admin.unsafe(
      "SELECT educore_r3.late_notice('2026-01-01 10:00Z','2026-01-02 10:00Z') exact24,educore_r3.late_notice('2026-01-01 11:00Z','2026-01-02 10:00Z') late23,educore_r3.time_locked('2026-01-03 10:00Z','2026-01-01 10:00Z') exact48,educore_r3.time_locked('2026-01-03 09:59:59.999999Z','2026-01-01 10:00Z') before48",
    );
    expect(r).toMatchObject({
      exact24: false,
      late23: true,
      exact48: true,
      before48: false,
    });
  });
  native(
    'C02 parent leave requires verified active link and cannot self approve',
    async () => {
      const c = await fixture();
      const s = await prepared(c);
      const parent = await actor(c, 'PARENT');
      const [p] = await admin.unsafe(
        'SELECT id FROM session_participants WHERE session_id=$1',
        [s.id],
      );
      await expect(
        parent.leave.submit(c.f.tenant, p.id, intent()),
      ).rejects.toThrow();
      const link = await put(
        admin as unknown as Query,
        'parent_student_links',
        {
          tenant_id: c.f.tenant,
          parent_membership_id: parent.f.member,
          student_id: c.f.student,
          relationship: 'PARENT',
          verified_at: '2020-01-01',
          verified_by_membership_id: c.f.member,
        },
      );
      const leave = await parent.leave.submit(c.f.tenant, p.id, intent());
      expect(leave.status).toBe('PENDING_APPROVAL');
      await expect(
        parent.leave.decide(c.f.tenant, leave.id, true, intent()),
      ).rejects.toThrow();
      expect(
        (await c.leave.decide(c.f.tenant, leave.id, true, intent())).status,
      ).toBe('APPROVED');
      await expect(
        c.leave.decide(c.f.tenant, leave.id, false, intent()),
      ).rejects.toThrow();
      const rows = await parent.scheduling.calendar(
        c.f.tenant,
        '2099-05-01',
        '2099-05-02',
        c.f.student,
      );
      expect(rows).toHaveLength(1);
      await admin.unsafe(
        'UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=$1',
        [link],
      );
      expect(
        await parent.scheduling.calendar(
          c.f.tenant,
          '2099-05-01',
          '2099-05-02',
          c.f.student,
        ),
      ).toHaveLength(0);
    },
  );
  native(
    'C03 late leave requires explicit late permission; decisions do not fabricate attendance',
    async () => {
      const near = await fixture({ enrollmentFrom: '2020-01-01' });
      const current = await prepared(
        near,
        new Date(Date.now() + 23 * 3600000).toISOString(),
      );
      const student = await actor(near, 'STUDENT');
      await admin.unsafe(
        'UPDATE student_profiles SET membership_id=$2 WHERE id=$1',
        [near.f.student, student.f.member],
      );
      const [p] = await admin.unsafe(
        'SELECT id FROM session_participants WHERE session_id=$1',
        [current.id],
      );
      const leave = await student.leave.submit(near.f.tenant, p.id, intent());
      await admin.unsafe(
        "DELETE FROM role_permissions WHERE role_id=$1 AND permission_id=(SELECT id FROM permissions WHERE code='absence.approve_late')",
        [near.f.role],
      );
      await expect(
        near.leave.decide(near.f.tenant, leave.id, true, intent()),
      ).rejects.toThrow();
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM attendance_records WHERE participant_id=$1',
            [p.id],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (await near.leave.decide(near.f.tenant, leave.id, false, intent()))
          .status,
      ).toBe('REJECTED');
    },
  );
  native(
    'C04 unapproved EXCUSED denied, full roster required, correction is revisioned history',
    async () => {
      const c = await historical();
      await expect(
        c.attendance.finalize(c.f.tenant, c.f.session, intent()),
      ).rejects.toThrow();
      await expect(
        c.attendance.mark(
          c.f.tenant,
          c.f.session,
          c.f.participant,
          'EXCUSED',
          0,
          intent(),
        ),
      ).rejects.toThrow();
      const ar = await finalized(c);
      await expect(
        c.attendance.mark(
          c.f.tenant,
          c.f.session,
          c.f.participant,
          'UNEXCUSED',
          1,
          intent(),
        ),
      ).rejects.toThrow();
      const correction = await c.attendance.correct(
        c.f.tenant,
        ar.id,
        'UNEXCUSED',
        1,
        intent(),
      );
      expect(correction.revision).toBe(2);
      await expect(
        c.attendance.correct(c.f.tenant, ar.id, 'ATTENDED', 1, intent()),
      ).rejects.toThrow();
      const [history] = await admin.unsafe(
        'SELECT * FROM attendance_corrections WHERE attendance_id=$1',
        [ar.id],
      );
      expect(history).toMatchObject({
        old_status: 'ATTENDED',
        new_status: 'UNEXCUSED',
        old_revision: 1,
        new_revision: 2,
      });
      expect(history.previous_record_snapshot).toMatchObject({
        id: ar.id,
        attendance_status: 'ATTENDED',
        revision: 1,
        recorded_by_membership_id: c.f.member,
      });
      await sqlstate(
        () =>
          admin.unsafe(
            "UPDATE attendance_corrections SET reason='rewrite' WHERE attendance_id=$1",
            [ar.id],
          ),
        '23514',
      );
    },
  );
  native(
    'C05 assigned teacher scope and current permission are enforced',
    async () => {
      const c = await historical(new Date(Date.now() - 3600000).toISOString());
      const teacher = await actor(c, 'TEACHER');
      await expect(
        teacher.attendance.mark(
          c.f.tenant,
          c.f.session,
          c.f.participant,
          'ATTENDED',
          0,
          intent(),
        ),
      ).rejects.toThrow();
      await admin.unsafe(
        'UPDATE teacher_profiles SET membership_id=$2 WHERE id=$1',
        [c.f.teacher, teacher.f.member],
      );
      const marked = await teacher.attendance.mark(
        c.f.tenant,
        c.f.session,
        c.f.participant,
        'ATTENDED',
        0,
        intent(),
      );
      expect(marked.revision).toBe(1);
      await admin.unsafe(
        'UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=$1',
        [teacher.f.membershipRole],
      );
      await expect(
        teacher.attendance.finalize(c.f.tenant, c.f.session, intent()),
      ).rejects.toThrow();
    },
  );
  native(
    'C06 approved leave permits EXCUSED; actual attendance overrides it',
    async () => {
      const c = await historical(new Date(Date.now() - 3600000).toISOString());
      await admin.unsafe(
        'UPDATE teacher_profiles SET membership_id=$2 WHERE id=$1',
        [c.f.teacher, c.f.member],
      );
      // Synthetic original approved leave predates this already-started fixture.
      await put(admin as unknown as Query, 'absence_requests', {
        tenant_id: c.f.tenant,
        participant_id: c.f.participant,
        requester_membership_id: c.f.member,
        submitted_at: new Date(Date.now() - 72 * 3600000).toISOString(),
        reason: 'Synthetic approved leave',
        is_late_notice: false,
        status: 'APPROVED',
        approved_by_membership_id: c.f.member,
        decided_at: new Date(Date.now() - 48 * 3600000).toISOString(),
      });
      const ar = await c.attendance.mark(
        c.f.tenant,
        c.f.session,
        c.f.participant,
        'EXCUSED',
        0,
        intent(),
      );
      const actual = await c.attendance.mark(
        c.f.tenant,
        c.f.session,
        c.f.participant,
        'ATTENDED',
        1,
        intent(),
      );
      expect(actual.id).toBe(ar.id);
      await c.attendance.finalize(c.f.tenant, c.f.session, intent());
    },
  );
});

describe('R3-D real Billing integration', () => {
  native(
    'D04 R3 UNEXCUSED charges one and approved EXCUSED charges zero through real Billing',
    async () => {
      for (const status of ['UNEXCUSED', 'EXCUSED'] as const) {
        const c = await historical(),
          period = await billingPeriod(c);
        if (status === 'EXCUSED') {
          const requester = await actor(c, 'STUDENT');
          const [policy] = await admin.unsafe(
            "SELECT id FROM policy_versions WHERE tenant_id=$1 AND version_code='R3_CURRENT'",
            [c.f.tenant],
          );
          const leave = await put(
            admin as unknown as Query,
            'absence_requests',
            {
              tenant_id: c.f.tenant,
              participant_id: c.f.participant,
              requester_membership_id: requester.f.member,
              submitted_at: '2025-09-18',
              reason: 'Synthetic original notice',
              is_late_notice: false,
              status: 'PENDING_APPROVAL',
              policy_version_id: policy.id,
            },
          );
          await c.leave.decide(c.f.tenant, leave, true, intent());
        }
        await c.attendance.mark(
          c.f.tenant,
          c.f.session,
          c.f.participant,
          status,
          0,
          intent(),
        );
        await c.attendance.finalize(c.f.tenant, c.f.session, intent());
        expect(
          (
            await c.generation.initial(
              c.f.tenant,
              c.f.student,
              period,
              intent(),
            )
          ).totalVnd,
        ).toBe(status === 'EXCUSED' ? '0' : '100000');
      }
    },
  );
  native(
    'D03 catalog verifies GiST, immutable history, narrow runtime grants and owner privileges',
    async () => {
      const [exclusion] = await admin.unsafe(
        "SELECT contype,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conname='r3_booking_overlap'",
      );
      expect(exclusion.contype).toBe('x');
      expect(exclusion.definition).toContain('tstzrange');
      expect(exclusion.definition).toContain('ACTIVE');
      const functions = await admin.unsafe(
        "SELECT p.proname,role.rolname owner,p.prosecdef,p.proconfig,has_function_privilege('educore_r3_command',p.oid,'EXECUTE') exposed,COALESCE((SELECT bool_or(a.grantee=0 AND a.privilege_type='EXECUTE') FROM aclexplode(p.proacl) a),false) public_execute FROM pg_proc p JOIN pg_roles role ON role.oid=p.proowner WHERE p.pronamespace='educore_r3'::regnamespace",
      );
      for (const fn of functions) {
        expect(fn.owner).toBe('educore_r3_owner');
        expect(fn.public_execute).toBe(false);
        expect(fn.proconfig.join(' ')).toContain('pg_catalog');
      }
      expect(
        functions
          .filter((f) => f.exposed)
          .map((f) => f.proname)
          .sort((a, b) => String(a).localeCompare(String(b))),
      ).toEqual([
        'academic',
        'attendance',
        'calendar',
        'placement_context',
        'scheduling',
      ]);
      const [owner] = await admin.unsafe(
        "SELECT rolsuper,rolcanlogin,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname='educore_r3_owner'",
      );
      expect(owner).toMatchObject({
        rolsuper: false,
        rolcanlogin: false,
        rolbypassrls: false,
        rolcreaterole: false,
      });
      evidence.catalog = { exclusion, functions, owner };
    },
  );
  native(
    'D01 R3 finalized source creates G1, ISSUE claims; correction cannot alter invoice or wallet',
    async () => {
      const c = await historical(),
        period = await billingPeriod(c);
      const ar = await finalized(c);
      await sqlstate(
        () =>
          admin.unsafe(
            "UPDATE enrollments SET effective_to='2024-01-01' WHERE id=$1",
            [c.f.enrollment],
          ),
        '23514',
      );
      const g = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        period,
        intent(),
      );
      expect(g.totalVnd).toBe('100000');
      const invoiceId = g.invoiceId as string;
      await c.invoice.issue(c.f.tenant, invoiceId, intent());
      await expect(
        c.attendance.correct(c.f.tenant, ar.id, 'UNEXCUSED', 1, intent()),
      ).rejects.toThrow();
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM invoiced_participation_claims WHERE participant_id=$1',
            [c.f.participant],
          )
        )[0].n,
      ).toBe(1);
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM wallet_transactions WHERE tenant_id=$1',
            [c.f.tenant],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (
          await admin.unsafe(
            'SELECT total_vnd::text FROM invoices WHERE id=$1',
            [invoiceId],
          )
        )[0].total_vnd,
      ).toBe('100000');
    },
  );
  native(
    'D02 missing finalization yields NEEDS_INFORMATION; explicit G2 after finalize preserves G1',
    async () => {
      const c = await historical(),
        period = await billingPeriod(c);
      const g1 = await c.generation.initial(
        c.f.tenant,
        c.f.student,
        period,
        intent(),
      );
      expect(g1.status).toBe('NEEDS_INFORMATION');
      await finalized(c);
      const g2 = await c.generation.recompute(
        c.f.tenant,
        c.f.student,
        period,
        g1.id as string,
        null,
        intent(),
      );
      expect(g2.totalVnd).toBe('100000');
      const [stored] = await admin.unsafe(
        'SELECT status FROM billing_run_generations WHERE id=$1',
        [g1.id as string],
      );
      expect(stored.status).toBe('NEEDS_INFORMATION');
    },
  );
});

describe('R3-D observed independent-connection concurrency', () => {
  native(
    'X16 Teacher permission revoke wins before attendance finalization',
    async () => {
      const c = await historical(new Date(Date.now() - 3600000).toISOString()),
        teacher = await actor(c, 'TEACHER');
      await admin.unsafe(
        'UPDATE teacher_profiles SET membership_id=$2 WHERE id=$1',
        [c.f.teacher, teacher.f.member],
      );
      await teacher.attendance.mark(
        c.f.tenant,
        c.f.session,
        c.f.participant,
        'ATTENDED',
        0,
        intent(),
      );
      const outcome = await race(
        teacher,
        'Teacher permission revoke vs finalize',
        (q) =>
          q.unsafe(
            'UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=$1',
            [teacher.f.membershipRole],
          ),
        (q) =>
          command(q, teacher, 'attendance', {
            ...intent(),
            operation: 'FINALIZE',
            sessionId: c.f.session,
          }),
        true,
        true,
      );
      expect(outcome.code).toBe('42501');
    },
  );
  native(
    'X01 competing confirmations commit or rollback under observed locks',
    async () => {
      for (const commit of [true, false]) {
        const c = await fixture();
        await assigned(c);
        const a = await session(c),
          b = await session(c);
        const outcome = await race(
          c,
          'confirm vs confirm',
          (q) =>
            command(q, c, 'scheduling', {
              ...intent(),
              operation: 'CONFIRM',
              sessionId: a.id,
            }),
          (q) =>
            command(q, c, 'scheduling', {
              ...intent(),
              operation: 'CONFIRM',
              sessionId: b.id,
            }),
          commit,
        );
        expect(outcome.code).toBe(commit ? '23P01' : null);
      }
    },
  );
  native('X02 two last-seat enrollments cannot overfill', async () => {
    const c = await fixture();
    await admin.unsafe('UPDATE classes SET capacity=2 WHERE id=$1', [
      c.f.classId,
    ]);
    const third = await put(admin as unknown as Query, 'student_profiles', {
        tenant_id: c.f.tenant,
        student_code: 'S3',
        full_name: 'Third',
        status: 'ACTIVE',
      }),
      e = await placement(c);
    const enroll = (studentId: string) => ({
      ...intent(),
      operation: 'ENROLL',
      classId: c.f.classId,
      studentId,
      effectiveFrom: '2099-01-01',
      placement: e,
    });
    const outcome = await race(
      c,
      'last seat vs enrollment',
      (q) => command(q, c, 'academic', enroll(c.f.student2)),
      (q) => command(q, c, 'academic', enroll(third)),
    );
    expect(outcome.code).toBe('23514');
  });
  native(
    'X03 transfer vs enrollment rechecks destination capacity',
    async () => {
      const c = await fixture();
      await admin.unsafe('UPDATE classes SET capacity=1 WHERE id=$1', [
        c.f.class2,
      ]);
      const e = await placement(c);
      const request = await c.academic.requestTransfer(
        c.f.tenant,
        c.f.enrollment,
        c.f.class2,
        '2099-03-01',
        intent(),
      );
      const outcome = await race(
        c,
        'transfer vs enrollment',
        (q) =>
          command(q, c, 'academic', {
            ...intent(),
            operation: 'TRANSFER_CONFIRM',
            transferId: request.id,
            placement: e,
          }),
        (q) =>
          command(q, c, 'academic', {
            ...intent(),
            operation: 'ENROLL',
            classId: c.f.class2,
            studentId: c.f.student2,
            effectiveFrom: '2099-03-01',
            placement: e,
          }),
      );
      expect(outcome.code).toBe('23514');
    },
  );
  native('X04 room shrink vs booking preserves capacity', async () => {
    const c = await fixture();
    await assigned(c);
    await c.academic.enroll(
      c.f.tenant,
      c.f.classId,
      c.f.student2,
      '2099-01-01',
      await placement(c),
      intent(),
    );
    const room = await c.scheduling.room(
        c.f.tenant,
        { code: 'R', name: 'Room', capacity: 2 },
        intent(),
      ),
      s = await session(
        c,
        '2099-05-01T10:00Z',
        c.f.classId,
        c.f.teacher,
        room.id,
      );
    const outcome = await race(
      c,
      'room capacity vs booking',
      (q) => q.unsafe('UPDATE rooms SET capacity=1 WHERE id=$1', [room.id]),
      (q) =>
        command(q, c, 'scheduling', {
          ...intent(),
          operation: 'CONFIRM',
          sessionId: s.id,
        }),
      true,
      true,
    );
    expect(outcome.code).toBe('23514');
  });
  native(
    'X05 reschedule vs booking and X06 busy vs confirmation serialize',
    async () => {
      for (const busy of [false, true]) {
        const c = await fixture();
        await assigned(c);
        const first = await session(c, '2099-05-01T08:00Z');
        await c.scheduling.confirm(c.f.tenant, first.id, intent());
        const second = await session(c);
        const unavailable = busy
          ? await c.scheduling.createUnavailability(
              c.f.tenant,
              {
                resourceKind: 'TEACHER',
                resourceId: c.f.teacher,
                startsAt: '2099-05-01T10:00Z',
                endsAt: '2099-05-01T11:00Z',
              },
              intent(),
            )
          : null;
        const firstBody = unavailable
          ? {
              ...intent(),
              operation: 'BUSY_CONFIRM',
              unavailabilityId: unavailable.id,
            }
          : {
              ...intent(),
              operation: 'RESCHEDULE',
              sessionId: first.id,
              revision: 2,
              startsAt: '2099-05-01T10:00Z',
              endsAt: '2099-05-01T11:00Z',
            };
        expect(
          (
            await race(
              c,
              busy ? 'busy vs confirmation' : 'reschedule vs booking',
              (q) => command(q, c, 'scheduling', firstBody),
              (q) =>
                command(q, c, 'scheduling', {
                  ...intent(),
                  operation: 'CONFIRM',
                  sessionId: second.id,
                }),
            )
          ).code,
        ).toBe('23P01');
      }
    },
  );
  native(
    'X07 cancellation releases booking before waiting confirmation',
    async () => {
      const c = await fixture();
      const s = await prepared(c),
        other = await session(c);
      expect(
        (
          await race(
            c,
            'cancel vs confirmation',
            (q) =>
              command(q, c, 'scheduling', {
                ...intent(),
                operation: 'CANCEL',
                sessionId: s.id,
                revision: 2,
              }),
            (q) =>
              command(q, c, 'scheduling', {
                ...intent(),
                operation: 'CONFIRM',
                sessionId: other.id,
              }),
          )
        ).code,
      ).toBeNull();
    },
  );
  native(
    'X08 enrollment roster vs confirmation includes the newly committed student',
    async () => {
      const c = await fixture();
      await assigned(c);
      const s = await session(c),
        e = await placement(c);
      const outcome = await race(
        c,
        'enrollment vs confirmation',
        (q) =>
          command(q, c, 'academic', {
            ...intent(),
            operation: 'ENROLL',
            classId: c.f.classId,
            studentId: c.f.student2,
            effectiveFrom: '2099-01-01',
            placement: e,
          }),
        (q) =>
          command(q, c, 'scheduling', {
            ...intent(),
            operation: 'CONFIRM',
            sessionId: s.id,
          }),
      );
      expect(outcome.code).toBeNull();
      expect(
        (
          await admin.unsafe(
            'SELECT count(*)::int n FROM session_participants WHERE session_id=$1 AND removed_at IS NULL',
            [s.id],
          )
        )[0].n,
      ).toBe(2);
    },
  );
  native('X09 concurrent corrections reject the stale revision', async () => {
    const c = await historical(),
      ar = await finalized(c);
    const outcome = await race(
      c,
      'correction vs correction',
      (q) =>
        command(q, c, 'attendance', {
          ...intent(),
          operation: 'CORRECT',
          attendanceId: ar.id,
          status: 'UNEXCUSED',
          revision: 1,
        }),
      (q) =>
        command(q, c, 'attendance', {
          ...intent(),
          operation: 'CORRECT',
          attendanceId: ar.id,
          status: 'ATTENDED',
          revision: 1,
        }),
    );
    expect(outcome.code).toBe('23514');
  });
  native(
    'X10 staff permission revoke wins before schedule confirmation',
    async () => {
      const c = await fixture();
      await preserveFixtureManager(admin as unknown as Query,c.f);
      await assigned(c);
      const s = await session(c);
      const outcome = await race(
        c,
        'permission revoke vs confirmation',
        (q) =>
          q.unsafe(
            'UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=$1',
            [c.f.membershipRole],
          ),
        (q) =>
          command(q, c, 'scheduling', {
            ...intent(),
            operation: 'CONFIRM',
            sessionId: s.id,
          }),
        true,
        true,
      );
      expect(outcome.code).toBe('42501');
    },
  );
  native('X11 ISSUE vs correction retains all billed history', async () => {
    const c = await historical(),
      period = await billingPeriod(c),
      ar = await finalized(c),
      g = await c.generation.initial(c.f.tenant, c.f.student, period, intent());
    const outcome = await race(
      c,
      'ISSUE vs correction',
      (q) =>
        command(q, c, 'billing', {
          ...intent(),
          operation: 'ISSUE',
          invoiceId: g.invoiceId,
        }),
      (q) =>
        command(q, c, 'attendance', {
          ...intent(),
          operation: 'CORRECT',
          attendanceId: ar.id,
          status: 'UNEXCUSED',
          revision: 1,
        }),
    );
    expect(outcome.code).toBe('23514');
  });
  native(
    'X12 finalization vs explicit G2 and ISSUE reads the committed batch',
    async () => {
      const c = await historical(),
        period = await billingPeriod(c),
        g = await c.generation.initial(
          c.f.tenant,
          c.f.student,
          period,
          intent(),
        );
      await c.attendance.mark(
        c.f.tenant,
        c.f.session,
        c.f.participant,
        'ATTENDED',
        0,
        intent(),
      );
      const outcome = await race(
        c,
        'finalize vs G2 ISSUE',
        (q) =>
          command(q, c, 'attendance', {
            ...intent(),
            operation: 'FINALIZE',
            sessionId: c.f.session,
          }),
        async (q) => {
          const result = await command(q, c, 'billing', {
            ...intent(),
            operation: 'RECOMPUTE',
            studentId: c.f.student,
            periodId: period,
            expectedBase: g.id,
            expectedApplied: null,
          });
          return command(q, c, 'billing', {
            ...intent(),
            operation: 'ISSUE',
            invoiceId: result.invoiceId,
          });
        },
      );
      expect(outcome.code).toBeNull();
    },
  );
  native(
    'X13 G2 vs source correction preserves generations in both writer orders',
    async () => {
      for (const sourceFirst of [true, false]) {
        const c = await historical(),
          period = await billingPeriod(c),
          g = await c.generation.initial(
            c.f.tenant,
            c.f.student,
            period,
            intent(),
          ),
          ar = await finalized(c);
        const correction = (q: Query) =>
          command(q, c, 'attendance', {
            ...intent(),
            operation: 'CORRECT',
            attendanceId: ar.id,
            status: 'UNEXCUSED',
            revision: 1,
          });
        const recompute = (q: Query) =>
          command(q, c, 'billing', {
            ...intent(),
            operation: 'RECOMPUTE',
            studentId: c.f.student,
            periodId: period,
            expectedBase: g.id,
            expectedApplied: null,
          });
        const outcome = await race(
          c,
          'G2 vs source correction',
          sourceFirst ? correction : recompute,
          sourceFirst ? recompute : correction,
        );
        expect(outcome.code).toBe(sourceFirst ? null : '23514');
      }
    },
  );
  native(
    'X14 Parent link revoke wins before waiting leave submission',
    async () => {
      const c = await fixture(),
        s = await prepared(c),
        parent = await actor(c, 'PARENT');
      const link = await put(
        admin as unknown as Query,
        'parent_student_links',
        {
          tenant_id: c.f.tenant,
          parent_membership_id: parent.f.member,
          student_id: c.f.student,
          relationship: 'PARENT',
          verified_at: '2020-01-01',
          verified_by_membership_id: c.f.member,
        },
      );
      const [p] = await admin.unsafe(
        'SELECT id FROM session_participants WHERE session_id=$1',
        [s.id],
      );
      const outcome = await race(
        parent,
        'Parent link revoke vs leave',
        (q) =>
          q.unsafe(
            'UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=$1',
            [link],
          ),
        (q) =>
          command(q, parent, 'attendance', {
            ...intent(),
            operation: 'LEAVE_SUBMIT',
            participantId: p.id,
          }),
        true,
        true,
      );
      expect(outcome.code).toBe('42501');
    },
  );
  native(
    'X15 roster mutation commits before finalize and prevents an incomplete batch',
    async () => {
      for (const rosterFirst of [true, false]) {
        const c = await historical();
        await c.attendance.mark(
          c.f.tenant,
          c.f.session,
          c.f.participant,
          'ATTENDED',
          0,
          intent(),
        );
        const enrollment = await put(admin as unknown as Query, 'enrollments', {
          tenant_id: c.f.tenant,
          student_id: c.f.student2,
          class_id: c.f.classId,
          status: 'ACTIVE',
          effective_from: '2020-01-01',
          created_by_membership_id: c.f.member,
        });
        const roster = (q: Query) =>
          put(q, 'session_participants', {
            tenant_id: c.f.tenant,
            session_id: c.f.session,
            student_id: c.f.student2,
            enrollment_id: enrollment,
            participant_kind: 'REGULAR',
          });
        const finalize = (q: Query) =>
          command(q, c, 'attendance', {
            ...intent(),
            operation: 'FINALIZE',
            sessionId: c.f.session,
          });
        const outcome = await race(
          c,
          'roster vs finalize',
          rosterFirst ? roster : finalize,
          rosterFirst ? finalize : roster,
          true,
          rosterFirst,
          !rosterFirst,
        );
        expect(outcome.code).toBe('23514');
      }
    },
  );
});
