import 'reflect-metadata';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer, type Socket } from 'node:net';
import { performance } from 'node:perf_hooks';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import { AuthService } from '../../src/identity-access/auth.service.js';
import {
  CaptureOtpDelivery,
  UnavailableOtpDelivery,
} from '../../src/identity-access/otp-delivery.js';
import {
  passwordHash,
  digest,
  secret,
} from '../../src/identity-access/crypto.js';
import {
  seed,
  put,
  waitBlocked,
  type Query,
} from '../schema-integrity/support.js';
import {
  R4Module,
  configureR4Http,
} from '../../src/identity-access/r4.module.js';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RuntimeService } from '../../src/workflow-approval/runtime.service.js';
import { R4Worker } from '../../src/automation-jobs/worker.js';
import { registerNavigationProposalTests } from './navigation-proposal.cases.js';
import { browserAuthJourney, browserAvailable, until } from './browser-auth.js';
import { withAcademicBrowser } from './browser-academic.js';
import { RecoveryWorker } from '../../src/identity-access/recovery-worker.js';
import { decryptRecovery, parseRecoveryKey } from '../../src/identity-access/recovery-envelope.js';
import { encryptRecovery } from '../../src/identity-access/recovery-envelope.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';

let admin: postgres.Sql;
let repository: R4Repository;
let auth: AuthService;
let recoveryWorker: RecoveryWorker;
let recoveryDb: PrismaClient;
let recoveryKey: ReturnType<typeof parseRecoveryKey>;
const delivery = new CaptureOtpDelivery();
let app: INestApplication;
let fixture: Awaited<ReturnType<typeof seed>>;
const password = 'Test password 123!';
let email: string;
let authConnection: string,
  apiConnection: string,
  otpWorkerConnection: string,
  operatorConnection: string,
  secondWorkerConnection: string;
let firstWorkerConnection: string;
let runtime: RuntimeService, worker: R4Worker, sharedPasswordHash: string;
const clients: postgres.Sql[] = [];
const evidence: Record<string, unknown> = { races: [], cases: {} };
type Timing = { known: boolean; ms: number; block: number };
const quantile = (values: number[], fraction: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const below = Math.floor(position);
  return sorted[below] + (sorted[Math.ceil(position)] - sorted[below]) * (position - below);
};
function timingMetrics(rows: Timing[]) {
  const known = rows.filter((r) => r.known).map((r) => r.ms);
  const unknown = rows.filter((r) => !r.known).map((r) => r.ms);
  const sortedUnknown = [...unknown].sort((a, b) => a - b);
  const lowerBound = (value: number, upper: boolean) => {
    let lo = 0, hi = sortedUnknown.length;
    while (lo < hi) {
      const middle = (lo + hi) >>> 1;
      if (sortedUnknown[middle] < value || (upper && sortedUnknown[middle] === value)) lo = middle + 1;
      else hi = middle;
    }
    return lo;
  };
  const auc = known.reduce((sum, value) => sum + (lowerBound(value, false) + lowerBound(value, true)) / 2, 0)
    / (known.length * unknown.length);
  return { auc, medianDiff: quantile(known, .5) - quantile(unknown, .5),
    p95Diff: quantile(known, .95) - quantile(unknown, .95),
    pooledMedian: quantile([...known, ...unknown], .5), pooledP95: quantile([...known, ...unknown], .95),
    knownMedian: quantile(known, .5), unknownMedian: quantile(unknown, .5),
    knownP95: quantile(known, .95), unknownP95: quantile(unknown, .95) };
}
function timingAnalysis(rows: Timing[], seedValue: number) {
  const blocks = Array.from({ length: 100 }, (_, index) => rows.filter((r) => r.block === index));
  const point = timingMetrics(rows);
  let state = seedValue;
  const random = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const samples = Array.from({ length: 10_000 }, () => {
    const sample: Timing[] = [];
    for (let i = 0; i < 100; i++) sample.push(...blocks[Math.floor(random() * 100)]);
    return timingMetrics(sample);
  });
  const ci = (name: 'auc' | 'medianDiff' | 'p95Diff') =>
    [quantile(samples.map((s) => s[name]), .025), quantile(samples.map((s) => s[name]), .975)];
  const intervals = { auc: ci('auc'), medianDiff: ci('medianDiff'), p95Diff: ci('p95Diff') };
  const medianLimit = Math.max(10, .05 * point.pooledMedian);
  const p95Limit = Math.max(25, .1 * point.pooledP95);
  const pass = intervals.auc[0] >= .45 && intervals.auc[1] <= .55
    && intervals.medianDiff[0] >= -medianLimit && intervals.medianDiff[1] <= medianLimit
    && intervals.p95Diff[0] >= -p95Limit && intervals.p95Diff[1] <= p95Limit;
  return { point, intervals, medianLimit, p95Limit, pass };
}
afterEach((context) =>
  context.onTestFinished(() => {
    (evidence.cases as Record<string, string>)[context.task.name] =
      context.task.result?.state === 'pass' ? 'PASS' : 'FAIL';
  }),
);
const native = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    await fn();
  });
registerNavigationProposalTests({ admin: () => admin, repository: () => repository, auth: () => auth,
  apiUrl: () => apiConnection, fresh: () => fresh(), actor });
const connect = (url: string) => {
  const q = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(q);
  return q;
};
const intent = () => ({ key: randomUUID(), reason: 'R4 verification' });
type Fixture = Awaited<ReturnType<typeof seed>>;
async function fresh(options: Parameters<typeof seed>[1] = {}) {
  const f = await admin.begin(async (tx) => {
    const f = await seed(tx as unknown as Query, options);
    await tx`SELECT educore_r4.seed(${f.tenant}::uuid)`;
    await tx`UPDATE membership_roles SET role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='MANAGER') WHERE id=${f.membershipRole}`;
    return f;
  });
  await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES(${f.user},${sharedPasswordHash},clock_timestamp())`;
  return f;
}
async function sessionFor(f: Fixture, user = f.user) {
  const [row] =
    await admin`SELECT email_normalized FROM users WHERE id=${user}`;
  const login = await auth.login(row.email_normalized as string, password);
  const selected = await auth.selectTenant(login.accessToken, f.tenant);
  return { ...login, ...selected, email: row.email_normalized as string };
}
async function actor(
  f: Fixture,
  code: string,
  scope: 'TENANT' | 'CLASS' | 'STUDENT' = 'TENANT',
  target?: string,
) {
  const user = await put(admin as unknown as Query, 'users', {
    email_normalized: randomUUID() + '@r4.invalid',
    display_name: 'R4 actor',
    status: 'ACTIVE',
  });
  const member = await put(admin as unknown as Query, 'tenant_memberships', {
    tenant_id: f.tenant,
    user_id: user,
    status: 'ACTIVE',
  });
  const [role] =
    await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND roles.code=${code}`;
  const assignment = await put(admin as unknown as Query, 'membership_roles', {
    tenant_id: f.tenant,
    membership_id: member,
    role_id: role.id,
    assigned_by_membership_id: f.member,
  });
  await put(admin as unknown as Query, 'access_scopes', {
    tenant_id: f.tenant,
    membership_role_id: assignment,
    scope_kind: scope,
    class_id: scope === 'CLASS' ? target : null,
    student_id: scope === 'STUDENT' ? target : null,
  });
  await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES(${user},${sharedPasswordHash},clock_timestamp())`;
  return { ...(await sessionFor(f, user)), userId: user, member, assignment };
}
async function issuedFixture(generate = true) {
  const f = await fresh({
      start: '2025-09-20T10:00:00Z',
      end: '2025-09-20T11:00:00Z',
      enrollmentFrom: '2020-01-01T00:00:00Z',
    }),
    s = await sessionFor(f);
  const [policy] =
    await admin`SELECT id FROM policy_versions WHERE tenant_id=${f.tenant} AND version_code='P0-R4-v1'`;
  await put(admin as unknown as Query, 'price_rules', {
    tenant_id: f.tenant,
    scope_kind: 'COURSE',
    course_id: f.course,
    unit_price_vnd: '800000',
    effective_from: '2020-01-01',
    policy_version_id: policy.id,
    created_by_membership_id: f.member,
    created_at: '2019-01-01',
  });
  const finalization = await put(
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
    finalization_id: finalization,
    attendance_status: 'ATTENDED',
    recorded_by_membership_id: f.member,
    recorded_at: '2025-10-01',
    revision: 1,
  });
  await admin`UPDATE class_sessions SET status='COMPLETED' WHERE id=${f.session}`;
  const period = await put(admin as unknown as Query, 'billing_periods', {
    tenant_id: f.tenant,
    month_start: '2025-09-01',
    month_end: '2025-10-01',
    status: 'OPEN',
  });
  if (!generate) return { f, s, invoice: '', period };
  const g = (await runtime.billing(s.accessToken, f.tenant, {
    ...intent(),
    operation: 'GENERATE',
    studentId: f.student,
    periodId: period,
  })) as { invoiceId: string };
  await runtime.billing(s.accessToken, f.tenant, {
    ...intent(),
    operation: 'ISSUE',
    invoiceId: g.invoiceId,
  });
  return { f, s, invoice: g.invoiceId, period };
}
async function confirmedSchedule() {
  const f = await fresh(),
    s = await sessionFor(f);
  const [course] =
    await admin`SELECT subject_id,level_id FROM courses WHERE id=${f.course}`;
  await put(admin as unknown as Query, 'teacher_competencies', {
    tenant_id: f.tenant,
    teacher_id: f.teacher,
    subject_id: course.subject_id,
    level_id: course.level_id,
    verified_at: '2025-01-01',
  });
  await runtime.run(
    s.accessToken,
    'SELECT educore_r3.academic($1::uuid,$2::jsonb) result',
    f.tenant,
    JSON.stringify({
      ...intent(),
      operation: 'ASSIGN_TEACHER',
      classId: f.classId,
      teacherId: f.teacher,
      validFrom: '2099-01-01T00:00:00Z',
      validTo: null,
    }),
  );
  await runtime.run(
    s.accessToken,
    'SELECT educore_r3.scheduling($1::uuid,$2::jsonb) result',
    f.tenant,
    JSON.stringify({ ...intent(), operation: 'CONFIRM', sessionId: f.session }),
  );
  return { f, s };
}
async function scheduleEvent(f: Fixture, s: { accessToken: string }) {
  const [current] =
    await admin`SELECT revision FROM class_sessions WHERE id=${f.session}`;
  const value = await runtime.run<{ correlationId: string }>(
    s.accessToken,
    'SELECT educore_r3.scheduling($1::uuid,$2::jsonb) result',
    f.tenant,
    JSON.stringify({
      ...intent(),
      operation: 'RESCHEDULE',
      sessionId: f.session,
      revision: current.revision,
      startsAt: '2099-09-29T10:00:00Z',
      endsAt: '2099-09-29T11:00:00Z',
    }),
  );
  const [event] =
    await admin`SELECT id FROM outbox_events WHERE tenant_id=${f.tenant} AND correlation_id=${value.correlationId}`;
  return event.id as string;
}
async function race(
  name: string,
  first: {
    url?: string;
    token?: string;
    sql: string;
    args: postgres.ParameterOrJSON<never>[];
  },
  second: {
    url?: string;
    token?: string;
    sql: string;
    args: postgres.ParameterOrJSON<never>[];
  },
  commit = true,
) {
  const a = connect(first.url ?? apiConnection),
    b = connect(second.url ?? apiConnection);
  await a`BEGIN`;
  await b`BEGIN`;
  try {
    if (first.token) await a`SELECT educore_r4.bind(${first.token})`;
    if (second.token) await b`SELECT educore_r4.bind(${second.token})`;
    const apid = (await a`SELECT pg_backend_pid() pid`)[0].pid as number,
      bpid = (await b`SELECT pg_backend_pid() pid`)[0].pid as number;
    const one = await a.unsafe(
      first.sql.replaceAll('::jsonb', '::text::jsonb'),
      first.args,
    );
    await a`SET CONSTRAINTS ALL IMMEDIATE`;
    const pending = b
      .unsafe(second.sql.replaceAll('::jsonb', '::text::jsonb'), second.args)
      .then(async (rows) => {
        await b`SET CONSTRAINTS ALL IMMEDIATE`;
        return { rows, code: null as string | null };
      })
      .catch((e) => ({ rows: [], code: (e as { code: string }).code }));
    await waitBlocked(admin, bpid, apid);
    await a.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
    const two = await pending;
    await b.unsafe(two.code ? 'ROLLBACK' : 'COMMIT');
    (evidence.races as unknown[]).push({
      name,
      apid,
      bpid,
      observedWait: true,
      firstCommit: commit,
      secondCode: two.code,
    });
    return { one, two };
  } finally {
    await a`ROLLBACK`;
    await b`ROLLBACK`;
  }
}
beforeAll(async () => {
  if (process.env.R4_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER')
    throw Error('DISPOSABLE_REQUIRED');
  const url = new URL(process.env.R4_TEST_URL ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^\/educore_r4_[a-z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error('UNSAFE_TARGET');
  admin = postgres(url.toString(), {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  const [row] =
    await admin`SELECT current_setting('server_version_num')::int version,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') tables`;
  expect(row.version).toBeGreaterThanOrEqual(160000);
  expect(row.version).toBeLessThan(170000);
  expect(row.tables).toBe(0);
  try {
    execFileSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      {
        cwd: resolve('.'),
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
        timeout: 90_000,
      },
    );
  } catch (e) {
    const x = e as { stdout?: Buffer; stderr?: Buffer };
    throw Error(
      (String(x.stdout ?? '') + String(x.stderr ?? ''))
        .replaceAll(url.toString(), '[URL]')
        .replaceAll(url.password, '[SECRET]'),
    );
  }
  const connection = async (role: string) => {
    const name = role + '_test',
      pass = randomBytes(32).toString('hex');
    await admin.unsafe(
      `CREATE ROLE ${name} LOGIN PASSWORD '${pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${role}`,
    );
    const next = new URL(url);
    next.username = name;
    next.password = pass;
    return next.toString();
  };
  authConnection = await connection('educore_r4_auth');
  otpWorkerConnection = await connection('educore_r4_otp_delivery');
  apiConnection = await connection('educore_r4_api');
  const firstWorker = await connection('educore_r4_worker');
  firstWorkerConnection = firstWorker;
  operatorConnection = await connection('educore_r4_operator');
  const secondName = 'r4_second_worker',
    secondPass = randomBytes(32).toString('hex');
  await admin.unsafe(
    `CREATE ROLE ${secondName} LOGIN PASSWORD '${secondPass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE educore_r4_worker`,
  );
  const second = new URL(url);
  second.username = secondName;
  second.password = secondPass;
  secondWorkerConnection = second.toString();
  repository = new R4Repository(authConnection, apiConnection, firstWorker);
  await repository.assertRuntime();
  recoveryKey = parseRecoveryKey('r8-test', randomBytes(32).toString('base64'));
  recoveryDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: otpWorkerConnection }) });
  recoveryWorker = new RecoveryWorker(recoveryDb, new Map([[recoveryKey.id, recoveryKey]]), {
    send: async (address, otp) => { delivery.messages.push({ email: address, otp, purpose: 'PASSWORD_RESET' }); return 'ACCEPTED'; },
  });
  await recoveryWorker.assertRuntime();
  auth = new AuthService(repository, delivery, {
    jwtSecret: randomBytes(32).toString('hex'),
    otpPepper: randomBytes(32).toString('hex'),
    issuer: 'educore-test',
    audience: 'educore-web',
    origins: ['http://localhost:5173'],
    production: false,
    recoveryKey,
  });
  sharedPasswordHash = await passwordHash(password);
  fixture = await fresh();
  const [user] =
    await admin`SELECT email_normalized FROM users WHERE id=${fixture.user}`;
  email = user.email_normalized as string;
  const module = await Test.createTestingModule({
    imports: [R4Module.register(repository, auth.config, delivery)],
  }).compile();
  app = module.createNestApplication();
  configureR4Http(app, auth.config);
  await app.init();
  auth = module.get(AuthService);
  runtime = module.get(RuntimeService);
  worker = new R4Worker(repository);
  const migrations =
    await admin`SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`;
  expect(migrations).toHaveLength(
    readdirSync(resolve('prisma/migrations')).filter((n) => /^\d{12}_/.test(n))
      .length,
  );
  for (const m of migrations)
    expect(m.checksum).toBe(
      createHash('sha256')
        .update(
          readFileSync(
            resolve(
              'prisma/migrations',
              m.migration_name as string,
              'migration.sql',
            ),
          ),
        )
        .digest('hex'),
    );
  evidence.migrations = migrations;
  evidence.version = (await admin`SELECT version() value`)[0].value;
});
afterAll(async () => {
  await app?.close();
  await repository?.close();
  await recoveryDb?.$disconnect();
  await Promise.all(clients.map((q) => q.end()));
  await admin?.end();
  const path = join(
    mkdtempSync(join(tmpdir(), 'educore-r4-evidence-')),
    'evidence.json',
  );
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  console.log('R4 sanitized evidence: ' + path);
});
describe('R4 native PostgreSQL', () => {
  native('R8 P01 scoped dashboard counts distinct active learners and issued debt', async () => {
    const f = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z' });
    const other = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z' });
    const s = await sessionFor(f);
    const get = () => request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/overview`)
      .auth(s.accessToken, { type: 'bearer' });
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/overview`).expect(401);
    const first = await get().expect(200);
    expect(first.body).toMatchObject({ students: 1, classes: 2, outstandingVnd: '0' });
    await put(admin as unknown as Query, 'enrollments', {
      tenant_id: f.tenant, student_id: f.student, class_id: f.class2, status: 'ACTIVE',
      effective_from: '2020-01-01T00:00:00Z', created_by_membership_id: f.member,
    });
    expect((await get().expect(200)).body.students).toBe(1);
    await admin`UPDATE classes SET status='ARCHIVED' WHERE id=${f.class2}`;
    expect((await get().expect(200)).body.classes).toBe(1);
    await admin`UPDATE invoices SET status='ISSUED',invoice_number='R8-P01',
      issued_at=clock_timestamp(),due_at=clock_timestamp()+interval '14 days' WHERE id=${f.invoice}`;
    expect((await get().expect(200)).body.outstandingVnd).toBe('100000');
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/portal/overview`)
      .auth(s.accessToken, { type: 'bearer' }).expect(403);
  });

  native('R8 P02 verified children and finance reads revoke on the next request', async () => {
    const f = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z' });
    const other = await fresh();
    const parent = await actor(f, 'PARENT', 'STUDENT', f.student);
    await put(admin as unknown as Query, 'access_scopes', { tenant_id: f.tenant,
      membership_role_id: parent.assignment, scope_kind: 'STUDENT', student_id: f.student2 });
    const first = await put(admin as unknown as Query, 'parent_student_links', { tenant_id: f.tenant,
      parent_membership_id: parent.member, student_id: f.student, relationship: 'PARENT',
      verified_at: new Date(), verified_by_membership_id: f.member });
    const second = await put(admin as unknown as Query, 'parent_student_links', { tenant_id: f.tenant,
      parent_membership_id: parent.member, student_id: f.student2, relationship: 'PARENT',
      verified_at: new Date(), verified_by_membership_id: f.member });
    const base = `/api/v1/tenants/${f.tenant}/portal`;
    const get = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(parent.accessToken, { type: 'bearer' });
    const context = await get('/context').expect(200);
    expect(context.body.children.map((row: { id: string }) => row.id)).toEqual([f.student, f.student2]);
    const parentNav = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(parent.accessToken, { type: 'bearer' }).expect(200);
    expect(parentNav.body.screenIds).toEqual(expect.arrayContaining(['PO03', 'PO04', 'PO05']));
    await get(`/children/${f.student}`).expect(200);
    await get(`/children/${other.student}`).expect(404);
    await get(`/billing/${other.student}`).expect(404);
    await admin`UPDATE invoices SET status='ISSUED',invoice_number='R8-P02',
      issued_at=clock_timestamp(),due_at=clock_timestamp()+interval '14 days' WHERE id=${f.invoice}`;
    const bill = await get(`/billing/${f.student}`).expect(200);
    expect(bill.body).toMatchObject({ status: 'PARTIAL', invoiceCount: 1,
      totals: { outstandingVnd: '100000' }, wallet: null });
    expect(bill.body.invoices).toHaveLength(1);
    await admin`DELETE FROM role_permissions rp USING roles r,permissions p
      WHERE rp.tenant_id=${f.tenant} AND rp.role_id=r.id AND rp.permission_id=p.id
        AND r.tenant_id=${f.tenant} AND r.code='PARENT' AND p.code='receivable.read'`;
    expect((await get(`/billing/${f.student}`).expect(200)).body).toMatchObject({ status: 'UNAVAILABLE', invoices: null });
    await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=${first}`;
    await get(`/children/${f.student}`).expect(404);
    await get(`/billing/${f.student}`).expect(404);
    expect((await get('/context').expect(200)).body.children.map((row: { id: string }) => row.id)).toEqual([f.student2]);
    await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=${second}`;
    expect((await get('/context').expect(200)).body.children).toEqual([]);
  });

  native('R8 H01 selector requires verified Parent scope despite another active role', async () => {
    const f = await fresh(), other = await fresh();
    const parent = await actor(f, 'PARENT', 'STUDENT', f.student);
    const linkA = await put(admin as unknown as Query, 'parent_student_links', { tenant_id: f.tenant,
      parent_membership_id: parent.member, student_id: f.student, relationship: 'PARENT',
      verified_at: new Date(), verified_by_membership_id: f.member });
    const linkB = await put(admin as unknown as Query, 'parent_student_links', { tenant_id: f.tenant,
      parent_membership_id: parent.member, student_id: f.student2, relationship: 'PARENT' });
    const scopeB = await put(admin as unknown as Query, 'access_scopes', {
      tenant_id: f.tenant, membership_role_id: parent.assignment,
      scope_kind: 'STUDENT', student_id: f.student2,
    });
    const base = `/api/v1/tenants/${f.tenant}/portal`;
    const get = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(parent.accessToken, { type: 'bearer' });
    const children = async () => (await get('/context').expect(200)).body.children.map((row: { id: string }) => row.id);
    expect(await children()).toEqual([f.student]);
    await get(`/children/${f.student2}`).expect(404);
    await admin`UPDATE parent_student_links SET verified_at=clock_timestamp(),
      verified_by_membership_id=${f.member} WHERE id=${linkB}`;
    expect(await children()).toEqual([f.student, f.student2]);
    await admin`DELETE FROM access_scopes WHERE id=${scopeB}`;
    expect(await children()).toEqual([f.student]);
    const [staffRole] = await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACADEMIC_STAFF'`;
    const staffGrant = await put(admin as unknown as Query, 'membership_roles', {
      tenant_id: f.tenant, membership_id: parent.member, role_id: staffRole.id,
      assigned_by_membership_id: f.member,
    });
    await put(admin as unknown as Query, 'access_scopes', {
      tenant_id: f.tenant, membership_role_id: staffGrant, scope_kind: 'TENANT',
    });
    expect(await children()).toEqual([f.student]);
    await get(`/children/${f.student2}`).expect(404);
    await get(`/billing/${f.student2}`).expect(404);
    await get(`/children/${other.student}`).expect(404);
    await get(`/billing/${other.student}`).expect(404);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${parent.assignment}`;
    expect(await children()).toEqual([]);
    await get(`/children/${f.student}`).expect(404);
    await get(`/billing/${f.student}`).expect(404);
    await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=${linkA}`;
    expect(await children()).toEqual([]);
  });

  native('R8 H02 selector hides metadata when every effective child read is revoked', async () => {
    const f = await fresh();
    const parent = await actor(f, 'PARENT', 'STUDENT', f.student);
    await put(admin as unknown as Query, 'parent_student_links', { tenant_id: f.tenant,
      parent_membership_id: parent.member, student_id: f.student, relationship: 'PARENT',
      verified_at: new Date(), verified_by_membership_id: f.member });
    const base = `/api/v1/tenants/${f.tenant}/portal`;
    const get = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(parent.accessToken, { type: 'bearer' });
    expect((await get('/context').expect(200)).body.children.map((row: { id: string }) => row.id)).toEqual([f.student]);
    await admin`DELETE FROM role_permissions rp USING roles r, permissions p
      WHERE rp.tenant_id=${f.tenant} AND rp.role_id=r.id AND rp.permission_id=p.id
        AND r.tenant_id=${f.tenant} AND r.code='PARENT'
        AND p.code IN ('schedule.read','attendance.read','absence.read','assignment.read',
          'grade.read_published','invoice.read','receivable.read')`;
    const hidden = await get('/context').expect(200);
    const [childName] = await admin`SELECT full_name FROM student_profiles WHERE id=${f.student}`;
    expect(hidden.body.children).toEqual([]);
    expect(JSON.stringify(hidden.body)).not.toContain(f.student);
    expect(JSON.stringify(hidden.body)).not.toContain(childName.full_name);
    await get(`/children/${f.student}`).expect(404);
    await get(`/billing/${f.student}`).expect(404);
    const [parentRole, invoicePermission, receivablePermission] = await Promise.all([
      admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='PARENT'`,
      admin`SELECT id FROM permissions WHERE code='invoice.read'`,
      admin`SELECT id FROM permissions WHERE code='receivable.read'`,
    ]);
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      VALUES(gen_random_uuid(),${f.tenant},${parentRole[0].id},${invoicePermission[0].id})`;
    expect((await get('/context').expect(200)).body.children).toEqual([]);
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      VALUES(gen_random_uuid(),${f.tenant},${parentRole[0].id},${receivablePermission[0].id})`;
    expect((await get('/context').expect(200)).body.children.map((row: { id: string }) => row.id)).toEqual([f.student]);
  });

  native('R8 P03 class scope is partial and Student finance stays unavailable', async () => {
    const f = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z' });
    const scoped = await actor(f, 'MANAGER', 'CLASS', f.classId);
    const student = await actor(f, 'STUDENT', 'STUDENT', f.student);
    await admin`UPDATE student_profiles SET membership_id=${student.member} WHERE id=${f.student}`;
    await admin`UPDATE invoices SET status='ISSUED',invoice_number='R8-P03',
      issued_at=clock_timestamp(),due_at=clock_timestamp()+interval '14 days' WHERE id=${f.invoice}`;
    const base = `/api/v1/tenants/${f.tenant}/portal`;
    const scopedRead = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(scoped.accessToken, { type: 'bearer' });
    const studentRead = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(student.accessToken, { type: 'bearer' });
    expect((await scopedRead('/overview').expect(200)).body).toMatchObject({
      students: 1, classes: 1, outstandingVnd: null,
    });
    const scopedNav = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(scoped.accessToken, { type: 'bearer' }).expect(200);
    expect(scopedNav.body.screenIds).toContain('G01');
    expect((await studentRead('/context').expect(200)).body.student.id).toBe(f.student);
    const studentNav = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(student.accessToken, { type: 'bearer' }).expect(200);
    expect(studentNav.body.screenIds).toContain('PO02');
    expect(studentNav.body.screenIds).not.toContain('PO05');
    expect((await studentRead(`/billing/${f.student}`).expect(200)).body).toMatchObject({
      status: 'UNAVAILABLE', invoices: null, wallet: null,
    });
    await studentRead(`/billing/${f.student2}`).expect(404);
  });

  native('R8 P04 teacher sessions require a current assignment and current grant', async () => {
    const startsAt = new Date(Date.now() + 86400_000);
    const endsAt = new Date(startsAt.getTime() + 3600_000);
    const f = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z',
      start: startsAt.toISOString(), end: endsAt.toISOString() });
    const manager = await sessionFor(f);
    const teacher = await actor(f, 'TEACHER', 'CLASS', f.classId);
    const otherTeacher = await actor(f, 'TEACHER', 'CLASS', f.classId);
    await admin`UPDATE teacher_profiles SET membership_id=${teacher.member} WHERE id=${f.teacher}`;
    await put(admin as unknown as Query, 'class_teacher_assignments', {
      tenant_id: f.tenant, class_id: f.classId, teacher_id: f.teacher,
      role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: f.member,
    });
    await runtime.run(manager.accessToken,
      'SELECT educore_r3.scheduling($1::uuid,$2::jsonb) result', f.tenant,
      JSON.stringify({ ...intent(), operation: 'CONFIRM', sessionId: f.session }));
    const path = `/api/v1/tenants/${f.tenant}/portal/teacher-sessions`;
    const own = () => request(app.getHttpServer()).get(path).auth(teacher.accessToken, { type: 'bearer' });
    expect((await own().expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([f.session]);
    const teacherNav = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(teacher.accessToken, { type: 'bearer' }).expect(200);
    expect(teacherNav.body.screenIds).toContain('PO01');
    await request(app.getHttpServer()).get(path).auth(otherTeacher.accessToken, { type: 'bearer' }).expect(403);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${teacher.assignment}`;
    await own().expect(403);
  });

  native('R8 N01 authenticated inbox, scoped audit and job projections', async () => {
    const f = await fresh(), other = await fresh(), s = await sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}`;
    const get = (path: string) => request(app.getHttpServer()).get(base + path).auth(s.accessToken, { type: 'bearer' });
    await request(app.getHttpServer()).get(base + '/notifications').expect(401);
    const inbox = await get('/notifications?unreadOnly=true').expect(200);
    expect(inbox.body).toMatchObject({ items: [], total: 0, timezone: expect.any(String) });
    expect((await get('/notifications/unread-count').expect(200)).body).toEqual({ count: 0 });
    const job = await request(app.getHttpServer()).post(base + '/jobs').auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ kind: 'SCHEDULE_CHECK', payload: { sessionId: f.session } }).expect(201);
    const jobs = await get('/jobs').expect(200);
    expect(jobs.body.items.some((row: { id: string }) => row.id === job.body.id)).toBe(true);
    expect(jobs.body.items.find((row: { id: string }) => row.id === job.body.id)).toMatchObject({
      sourceId: f.session, attemptCount: 0, attempts: [], retryEligible: false,
    });
    const detail = await get(`/jobs/${job.body.id}`).expect(200);
    expect(detail.body.id).toBe(job.body.id);
    expect(detail.body.payload_json).toBeUndefined();
    const audit = await get('/audit?eventType=JOB_ENQUEUED').expect(200);
    expect(audit.body.items.some((row: { entityId: string }) => row.entityId === job.body.id)).toBe(true);
    expect(audit.body.items[0].before_json).toBeUndefined();
    expect(audit.body.items[0].after_json).toBeUndefined();
    await get(`/audit/operations/${audit.body.items[0].correlationId}`).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/jobs`)
      .auth(s.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/notifications`)
      .auth(s.accessToken, { type: 'bearer' }).expect(403);
    await get(`/jobs/${randomUUID()}`).expect(404);
    await admin`DELETE FROM automation_jobs WHERE id=${job.body.id}`;
    await admin`DELETE FROM role_permissions rp USING roles r,permissions p
      WHERE rp.tenant_id=${f.tenant} AND rp.role_id=r.id AND rp.permission_id=p.id
       AND r.tenant_id=${f.tenant} AND r.code='MANAGER' AND p.code='notification.read'`;
    await get('/notifications').expect(403);
    await get('/notifications/unread-count').expect(403);
  });

  native('R8 N02 retry is confirmed, scoped, idempotent and bounded', async () => {
    const f = await fresh(), s = await sessionFor(f), base = `/api/v1/tenants/${f.tenant}`;
    const created = await request(app.getHttpServer()).post(base + '/jobs').auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ kind: 'SCHEDULE_CHECK', payload: { sessionId: f.session } }).expect(201);
    const id = created.body.id as string;
    const path = `${base}/jobs/${id}/retry`, key = randomUUID();
    const post = (body: object, replayKey = key) => request(app.getHttpServer()).post(path)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', replayKey).send(body);
    await post({ reason: 'Reviewed source', confirmed: true }).expect(403);
    await admin`UPDATE automation_jobs SET status='FAILED',attempt_count=1,last_error_code='40001',updated_at=clock_timestamp() WHERE id=${id}`;
    await post({ reason: 'Reviewed source' }).expect(400);
    const first = await post({ reason: 'Reviewed source', confirmed: true }).expect(200);
    expect(first.body).toMatchObject({ id, status: 'READY' });
    expect((await post({ reason: 'Reviewed source', confirmed: true }).expect(200)).body).toEqual(first.body);
    await post({ reason: 'Different reason', confirmed: true }).expect(409);
    const [row] = await admin`SELECT status,attempt_count FROM automation_jobs WHERE id=${id}`;
    expect(row).toMatchObject({ status: 'READY', attempt_count: 1 });
    await admin`UPDATE automation_jobs SET status='FAILED',attempt_count=4,updated_at=clock_timestamp() WHERE id=${id}`;
    await post({ reason: 'No reset', confirmed: true }, randomUUID()).expect(403);
    const [bounded] = await admin`SELECT attempt_count FROM automation_jobs WHERE id=${id}`;
    expect(bounded.attempt_count).toBe(4);
    await admin`UPDATE automation_jobs SET attempt_count=1,updated_at=clock_timestamp() WHERE id=${id}`;
    await admin`DELETE FROM role_permissions rp USING roles r,permissions p
      WHERE rp.tenant_id=${f.tenant} AND rp.role_id=r.id AND rp.permission_id=p.id
       AND r.tenant_id=${f.tenant} AND r.code='MANAGER' AND p.code='job.retry'`;
    await post({ reason: 'Revoked', confirmed: true }, randomUUID()).expect(403);
    await admin`DELETE FROM automation_jobs WHERE id=${id}`;
  });

  native('R8 N03 class scope filters audit and jobs before counts and correlation', async () => {
    const f = await fresh(), manager = await sessionFor(f), scoped = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.classId);
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      SELECT gen_random_uuid(),${f.tenant},r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.tenant_id=${f.tenant} AND r.code='ACADEMIC_STAFF'
       AND p.code IN ('audit.read','audit.explain','job.read') ON CONFLICT DO NOTHING`;
    await admin`INSERT INTO audit_logs(id,tenant_id,actor_user_id,actor_membership_id,actor_kind,
      event_type,entity_type,entity_id,action,correlation_id)
      VALUES(gen_random_uuid(),${f.tenant},${f.user},${f.member},'USER','R8_VISIBLE','ClassSession',
      ${f.session},'R8_VISIBLE',gen_random_uuid()),
      (gen_random_uuid(),${f.tenant},${f.user},${f.member},'USER','R8_VISIBLE','StudentProfile',
      ${f.student},'R8_VISIBLE',gen_random_uuid()),
      (gen_random_uuid(),${f.tenant},${f.user},${f.member},'USER','R8_VISIBLE','R4',
      ${f.session},'R8_VISIBLE',gen_random_uuid())`;
    const [hidden] = await admin`SELECT correlation_id FROM audit_logs WHERE tenant_id=${f.tenant}
      AND event_type='R8_VISIBLE' AND entity_id=${f.student}`;
    const base = `/api/v1/tenants/${f.tenant}`;
    const read = (path: string) => request(app.getHttpServer()).get(base + path).auth(scoped.accessToken, { type: 'bearer' });
    const audit = await read('/audit?eventType=R8_VISIBLE&pageSize=1').expect(200);
    expect(audit.body.total).toBe(1);
    expect(audit.body.items).toHaveLength(1);
    expect(audit.body.items[0].entityId).toBe(f.session);
    await read(`/audit/operations/${hidden.correlation_id}`).expect(404);
    const schedule = await request(app.getHttpServer()).post(base + '/jobs').auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ kind: 'SCHEDULE_CHECK', payload: { sessionId: f.session } }).expect(201);
    const billing = await request(app.getHttpServer()).post(base + '/jobs').auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ kind: 'BILLING_GENERATE', payload: { studentId: f.student, periodId: randomUUID() } }).expect(201);
    const jobs = await read('/jobs?pageSize=1').expect(200);
    expect(jobs.body.total).toBe(1);
    expect(jobs.body.items[0].id).toBe(schedule.body.id);
    await read(`/jobs/${billing.body.id}`).expect(404);
    const old = await runtime.read(scoped.accessToken, f.tenant, 'AUDIT', { page: 1 }) as { total: number };
    expect(old.total).toBeGreaterThanOrEqual(1);
    expect(await runtime.read(scoped.accessToken, f.tenant, 'JOBS', { page: 1 })).toMatchObject({ total: 1 });
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp()
      WHERE tenant_id=${f.tenant} AND membership_id=${scoped.member} AND revoked_at IS NULL`;
    await read('/audit').expect(403);
    await read('/jobs').expect(403);
    await admin`DELETE FROM automation_jobs WHERE id IN (${schedule.body.id},${billing.body.id})`;
  });

  native('R8 N04 retry rejects unresolved, approved and leased work; concurrent requests serialize', async () => {
    const f = await fresh(), s = await sessionFor(f), base = `/api/v1/tenants/${f.tenant}`;
    const created = await request(app.getHttpServer()).post(base + '/jobs').auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ kind: 'SCHEDULE_CHECK', payload: { sessionId: f.session } }).expect(201);
    const id = created.body.id as string, path = `${base}/jobs/${id}/retry`;
    const post = (key = randomUUID()) => request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', key).send({ reason: 'Reviewed source', confirmed: true });
    await admin`UPDATE automation_jobs SET status='NEEDS_INFORMATION',attempt_count=1,updated_at=clock_timestamp() WHERE id=${id}`;
    await post().expect(403);
    await admin`UPDATE automation_jobs SET status='PENDING_APPROVAL',updated_at=clock_timestamp() WHERE id=${id}`;
    await post().expect(403);
    await admin`UPDATE automation_jobs SET status='RUNNING',lease_owner='educore_r4_worker',lease_started_at=clock_timestamp(),
      lease_until=clock_timestamp()+interval '30 seconds',updated_at=clock_timestamp() WHERE id=${id}`;
    await post().expect(403);
    await admin`UPDATE automation_jobs SET status='FAILED',lease_owner=NULL,lease_started_at=NULL,lease_until=NULL,
      updated_at=clock_timestamp() WHERE id=${id}`;
    const results = await Promise.all([post(), post()]);
    expect(results.map((result) => result.status).sort((a, b) => a - b)).toEqual([200, 403]);
    expect((await admin`SELECT status FROM automation_jobs WHERE id=${id}`)[0].status).toBe('READY');
    await admin`DELETE FROM automation_jobs WHERE id=${id}`;
  });

  native('R8 N05 audit projection hides secret payload and does not mutate history', async () => {
    const f = await fresh(), s = await sessionFor(f), correlation = randomUUID();
    await admin`INSERT INTO audit_logs(id,tenant_id,actor_user_id,actor_membership_id,actor_kind,
      event_type,entity_type,entity_id,action,reason,before_json,after_json,correlation_id)
      VALUES(gen_random_uuid(),${f.tenant},${f.user},${f.member},'USER','R8_REDACTION','ClassSession',
      ${f.session},'R8_REDACTION','Reviewed','{"password":"SECRET_CANARY"}'::jsonb,
      '{"otp":"SECRET_CANARY"}'::jsonb,${correlation})`;
    const [before] = await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant} AND correlation_id=${correlation}`;
    const base = `/api/v1/tenants/${f.tenant}`;
    const list = await request(app.getHttpServer()).get(base + '/audit?eventType=R8_REDACTION')
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    const timeline = await request(app.getHttpServer()).get(base + `/audit/operations/${correlation}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    for (const response of [list, timeline]) {
      expect(response.body.total).toBe(1);
      expect(JSON.stringify(response.body)).not.toContain('SECRET_CANARY');
      expect(response.body.items[0].before_json).toBeUndefined();
      expect(response.body.items[0].after_json).toBeUndefined();
      expect(response.body.items[0]).toMatchObject({ actorKind: 'USER', actorDisplay: expect.any(String), outcome: null });
    }
    const actor = encodeURIComponent(list.body.items[0].actorDisplay as string);
    expect((await request(app.getHttpServer()).get(base + `/audit?eventType=R8_REDACTION&actor=${actor}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.total).toBe(1);
    const [after] = await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant} AND correlation_id=${correlation}`;
    expect(after.n).toBe(before.n);
  });
  native('R8 N06 committed root receipt blocks retry despite a stale failed status', async () => {
    const f = await fresh(), s = await sessionFor(f), base = `/api/v1/tenants/${f.tenant}`;
    const created = await request(app.getHttpServer()).post(base + '/jobs').auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ kind: 'SCHEDULE_CHECK', payload: { sessionId: f.session } }).expect(201);
    const claim = await worker.claim();
    expect(claim?.id).toBe(created.body.id);
    expect(((await worker.perform(claim!)) as { status: string }).status).toBe('COMPLETED');
    const [receipt] = await admin`SELECT count(*)::int n FROM idempotency_records r JOIN automation_jobs j
      ON r.tenant_id=j.tenant_id AND r.idempotency_key=j.operation_key
      WHERE j.id=${created.body.id} AND r.operation_type='R4:JOB'`;
    expect(receipt.n).toBe(1);
    await admin`UPDATE automation_jobs SET status='FAILED',attempt_count=1,updated_at=clock_timestamp()
      WHERE id=${created.body.id}`;
    await request(app.getHttpServer()).post(base + `/jobs/${created.body.id}/retry`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Do not repeat an effect', confirmed: true }).expect(403);
  });
  native('R8 N07 failed job emits one authorized ADMIN_ALERT', async () => {
    const f = await fresh(), s = await sessionFor(f), base = `/api/v1/tenants/${f.tenant}`;
    const created = await request(app.getHttpServer()).post(base + '/jobs').auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ kind: 'BILLING_GENERATE', payload: { studentId: f.student, periodId: randomUUID() } }).expect(201);
    const claim = await worker.claim();
    expect(claim?.id).toBe(created.body.id);
    expect(((await worker.perform(claim!)) as { status: string }).status).toBe('FAILED');
    const [event] = await admin`SELECT id FROM outbox_events WHERE tenant_id=${f.tenant}
      AND aggregate_id=${created.body.id} AND event_type='ADMIN_ALERT'`;
    expect(event.id).toBeTruthy();
    for (let n = 0; n < 20 && (await admin`SELECT status FROM outbox_events WHERE id=${event.id}`)[0].status !== 'DONE'; n++)
      await worker.dispatch();
    const inbox = await request(app.getHttpServer()).get(base + '/notifications')
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(inbox.body.items.filter((row: { kind: string }) => row.kind === 'ADMIN_ALERT')).toHaveLength(1);
    await admin`UPDATE outbox_events SET status='NEW' WHERE id=${event.id}`;
    await worker.dispatch();
    const [count] = await admin`SELECT count(*)::int n FROM notifications WHERE outbox_event_id=${event.id}`;
    expect(count.n).toBe(1);
  });
  const academicRead = <T = Record<string, unknown>>(token: string, tenant: string, kind: string,
    target?: string, search?: string, page = 1, size = 20) =>
    runtime.run<T>(token,
      'SELECT educore_r4.academic_read($1::uuid,$2::text,$3::uuid,$4::text,$5::int,$6::int) result',
      tenant, kind, target ?? null, search ?? null, page, size);

  native('R8 academic reader A01 migration privileges and real projections', async () => {
    const f = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z' });
    const s = await sessionFor(f);
    const [privilege] = await admin`SELECT p.prosecdef,owner.rolname owner,
      has_function_privilege('educore_r4_api',p.oid,'EXECUTE') api,
      has_function_privilege('educore_r4_auth',p.oid,'EXECUTE') auth,
      has_function_privilege('educore_r4_worker',p.oid,'EXECUTE') worker,
      COALESCE((SELECT bool_or(a.grantee=0 AND a.privilege_type='EXECUTE')
        FROM aclexplode(p.proacl) a),false) public
      FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
      WHERE p.oid='educore_r4.academic_read(uuid,text,uuid,text,integer,integer)'::regprocedure`;
    expect(privilege).toMatchObject({ prosecdef: true, owner: 'educore_r4_owner', api: true,
      auth: false, worker: false, public: false });
    const expected = [
      ['STUDENTS', 'S1'], ['TEACHERS', 'T1'], ['SUBJECTS', 'SUB'],
      ['LEVELS', 'L1'], ['COURSES', 'C1'], ['CLASSES', 'CL1'],
    ] as const;
    for (const [kind, code] of expected) {
      const list = await academicRead<{ items: { code: string }[]; total: number; page: number }>(
        s.accessToken, f.tenant, kind, undefined, code);
      expect(list.items.some((item) => item.code === code)).toBe(true);
      expect(list.total).toBeGreaterThan(0);
      expect(list.page).toBe(1);
    }
    const classList = await academicRead<{ items: { code: string; enrollmentCount: number }[] }>(
      s.accessToken, f.tenant, 'CLASSES', undefined, 'CL1');
    expect(classList.items[0].enrollmentCount).toBe(1);
    const pageTwo = await academicRead<{ items: unknown[]; total: number }>(
      s.accessToken, f.tenant, 'STUDENTS', undefined, undefined, 2, 1);
    expect(pageTwo.total).toBe(2);
    expect(pageTwo.items).toHaveLength(1);
    const empty = await academicRead<{ items: unknown[]; total: number }>(
      s.accessToken, f.tenant, 'STUDENTS', undefined, 'NO_MATCH_R8');
    expect(empty).toMatchObject({ items: [], total: 0 });
    expect(await academicRead(s.accessToken, f.tenant, 'STUDENT', f.student)).toMatchObject({ id: f.student });
    expect(await academicRead(s.accessToken, f.tenant, 'TEACHER', f.teacher)).toMatchObject({ id: f.teacher });
    expect(await academicRead(s.accessToken, f.tenant, 'CLASS', f.classId)).toMatchObject({ id: f.classId });
  });

  native('R8 academic reader A02 live session, tenant, permission and missing targets', async () => {
    const f = await fresh(), g = await fresh(), s = await sessionFor(f);
    const raw = connect(apiConnection);
    await expect(raw`SELECT educore_r4.academic_read(${f.tenant}::uuid,'STUDENTS')`).rejects.toMatchObject({ code: '42501' });
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${g.tenant}/academic/students`)
      .auth(s.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students/${g.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/classes/${randomUUID()}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(404);
    const accountant = await actor(f, 'ACCOUNTANT');
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students`)
      .auth(accountant.accessToken, { type: 'bearer' }).expect(403);
    const sid = auth.tokens.verify(s.accessToken).sid;
    await admin`UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=${sid}`;
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students`)
      .auth(s.accessToken, { type: 'bearer' }).expect(401);
  });

  native('R8 academic reader A03 TENANT versus CLASS and STUDENT scope', async () => {
    const f = await fresh();
    const classActor = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.classId);
    const studentActor = await actor(f, 'ACADEMIC_STAFF', 'STUDENT', f.student);
    expect(await academicRead(classActor.accessToken, f.tenant, 'CLASS', f.classId)).toMatchObject({ id: f.classId });
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/classes/${f.class2}`)
      .auth(classActor.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/classes`)
      .auth(classActor.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students`)
      .auth(classActor.accessToken, { type: 'bearer' }).expect(403);
    expect(await academicRead(studentActor.accessToken, f.tenant, 'STUDENT', f.student)).toMatchObject({ id: f.student });
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students/${f.student2}`)
      .auth(studentActor.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/students`)
      .auth(studentActor.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}`)
      .auth(studentActor.accessToken, { type: 'bearer' }).expect(403);
  });

  native('R8 academic reader A04 restricted nested projections', async () => {
    const f = await fresh(), staff = await actor(f, 'ACADEMIC_STAFF');
    const assignment = await put(admin as unknown as Query, 'class_teacher_assignments', {
      tenant_id: f.tenant, class_id: f.classId, teacher_id: f.teacher, role_kind: 'PRIMARY',
      valid_from: '2090-01-01T00:00:00Z', assigned_by_membership_id: f.member,
    });
    const visibleClass = await academicRead<{ enrollments: unknown[]; teacherAssignments: { id: string }[] }>(
      staff.accessToken, f.tenant, 'CLASS', f.classId);
    expect(visibleClass.enrollments).toHaveLength(1);
    expect(visibleClass.teacherAssignments[0].id).toBe(assignment);
    const visibleTeacher = await academicRead<{ assignments: { id: string }[] }>(
      staff.accessToken, f.tenant, 'TEACHER', f.teacher);
    expect(visibleTeacher.assignments[0].id).toBe(assignment);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACADEMIC_STAFF')
      AND permission_id IN (SELECT id FROM permissions WHERE code IN ('enrollment.read','teacher.read'))`;
    const restrictedClass = await academicRead<Record<string, unknown>>(
      staff.accessToken, f.tenant, 'CLASS', f.classId);
    expect(restrictedClass).not.toHaveProperty('enrollments');
    expect(restrictedClass).not.toHaveProperty('teacherAssignments');
    const restrictedStudent = await academicRead<{ enrollments: unknown[] }>(
      staff.accessToken, f.tenant, 'STUDENT', f.student);
    expect(restrictedStudent.enrollments).toEqual([]);
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      SELECT gen_random_uuid(),${f.tenant},r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.tenant_id=${f.tenant} AND r.code='ACADEMIC_STAFF' AND p.code='teacher.read'`;
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACADEMIC_STAFF')
      AND permission_id=(SELECT id FROM permissions WHERE code='class.read')`;
    const restrictedTeacher = await academicRead<{ assignments: unknown[] }>(
      staff.accessToken, f.tenant, 'TEACHER', f.teacher);
    expect(restrictedTeacher.assignments).toEqual([]);
  });
  native('R8 academic C01 placement, enrollment and pending transfer use R4 binding', async () => {
    const f = await fresh(), s = await sessionFor(f);
    const [course] = await admin`SELECT subject_id,level_id FROM courses WHERE id=${f.course}`;
    const context = await request(app.getHttpServer())
      .get(`/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}/students/${f.student2}/placement-context`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(context.body).toMatchObject({ targetSubjectId: course.subject_id,
      targetLevelId: course.level_id, automaticRecommendation: 'DEFERRED_NO_APPROVED_RUBRIC' });
    const enrollmentKey = randomUUID();
    const enrollmentBody = { classId: f.classId, studentId: f.student2,
      effectiveFrom: '2099-01-01T00:00:00Z', reason: 'Admission test', confirmed: true,
      placement: { basis: 'STAFF_CONFIRMATION', subjectId: course.subject_id,
        levelId: course.level_id, reason: 'Staff reviewed placement' } };
    const created = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${f.tenant}/academic/enrollments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', enrollmentKey)
      .send(enrollmentBody).expect(201);
    expect(created.body).toMatchObject({ status: 'ACTIVE' });
    const repeated = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${f.tenant}/academic/enrollments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', enrollmentKey)
      .send(enrollmentBody).expect(201);
    expect(repeated.body.id).toBe(created.body.id);
    const transfer = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${f.tenant}/academic/transfers`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ enrollmentId: created.body.id, targetClassId: f.class2,
        effectiveAt: '2099-06-01T00:00:00Z', reason: 'Requested class change', confirmed: true }).expect(201);
    expect(transfer.body).toMatchObject({ status: 'REQUESTED' });
    const [source] = await admin`SELECT class_id,status,effective_to FROM enrollments WHERE id=${created.body.id}`;
    expect(source).toMatchObject({ class_id: f.classId, status: 'ACTIVE', effective_to: null });
    const [pending] = await admin`SELECT status,target_enrollment_id FROM enrollment_transfers WHERE id=${transfer.body.id}`;
    expect(pending).toMatchObject({ status: 'REQUESTED', target_enrollment_id: null });
  });

  native('R8 academic C02 public commands reject missing confirmation, scope and stale grants', async () => {
    const f = await fresh(), s = await sessionFor(f), accountant = await actor(f, 'ACCOUNTANT');
    const [course] = await admin`SELECT subject_id,level_id FROM courses WHERE id=${f.course}`;
    const body = { classId: f.classId, studentId: f.student2,
      effectiveFrom: '2099-01-01T00:00:00Z', reason: 'Admission test', confirmed: true,
      placement: { basis: 'STAFF_CONFIRMATION', subjectId: course.subject_id,
        levelId: course.level_id, reason: 'Staff reviewed placement' } };
    const path = `/api/v1/tenants/${f.tenant}/academic/enrollments`;
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, confirmed: false }).expect(400);
    await request(app.getHttpServer()).post(path).auth(accountant.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(body).expect(403);
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body,
        placement: { ...body.placement, levelId: randomUUID() } }).expect(422);
    const staff = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.class2);
    await request(app.getHttpServer()).post(path).auth(staff.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(body).expect(403);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACADEMIC_STAFF')
      AND permission_id=(SELECT id FROM permissions WHERE code='enrollment.create')`;
    await request(app.getHttpServer()).post(path).auth(staff.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, classId: f.class2 }).expect(403);
  });
  native('R8 closure T01 teacher assignment uses live class grant and idempotent R3 command', async () => {
    const f = await fresh(), s = await sessionFor(f);
    await admin`UPDATE classes SET status='PLANNED' WHERE id=${f.classId}`;
    const path = `/api/v1/tenants/${f.tenant}/academic/teacher-assignments`;
    const body = { classId: f.classId, teacherId: f.teacher, validFrom: '2099-01-01T00:00:00Z',
      validTo: null, reason: 'Initial class responsibility', confirmed: true };
    const key = randomUUID();
    const created = await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', key).send(body).expect(201);
    expect(created.body.status).toBe('ASSIGNED');
    const replay = await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', key).send(body).expect(201);
    expect(replay.body.id).toBe(created.body.id);
    const [count] = await admin`SELECT count(*)::int n FROM class_teacher_assignments WHERE id=${created.body.id}`;
    expect(count.n).toBe(1);
    const [audit] = await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant}
      AND event_type='R3:ASSIGN_TEACHER' AND entity_id=${created.body.id}`;
    expect(audit.n).toBe(1);
  });
  native('R8 billing H01 authenticated generation and reviewed issue bind to the selected tenant', async () => {
    const { f, s, period } = await issuedFixture(false);
    const other = await fresh();
    const base = `/api/v1/tenants/${f.tenant}/billing`;
    const generationPath = `${base}/periods/${period}/students/${f.student}/generations`;
    const key = randomUUID();
    const unrelated = await actor(f, 'ACADEMIC_STAFF');
    const financeNav = await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(financeNav.body.screenIds.filter((id: string) => id.startsWith('BL')))
      .toEqual(['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07']);
    const scopedAccountant = await actor(f, 'ACCOUNTANT', 'STUDENT', f.student);
    const scopedNav = await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(scopedAccountant.accessToken, { type: 'bearer' }).expect(200);
    expect(scopedNav.body.screenIds.filter((id: string) => id.startsWith('BL'))).toEqual([]);
    const accountant = await actor(f, 'ACCOUNTANT');
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACCOUNTANT')
      AND permission_id=(SELECT id FROM permissions WHERE code='billing.read')`;
    const reducedNav = await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .auth(accountant.accessToken, { type: 'bearer' }).expect(200);
    expect(reducedNav.body.screenIds).toContain('BL06');
    expect(reducedNav.body.screenIds).not.toContain('BL07');
    const tariffs = await request(app.getHttpServer()).get(`${base}/price-rules`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(tariffs.body.items).toEqual([expect.objectContaining({ scope: 'COURSE', amountVnd: '800000' })]);
    const periods = await request(app.getHttpServer()).get(`${base}/periods`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(periods.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: period })]));
    const opened = await request(app.getHttpServer()).post(`${base}/periods`)
      .auth(s.accessToken, { type: 'bearer' }).send({ monthStart: '2025-09-01', reason: 'Monthly review' }).expect(200);
    expect(opened.body.id).toBe(period);
    await request(app.getHttpServer()).post(generationPath)
      .set('Idempotency-Key', key).send({ reason: 'Monthly review' }).expect(401);
    await request(app.getHttpServer()).post(`/api/v1/tenants/${other.tenant}/billing/periods/${period}/students/${f.student}/generations`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
      .send({ reason: 'Monthly review' }).expect(403);
    await request(app.getHttpServer()).post(generationPath)
      .auth(unrelated.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Monthly review' }).expect(403);
    const first = await request(app.getHttpServer()).post(generationPath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
      .send({ reason: 'Monthly review' }).expect(200);
    expect(first.body).toMatchObject({ status: 'DRAFT', totalVnd: '800000' });
    const replay = await request(app.getHttpServer()).post(generationPath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
      .send({ reason: 'Monthly review' }).expect(200);
    expect(replay.body.id).toBe(first.body.id);
    const draftList = await request(app.getHttpServer()).get(`${base}/drafts`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(draftList.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: first.body.invoiceId, totalVnd: '800000' })]));
    const draft = await request(app.getHttpServer()).get(`${base}/drafts/${first.body.invoiceId}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(draft.body).toMatchObject({ id: first.body.invoiceId, currentGenerationId: first.body.id, canIssue: true });
    expect(draft.body.lines).toHaveLength(1);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/billing/drafts/${first.body.invoiceId}`)
      .auth((await sessionFor(other)).accessToken, { type: 'bearer' }).expect(403);
    const issuePath = `${base}/drafts/${first.body.invoiceId}/issue`;
    await request(app.getHttpServer()).post(issuePath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Reviewed', confirmed: true, expectedGenerationId: randomUUID() }).expect(409);
    const issued = await request(app.getHttpServer()).post(issuePath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key + ':issue')
      .send({ reason: 'Reviewed', confirmed: true, expectedGenerationId: first.body.id }).expect(200);
    expect(issued.body).toMatchObject({ id: first.body.invoiceId, status: 'ISSUED' });
    const invoiceList = await request(app.getHttpServer()).get(`${base}/invoices`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(invoiceList.body.items).toEqual(expect.arrayContaining([expect.objectContaining({
      id: first.body.invoiceId, status: 'ISSUED', settlement: 'UNPAID', outstandingVnd: '800000', allocatedVnd: '0' })]));
    const invoiceDetail = await request(app.getHttpServer()).get(`${base}/invoices/${first.body.invoiceId}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(invoiceDetail.body.snapshot.appliedGenerationId).toBe(first.body.id);
    expect(invoiceDetail.body.payments).toEqual([]);
    const issueReplay = await request(app.getHttpServer()).post(issuePath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key + ':issue')
      .send({ reason: 'Reviewed', confirmed: true, expectedGenerationId: first.body.id }).expect(200);
    expect(issueReplay.body).toEqual(issued.body);
    await request(app.getHttpServer()).post(issuePath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Reviewed again', confirmed: true, expectedGenerationId: first.body.id }).expect(422);
    const receivable = await request(app.getHttpServer()).get(`${base}/invoices/${first.body.invoiceId}/receivable`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(receivable.body).toMatchObject({ status: 'ISSUED', outstandingVnd: '800000' });
    const [effects] = await admin`SELECT (SELECT count(*)::int FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${first.body.invoiceId}) payment_count,
      (SELECT count(*)::int FROM wallet_transactions WHERE tenant_id=${f.tenant}) wallet_count`;
    expect(effects).toMatchObject({ payment_count: 0, wallet_count: 0 });
  });
  native('R8 billing H02 price writer uses live permission, date window and idempotent evidence', async () => {
    const f = await fresh(), other = await fresh(), manager = await sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/billing/price-rules`;
    const input = { scope: 'COURSE', targetId: f.course, amountVnd: '150000',
      effectiveFrom: '2099-01-01', effectiveTo: '2099-06-01', reason: 'Approved future tariff' };
    const key = randomUUID();
    const created = await request(app.getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', key).send(input).expect(200);
    expect(created.body).toMatchObject({ scope: 'COURSE', targetId: f.course, amountVnd: '150000' });
    const replay = await request(app.getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', key).send(input).expect(200);
    expect(replay.body).toEqual(created.body);
    await request(app.getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...input, amountVnd: '160000' }).expect(409);
    await request(app.getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...input, targetId: other.course }).expect(403);
    await request(app.getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...input, amountVnd: '-1' }).expect(400);
    const unauthorized = await actor(f, 'ACADEMIC_STAFF');
    await request(app.getHttpServer()).post(path).auth(unauthorized.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...input, scope: 'CLASS', targetId: f.classId }).expect(403);
    const [state] = await admin`SELECT (SELECT count(*)::int FROM price_rules WHERE tenant_id=${f.tenant} AND course_id=${f.course}) rule_count,
      (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='PRICE_RULE_CREATED' AND entity_id=${created.body.id}) audit_count`;
    expect(state).toMatchObject({ rule_count: 1, audit_count: 1 });
  });
  native('R8 billing H03 missing source creates NEEDS_INFORMATION without an invoice', async () => {
    const f = await fresh({ start: '2025-09-20T10:00:00Z', end: '2025-09-20T11:00:00Z', enrollmentFrom: '2020-01-01T00:00:00Z' });
    const session = await sessionFor(f);
    const period = await put(admin as unknown as Query, 'billing_periods', { tenant_id: f.tenant,
      month_start: '2025-09-01', month_end: '2025-10-01', status: 'OPEN' });
    const path = `/api/v1/tenants/${f.tenant}/billing/periods/${period}/students/${f.student}/generations`;
    const response = await request(app.getHttpServer()).post(path).auth(session.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Monthly source review' }).expect(200);
    expect(response.body.status).toBe('NEEDS_INFORMATION');
    expect(response.body.invoiceId).toBeNull();
    expect(response.body.source.missing.length).toBeGreaterThan(0);
    const [state] = await admin`SELECT count(*)::int n FROM invoices WHERE tenant_id=${f.tenant} AND period_id=${period}`;
    expect(state.n).toBe(0);
  });
  native('R8 billing H04 parent links alone do not discount; verified sibling G2 does', async () => {
    const { f, s, period } = await issuedFixture(false);
    await put(admin as unknown as Query, 'enrollments', { tenant_id: f.tenant, class_id: f.classId,
      student_id: f.student2, status: 'ACTIVE', effective_from: '2020-01-01', created_by_membership_id: f.member });
    const parent = await actor(f, 'PARENT');
    for (const student of [f.student, f.student2])
      await put(admin as unknown as Query, 'parent_student_links', { tenant_id: f.tenant,
        parent_membership_id: parent.member, student_id: student, relationship: 'PARENT',
        verified_at: '2020-01-01', verified_by_membership_id: f.member });
    const base = `/api/v1/tenants/${f.tenant}/billing`;
    const first = await request(app.getHttpServer()).post(`${base}/periods/${period}/students/${f.student}/generations`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Monthly source review' }).expect(200);
    expect(first.body).toMatchObject({ totalVnd: '800000', discountVnd: '0' });
    await put(admin as unknown as Query, 'verified_sibling_relationships', { tenant_id: f.tenant,
      student_a_id: f.student, student_b_id: f.student2, verified_by_membership_id: f.member,
      verified_at: '2020-01-01', evidence_note: 'Reviewed family evidence' });
    const evidence = await request(app.getHttpServer()).get(`${base}/sibling-evidence`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(evidence.body.items).toEqual([expect.objectContaining({ eligible: true })]);
    const second = await request(app.getHttpServer()).post(`${base}/periods/${period}/students/${f.student}/recomputations`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Verified sibling evidence added', expectedBase: first.body.id,
        expectedApplied: first.body.id }).expect(200);
    expect(second.body).toMatchObject({ totalVnd: '720000', discountVnd: '80000', invoiceId: first.body.invoiceId });
    const historical = await request(app.getHttpServer()).get(`${base}/drafts/${first.body.invoiceId}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(historical.body.generationHistory).toHaveLength(2);
    expect(historical.body.generationHistory[0].result.totalVnd).toBe('800000');
    await request(app.getHttpServer()).get(`${base}/drafts/${first.body.invoiceId}`)
      .auth(parent.accessToken, { type: 'bearer' }).expect(403);
  });
  native('R8 billing H05 issued detail requires both live permissions and student scope', async () => {
    const { f, s, invoice } = await issuedFixture();
    const other = await fresh();
    const path = `/api/v1/tenants/${f.tenant}/billing/invoices/${invoice}`;
    const read = (token: string) => request(app.getHttpServer()).get(path)
      .auth(token, { type: 'bearer' });
    await read(s.accessToken).expect(200);
    const wrongStudent = await actor(f, 'ACCOUNTANT', 'STUDENT', f.student2);
    await read(wrongStudent.accessToken).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/billing/invoices/${invoice}`)
      .auth((await sessionFor(other)).accessToken, { type: 'bearer' }).expect(403);

    // The same selected session must lose access immediately after a live grant
    // changes; navigation visibility alone is not the authorization boundary.
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='MANAGER')
      AND permission_id=(SELECT id FROM permissions WHERE code='invoice.read')`;
    await read(s.accessToken).expect(403); // billing.read only
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      SELECT gen_random_uuid(),${f.tenant},r.id,p.id FROM roles r CROSS JOIN permissions p
      WHERE r.tenant_id=${f.tenant} AND r.code='MANAGER' AND p.code='invoice.read'`;
    await read(s.accessToken).expect(200);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='MANAGER')
      AND permission_id=(SELECT id FROM permissions WHERE code='billing.read')`;
    await read(s.accessToken).expect(403); // invoice.read only
  });
  native('R8 closure T02 teacher assignment denies conflict, wrong tenant and bad authority', async () => {
    const f = await fresh(), g = await fresh(), s = await sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/academic/teacher-assignments`;
    const teacher2 = await put(admin as unknown as Query, 'teacher_profiles', {
      tenant_id: f.tenant, teacher_code: 'T2', full_name: 'Other Teacher', status: 'ACTIVE',
    });
    const body = { classId: f.classId, teacherId: teacher2, validFrom: '2099-01-01T00:00:00Z',
      validTo: null, reason: 'Assignment review', confirmed: true };
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(body).expect(422);
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, teacherId: g.teacher }).expect(422);
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, confirmed: false }).expect(400);
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, validTo: '2098-01-01T00:00:00Z' }).expect(400);
    const accountant = await actor(f, 'ACCOUNTANT');
    await request(app.getHttpServer()).post(path).auth(accountant.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, teacherId: f.teacher }).expect(403);
    const otherClass = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.class2);
    await request(app.getHttpServer()).post(path).auth(otherClass.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send({ ...body, teacherId: f.teacher }).expect(403);
  });
  native('R8 closure N01 Academic navigation requires live TENANT grants', async () => {
    const f = await fresh(), manager = await sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/access/navigation`;
    const read = (token: string) => request(app.getHttpServer()).get(path)
      .auth(token, { type: 'bearer' });
    const academic = (ids: string[]) => ids.filter((id) => id.startsWith('AC'));
    expect(academic((await read(manager.accessToken).expect(200)).body.screenIds))
      .toEqual(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08']);
    const scoped = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.classId);
    expect(academic((await read(scoped.accessToken).expect(200)).body.screenIds)).toEqual([]);
    const student = await actor(f, 'ACADEMIC_STAFF', 'STUDENT', f.student);
    expect(academic((await read(student.accessToken).expect(200)).body.screenIds)).toEqual([]);
    const tenantStaff = await actor(f, 'ACADEMIC_STAFF');
    expect(academic((await read(tenantStaff.accessToken).expect(200)).body.screenIds))
      .toEqual(['AC01', 'AC02', 'AC03', 'AC04', 'AC05', 'AC06', 'AC07', 'AC08']);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
      AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACADEMIC_STAFF')
      AND permission_id=(SELECT id FROM permissions WHERE code='academic.read')`;
    expect(academic((await read(tenantStaff.accessToken).expect(200)).body.screenIds))
      .toEqual(['AC01', 'AC02', 'AC03', 'AC04', 'AC07', 'AC08']);
    const base = `/api/v1/tenants/${f.tenant}/academic`;
    await request(app.getHttpServer()).get(`${base}/classes`)
      .auth(tenantStaff.accessToken, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get(`${base}/courses`)
      .auth(tenantStaff.accessToken, { type: 'bearer' }).expect(403);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${tenantStaff.assignment}`;
    expect(academic((await read(tenantStaff.accessToken).expect(200)).body.screenIds)).toEqual([]);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${randomUUID()}/access/navigation`)
      .auth(manager.accessToken, { type: 'bearer' }).expect(403);
  });
  native('R8 closure J01 login to navigation, profiles, catalog, assignment, enrollment and roster', async () => {
    const f = await fresh(), session = await sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}/academic`;
    const bearerToken = (path: string) => request(app.getHttpServer()).get(path)
      .auth(session.accessToken, { type: 'bearer' });
    const menu = await bearerToken(`/api/v1/tenants/${f.tenant}/access/navigation`).expect(200);
    expect(menu.body.screenIds).toContain('AC07');
    const student = await request(app.getHttpServer()).post(`${base}/profiles/students`)
      .auth(session.accessToken, { type: 'bearer' })
      .send({ code: 'JST', name: 'Journey Student', reason: 'Journey' }).expect(201);
    const teacher = await request(app.getHttpServer()).post(`${base}/profiles/teachers`)
      .auth(session.accessToken, { type: 'bearer' })
      .send({ code: 'JTE', name: 'Journey Teacher', reason: 'Journey' }).expect(201);
    expect(student.body.status).toBe('ACTIVE');
    expect(teacher.body.status).toBe('ACTIVE');
    const subject = await request(app.getHttpServer()).post(`${base}/catalog/subjects`)
      .auth(session.accessToken, { type: 'bearer' })
      .send({ code: 'JSUB', name: 'Journey Subject', reason: 'Journey' }).expect(201);
    const level = await request(app.getHttpServer()).post(`${base}/catalog/levels`)
      .auth(session.accessToken, { type: 'bearer' })
      .send({ code: 'JLVL', name: 'Journey Level', sortOrder: 2, reason: 'Journey' }).expect(201);
    const course = await request(app.getHttpServer()).post(`${base}/catalog/courses`)
      .auth(session.accessToken, { type: 'bearer' })
      .send({ code: 'JCRS', name: 'Journey Course', subjectId: subject.body.id,
        levelId: level.body.id, reason: 'Journey' }).expect(201);
    const classRow = await request(app.getHttpServer()).post(`${base}/catalog/classes`)
      .auth(session.accessToken, { type: 'bearer' })
      .send({ code: 'JCLS', name: 'Journey Class', courseId: course.body.id,
        capacity: 1, startDate: '2099-01-01', endDate: '2099-12-31', reason: 'Journey' }).expect(201);
    const [createdStates] = await admin`SELECT co.status course_status,cl.status class_status
      FROM courses co JOIN classes cl ON cl.course_id=co.id
      WHERE co.id=${course.body.id} AND cl.id=${classRow.body.id}`;
    expect(createdStates).toMatchObject({ course_status: 'ACTIVE', class_status: 'PLANNED' });
    const assigned = await request(app.getHttpServer()).post(`${base}/teacher-assignments`)
      .auth(session.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ classId: classRow.body.id, teacherId: teacher.body.id,
        validFrom: '2099-01-01T00:00:00Z', validTo: null,
        reason: 'Journey assignment', confirmed: true }).expect(201);
    expect(assigned.body.status).toBe('ASSIGNED');
    const enrolled = await request(app.getHttpServer()).post(`${base}/enrollments`)
      .auth(session.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ classId: classRow.body.id, studentId: student.body.id,
        effectiveFrom: '2099-02-01T00:00:00Z', reason: 'Journey', confirmed: true,
        placement: { basis: 'STAFF_CONFIRMATION', subjectId: subject.body.id,
          levelId: level.body.id, reason: 'Journey placement' } }).expect(201);
    expect(enrolled.body.status).toBe('ACTIVE');
    const classes = await bearerToken(`${base}/classes`).expect(200);
    expect(classes.body.items.some((item: { id: string }) => item.id === classRow.body.id)).toBe(true);
    const detail = await bearerToken(`${base}/classes/${classRow.body.id}`).expect(200);
    expect(detail.body.enrollments).toContainEqual(expect.objectContaining({
      id: enrolled.body.id, studentId: student.body.id, studentName: 'Journey Student',
    }));
    expect(detail.body.teacherAssignments).toContainEqual(expect.objectContaining({
      id: assigned.body.id, teacherId: teacher.body.id,
    }));
    const enrollmentBody = { classId: classRow.body.id, studentId: student.body.id,
      effectiveFrom: '2099-02-01T00:00:00Z', reason: 'Journey duplicate', confirmed: true,
      placement: { basis: 'STAFF_CONFIRMATION', subjectId: subject.body.id,
        levelId: level.body.id, reason: 'Journey placement' } };
    const duplicate = await request(app.getHttpServer()).post(`${base}/enrollments`)
      .auth(session.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send(enrollmentBody);
    expect([409, 422]).toContain(duplicate.status);
    const full = await request(app.getHttpServer()).post(`${base}/enrollments`)
      .auth(session.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...enrollmentBody, studentId: f.student2 });
    expect([409, 422]).toContain(full.status);
    const [activeCount] = await admin`SELECT count(*)::int n FROM enrollments
      WHERE tenant_id=${f.tenant} AND class_id=${classRow.body.id} AND status='ACTIVE'`;
    expect(activeCount.n).toBe(1);
    const capabilities = await bearerToken(`${base}/permissions/capabilities/current?classId=${classRow.body.id}`)
      .expect(200);
    expect(capabilities.body.tenantTimezone).toBe('Asia/Ho_Chi_Minh');
  });
  native('R8 academic A01 profile create and update preserve account separation', async () => {
    const f = await fresh(), s = await sessionFor(f);
    const usersBefore = await admin`SELECT count(*)::int n FROM users`;
    const membershipsBefore = await admin`SELECT count(*)::int n FROM tenant_memberships`;
    const rolesBefore = await admin`SELECT count(*)::int n FROM membership_roles`;
    const student = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${f.tenant}/academic/profiles/students`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'SNEW', name: 'New Student', dateOfBirth: '2014-03-21', reason: 'Profile creation' }).expect(201);
    expect(student.body).toMatchObject({ status: 'ACTIVE' });
    const teacher = await request(app.getHttpServer())
      .post(`/api/v1/tenants/${f.tenant}/academic/profiles/teachers`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'TNEW', name: 'New Teacher', contact: 'internal contact', reason: 'Profile creation' }).expect(201);
    const studentUpdate = await request(app.getHttpServer())
      .patch(`/api/v1/tenants/${f.tenant}/academic/profiles/students/${student.body.id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Updated Student', dateOfBirth: null, reason: 'Correct name' }).expect(200);
    expect(studentUpdate.body.id).toBe(student.body.id);
    await request(app.getHttpServer())
      .patch(`/api/v1/tenants/${f.tenant}/academic/profiles/teachers/${teacher.body.id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Updated Teacher', contact: null, reason: 'Correct name' }).expect(200);
    const [studentRow] = await admin`SELECT student_code,full_name,date_of_birth,membership_id FROM student_profiles WHERE id=${student.body.id}`;
    const [teacherRow] = await admin`SELECT teacher_code,full_name,contact,membership_id FROM teacher_profiles WHERE id=${teacher.body.id}`;
    expect(studentRow).toMatchObject({ student_code: 'SNEW', full_name: 'Updated Student', date_of_birth: null, membership_id: null });
    expect(teacherRow).toMatchObject({ teacher_code: 'TNEW', full_name: 'Updated Teacher', contact: null, membership_id: null });
    expect((await admin`SELECT count(*)::int n FROM users`)[0].n).toBe(usersBefore[0].n);
    expect((await admin`SELECT count(*)::int n FROM tenant_memberships`)[0].n).toBe(membershipsBefore[0].n);
    expect((await admin`SELECT count(*)::int n FROM membership_roles`)[0].n).toBe(rolesBefore[0].n);
  });

  native('R8 academic A02 profile validation, duplicates and scope denial', async () => {
    const f = await fresh(), g = await fresh(), s = await sessionFor(f);
    const studentPath = `/api/v1/tenants/${f.tenant}/academic/profiles/students`;
    const input = { code: 'S1', name: 'Duplicate', dateOfBirth: null, reason: 'Test duplicate' };
    await request(app.getHttpServer()).post(studentPath).auth(s.accessToken, { type: 'bearer' }).send(input).expect(409);
    await request(app.getHttpServer()).post(studentPath).auth(s.accessToken, { type: 'bearer' })
      .send({ ...input, code: 'BAD', dateOfBirth: '2026-02-30' }).expect(400);
    await request(app.getHttpServer()).post(studentPath).auth(s.accessToken, { type: 'bearer' })
      .send({ ...input, code: 'BAD', membershipId: f.member }).expect(400);
    const accountant = await actor(f, 'ACCOUNTANT');
    await request(app.getHttpServer()).post(studentPath).auth(accountant.accessToken, { type: 'bearer' })
      .send({ ...input, code: 'NEW' }).expect(403);
    await request(app.getHttpServer()).patch(`${studentPath}/${g.student}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Wrong tenant', dateOfBirth: null, reason: 'Test' }).expect(404);
    const scoped = await actor(f, 'ACADEMIC_STAFF', 'STUDENT', f.student);
    await request(app.getHttpServer()).patch(`${studentPath}/${f.student}`)
      .auth(scoped.accessToken, { type: 'bearer' })
      .send({ name: 'Scoped edit', dateOfBirth: null, reason: 'Correct profile' }).expect(200);
    await request(app.getHttpServer()).patch(`${studentPath}/${f.student2}`)
      .auth(scoped.accessToken, { type: 'bearer' })
      .send({ name: 'Denied edit', dateOfBirth: null, reason: 'Test' }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/tenants/${g.tenant}/academic/profiles/students`)
      .auth(s.accessToken, { type: 'bearer' }).send({ ...input, code: 'NEW' }).expect(403);
    await request(app.getHttpServer()).post(`/api/v1/tenants/${f.tenant}/academic/profiles/teachers`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'T1', name: 'Duplicate', contact: null, reason: 'Test duplicate' }).expect(409);
  });
  native('R8 academic B01 catalog, course and class persistence with tenant references', async () => {
    const f = await fresh(), s = await sessionFor(f), base = `/api/v1/tenants/${f.tenant}/academic/catalog`;
    const subject = await request(app.getHttpServer()).post(`${base}/subjects`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'SUB2', name: 'Second Subject', reason: 'Catalog setup' }).expect(201);
    const level = await request(app.getHttpServer()).post(`${base}/levels`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'L2', name: 'Second Level', sortOrder: 2, reason: 'Catalog setup' }).expect(201);
    const course = await request(app.getHttpServer()).post(`${base}/courses`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'C2', name: 'Second Course', subjectId: subject.body.id,
        levelId: level.body.id, description: 'Course details', reason: 'Course setup' }).expect(201);
    const classRow = await request(app.getHttpServer()).post(`${base}/classes`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'CL3', name: 'Third Class', courseId: course.body.id,
        capacity: 12, startDate: '2099-01-01', endDate: '2099-12-31', reason: 'Class setup' }).expect(201);
    await request(app.getHttpServer()).patch(`${base}/subjects/${subject.body.id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Updated Subject', reason: 'Correct display name' }).expect(200);
    await request(app.getHttpServer()).patch(`${base}/levels/${level.body.id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Updated Level', sortOrder: 3, reason: 'Correct display order' }).expect(200);
    await request(app.getHttpServer()).patch(`${base}/courses/${course.body.id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Updated Course', description: null, reason: 'Correct course' }).expect(200);
    await request(app.getHttpServer()).patch(`${base}/classes/${classRow.body.id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Updated Class', reason: 'Correct class' }).expect(200);
    const [row] = await admin`SELECT cl.code,cl.name,cl.status,cl.capacity,cl.course_id,
      co.subject_id,co.level_id FROM classes cl JOIN courses co ON co.id=cl.course_id WHERE cl.id=${classRow.body.id}`;
    expect(row).toMatchObject({ code: 'CL3', name: 'Updated Class', status: 'PLANNED',
      capacity: 12, course_id: course.body.id, subject_id: subject.body.id, level_id: level.body.id });
    const [catalog] = await admin`SELECT s.name subject_name,l.name level_name,l.sort_order FROM subjects s
      JOIN levels l ON l.tenant_id=s.tenant_id WHERE s.id=${subject.body.id} AND l.id=${level.body.id}`;
    expect(catalog).toMatchObject({ subject_name: 'Updated Subject', level_name: 'Updated Level', sort_order: 3 });
    expect((await admin`SELECT count(*)::int n FROM class_sessions WHERE tenant_id=${f.tenant} AND class_id=${classRow.body.id}`)[0].n).toBe(0);
  });

  native('R8 academic B02 duplicates, invalid references and unsafe deactivation are denied', async () => {
    const f = await fresh(), g = await fresh(), s = await sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}/academic/catalog`;
    await request(app.getHttpServer()).post(`${base}/subjects`).auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'SUB', name: 'Duplicate', reason: 'Test' }).expect(409);
    await request(app.getHttpServer()).post(`${base}/levels`).auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'L1', name: 'Duplicate', sortOrder: 1, reason: 'Test' }).expect(409);
    await request(app.getHttpServer()).post(`${base}/classes`).auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'BAD', name: 'Bad Class', courseId: f.course, capacity: 0, reason: 'Test' }).expect(400);
    await request(app.getHttpServer()).post(`${base}/courses`).auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'BAD', name: 'Bad Course', subjectId: g.course, levelId: randomUUID(), reason: 'Test' }).expect(422);
    await request(app.getHttpServer()).post(`${base}/classes`).auth(s.accessToken, { type: 'bearer' })
      .send({ code: 'BAD', name: 'Bad Class', courseId: g.course, capacity: 10, reason: 'Test' }).expect(422);
    const [subject] = await admin`SELECT subject_id FROM courses WHERE id=${f.course}`;
    await request(app.getHttpServer()).patch(`${base}/subjects/${subject.subject_id}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Subject', active: false, reason: 'Test deactivation' }).expect(422);
    const accountant = await actor(f, 'ACCOUNTANT');
    await request(app.getHttpServer()).post(`${base}/subjects`).auth(accountant.accessToken, { type: 'bearer' })
      .send({ code: 'DENIED', name: 'Denied', reason: 'Test' }).expect(403);
    await request(app.getHttpServer()).patch(`${base}/classes/${g.classId}`)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ name: 'Wrong tenant', reason: 'Test' }).expect(404);
    const classActor = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.classId);
    await request(app.getHttpServer()).patch(`${base}/classes/${f.classId}`)
      .auth(classActor.accessToken, { type: 'bearer' })
      .send({ name: 'Scoped Class', reason: 'Test' }).expect(200);
    await request(app.getHttpServer()).patch(`${base}/classes/${f.class2}`)
      .auth(classActor.accessToken, { type: 'bearer' })
      .send({ name: 'Denied Class', reason: 'Test' }).expect(403);
  });
  native('R8 academic D01 capabilities mirror current tenant and class grants', async () => {
    const f = await fresh(), manager = await sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/academic/permissions/capabilities/current`;
    const managerCapabilities = await request(app.getHttpServer()).get(`${path}?classId=${f.classId}&studentId=${f.student}`)
      .auth(manager.accessToken, { type: 'bearer' }).expect(200);
    expect(managerCapabilities.body).toMatchObject({ studentCreate: true, classCreate: true,
      classUpdate: true, enroll: true, transferRequest: true });
    const classActor = await actor(f, 'ACADEMIC_STAFF', 'CLASS', f.classId);
    const scoped = await request(app.getHttpServer()).get(`${path}?classId=${f.classId}&studentId=${f.student}`)
      .auth(classActor.accessToken, { type: 'bearer' }).expect(200);
    expect(scoped.body).toMatchObject({ studentCreate: false, classCreate: false,
      classUpdate: true, enroll: true });
    const other = await request(app.getHttpServer()).get(`${path}?classId=${f.class2}&studentId=${f.student}`)
      .auth(classActor.accessToken, { type: 'bearer' }).expect(200);
    expect(other.body).toMatchObject({ classUpdate: false, enroll: false });
    const studentActor = await actor(f, 'ACADEMIC_STAFF', 'STUDENT', f.student);
    const studentScoped = await request(app.getHttpServer()).get(`${path}?classId=${f.classId}&studentId=${f.student}`)
      .auth(studentActor.accessToken, { type: 'bearer' }).expect(200);
    expect(studentScoped.body).toMatchObject({ studentUpdate: true, classUpdate: false, enroll: false });
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${classActor.assignment}`;
    const revoked = await request(app.getHttpServer()).get(`${path}?classId=${f.classId}&studentId=${f.student}`)
      .auth(classActor.accessToken, { type: 'bearer' }).expect(200);
    expect(revoked.body).toMatchObject({ classUpdate: false, enroll: false });
    await request(app.getHttpServer()).get(`/api/v1/tenants/${randomUUID()}/academic/permissions/capabilities/current`)
      .auth(manager.accessToken, { type: 'bearer' }).expect(403);
  });
  const issueRecovery = async () => {
    const base = await fresh();
    const address = randomUUID() + '@r4.invalid';
    const userId = await put(admin as unknown as Query, 'users', {
      email_normalized: address, display_name: 'Recovery fixture', status: 'ACTIVE',
    });
    const f = { ...base, user: userId };
    await auth.requestOtp(address, 'PASSWORD_RESET');
    const [otp] = await admin`SELECT id FROM public.password_reset_otps WHERE user_id=${f.user} AND purpose='PASSWORD_RESET' ORDER BY requested_at DESC LIMIT 1`;
    return { f, email: address, otpId: otp.id as string };
  };
  const childEvents = new WeakMap<ChildProcess, Record<string, string>[]>();
  const crashChild = (mode: string) => {
    const child = fork(resolve('test/r4/recovery-crash-child.mjs'), [], {
      cwd: resolve('.'), silent: true,
      env: { ...process.env, NODE_ENV: 'test', R4_CRASH_MODE: mode,
        R4_AUTH_URL: authConnection, R4_API_URL: apiConnection,
        R4_CRASH_KEY: recoveryKey.key.toString('base64'), R4_CRASH_JWT: auth.config.jwtSecret,
        R4_CRASH_PEPPER: auth.config.otpPepper, R4_OTP_WORKER_URL: otpWorkerConnection,
        R4_RECOVERY_KEYS: JSON.stringify({ [recoveryKey.id]: recoveryKey.key.toString('base64') }),
        R4_SMTP_HOST: '127.0.0.1', R4_SMTP_PORT: process.env.R4_CRASH_SMTP_PORT ?? '1',
        R4_SMTP_FROM: 'otp@r4.invalid' },
    });
    const events: Record<string, string>[] = [];
    childEvents.set(child, events);
    child.on('message', (event) => events.push(event as Record<string, string>));
    return child;
  };
  const childPhase = (child: ChildProcess, wanted: string) => new Promise<Record<string, string>>((resolvePhase, rejectPhase) => {
    const previous = childEvents.get(child)?.find((event) => event.phase === wanted);
    if (previous) { resolvePhase(previous); return; }
    const timer = setTimeout(() => { cleanup(); rejectPhase(Error('CHILD_PHASE_TIMEOUT')); }, 15_000);
    const message = (raw: unknown) => {
      const event = raw as Record<string, string>;
      if (event.phase === wanted) { cleanup(); resolvePhase(event); }
      else if (event.phase === 'ERROR') { cleanup(); rejectPhase(Error('CHILD_FAILED')); }
    };
    const exit = () => { cleanup(); rejectPhase(Error('CHILD_EXITED_EARLY')); };
    const cleanup = () => { clearTimeout(timer); child.off('message', message); child.off('exit', exit); };
    child.on('message', message); child.once('exit', exit);
  });
  const stopChild = async (child: ChildProcess) => {
    const exited = once(child, 'exit');
    expect(child.kill()).toBe(true);
    await exited;
  };
  native('R8 D01 process kills preserve one committed OTP and recover the same code', async () => {
    const address = randomUUID() + '@r4.invalid';
    const userId = await put(admin as unknown as Query, 'users', {
      email_normalized: address, display_name: 'Crash fixture', status: 'ACTIVE',
    });
    const apiChild = crashChild('issue-http');
    try {
      const ready = await childPhase(apiChild, 'HTTP_READY');
      const response = await fetch(`http://127.0.0.1:${ready.port}/api/v1/auth/password/otp/request`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: address }),
      });
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ accepted: true });
    }
    finally { if (apiChild.exitCode === null) await stopChild(apiChild); }
    const [issued] = await admin`SELECT o.id,o.otp_hash,q.status FROM public.password_reset_otps o
      JOIN educore_r4.recovery_otp_deliveries q ON q.otp_id=o.id
      WHERE o.user_id=${userId} AND o.consumed_at IS NULL`;
    expect(issued.status).toBe('READY');
    const [stored] = await admin`SELECT key_id,nonce,ciphertext,tag FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${issued.id}`;
    const originalOtp = decryptRecovery(issued.id as string, {
      keyId: stored.key_id as string, nonce: stored.nonce as Buffer,
      ciphertext: stored.ciphertext as Buffer, tag: stored.tag as Buffer,
    }, recoveryKey).otp;
    expect(createHmac('sha256', auth.config.otpPepper)
      .update(JSON.stringify([address, 'PASSWORD_RESET', originalOtp])).digest('hex')).toBe(issued.otp_hash);
    const replacement = crashChild('complete');
    try {
      const done = await childPhase(replacement, 'COMPLETED');
      expect(done.state).toBe('DONE');
      const resent = await childPhase(replacement, 'RESENT');
      expect(resent.otpDigest).toBe(createHash('sha256').update(originalOtp).digest('hex'));
      if (replacement.exitCode === null) await once(replacement, 'exit');
    } finally { if (replacement.exitCode === null) await stopChild(replacement); }
    const [after] = await admin`SELECT q.status,q.attempt_count,count(o.id)::int otp_count
      FROM educore_r4.recovery_otp_deliveries q JOIN public.password_reset_otps o ON o.id=q.otp_id
      WHERE q.otp_id=${issued.id} GROUP BY q.status,q.attempt_count`;
    expect(after).toMatchObject({ status: 'ACCEPTED_BY_SMTP', attempt_count: 1, otp_count: 1 });
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=${issued.id}`;

    for (const mode of ['before-send', 'during-smtp', 'after-250'] as const) {
      const item = await issueRecovery();
      let accepted = 0;
      let receivedOtp = '';
      let dataArrived!: () => void;
      const dataSeen = new Promise<void>((resolveSeen) => { dataArrived = resolveSeen; });
      const sockets = new Set<Socket>();
      const server = createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.on('error', () => undefined);
        socket.write('220 fake-smtp.local ESMTP\r\n');
        let pending = '', inData = false, message = '';
        socket.on('data', (chunk) => {
          pending += chunk.toString('utf8');
          while (pending.includes('\r\n')) {
            const end = pending.indexOf('\r\n');
            const line = pending.slice(0, end); pending = pending.slice(end + 2);
            if (inData) {
              if (line === '.') {
                inData = false;
                receivedOtp = /\b\d{6}\b/.exec(message)?.[0] ?? '';
                dataArrived();
                if (mode === 'after-250') { accepted++; socket.write('250 queued locally\r\n'); }
              } else message += line + '\n';
            } else if (/^(EHLO|HELO) /i.test(line)) socket.write('250 fake-smtp.local\r\n');
            else if (/^(MAIL FROM:|RCPT TO:)/i.test(line)) socket.write('250 ok\r\n');
            else if (line === 'DATA') { inData = true; socket.write('354 continue\r\n'); }
            else if (line === 'QUIT') { socket.write('221 bye\r\n'); socket.end(); }
          }
        });
      });
      await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
      const port = server.address();
      if (!port || typeof port === 'string') throw Error('FAKE_SMTP_BIND_FAILED');
      process.env.R4_CRASH_SMTP_PORT = String(port.port);
      const child = crashChild(mode);
      let workerId = '';
      let fence = '';
      try {
        const ready = await childPhase(child, 'WORKER_READY');
        workerId = ready.workerId;
        if (mode === 'before-send') await childPhase(child, 'BEFORE_SEND');
        else {
          await Promise.race([dataSeen, new Promise((_, rejectWait) => setTimeout(() => rejectWait(Error('SMTP_DATA_TIMEOUT')), 15_000))]);
          if (mode === 'after-250') {
            const acceptedEvent = await childPhase(child, 'AFTER_SMTP');
            expect(acceptedEvent.result).toBe('ACCEPTED');
            expect(acceptedEvent.otpDigest).toBe(createHash('sha256').update(receivedOtp).digest('hex'));
          }
        }
        const [leased] = await admin`SELECT status,attempt_count,fencing_token FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${item.otpId}`;
        expect(leased).toMatchObject({ status: 'SENDING', attempt_count: 1 });
        fence = String(leased.fencing_token);
      } finally {
        if (child.exitCode === null) await stopChild(child);
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
        delete process.env.R4_CRASH_SMTP_PORT;
      }
      expect(accepted).toBe(mode === 'after-250' ? 1 : 0);
      await admin`UPDATE educore_r4.recovery_otp_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE otp_id=${item.otpId}`;
      expect(await recoveryWorker.sweep()).toBeGreaterThanOrEqual(1);
      const [waiting] = await admin`SELECT status,attempt_count,fencing_token,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${item.otpId}`;
      expect(waiting).toMatchObject({ status: 'RETRY_WAIT', attempt_count: 1 });
      expect(waiting.ciphertext).not.toBeNull();
      expect(BigInt(waiting.fencing_token as string)).toBeGreaterThan(BigInt(fence));
      const [stale] = await recoveryDb.$queryRawUnsafe<{ result: boolean }[]>(
        'SELECT educore_r4.check_recovery_delivery($1::uuid,$2::uuid,$3::bigint,$4::text) result',
        item.otpId, workerId, fence, item.email);
      expect(stale.result).toBe(false);
      await admin`UPDATE educore_r4.recovery_otp_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE otp_id=${item.otpId}`;
      const sentBefore = delivery.messages.length;
      expect(await recoveryWorker.tick()).toBe('DONE');
      expect(delivery.messages.length).toBe(sentBefore + 1);
      expect(delivery.messages.at(-1)?.email).toBe(item.email);
      if (receivedOtp) expect(delivery.messages.at(-1)?.otp).toBe(receivedOtp);
      const [recovered] = await admin`SELECT status,attempt_count,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${item.otpId}`;
      expect(recovered).toMatchObject({ status: 'ACCEPTED_BY_SMTP', attempt_count: 2, ciphertext: null });
      const [oneOtp] = await admin`SELECT count(*)::int total FROM public.password_reset_otps WHERE user_id=${item.f.user}`;
      expect(oneOtp.total).toBe(1);
      await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=${item.otpId}`;
      (evidence.cases as Record<string, string>)[`R8 process kill ${mode}`] = 'PASS';
    }
  });
  native('R8 D01 killed worker cannot send expired, revoked, superseded or fifth-attempt OTP', async () => {
    const killBeforeSend = async () => {
      const child = crashChild('before-send');
      try { await childPhase(child, 'BEFORE_SEND'); }
      finally { if (child.exitCode === null) await stopChild(child); }
    };
    const baseline = delivery.messages.length;
    const expired = await issueRecovery();
    await killBeforeSend();
    await admin`UPDATE public.password_reset_otps SET requested_at=v.at-interval '16 minutes',
      expires_at=v.at-interval '1 minute' FROM (SELECT clock_timestamp() at) v WHERE id=${expired.otpId}`;
    await admin`UPDATE educore_r4.recovery_otp_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE otp_id=${expired.otpId}`;
    expect(await recoveryWorker.sweep()).toBeGreaterThanOrEqual(1);
    const [expiredTask] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${expired.otpId}`;
    expect(expiredTask).toMatchObject({ status: 'EXPIRED', ciphertext: null });

    const revoked = await issueRecovery();
    await killBeforeSend();
    await admin`UPDATE public.users SET status='DISABLED' WHERE id=${revoked.f.user}`;
    const [revokedTask] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${revoked.otpId}`;
    expect(revokedTask).toMatchObject({ status: 'CANCELLED', ciphertext: null });

    const superseded = await issueRecovery();
    await killBeforeSend();
    await admin`UPDATE public.password_reset_otps SET requested_at=requested_at-interval '2 minutes',
      expires_at=expires_at-interval '2 minutes' WHERE id=${superseded.otpId}`;
    await auth.requestOtp(superseded.email, 'PASSWORD_RESET');
    const [supersededTask] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${superseded.otpId}`;
    expect(supersededTask).toMatchObject({ status: 'CANCELLED', ciphertext: null });
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp()
      WHERE user_id=${superseded.f.user} AND consumed_at IS NULL`;

    const exhausted = await issueRecovery();
    const transient = new RecoveryWorker(recoveryDb, new Map([[recoveryKey.id, recoveryKey]]), { send: async () => 'TRANSIENT' });
    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(await transient.tick()).toBe('DONE');
      await admin`UPDATE educore_r4.recovery_otp_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE otp_id=${exhausted.otpId}`;
    }
    await killBeforeSend();
    await admin`UPDATE educore_r4.recovery_otp_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE otp_id=${exhausted.otpId}`;
    expect(await recoveryWorker.sweep()).toBeGreaterThanOrEqual(1);
    const [terminal] = await admin`SELECT status,attempt_count,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${exhausted.otpId}`;
    expect(terminal).toMatchObject({ status: 'FAILED', attempt_count: 4, ciphertext: null });
    expect(await transient.tick()).toBe('IDLE');
    expect(delivery.messages.length).toBe(baseline);
    (evidence.cases as Record<string, string>)['R8 process kill terminal safeguards'] = 'PASS';
  });
  native('R8 C01 issue is atomic and worker ACLs are narrow', async () => {
    const { otpId } = await issueRecovery();
    const [row] = await admin`SELECT q.status,q.attempt_count,q.fencing_token,q.ciphertext IS NOT NULL encrypted,
      q.otp_id=o.id bound FROM educore_r4.recovery_otp_deliveries q JOIN public.password_reset_otps o ON o.id=q.otp_id WHERE q.otp_id=${otpId}`;
    expect(row).toMatchObject({ status: 'READY', attempt_count: 0, encrypted: true, bound: true });
    const [acl] = await admin`SELECT
      NOT has_table_privilege('educore_r4_otp_delivery','educore_r4.recovery_otp_deliveries','SELECT') no_raw,
      has_function_privilege('educore_r4_otp_delivery','educore_r4.claim_recovery_delivery(uuid)','EXECUTE') can_claim,
      NOT has_function_privilege('educore_r4_auth','educore_r4.claim_recovery_delivery(uuid)','EXECUTE') auth_cannot_claim,
      NOT has_function_privilege('educore_r4_otp_delivery','educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea)','EXECUTE') worker_cannot_issue`;
    expect(Object.values(acl).every(Boolean)).toBe(true);
    const q = connect(authConnection);
    await expect(q`SELECT * FROM educore_r4.recovery_otp_deliveries LIMIT 1`).rejects.toThrow();
    await expect(q`SELECT educore_r4.claim_recovery_delivery(${randomUUID()}::uuid)`).rejects.toThrow();
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=${otpId}`;
  });
  native('R8 C01 disable and email change clear READY and SENDING payloads and fence stale workers', async () => {
    for (const kind of ['disable', 'email'] as const) {
      for (const claimed of [false, true]) {
        const { f, otpId } = await issueRecovery();
        const claim = claimed ? (await recoveryDb.$queryRawUnsafe<{ result: { fence: string } }[]>(
          'SELECT educore_r4.claim_recovery_delivery($1::uuid) result', recoveryWorker.workerId))[0].result : null;
        const [before] = await admin`SELECT fencing_token FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${otpId}`;
        if (kind === 'disable') await admin`UPDATE public.users SET status='DISABLED' WHERE id=${f.user}`;
        else await admin`UPDATE public.users SET email_normalized=${randomUUID() + '@r4.invalid'} WHERE id=${f.user}`;
        const [after] = await admin`SELECT status,last_error_code,nonce,ciphertext,tag,key_id,lease_owner,lease_until,next_attempt_at,completed_at,fencing_token FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${otpId}`;
        expect(after.status).toBe('CANCELLED');
        expect(after.last_error_code).toBe(kind === 'email' ? 'RECIPIENT_CHANGED' : 'USER_STATE_CHANGED');
        expect([after.nonce, after.ciphertext, after.tag, after.key_id, after.lease_owner, after.lease_until, after.next_attempt_at]).toEqual(Array(7).fill(null));
        expect(after.completed_at).not.toBeNull();
        expect(BigInt(after.fencing_token as string)).toBeGreaterThan(BigInt(before.fencing_token as string));
        if (claim) {
          const [stale] = await recoveryDb.$queryRawUnsafe<{ result: string }[]>(
            'SELECT educore_r4.finish_recovery_delivery($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text) result',
            otpId, recoveryWorker.workerId, claim.fence, kind === 'email' ? 'old@r4.invalid' : 'old@r4.invalid', 'SMTP_ACCEPTED', null);
          expect(stale.result).toBe('STALE');
        }
      }
    }
  });
  native('R8 C01 user-update rollback preserves task; waiting check observes committed disable', async () => {
    const { f, email: address, otpId } = await issueRecovery();
    const [claimed] = await recoveryDb.$queryRawUnsafe<{ result: { fence: string } }[]>(
      'SELECT educore_r4.claim_recovery_delivery($1::uuid) result', recoveryWorker.workerId);
    const blocker = connect(process.env.R4_TEST_URL!);
    const waiter = connect(otpWorkerConnection);
    const observer = connect(process.env.R4_TEST_URL!);
    const blockerPid = (await blocker`SELECT pg_backend_pid() pid`)[0].pid as number;
    const waiterPid = (await waiter`SELECT pg_backend_pid() pid`)[0].pid as number;
    let unlock!: () => void;
    let locked!: () => void;
    const holding = new Promise<void>((resolve) => { unlock = resolve; });
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const transaction = blocker.begin(async (tx) => {
      await tx`UPDATE public.users SET status='DISABLED' WHERE id=${f.user}`;
      locked();
      await holding;
    });
    await acquired;
    const checking = waiter`SELECT educore_r4.check_recovery_delivery(${otpId}::uuid,${recoveryWorker.workerId}::uuid,${claimed.result.fence}::bigint,${address}) result`.then((rows) => rows);
    try { await waitBlocked(observer, waiterPid, blockerPid); }
    finally { unlock(); }
    await transaction;
    expect((await checking)[0].result).toBe(false);
    const [cancelled] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${otpId}`;
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.ciphertext).toBeNull();
    const again = await issueRecovery();
    await expect(blocker.begin(async (tx) => {
      await tx`UPDATE public.users SET email_normalized=${randomUUID() + '@r4.invalid'} WHERE id=${again.f.user}`;
      throw Error('ROLLBACK_MARKER');
    })).rejects.toThrow('ROLLBACK_MARKER');
    const [retained] = await admin`SELECT status,ciphertext IS NOT NULL encrypted FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${again.otpId}`;
    expect(retained).toMatchObject({ status: 'READY', encrypted: true });
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=${again.otpId}`;
  });
  native('R8 C03 locked known user uses neutral nonblocking issue path', async () => {
    const { f, email: address, otpId } = await issueRecovery();
    const blocker = connect(process.env.R4_TEST_URL!);
    let unlock!: () => void;
    let locked!: () => void;
    const holding = new Promise<void>((resolve) => { unlock = resolve; });
    const acquired = new Promise<void>((resolve) => { locked = resolve; });
    const transaction = blocker.begin(async (tx) => {
      await tx`UPDATE public.users SET display_name=display_name WHERE id=${f.user}`;
      locked();
      await holding;
    });
    await acquired;
    try {
      const start = performance.now();
      const known = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request')
        .send({ email: address }).timeout({ response: 2_000 });
      const knownMs = performance.now() - start;
      const unknown = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request')
        .send({ email: randomUUID() + '@r4.invalid' }).timeout({ response: 2_000 });
      expect([known.status, unknown.status]).toEqual([202, 202]);
      expect(known.body).toEqual({ accepted: true });
      expect(unknown.body).toEqual(known.body);
      expect(known.headers['content-type']).toBe(unknown.headers['content-type']);
      expect(known.headers['cache-control']).toBe(unknown.headers['cache-control']);
      expect(knownMs).toBeLessThan(1_000);
      const [count] = await admin`SELECT count(*)::int total FROM public.password_reset_otps WHERE user_id=${f.user} AND purpose='PASSWORD_RESET'`;
      expect(count.total).toBe(1);
    } finally { unlock(); await transaction; }
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=${otpId}`;
  });
  native('R8 C01 wrong encrypted recipient cancels before SMTP; exhaustion and supersession clear ciphertext', async () => {
    const wrong = await issueRecovery();
    const encoded = encryptRecovery(wrong.otpId, 'other@r4.invalid', '123456', recoveryKey);
    await admin`UPDATE educore_r4.recovery_otp_deliveries SET nonce=${encoded.nonce},ciphertext=${encoded.ciphertext},tag=${encoded.tag} WHERE otp_id=${wrong.otpId}`;
    const sent = delivery.messages.length;
    expect(await recoveryWorker.tick()).toBe('DONE');
    expect(delivery.messages.length).toBe(sent);
    const [mismatch] = await admin`SELECT status,last_error_code,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${wrong.otpId}`;
    expect(mismatch).toMatchObject({ status: 'CANCELLED', last_error_code: 'RECIPIENT_CHANGED', ciphertext: null });
    const exhausted = await issueRecovery();
    for (let i = 0; i < 5; i++) await expect(auth.reset(exhausted.email, '000000', password, 'PASSWORD_RESET')).rejects.toThrow('INVALID_OTP');
    const [limit] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${exhausted.otpId}`;
    expect(limit).toMatchObject({ status: 'CANCELLED', ciphertext: null });
    const superseded = await issueRecovery();
    await admin`UPDATE public.password_reset_otps SET requested_at=requested_at-interval '2 minutes',expires_at=expires_at-interval '2 minutes' WHERE id=${superseded.otpId}`;
    await auth.requestOtp(superseded.email, 'PASSWORD_RESET');
    const [old] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${superseded.otpId}`;
    expect(old).toMatchObject({ status: 'CANCELLED', ciphertext: null });
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE user_id=${superseded.f.user} AND consumed_at IS NULL`;
  });
  native('R8 D01 fake SMTP retries 1/3/5 minutes, stops at four and clears payload', async () => {
    const { otpId } = await issueRecovery();
    const failing = new RecoveryWorker(recoveryDb, new Map([[recoveryKey.id, recoveryKey]]), {
      send: async () => 'TRANSIENT',
    });
    for (let attempt = 1; attempt <= 4; attempt++) {
      expect(await failing.tick()).toBe('DONE');
      const [task] = await admin`SELECT status,attempt_count,last_error_code,
        extract(epoch FROM (next_attempt_at-updated_at)) delay_seconds,ciphertext
        FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${otpId}`;
      expect(task.attempt_count).toBe(attempt);
      if (attempt < 4) {
        expect(task.status).toBe('RETRY_WAIT');
        expect(Number(task.delay_seconds)).toBeCloseTo([60, 180, 300][attempt - 1], 0);
        expect(task.ciphertext).not.toBeNull();
        await admin`UPDATE educore_r4.recovery_otp_deliveries SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE otp_id=${otpId}`;
      } else {
        expect(task.status).toBe('FAILED');
        expect(task.ciphertext).toBeNull();
      }
    }
    const permanent = await issueRecovery();
    const reject = new RecoveryWorker(recoveryDb, new Map([[recoveryKey.id, recoveryKey]]), { send: async () => 'PERMANENT' });
    expect(await reject.tick()).toBe('DONE');
    const [failed] = await admin`SELECT status,last_error_code,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${permanent.otpId}`;
    expect(failed).toMatchObject({ status: 'FAILED', last_error_code: 'SMTP_PERMANENT', ciphertext: null });
  });
  native('R8 D01 expired lease is swept, stale finish is fenced and no fifth claim occurs', async () => {
    const { otpId } = await issueRecovery();
    const [claim] = await recoveryDb.$queryRawUnsafe<{ result: { fence: string } }[]>(
      'SELECT educore_r4.claim_recovery_delivery($1::uuid) result', recoveryWorker.workerId);
    await admin`UPDATE educore_r4.recovery_otp_deliveries SET lease_until=clock_timestamp()-interval '1 second' WHERE otp_id=${otpId}`;
    expect(await recoveryWorker.sweep()).toBeGreaterThanOrEqual(1);
    const [stale] = await recoveryDb.$queryRawUnsafe<{ result: string }[]>(
      'SELECT educore_r4.finish_recovery_delivery($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text) result',
      otpId, recoveryWorker.workerId, claim.result.fence, 'unknown@r4.invalid', 'SMTP_ACCEPTED', null);
    expect(stale.result).toBe('STALE');
    const [task] = await admin`SELECT status,last_error_code,attempt_count,next_attempt_at,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${otpId}`;
    expect(task.status).toBe('RETRY_WAIT');
    expect(task.last_error_code).toBe('SMTP_TIMEOUT_UNKNOWN');
    expect(task.attempt_count).toBe(1);
    expect(task.ciphertext).not.toBeNull();
    await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp() WHERE id=${otpId}`;
  });
  native('R8 D01 key loss, corrupt ciphertext, delivery window, expiry and seven-day retention fail closed', async () => {
    const missing = await issueRecovery();
    const noKey = new RecoveryWorker(recoveryDb, new Map(), { send: async () => { throw Error('UNREACHABLE_SMTP'); } });
    expect(await noKey.tick()).toBe('DONE');
    const [lost] = await admin`SELECT status,last_error_code,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${missing.otpId}`;
    expect(lost).toMatchObject({ status: 'FAILED', last_error_code: 'KEY_UNAVAILABLE', ciphertext: null });
    const corrupt = await issueRecovery();
    await admin`UPDATE educore_r4.recovery_otp_deliveries SET ciphertext=decode(repeat('00',octet_length(ciphertext)),'hex') WHERE otp_id=${corrupt.otpId}`;
    const sent = delivery.messages.length;
    expect(await recoveryWorker.tick()).toBe('DONE');
    expect(delivery.messages.length).toBe(sent);
    const [invalid] = await admin`SELECT status,last_error_code,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${corrupt.otpId}`;
    expect(invalid).toMatchObject({ status: 'FAILED', last_error_code: 'CONFIG_UNAVAILABLE', ciphertext: null });
    const narrow = await issueRecovery();
    await admin`UPDATE public.password_reset_otps SET
      requested_at=v.at-interval '13 minutes 50 seconds',expires_at=v.at+interval '70 seconds'
      FROM (SELECT clock_timestamp() at) v WHERE id=${narrow.otpId}`;
    expect(await recoveryWorker.tick()).toBe('IDLE');
    const [window] = await admin`SELECT status,last_error_code,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${narrow.otpId}`;
    expect(window).toMatchObject({ status: 'FAILED', last_error_code: 'DELIVERY_WINDOW_CLOSED', ciphertext: null });
    const expired = await issueRecovery();
    await admin`UPDATE public.password_reset_otps SET
      requested_at=v.at-interval '16 minutes',expires_at=v.at-interval '1 minute'
      FROM (SELECT clock_timestamp() at) v WHERE id=${expired.otpId}`;
    expect(await recoveryWorker.sweep()).toBeGreaterThanOrEqual(1);
    const [ended] = await admin`SELECT status,ciphertext FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${expired.otpId}`;
    expect(ended).toMatchObject({ status: 'EXPIRED', ciphertext: null });
    await admin`UPDATE educore_r4.recovery_otp_deliveries SET completed_at=clock_timestamp()-interval '8 days' WHERE otp_id=${expired.otpId}`;
    await recoveryWorker.sweep();
    const [retained] = await admin`SELECT count(*)::int total FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${expired.otpId}`;
    expect(retained.total).toBe(0);
  });
  native('R8 C01 SMTP already in flight cannot be recalled but DB fence rejects late finish', async () => {
    const { f, otpId } = await issueRecovery();
    let started!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let attempts = 0;
    const slow = new RecoveryWorker(recoveryDb, new Map([[recoveryKey.id, recoveryKey]]), {
      send: async () => { attempts++; started(); await held; return 'ACCEPTED'; },
    });
    const pending = slow.tick();
    await entered;
    expect(attempts).toBe(1);
    await admin`UPDATE public.users SET email_normalized=${randomUUID() + '@r4.invalid'} WHERE id=${f.user}`;
    release();
    expect(await pending).toBe('STALE');
    const [task] = await admin`SELECT status,last_error_code,ciphertext,lease_owner FROM educore_r4.recovery_otp_deliveries WHERE otp_id=${otpId}`;
    expect(task).toMatchObject({ status: 'CANCELLED', last_error_code: 'RECIPIENT_CHANGED', ciphertext: null, lease_owner: null });
  });
  native('R8 C03 preregistered account enumeration timing protocol', async () => {
    const runToken = randomBytes(4).toString('hex');
    const knownEmail = (index: number) => `r8k${runToken}${String(index).padStart(4, '0')}@r4.invalid`;
    const unknownEmail = (index: number) => `r8u${runToken}${String(index).padStart(4, '0')}@r4.invalid`;
    await admin`INSERT INTO public.users(id,email_normalized,display_name,status,updated_at)
      SELECT gen_random_uuid(),'r8k' || ${runToken} || lpad(g::text,4,'0') || '@r4.invalid','Benchmark','ACTIVE',clock_timestamp()
      FROM generate_series(0,1249) g`;
    const express = app.getHttpAdapter().getInstance() as { set: (key: string, value: unknown) => void };
    express.set('trust proxy', 'loopback');
    let randomState = 0xD01C03;
    const random = () => ((randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    // Balance every concurrent slot across the run. The former independent shuffle
    // put 38 known and 62 unknown requests in slot 1; slot latency itself drifted
    // by 1-2 ms, enough to bias an AUC measured after the common 100 ms floor.
    const balancedOrders = () => {
      const orders: boolean[][] = [];
      for (let pair = 0; pair < 50; pair++) {
        const order = Array.from({ length: 8 }, (_, index) => index < 4);
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
        orders.push(order, order.map((known) => !known));
      }
      for (let i = orders.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [orders[i], orders[j]] = [orders[j], orders[i]];
      }
      return orders;
    };
    const responseShape = (response: Awaited<ReturnType<ReturnType<typeof request>['post']>>) => ({
      status: response.status, body: response.text,
      contentType: response.headers['content-type'], cacheControl: response.headers['cache-control'],
      contentLength: response.headers['content-length'], vary: response.headers.vary ?? null,
      retryAfter: response.headers['retry-after'] ?? null, setCookie: response.headers['set-cookie'] ?? null,
    });
    const call = async (address: string, block: number, range: number) => {
      const ip = `198.${range}.${Math.floor(block / 256)}.${block % 256}`;
      const start = process.hrtime.bigint();
      const response = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request')
        .set('X-Forwarded-For', ip).send({ email: address });
      const ms = Number(process.hrtime.bigint() - start) / 1_000_000;
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
      return { response, ms };
    };
    let reference: ReturnType<typeof responseShape> | undefined;
    const results: Record<string, unknown> = { seed: 0xD01C03, samplesPerGroupPerCondition: 400,
      bootstrapResamples: 10_000, conditions: {} };
    try {
      for (let block = 0; block < 13; block++) {
        const jobs = Array.from({ length: Math.min(8, 100 - block * 8) }, (_, j) => {
          const index = block * 8 + j;
          return () => call(index % 2 ? `r8k${runToken}${String(1200 + Math.floor(index / 2)).padStart(4, '0')}@r4.invalid`
            : `r8u${runToken}${String(1200 + Math.floor(index / 2)).padStart(4, '0')}@r4.invalid`, block, 19);
        });
        for (let start = 0; start < jobs.length; start += 4) await Promise.all(jobs.slice(start, start + 4).map((job) => job()));
      }
      while (await recoveryWorker.tick() !== 'IDLE') { /* drain warm-up */ }
      for (let condition = 0; condition < 3; condition++) {
        const orders = balancedOrders();
        let active = true;
        let pumpError: unknown;
        const smtp = new RecoveryWorker(recoveryDb, new Map([[recoveryKey.id, recoveryKey]]), {
          send: async () => {
            if (condition === 1) { await new Promise((resolve) => setTimeout(resolve, 20)); return 'TRANSIENT'; }
            return 'ACCEPTED';
          },
        });
        const pump = (async () => {
          try {
            while (active) {
              if (await smtp.tick() === 'IDLE') await new Promise((resolve) => setTimeout(resolve, 2));
            }
          } catch (error) { pumpError = error; }
        })();
        const rows: Timing[] = [];
        const serviceMs: Timing[] = [];
        const originalIssue = auth.requestOtp.bind(auth);
        auth.requestOtp = async (address, purpose) => {
          const start = performance.now();
          try { return await originalIssue(address, purpose); }
          finally { serviceMs.push({ known: address.startsWith(`r8k${runToken}`), ms: performance.now() - start,
            block: Math.floor(serviceMs.length / 8) }); }
        };
        let headerEquivalent = true;
        try {
          for (let block = 0; block < 100; block++) {
            const order = orders[block];
            let knownIndex = 0, unknownIndex = 0;
            const jobs = order.map((known) => {
              const index = condition * 400 + block * 4 + (known ? knownIndex++ : unknownIndex++);
              return { known, task: () => call(known ? knownEmail(index) : unknownEmail(index), condition * 100 + block, 18) };
            });
            for (let start = 0; start < 8; start += 4) {
              const wave = await Promise.all(jobs.slice(start, start + 4).map((j) => j.task()));
              wave.forEach(({ response, ms }, offset) => {
                const shape = responseShape(response);
                reference ??= shape;
                if (shape.status !== 202 || shape.body !== JSON.stringify({ accepted: true })
                  || shape.contentType !== 'application/json; charset=utf-8'
                  || shape.cacheControl !== 'no-store' || shape.retryAfter !== null || shape.setCookie !== null
                  || JSON.stringify(shape) !== JSON.stringify(reference)) headerEquivalent = false;
                rows.push({ known: jobs[start + offset].known, ms, block });
              });
            }
          }
        } finally { auth.requestOtp = originalIssue; active = false; await pump; }
        if (pumpError) throw Error('BENCHMARK_WORKER_FAILED');
        const analysis = timingAnalysis(rows, 0xD01C03 + condition);
        const serviceKnown = serviceMs.filter((row) => row.known).map((row) => row.ms);
        const serviceUnknown = serviceMs.filter((row) => !row.known).map((row) => row.ms);
        (results.conditions as Record<string, unknown>)[['healthy', 'slow_reject', 'concurrency_four'][condition]] = {
          status: headerEquivalent && analysis.pass ? 'PASS' : 'FAIL', headerEquivalent, ...analysis,
          slotKnownCounts: Array.from({ length: 8 }, (_, slot) => rows.filter((row, index) => index % 8 === slot && row.known).length),
          serviceDuration: { knownMedian: quantile(serviceKnown, .5), unknownMedian: quantile(serviceUnknown, .5),
            knownP95: quantile(serviceKnown, .95), unknownP95: quantile(serviceUnknown, .95),
            knownCount: serviceKnown.length, unknownCount: serviceUnknown.length },
          rawTimings: rows,
        };
      }
      const previousReady = auth.recoveryReady.bind(auth);
      auth.recoveryReady = async () => { throw Error('GLOBAL_FAULT'); };
      let globalEquivalent = true;
      try {
        for (let i = 0; i < 200; i++) {
          const response = (await call(i % 2 ? knownEmail(i % 100) : unknownEmail(i % 100), Math.floor(i / 8), 20)).response;
          const shape = responseShape(response);
          if (shape.status !== 503 || response.body.code !== 'SERVICE_UNAVAILABLE'
            || response.body.message !== 'SERVICE_UNAVAILABLE'
            || response.body.correlationId !== response.headers['x-request-id']
            || shape.cacheControl !== 'no-store' || shape.setCookie !== null || shape.retryAfter !== null) globalEquivalent = false;
        }
      } finally { auth.recoveryReady = previousReady; }
      results.global503 = { known: 100, unknown: 100, status: globalEquivalent ? 'PASS' : 'FAIL' };
      const previousRequest = auth.requestOtp.bind(auth);
      auth.requestOtp = async (address, purpose) => { await previousRequest(address, purpose); throw Error('POSTLOOKUP_FAULT'); };
      try {
        const known = await call(knownEmail(0), 0, 21);
        const unknown = await call(unknownEmail(0), 1, 21);
        const probe = await call(unknownEmail(1), 2, 21);
        results.postlookup = { status: [known, unknown, probe].every((entry) =>
          JSON.stringify(responseShape(entry.response)) === JSON.stringify(reference)) ? 'PASS' : 'FAIL' };
      } finally { auth.requestOtp = previousRequest; }
    } finally {
      express.set('trust proxy', false);
      await admin`UPDATE public.password_reset_otps SET consumed_at=clock_timestamp()
        WHERE consumed_at IS NULL AND user_id IN
        (SELECT id FROM public.users WHERE email_normalized LIKE ${'r8k' + runToken + '%@r4.invalid'})`;
      evidence.benchmark = results;
    }
    expect(Object.values(results.conditions as Record<string, { status: string }>).every((v) => v.status === 'PASS')).toBe(true);
    expect((results.global503 as { status: string }).status).toBe('PASS');
    expect((results.postlookup as { status: string }).status).toBe('PASS');
  });
  native('A20 migrated navigation exists and unauthenticated HTTP is denied', async () => {
    const [row] = await admin`SELECT to_regprocedure('educore_r4.navigation_access(uuid)') IS NOT NULL installed`;
    expect(row.installed).toBe(true);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${fixture.tenant}/access/navigation`).expect(401);
  });
  native('A21 navigation HTTP binds identity, tenant, no-store and exact five-field response', async () => {
    const f = await fresh(), principalSession = await sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/access/navigation`;
    const get = () => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${principalSession.accessToken}`);
    const response = await get().expect(200);
    expect(Object.keys(response.body).sort()).toEqual(['screenIds', 'sessionId', 'tenantId', 'userId', 'validUntil']);
    expect(response.body).toMatchObject({ userId: f.user, tenantId: f.tenant });
    expect(response.body.screenIds.filter((id: string) => id.startsWith('OP')))
      .toEqual(['OP01', 'OP02', 'OP03', 'OP04', 'OP05', 'OP06', 'OP07']);
    expect(response.body.sessionId).toBe(auth.tokens.verify(principalSession.accessToken).sid);
    expect(response.body.validUntil).toBeGreaterThan(Date.now());
    const [serverClock] = await admin`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint now_ms`;
    expect(response.body.validUntil).toBeLessThanOrEqual(Number(serverClock.now_ms) + 60_000);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.etag).toBeUndefined();
    const conditional = await get().set('If-None-Match', '*').expect(200);
    expect(conditional.headers['cache-control']).toBe('no-store');
    expect(conditional.headers.etag).toBeUndefined();
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers['set-cookie']).toBeUndefined();
    for (const bad of [await get().query({ role: 'MANAGER' }).expect(400),
      await get().send({ screenIds: ['OP01'] }).expect(400)]) {
      expect(bad.body.code).toBe('INVALID_INPUT');
      expect(bad.headers['cache-control']).toBe('no-store');
      expect(bad.headers.etag).toBeUndefined();
    }
    const wrong = await request(app.getHttpServer()).get(`/api/v1/tenants/${randomUUID()}/access/navigation`)
      .set('Authorization', `Bearer ${principalSession.accessToken}`).expect(403);
    expect(wrong.body.code).toBe('FORBIDDEN');
    const none = await actor(f, 'ACADEMIC_STAFF');
    const empty = await request(app.getHttpServer()).get(path)
      .set('Authorization', `Bearer ${none.accessToken}`).expect(200);
    expect(empty.body.screenIds.filter((id: string) => id.startsWith('OP'))).toEqual(['OP03']);
    await admin`UPDATE tenant_memberships SET status='DISABLED',left_at=clock_timestamp() WHERE id=${none.member}`;
    const denied = await request(app.getHttpServer()).get(path)
      .set('Authorization', `Bearer ${none.accessToken}`).expect(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    const sid = auth.tokens.verify(principalSession.accessToken).sid;
    await admin`UPDATE auth_sessions SET access_expires_at=clock_timestamp()-interval '1 second' WHERE id=${sid}`;
    const expired = await get().expect(401);
    expect(expired.body.code).toBe('AUTH_REQUIRED');
  });
  native('A22 OP05 menu evidence cannot resolve an unrelated approval resource', async () => {
    const f = await fresh(), accountant = await actor(f, 'ACCOUNTANT');
    const authorization = `Bearer ${accountant.accessToken}`;
    const menu = await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/access/navigation`)
      .set('Authorization', authorization).expect(200);
    expect(menu.body.screenIds).toEqual(['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07', 'BL09', 'G01', 'GL01', 'OP04', 'OP05']);
    const resource = await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/approvals/${randomUUID()}`)
      .set('Authorization', authorization).expect(403);
    expect(resource.body.code).toBe('FORBIDDEN');
  });
  native('A18 no-membership account authenticates but cannot select a tenant', async () => {
    const isolatedEmail = randomUUID() + '@r4.invalid';
    const user = await put(admin as unknown as Query, 'users', { email_normalized: isolatedEmail, display_name: 'No membership', status: 'ACTIVE' });
    await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES(${user},${sharedPasswordHash},clock_timestamp())`;
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', auth.config.origins[0])
      .send({ email: isolatedEmail, password }).expect(200);
    expect(login.body.allowedTenants).toEqual([]);
    const me = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
    expect(me.body.tenantId).toBeNull();
    expect(me.body.allowedTenants).toEqual([]);
    await request(app.getHttpServer()).post('/api/v1/auth/select-tenant').set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ tenantId: fixture.tenant }).expect(403);
    await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', `Bearer ${login.body.accessToken}`).expect(204);
  });
  it.skipIf(!browserAvailable)('A19 actual Edge → React → NestJS → restricted PostgreSQL journey', async () => {
    const f = await fresh();
    const [user] = await admin`SELECT email_normalized FROM users WHERE id=${f.user}`;
    const verified = await browserAuthJourney({ authUrl: authConnection, apiUrl: apiConnection, config: auth.config,
      email: user.email_normalized as string, password, tenantId: f.tenant,
      recoveryOtp: async (address) => {
        await recoveryWorker.tick();
        return delivery.messages.find((message) => message.email === address && message.purpose === 'PASSWORD_RESET')?.otp;
      } });
    expect(Object.values(verified).every((value) => value === true)).toBe(true);
    const [row] = await admin`SELECT count(*)::int revoked FROM auth_sessions WHERE user_id=${f.user} AND revoked_at IS NOT NULL`;
    expect(row.revoked).toBeGreaterThanOrEqual(1);
    (evidence.cases as Record<string, unknown>).browser = verified;
  });
  it.skipIf(!browserAvailable)('R9.2 Parent two-child browser scope and revocation', async () => {
    const f = await fresh();
    const parent = await actor(f, 'PARENT');
    const link = async (studentId: string) => put(admin as unknown as Query, 'parent_student_links', {
      tenant_id: f.tenant, parent_membership_id: parent.member, student_id: studentId,
      relationship: 'PARENT', evidence_reference: 'R9 disposable fixture',
      verified_by_membership_id: f.member, verified_at: new Date(),
    });
    const firstLink = await link(f.student);
    await link(f.student2);
    const third = await put(admin as unknown as Query, 'student_profiles', {
      tenant_id: f.tenant, student_code: `S3-${randomUUID()}`, full_name: 'Third student', status: 'ACTIVE',
    });
    const base = `/api/v1/tenants/${f.tenant}`;
    const bearer = (r: request.Test) => r.set('Authorization', `Bearer ${parent.accessToken}`);
    await bearer(request(app.getHttpServer()).get(`${base}/portal/children/${third}`)).expect(404);
    await bearer(request(app.getHttpServer()).get(`${base}/portal/billing/${third}`)).expect(404);
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.viewport(1280, 800, false);
      await b.login(parent.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/parent`);
      await b.wait('document.querySelector("#portal-parent-child")?.options.length === 2', 'PARENT_CHILDREN');
      const options = await b.evaluate<string[]>('Array.from(document.querySelector("#portal-parent-child").options, option => option.value)');
      expect(options).toEqual(expect.arrayContaining([f.student, f.student2]));
      expect(options).not.toContain(third);
      await b.viewport(390, 844, true);
      await b.select('#portal-parent-child', f.student2);
      await b.wait(`document.querySelector('#portal-parent-child')?.value === ${JSON.stringify(f.student2)} && document.querySelector('.portal-page')?.textContent.includes('Student Two')`, 'SECOND_CHILD');
      const secondOnly = await b.evaluate<boolean>('!document.querySelector(".portal-heading p")?.textContent.includes("Student One")');
      expect(secondOnly).toBe(true);
      await b.route(`/app/${f.tenant}/parent/children/${third}`);
      await b.wait('document.body.textContent.includes("Không có quyền") || document.body.textContent.includes("Không thể tải")', 'THIRD_CHILD_DENIED');
      expect(b.network.some(r => r.path === `${base}/portal/children/${third}` && r.status === 404)).toBe(true);
      await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=${firstLink}`;
      await b.route(`/app/${f.tenant}/parent`);
      await b.wait('document.querySelector("#portal-parent-child")?.options.length === 1', 'REVOKED_LINK');
      const remaining = await b.evaluate<string[]>('Array.from(document.querySelector("#portal-parent-child").options, option => option.value)');
      expect(remaining).toEqual([f.student2]);
      expect(b.network.some(r => r.path === `${base}/portal/context` && r.status === 200)).toBe(true);
      return { browserVersion: b.browserVersion, responses: b.network.filter(r => r.path.startsWith(base)) };
    });
    await bearer(request(app.getHttpServer()).get(`${base}/portal/children/${f.student}`)).expect(404);
    await bearer(request(app.getHttpServer()).get(`${base}/portal/billing/${f.student}`)).expect(404);
    (evidence.cases as Record<string, unknown>).r9Parent = {
      browser: browser.browserVersion, network: browser.responses,
      verifiedLinks: 2, thirdStudentDenied: true, revokedLinkDenied: true,
      desktop: '1280x800', mobile: '390x844',
    };
  }, 120_000);
  it.skipIf(!browserAvailable)('R9.2 T01 Parent delayed child response never restores stale data', async () => {
    const f = await fresh();
    const parent = await actor(f, 'PARENT');
    const link = async (studentId: string) => put(admin as unknown as Query, 'parent_student_links', {
      tenant_id: f.tenant, parent_membership_id: parent.member, student_id: studentId,
      relationship: 'PARENT', evidence_reference: 'R9 disposable race fixture',
      verified_by_membership_id: f.member, verified_at: new Date(),
    });
    await link(f.student);
    const secondLink = await link(f.student2);
    const unrelated = await put(admin as unknown as Query, 'student_profiles', {
      tenant_id: f.tenant, student_code: `R9-${randomUUID()}`, full_name: 'Unrelated student', status: 'ACTIVE',
    });
    const base = `/api/v1/tenants/${f.tenant}`;
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.login(parent.email, password, f.tenant);
      const gate = await b.deferResponse(`${base}/portal/children/${f.student}`);
      await b.route(`/app/${f.tenant}/parent/children/${f.student}`);
      expect(await gate.waitPaused()).toBe(200);
      await b.route(`/app/${f.tenant}/parent/children/${f.student2}`);
      await b.wait(`document.querySelector('.portal-heading p')?.textContent.includes('Student Two')`, 'SECOND_CHILD_FINISHED');
      expect(b.network.some(r => r.path === `${base}/portal/children/${f.student2}` && r.status === 200)).toBe(true);
      const resumed = await gate.release();
      const settled = await gate.waitSettled();
      await b.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      expect(await b.evaluate<boolean>(`location.pathname.endsWith(${JSON.stringify(`/parent/children/${f.student2}`)})
        && document.querySelector('.portal-heading p')?.textContent.includes('Student Two')
        && !document.querySelector('.portal-heading p')?.textContent.includes('Student One')`)).toBe(true);
      await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=${secondLink}`;
      await b.route(`/app/${f.tenant}/parent`);
      await b.wait('document.querySelector("#portal-parent-child")?.options.length === 1', 'REVALIDATED_LINKS');
      expect(await b.evaluate<string>('document.querySelector("#portal-parent-child")?.value')).toBe(f.student);
      await b.route(`/app/${f.tenant}/parent/children/${f.student2}`);
      await b.wait(`document.querySelector('.portal-state h2')?.textContent.includes('Không thể tải dữ liệu')
        && !document.querySelector('.portal-heading')`, 'REVOKED_CHILD_STATE');
      expect(b.network.some(r => r.path === `${base}/portal/children/${f.student2}` && r.status === 404)).toBe(true);
      await b.route(`/app/${f.tenant}/parent/children/${unrelated}`);
      await b.wait(`document.querySelector('.portal-state h2')?.textContent.includes('Không thể tải dữ liệu')
        && !document.querySelector('.portal-heading')`, 'UNRELATED_CHILD_STATE');
      expect(b.network.some(r => r.path === `${base}/portal/children/${unrelated}` && r.status === 404)).toBe(true);
      return { browser: b.browserVersion, aResponseStatus: 200, delayedSettled: settled,
        releaseAccepted: resumed, bFirst: true, revokedDenied: true, unrelatedDenied: true };
    });
    expect((await request(app.getHttpServer()).get(`${base}/portal/children/${f.student2}`)
      .auth(parent.accessToken, { type: 'bearer' })).status).toBe(404);
    (evidence.cases as Record<string, unknown>).r9Race = browser;
  }, 120_000);
  it.skipIf(!browserAvailable)('R9.2 Teacher Student assignment browser lifecycle', async () => {
    const f = await fresh({ enrollmentFrom: '2020-01-01T00:00:00Z' });
    const teacher = await actor(f, 'TEACHER', 'CLASS', f.classId);
    const student = await actor(f, 'STUDENT', 'STUDENT', f.student);
    const parent = await actor(f, 'PARENT');
    await put(admin as unknown as Query, 'parent_student_links', {
      tenant_id: f.tenant, parent_membership_id: parent.member, student_id: f.student,
      relationship: 'PARENT', evidence_reference: 'R9 learning browser fixture',
      verified_by_membership_id: f.member, verified_at: new Date(),
    });
    await admin`UPDATE teacher_profiles SET membership_id=${teacher.member} WHERE tenant_id=${f.tenant} AND id=${f.teacher}`;
    await admin`UPDATE student_profiles SET membership_id=${student.member} WHERE tenant_id=${f.tenant} AND id=${f.student}`;
    await put(admin as unknown as Query, 'class_teacher_assignments', {
      tenant_id: f.tenant, class_id: f.classId, teacher_id: f.teacher,
      role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: f.member,
    });
    const base = `/api/v1/tenants/${f.tenant}`;
    const title = `R9 browser assignment ${randomUUID()}`;
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.viewport(1280, 800, false);
      await b.login(teacher.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/teaching/assignments/new`);
      await b.wait('!!document.querySelector(".as-actions button")', 'ASSIGNMENT_FORM');
      await b.fill('.as-field input:not([type])', title);
      await b.select('.as-field select', f.classId);
      await b.fill('.as-field textarea', 'A real browser assignment');
      await b.value('.as-field input[type="datetime-local"]', '2099-10-05T10:00');
      await b.wait('!document.querySelector(".as-actions button:last-child")?.disabled', 'VALID_ASSIGNMENT');
      await b.evaluate('window.confirm = () => true');
      await b.click('.as-actions button:last-child');
      await b.wait(`location.pathname.includes('/teaching/assignments/') && document.querySelector('.as-page')?.textContent.includes(${JSON.stringify(title)})`, 'PUBLISHED_ASSIGNMENT');
      const [assignment] = await admin`SELECT id,status,revision FROM assignments WHERE tenant_id=${f.tenant} AND title=${title}`;
      expect(assignment).toMatchObject({ status: 'PUBLISHED', revision: 2 });
      const [recipient] = await admin`SELECT id FROM assignment_recipients WHERE assignment_id=${assignment.id} AND student_id=${f.student} AND revoked_at IS NULL`;
      expect(recipient?.id).toBeTruthy();
      expect((await admin`SELECT count(*)::int n FROM outbox_events WHERE tenant_id=${f.tenant} AND aggregate_id=${assignment.id}`)[0].n).toBe(1);
      await request(app.getHttpServer()).get(`${base}/assignments/${assignment.id}`)
        .auth(student.accessToken, { type: 'bearer' }).expect(200);
      await b.login(student.email, password, f.tenant);
      await request(app.getHttpServer()).get(`${base}/teaching/assignments/${assignment.id}/recipients`)
        .auth(student.accessToken, { type: 'bearer' }).expect(403);
      await b.route(`/app/${f.tenant}/teaching/assignments/${assignment.id}`);
      await b.wait(`document.querySelector('.ec-error-page .ec-error-card span')?.textContent === '403'`,
        'STUDENT_TEACHER_URL_FORBIDDEN');
      await b.route(`/app/${f.tenant}/my/assignments/${assignment.id}`);
      await b.wait(`document.querySelector('.as-page')?.textContent.includes(${JSON.stringify(title)}) && !!document.querySelector('.as-field textarea')`, 'STUDENT_ASSIGNMENT');
      await b.fill('.as-field textarea', 'R9 submitted answer');
      await b.wait('!document.querySelector(".as-actions button")?.disabled || Array.from(document.querySelectorAll("button")).some(x => x.textContent.includes("Nộp bài") && !x.disabled)', 'SUBMISSION_READY');
      await b.evaluate('Array.from(document.querySelectorAll("button")).find(x => x.textContent.includes("Nộp bài"))?.click()');
      await b.wait('!!document.querySelector(".as-notice") || !!document.querySelector(".as-error")', 'SUBMISSION_RESULT');
      expect(b.network.some(r => r.path.endsWith(`/assignment-recipients/${recipient.id}/submissions`) && r.method === 'POST' && r.status === 201),
        JSON.stringify(b.network.filter(r => r.path.endsWith(`/assignment-recipients/${recipient.id}/submissions`)))).toBe(true);
      const [submission] = await admin`SELECT s.id,s.current_version_id FROM submissions s WHERE s.recipient_id=${recipient.id}`;
      expect(submission?.current_version_id).toBeTruthy();
      await b.login(teacher.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/teaching/submissions/${submission.id}/grade`);
      await b.wait('!!document.querySelector(".as-actions button")', 'GRADE_FORM');
      await b.fill('.as-field input[inputmode="decimal"]', '8.5');
      await b.fill('.as-field textarea', 'Reviewed in R9 browser');
      await b.click('.as-actions button:first-child');
      await b.wait('document.querySelector(".as-page")?.textContent.includes("DRAFT")', 'GRADE_DRAFT');
      const [draft] = await admin`SELECT id,status,revision_no FROM grades WHERE submission_version_id=${submission.current_version_id}`;
      expect(draft.status).toBe('DRAFT');
      await request(app.getHttpServer()).get(`${base}/submission-versions/${submission.current_version_id}/grade-draft`)
        .auth(student.accessToken, { type: 'bearer' }).expect(403);
      await b.login(student.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/my/assignments/${assignment.id}`);
      await b.wait(`document.querySelector('.as-page')?.textContent.includes(${JSON.stringify(title)})`,
        'STUDENT_DRAFT_GRADE_DETAIL');
      expect(await b.evaluate<boolean>(`!document.querySelector('.as-page')?.textContent.includes('8.5/10')`)).toBe(true);
      await b.route(`/app/${f.tenant}/student`);
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes(${JSON.stringify(title)})`,
        'STUDENT_DRAFT_GRADE_HOME');
      expect(await b.evaluate<boolean>(`!document.querySelector('.portal-page')?.textContent.includes('8,5')`)).toBe(true);
      await b.login(parent.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/parent/children/${f.student}`);
      await b.wait(`document.querySelector('.portal-heading p')?.textContent.includes('Student One')`, 'PARENT_DRAFT_CHILD');
      await b.click('.portal-tabs button:nth-child(3)');
      await b.wait(`document.querySelector('.portal-list')?.textContent.includes(${JSON.stringify(title)})`, 'PARENT_DRAFT_ASSIGNMENT');
      expect(await b.evaluate<boolean>(`!document.querySelector('.portal-list')?.textContent.includes('8,5')
        && !document.querySelector('.portal-list')?.textContent.includes('8.5')`)).toBe(true);
      await b.login(teacher.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/teaching/submissions/${submission.id}/grade`);
      await b.wait(`document.querySelector('.as-page')?.textContent.includes('DRAFT')`, 'RETURN_TO_GRADE_DRAFT');
      await b.evaluate('window.confirm = () => true');
      await b.click('.as-actions button:last-child');
      await b.wait('document.querySelector(".as-page")?.textContent.includes("PUBLISHED")', 'GRADE_PUBLISHED');
      expect((await admin`SELECT status FROM grades WHERE id=${draft.id}`)[0].status).toBe('PUBLISHED');
      await b.login(student.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/my/assignments/${assignment.id}`);
      await b.wait('document.querySelector(".as-page")?.textContent.includes("8.5/10")', 'STUDENT_PUBLISHED_GRADE');
      await b.login(parent.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/parent/children/${f.student}`);
      await b.wait(`document.querySelector('.portal-heading p')?.textContent.includes('Student One')`, 'PARENT_PUBLISHED_CHILD');
      await b.click('.portal-tabs button:nth-child(3)');
      await b.wait(`document.querySelector('.portal-list')?.textContent.includes(${JSON.stringify(title)})
        && document.querySelector('.portal-list')?.textContent.includes('8,5')`, 'PARENT_PUBLISHED_GRADE');
      await b.login(teacher.email, password, f.tenant);
      await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${teacher.assignment}`;
      const revokedList = await request(app.getHttpServer()).get(`${base}/teaching/assignments`)
        .auth(teacher.accessToken, { type: 'bearer' }).expect(200);
      expect(revokedList.body).toEqual([]);
      await b.route(`/app/${f.tenant}/teaching/assignments`);
      await b.wait(`(document.querySelector('.ec-error-page .ec-error-card span')?.textContent === '403'
        || (document.querySelector('.as-page .as-list')?.children.length === 0
          && document.querySelector('.as-page')?.textContent.includes('Không có bài tập phù hợp')))
        && !document.body.textContent.includes(${JSON.stringify(title)})`, 'TEACHER_REVOKED_FINAL_STATE');
      await request(app.getHttpServer()).get(`${base}/teaching/assignments/${assignment.id}/recipients`)
        .auth(teacher.accessToken, { type: 'bearer' }).expect(403);
      await b.route(`/app/${f.tenant}/teaching/assignments/${assignment.id}`);
      await b.wait(`(document.querySelector('.ec-error-page .ec-error-card span')?.textContent === '403'
        || !!document.querySelector('.as-page [role="alert"]')
        || (document.querySelector('.as-page h1')?.textContent.includes('Chi tiết bài tập')
          && document.querySelector('.as-card h2')?.textContent.includes('Không tìm thấy')))
        && !document.body.textContent.includes(${JSON.stringify(title)})`, 'TEACHER_DIRECT_URL_DENIED');
      return { browserVersion: b.browserVersion, responses: b.network.filter(r => r.path.startsWith(base)) };
    });
    (evidence.cases as Record<string, unknown>).r9Learning = { browser: browser.browserVersion,
      network: browser.responses, assignmentPublished: true, submissionPersisted: true,
      draftPrivate: true, gradePublished: true, parentPublishedOnly: true,
      studentTeacherResourceDenied: true, revokedTeacherDenied: true };
  }, 120_000);
  it.skipIf(!browserAvailable)('R9.2 Manager schedule preview confirmation and conflict browser', async () => {
    const startsAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const f = await fresh({ start: startsAt, end: new Date(Date.parse(startsAt) + 3_600_000).toISOString(),
      enrollmentFrom: '2020-01-01T00:00:00Z', policyEffectiveFrom: '2020-01-01T00:00:00Z' });
    const student = await actor(f, 'STUDENT', 'STUDENT', f.student);
    await admin`UPDATE student_profiles SET membership_id=${student.member} WHERE tenant_id=${f.tenant} AND id=${f.student}`;
    const [course] = await admin`SELECT subject_id,level_id FROM courses WHERE id=${f.course}`;
    await put(admin as unknown as Query, 'teacher_competencies', {
      tenant_id: f.tenant, teacher_id: f.teacher, subject_id: course.subject_id,
      level_id: course.level_id, verified_at: '2025-01-01',
    });
    await put(admin as unknown as Query, 'class_teacher_assignments', {
      tenant_id: f.tenant, class_id: f.classId, teacher_id: f.teacher,
      role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: f.member,
    });
    const teacher = await actor(f, 'TEACHER', 'CLASS', f.classId);
    await admin`UPDATE teacher_profiles SET membership_id=${teacher.member} WHERE tenant_id=${f.tenant} AND id=${f.teacher}`;
    const unrelatedTeacher = await put(admin as unknown as Query, 'teacher_profiles', {
      tenant_id: f.tenant, teacher_code: `R9-${randomUUID()}`, full_name: 'Unrelated teacher', status: 'ACTIVE',
    });
    const unrelatedSession = await put(admin as unknown as Query, 'class_sessions', {
      tenant_id: f.tenant, class_id: f.class2, teacher_id: unrelatedTeacher,
      delivery_mode: 'ONLINE', starts_at: new Date(Date.parse(startsAt) + 2 * 3_600_000),
      ends_at: new Date(Date.parse(startsAt) + 3 * 3_600_000), status: 'DRAFT', revision: 1,
      policy_version_id: f.policy,
    });
    const manager = await sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}`;
    const [classRow] = await admin`SELECT name FROM classes WHERE id=${f.classId}`;
    const bearer = (r: request.Test) => r.set('Authorization', `Bearer ${manager.accessToken}`);
    const before = await admin`SELECT count(*)::int n FROM resource_bookings WHERE session_id=${f.session}`;
    expect(before[0].n).toBe(0);
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.viewport(1280, 800, false);
      await b.login(manager.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/schedule/sessions/${f.session}`);
      await b.wait('Array.from(document.querySelectorAll(".attendance-primary")).some(x => x.textContent.includes("Xác nhận buổi") && !x.disabled)', 'SCHEDULE_PREVIEW_READY');
      expect((await admin`SELECT status FROM class_sessions WHERE id=${f.session}`)[0].status).toBe('DRAFT');
      expect(b.network.some(r => r.path === `${base}/scheduling/drafts/${f.session}/preview` && r.status === 200)).toBe(true);
      await b.evaluate('Array.from(document.querySelectorAll(".attendance-primary")).find(x => x.textContent.includes("Xác nhận buổi"))?.click()');
      await until(async () => b.network.some(r => r.path === `${base}/scheduling/sessions/${f.session}/confirm` && r.status === 201), 'SCHEDULE_CONFIRM_HTTP');
      expect((await admin`SELECT status FROM class_sessions WHERE id=${f.session}`)[0].status).toBe('CONFIRMED');
      expect((await admin`SELECT count(*)::int n FROM resource_bookings WHERE session_id=${f.session}`)[0].n).toBeGreaterThan(0);
      expect((await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant} AND entity_id=${f.session}`)[0].n).toBeGreaterThan(0);
      const [times] = await admin`SELECT starts_at,ends_at FROM class_sessions WHERE id=${f.session}`;
      const conflict = await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions`))
        .set('Idempotency-Key', randomUUID()).send({ classId: f.classId, teacherId: f.teacher,
          deliveryMode: 'ONLINE', startsAt: times.starts_at, endsAt: times.ends_at,
          reason: 'R9 conflict fixture' }).expect(201);
      await b.route(`/app/${f.tenant}/schedule/sessions/${conflict.body.id}`);
      await b.wait('Array.from(document.querySelectorAll(".attendance-primary")).some(x => x.textContent.includes("Xác nhận buổi") && x.disabled)', 'SCHEDULE_CONFLICT_PREVIEW');
      expect(b.network.some(r => r.path === `${base}/scheduling/drafts/${conflict.body.id}/preview` && r.status === 200)).toBe(true);
      await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions/${conflict.body.id}/confirm`))
        .set('Idempotency-Key', randomUUID()).send({ reason: 'Expected conflict' }).expect(409);
      expect((await admin`SELECT status FROM class_sessions WHERE id=${conflict.body.id}`)[0].status).toBe('DRAFT');
      await b.login(teacher.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/teacher`);
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes(${JSON.stringify(classRow.name)})`,
        'TEACHER_ASSIGNED_SESSION');
      await request(app.getHttpServer()).get(`${base}/scheduling/sessions/${unrelatedSession}`)
        .auth(teacher.accessToken, { type: 'bearer' }).expect(404);
      await b.route(`/app/${f.tenant}/schedule/sessions/${unrelatedSession}`);
      await b.wait(`!!document.querySelector('.attendance-page [role="alert"]')
        && !document.querySelector('.attendance-page')?.textContent.includes('Class Two')`,
        'TEACHER_UNRELATED_SESSION_DENIED');
      await b.viewport(390, 844, true);
      await b.login(student.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/student`);
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes(${JSON.stringify(classRow.name)})`,
        'MOBILE_STUDENT_ASSIGNED_SCHEDULE');
      await b.route(`/app/${f.tenant}/my/schedule`);
      await b.wait(`document.querySelector('.attendance-page')?.textContent.includes(${JSON.stringify(classRow.name)})`,
        'MOBILE_STUDENT_CALENDAR');
      return { browserVersion: b.browserVersion, responses: b.network.filter(r => r.path.startsWith(base)) };
    });
    (evidence.cases as Record<string, unknown>).r9Manager = { browser: browser.browserVersion,
      network: browser.responses, previewUnreserved: true, confirmedBooking: true,
      auditPersisted: true, conflictRejected: true, teacherAssignedOnly: true, mobileStudentSchedule: true };
  }, 120_000);
  it.skipIf(!browserAvailable)('R9.2 Manager approved leave attendance finalization and lock browser', async () => {
    const start = new Date(Date.now() + 8_000).toISOString();
    const f = await fresh({ start, end: new Date(Date.parse(start) + 3_600_000).toISOString(),
      enrollmentFrom: '2020-01-01T00:00:00Z',
      policyEffectiveFrom: '2020-01-01T00:00:00Z' });
    const [course] = await admin`SELECT subject_id,level_id FROM courses WHERE id=${f.course}`;
    await put(admin as unknown as Query, 'teacher_competencies', {
      tenant_id: f.tenant, teacher_id: f.teacher, subject_id: course.subject_id,
      level_id: course.level_id, verified_at: '2025-01-01',
    });
    await admin`UPDATE teacher_profiles SET membership_id=${f.member} WHERE tenant_id=${f.tenant} AND id=${f.teacher}`;
    await put(admin as unknown as Query, 'class_teacher_assignments', {
      tenant_id: f.tenant, class_id: f.classId, teacher_id: f.teacher,
      role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: f.member,
    });
    const manager = await sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}`;
    await request(app.getHttpServer()).post(`${base}/scheduling/sessions/${f.session}/confirm`)
      .auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Attendance browser fixture' }).expect(201);
    await put(admin as unknown as Query, 'absence_requests', {
      tenant_id: f.tenant, participant_id: f.participant, requester_membership_id: f.member,
      submitted_at: new Date(Date.parse(start) - 2 * 86_400_000), reason: 'Synthetic approved leave',
      is_late_notice: false, status: 'APPROVED', approved_by_membership_id: f.member,
      decided_at: new Date(Date.parse(start) - 86_400_000),
    });
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.login(manager.email, password, f.tenant);
      await until(async () => Date.now() >= Date.parse(start), 'ATTENDANCE_START_BOUNDARY');
      await b.route(`/app/${f.tenant}/sessions/${f.session}/attendance`);
      await b.wait(`!!document.querySelector('select[aria-label^="Điểm danh"] option[value="EXCUSED"]:not([disabled])')`,
        'APPROVED_LEAVE_ELIGIBLE');
      await b.select('select[aria-label^="Điểm danh"]', 'EXCUSED');
      await b.evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
      await b.click('.attendance-actions button:first-child');
      await until(async () => b.network.some(r => r.path === `${base}/attendance/sessions/${f.session}/marks`
        && r.method === 'POST') || b.evaluate<boolean>('!!document.querySelector(".attendance-page [role=alert]")'), 'BROWSER_MARK_RESULT');
      expect(b.network.filter(r => r.path === `${base}/attendance/sessions/${f.session}/marks` && r.method === 'POST')
        .map(r => r.status), JSON.stringify({ alert: await b.evaluate<boolean>('!!document.querySelector(".attendance-page [role=alert]")') })).toContain(201);
      await b.wait(`!!document.querySelector('.attendance-actions button:last-child:not([disabled])')`, 'FINALIZE_READY');
      await b.click('.attendance-actions button:last-child');
      await until(async () => b.network.some(r => r.path === `${base}/attendance/sessions/${f.session}/finalize`
        && r.method === 'POST' && r.status === 201), 'BROWSER_ATTENDANCE_FINALIZED');
      await b.wait(`!document.querySelector('select[aria-label^="Điểm danh"]')
        && document.querySelector('.attendance-page')?.textContent.includes('EXCUSED')`, 'FINALIZED_READ_ONLY');
      const sheet = await request(app.getHttpServer()).get(`${base}/attendance/sessions/${f.session}`)
        .auth(manager.accessToken, { type: 'bearer' }).expect(200);
      expect(sheet.body.finalized).toBe(true);
      expect(sheet.body.participants[0]).toMatchObject({ status: 'EXCUSED', approvedLeave: true });
      await request(app.getHttpServer()).post(`${base}/attendance/sessions/${f.session}/marks`)
        .auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
        .send({ participantId: f.participant, status: 'ATTENDED', revision: sheet.body.participants[0].revision,
          reason: 'Must remain locked' }).expect(422);
      return { browserVersion: b.browserVersion, responses: b.network.filter(r => r.path.startsWith(base)) };
    });
    (evidence.cases as Record<string, unknown>).r9Attendance = { browser: browser.browserVersion,
      network: browser.responses, approvedLeaveEligible: true, excusedPersisted: true,
      finalizedReadOnly: true, lockedWriteDenied: true };
  }, 120_000);
  it.skipIf(!browserAvailable)('R9.2 Student leave submission and Manager approval browser', async () => {
    const start = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const f = await fresh({ start, end: new Date(Date.parse(start) + 3_600_000).toISOString(),
      enrollmentFrom: '2020-01-01T00:00:00Z', policyEffectiveFrom: '2020-01-01T00:00:00Z' });
    const student = await actor(f, 'STUDENT', 'STUDENT', f.student);
    await admin`UPDATE student_profiles SET membership_id=${student.member} WHERE tenant_id=${f.tenant} AND id=${f.student}`;
    const [course] = await admin`SELECT subject_id,level_id FROM courses WHERE id=${f.course}`;
    await put(admin as unknown as Query, 'teacher_competencies', {
      tenant_id: f.tenant, teacher_id: f.teacher, subject_id: course.subject_id,
      level_id: course.level_id, verified_at: '2025-01-01',
    });
    await put(admin as unknown as Query, 'class_teacher_assignments', {
      tenant_id: f.tenant, class_id: f.classId, teacher_id: f.teacher,
      role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: f.member,
    });
    const manager = await sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}`;
    await request(app.getHttpServer()).post(`${base}/scheduling/sessions/${f.session}/confirm`)
      .auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Leave browser fixture' }).expect(201);
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.login(student.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/leave-requests/new`);
      await b.wait(`!!document.querySelector('select option[value=${JSON.stringify(f.participant)}]')`, 'STUDENT_LEAVE_ELIGIBLE');
      await b.select('.attendance-field select', f.participant);
      await b.fill('.attendance-field input', 'R9 browser leave');
      await b.click('.attendance-primary');
      await until(async () => b.network.some(r => r.path === `${base}/attendance/leaves`
        && r.method === 'POST' && r.status === 201), 'STUDENT_LEAVE_SUBMITTED');
      const [leave] = await admin`SELECT id,status,is_late_notice FROM absence_requests WHERE tenant_id=${f.tenant}
        AND participant_id=${f.participant} ORDER BY submitted_at DESC LIMIT 1`;
      expect(leave).toMatchObject({ status: 'PENDING_APPROVAL', is_late_notice: false });
      await b.login(manager.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/leave-requests`);
      await b.wait(`document.querySelector('.attendance-page li')?.textContent.includes('PENDING_APPROVAL')
        && !!document.querySelector('.attendance-page li .attendance-primary')`, 'MANAGER_LEAVE_REVIEW');
      await b.fill('.attendance-page li .attendance-field input', 'Approved for R9 browser');
      await b.click('.attendance-page li .attendance-primary');
      await until(async () => b.network.some(r => r.path === `${base}/attendance/leaves/${leave.id}/approve`
        && r.method === 'POST' && r.status === 201), 'MANAGER_LEAVE_APPROVED');
      await b.wait(`document.querySelector('.attendance-page li')?.textContent.includes('APPROVED')`, 'APPROVED_LEAVE_VISIBLE');
      expect((await admin`SELECT status FROM absence_requests WHERE id=${leave.id}`)[0].status).toBe('APPROVED');
      await b.login(student.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/leave-requests`);
      await b.wait(`document.querySelector('.attendance-page li')?.textContent.includes('APPROVED')
        && !document.querySelector('.attendance-page li .attendance-primary')`, 'STUDENT_APPROVED_READ_ONLY');
      return { browserVersion: b.browserVersion, responses: b.network.filter(r => r.path.startsWith(base)) };
    });
    (evidence.cases as Record<string, unknown>).r9Leave = { browser: browser.browserVersion,
      network: browser.responses, studentSubmitted: true, managerApproved: true,
      studentDecisionDenied: true };
  }, 120_000);
  it.skipIf(!browserAvailable)('R9.2 Tenant switch clears academic records and handles final states', async () => {
    const a = await fresh();
    const bTenant = await fresh();
    await admin`UPDATE tenants SET name='R9 Tenant A' WHERE id=${a.tenant}`;
    await admin`UPDATE tenants SET name='R9 Tenant B' WHERE id=${bTenant.tenant}`;
    await admin`UPDATE classes SET name='R9 A class' WHERE id=${a.classId}`;
    await admin`UPDATE classes SET name='R9 B class' WHERE id=${bTenant.classId}`;
    const secondMembership = await put(admin as unknown as Query, 'tenant_memberships', {
      tenant_id: bTenant.tenant, user_id: a.user, status: 'ACTIVE',
    });
    const [managerRole] = await admin`SELECT id FROM roles WHERE tenant_id=${bTenant.tenant} AND code='MANAGER'`;
    const secondRole = await put(admin as unknown as Query, 'membership_roles', {
      tenant_id: bTenant.tenant, membership_id: secondMembership, role_id: managerRole.id,
      assigned_by_membership_id: bTenant.member,
    });
    await put(admin as unknown as Query, 'access_scopes', {
      tenant_id: bTenant.tenant, membership_role_id: secondRole, scope_kind: 'TENANT',
    });
    const student = await actor(bTenant, 'STUDENT', 'STUDENT', bTenant.student);
    await admin`UPDATE student_profiles SET membership_id=${student.member}
      WHERE tenant_id=${bTenant.tenant} AND id=${bTenant.student}`;
    const manager = await sessionFor(a);
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.login(manager.email, password, a.tenant);
      await b.route(`/app/${a.tenant}/classes`);
      await b.wait(`document.querySelector('.academic-table tbody')?.textContent.includes('R9 A class')`, 'TENANT_A_CLASS');
      await b.route('/select-tenant');
      await b.wait(`document.querySelectorAll('.ec-tenant-choice').length === 2
        && !document.body.textContent.includes('R9 A class')`, 'TENANT_SWITCH_CHOICES');
      await b.evaluate(`Array.from(document.querySelectorAll('.ec-tenant-choice'))
        .find(x => x.textContent.includes('R9 Tenant B'))?.click()`);
      await b.wait(`location.pathname.startsWith(${JSON.stringify(`/app/${bTenant.tenant}/`)})
        && !!document.querySelector('.app-shell')`, 'TENANT_B_SELECTED');
      await b.route(`/app/${bTenant.tenant}/classes`);
      await b.wait(`document.querySelector('.academic-table tbody')?.textContent.includes('R9 B class')
        && !document.body.textContent.includes('R9 A class')`, 'TENANT_B_CLASS_ONLY');
      await b.route(`/app/${a.tenant}/classes`);
      await b.wait(`document.querySelector('.ec-error-page .ec-error-card span')?.textContent === '403'
        && !document.body.textContent.includes('R9 A class')`, 'OLD_TENANT_FORBIDDEN');
      await b.route(`/app/${bTenant.tenant}/schedule`);
      await b.wait(`document.querySelector('.attendance-page')?.textContent.includes('Không có buổi học')
        && !document.querySelector('.attendance-page [role="status"]')`, 'EMPTY_CALENDAR_FINAL');
      await admin`UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=${a.user}
        AND active_tenant_id=${bTenant.tenant} AND revoked_at IS NULL`;
      await b.route(`/app/${bTenant.tenant}/classes`);
      await b.wait(`!!document.querySelector('.academic-page [role="alert"]')
        && !document.body.textContent.includes('R9 B class')`, 'REVOKED_SESSION_FINAL_STATE');
      expect(b.network.some(r => r.path.startsWith(`/api/v1/tenants/${bTenant.tenant}/academic/classes`)
        && r.status === 401)).toBe(true);
      await b.click('.top-actions button');
      await b.route(`/app/${bTenant.tenant}/classes`);
      await b.wait(`document.querySelector('.state-page h1')?.textContent.includes('Cần đăng nhập')`,
        'LOGGED_OUT_PROTECTED_ROUTE');
      const emptyGate = await b.deferResponse(`/api/v1/tenants/${bTenant.tenant}/my/assignments`);
      await b.login(student.email, password, bTenant.tenant);
      await b.route(`/app/${bTenant.tenant}/student`);
      expect(await emptyGate.waitPaused()).toBe(200);
      expect(await b.evaluate<boolean>(`document.querySelector('.portal-state h2')?.textContent.includes('Đang tải dữ liệu')`)).toBe(true);
      await emptyGate.release();
      await emptyGate.waitSettled();
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes('Hiện chưa có bài tập sắp hạn')
        && !document.querySelector('.portal-state')`, 'STUDENT_SUCCESSFUL_EMPTY_AFTER_LOADING');
      return { browserVersion: b.browserVersion, responses: b.network.filter(r => r.path.startsWith('/api/v1/tenants/')) };
    });
    (evidence.cases as Record<string, unknown>).r9TenantSwitch = { browser: browser.browserVersion,
      network: browser.responses, tenantAHidden: true, tenantBShown: true,
      oldTenantForbidden: true, successfulEmpty: true, revokedSessionDenied: true,
      loggedOutDenied: true, loadingVsEmpty: true };
  }, 120_000);
  it('D01 restricted runtime starts; anonymous principal cannot bind', async () => {
    expect(() => auth.me('invalid')).toThrow('AUTH_REQUIRED');
    await expect(
      repository.api.$queryRawUnsafe('SELECT * FROM public.credentials'),
    ).rejects.toThrow(/permission denied/);
  });
  it('A01 real login, tenant selection and authenticated HTTP', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toBeTypeOf('string');
    expect(login.body.refreshToken).toBeUndefined();
    expect(login.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    const selected = await request(app.getHttpServer())
      .post('/api/v1/auth/select-tenant')
      .auth(login.body.accessToken, { type: 'bearer' })
      .send({ tenantId: fixture.tenant })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(selected.body.accessToken, { type: 'bearer' })
      .expect(200);
    expect(me.body.tenantId).toBe(fixture.tenant);
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
  native(
    'A02 wrong password, inactive account and temporary lock fail closed',
    async () => {
      const f = await fresh();
      const s = await sessionFor(f);
      for (let i = 0; i < 5; i++)
        await expect(auth.login(s.email, 'incorrect password')).rejects.toThrow(
          'INVALID_CREDENTIALS',
        );
      await expect(auth.login(s.email, password)).rejects.toThrow(
        'INVALID_CREDENTIALS',
      );
      const [c] =
        await admin`SELECT failed_attempts,locked_until>clock_timestamp() locked FROM credentials WHERE user_id=${f.user}`;
      expect(c).toMatchObject({ failed_attempts: 5, locked: true });
    },
  );
  native(
    'A03 wrong tenant and malicious principal fields are rejected by HTTP',
    async () => {
      const s = await sessionFor(fixture),
        other = await fresh();
      await request(app.getHttpServer())
        .post('/api/v1/auth/select-tenant')
        .auth(s.accessToken, { type: 'bearer' })
        .send({ tenantId: other.tenant })
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/auth/select-tenant')
        .auth(s.accessToken, { type: 'bearer' })
        .send({ tenantId: fixture.tenant, userId: other.user })
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${other.tenant}/roles`)
        .auth(s.accessToken, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/tenants/invalid/roles')
        .auth(s.accessToken, { type: 'bearer' })
        .expect(400);
    },
  );
  native(
    'A04 refresh rotates, old-token replay revokes the session',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      const rotated = await auth.refresh(s.refreshToken, s.csrfToken);
      expect(rotated.refreshToken).not.toBe(s.refreshToken);
      await expect(auth.refresh(s.refreshToken, s.csrfToken)).rejects.toThrow(
        'AUTH_REQUIRED',
      );
      await expect(auth.me(rotated.accessToken)).rejects.toThrow();
    },
  );
  native(
    'A05 cookie refresh requires allowlisted Origin and session CSRF',
    async () => {
      const s = await sessionFor(await fresh());
      const cookie = 'educore_refresh=' + s.refreshToken;
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .expect(403);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
        .set('X-CSRF-Token', s.csrfToken)
        .expect(200);
    },
  );
  native('A06 logout immediately invalidates access and refresh', async () => {
    const s = await sessionFor(await fresh());
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .auth(s.accessToken, { type: 'bearer' })
      .expect(204);
    await expect(auth.me(s.accessToken)).rejects.toThrow();
    await expect(auth.refresh(s.refreshToken, s.csrfToken)).rejects.toThrow();
  });
  native(
    'A07 OTP generic response, atomic reset, one use and old session revocation',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      const known = await request(app.getHttpServer())
        .post('/api/v1/auth/password/otp/request')
        .send({ email: s.email })
        .expect(202);
      const unknown = await request(app.getHttpServer())
        .post('/api/v1/auth/password/otp/request')
        .send({ email: randomUUID() + '@r4.invalid' })
        .expect(202);
      expect(known.body).toEqual(unknown.body);
      expect(await recoveryWorker.tick()).toBe('DONE');
      const otp = delivery.messages.at(-1)!.otp;
      const newPassword = 'New password 123!';
      await request(app.getHttpServer())
        .post('/api/v1/auth/password/reset')
        .send({ email: s.email, otp, newPassword })
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/v1/auth/password/reset')
        .send({ email: s.email, otp, newPassword })
        .expect(400);
      await expect(auth.me(s.accessToken)).rejects.toThrow();
      await expect(auth.login(s.email, password)).rejects.toThrow();
      expect((await auth.login(s.email, newPassword)).accessToken).toBeTypeOf(
        'string',
      );
      const [row] =
        await admin`SELECT c.password_hash,o.otp_hash,o.consumed_at FROM credentials c JOIN password_reset_otps o ON o.user_id=c.user_id WHERE c.user_id=${f.user}`;
      expect(row.password_hash).toMatch(/^\$argon2id\$/);
      expect(row.otp_hash).not.toContain(otp);
      expect(row.consumed_at).not.toBeNull();
      const [securityEvent] =
        await admin`SELECT entity_type,entity_id FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='PASSWORD_PASSWORD_RESET'`;
      expect(securityEvent).toMatchObject({
        entity_type: 'User',
        entity_id: f.user,
      });
    },
  );
  native('A08 OTP expiry, attempt exhaustion and password policy', async () => {
    const f = await fresh(),
      s = await sessionFor(f);
    await auth.requestOtp(s.email, 'PASSWORD_RESET');
    expect(await recoveryWorker.tick()).toBe('DONE');
    const otp = delivery.messages.at(-1)!.otp;
    for (let i = 0; i < 5; i++)
      await expect(
        auth.reset(
          s.email,
          otp === '000000' ? '111111' : '000000',
          password,
          'PASSWORD_RESET',
        ),
      ).rejects.toThrow('INVALID_OTP');
    await expect(
      auth.reset(s.email, otp, password, 'PASSWORD_RESET'),
    ).rejects.toThrow('INVALID_OTP');
    await expect(
      auth.reset(s.email, otp, 'short', 'PASSWORD_RESET'),
    ).rejects.toThrow('PASSWORD_POLICY');
  });
  native('A08b wrong OTP purpose leaves password and session unchanged', async () => {
    const f = await fresh(), s = await sessionFor(f);
    await auth.requestOtp(s.email, 'PASSWORD_RESET');
    expect(await recoveryWorker.tick()).toBe('DONE');
    const otp = delivery.messages.at(-1)!.otp;
    await expect(auth.reset(s.email, otp, 'new password 123', 'ACTIVATION')).rejects.toThrow('INVALID_OTP');
    expect(await auth.me(s.accessToken)).toBeTruthy();
    expect((await auth.login(s.email, password)).accessToken).toBeTypeOf('string');
    await auth.reset(s.email, otp, 'new password 123', 'PASSWORD_RESET');
    await expect(auth.login(s.email, password)).rejects.toThrow('INVALID_CREDENTIALS');
  });
  native('A08c PostgreSQL OTP throttle and per-user resend window', async () => {
    const f = await fresh(), s = await sessionFor(f);
    const ip = randomUUID();
    for (let attempt = 0; attempt < 10; attempt++) expect(await auth.throttle(ip, 'otp', 10)).toBe(true);
    expect(await auth.throttle(ip, 'otp', 10)).toBe(false);
    const before = delivery.messages.length;
    await auth.requestOtp(s.email, 'PASSWORD_RESET');
    await auth.requestOtp(s.email, 'PASSWORD_RESET');
    expect(await recoveryWorker.tick()).toBe('DONE');
    expect(delivery.messages.length - before).toBe(1);
    const [row] = await admin`SELECT count(*)::int count FROM password_reset_otps WHERE user_id=${f.user} AND purpose='PASSWORD_RESET'`;
    expect(row.count).toBe(1);
  });
  native(
    'A09 bootstrap O-11 A, operator provenance, activation and no public bootstrap',
    async () => {
      const q = connect(operatorConnection),
        email = randomUUID() + '@r4.invalid';
      const [row] =
        await q`SELECT educore_r4.bootstrap(${randomUUID()},'R4 CLI','Asia/Ho_Chi_Minh',${email},'First Manager') result`;
      const t = row.result.tenantId as string;
      expect(
        (await admin`SELECT status FROM tenants WHERE id=${t}`)[0].status,
      ).toBe('CREATED');
      expect(
        (
          await admin`SELECT assigned_by_membership_id=membership_id valid FROM membership_roles WHERE tenant_id=${t}`
        )[0].valid,
      ).toBe(true);
      expect(
        (
          await admin`SELECT actor_kind,operator_identity,actor_membership_id FROM audit_logs WHERE tenant_id=${t}`
        )[0],
      ).toMatchObject({
        actor_kind: 'OPERATOR',
        operator_identity: 'educore_r4_operator_test',
        actor_membership_id: null,
      });
      await auth.requestOtp(email, 'ACTIVATION');
      const otp = delivery.messages.at(-1)!.otp;
      await auth.reset(email, otp, password, 'ACTIVATION');
      expect(
        (await admin`SELECT status FROM tenants WHERE id=${t}`)[0].status,
      ).toBe('ACTIVE');
      expect((await auth.login(email, password)).accessToken).toBeTypeOf(
        'string',
      );
      await request(app.getHttpServer())
        .post('/api/v1/auth/bootstrap')
        .send({ email })
        .expect(404);
    },
  );
  native(
    'A10 fresh grants deny revoked roles after token issuance',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        a = await actor(f, 'ACCOUNTANT');
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/students/${f.student}/wallet`)
        .auth(a.accessToken, { type: 'bearer' })
        .expect(200);
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'ROLE_REVOKE',
        id: a.member,
        assignmentId: a.assignment,
        reason: 'Revoke current grant',
      });
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/students/${f.student}/wallet`)
        .auth(a.accessToken, { type: 'bearer' })
        .expect(403);
    },
  );
  native(
    'A11 last Manager and global multi-tenant deactivation roll back',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      await expect(
        runtime.iam(s.accessToken, f.tenant, {
          operation: 'ROLE_REVOKE',
          id: f.member,
          assignmentId: f.membershipRole,
          reason: 'Last Manager',
        }),
      ).rejects.toThrow(/LAST_ACTIVE_MANAGER/);
      const op = connect(operatorConnection);
      await expect(
        op`SELECT educore_r4.disable_user(${f.user}::uuid,'Global disable')`,
      ).rejects.toThrow(/LAST_ACTIVE_MANAGER/);
      expect(
        (await admin`SELECT status FROM users WHERE id=${f.user}`)[0].status,
      ).toBe('ACTIVE');
    },
  );
  native(
    'A12 parent verify/revoke controls wallet and attendance reads',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        p = await actor(f, 'PARENT', 'STUDENT', f.student);
      const path = `/api/v1/tenants/${f.tenant}`;
      await request(app.getHttpServer())
        .get(path + `/students/${f.student}/wallet`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(403);
      const created = await request(app.getHttpServer())
        .post(path + '/parent-student-links')
        .auth(s.accessToken, { type: 'bearer' })
        .send({
          parentMembershipId: p.member,
          studentId: f.student,
          evidenceReference: 'Native evidence',
          reason: 'Create parent link',
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(path + `/parent-student-links/${created.body.id}/verify`)
        .auth(s.accessToken, { type: 'bearer' })
        .send({ reason: 'Verified by staff' })
        .expect(201);
      await request(app.getHttpServer())
        .get(path + `/students/${f.student}/wallet`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(200);
      await request(app.getHttpServer())
        .get(path + `/participants/${f.participant}/attendance`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(200);
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'PARENT_REVOKE',
        id: created.body.id,
        reason: 'Evidence revoked',
      });
      await request(app.getHttpServer())
        .get(path + `/students/${f.student}/wallet`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(403);
      expect(
        (
          await admin`SELECT count(*)::int n FROM verified_sibling_relationships WHERE tenant_id=${f.tenant}`
        )[0].n,
      ).toBe(0);
    },
  );
  native(
    'D02 transaction principal cannot leak across pooled requests',
    async () => {
      const a = await sessionFor(await fresh()),
        b = await sessionFor(await fresh());
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          auth.me(i % 2 ? a.accessToken : b.accessToken),
        ),
      );
      results.forEach((r, i) =>
        expect(r.id).toBe(
          auth.tokens.verify(i % 2 ? a.accessToken : b.accessToken).sub,
        ),
      );
      await expect(
        repository.api.$queryRawUnsafe('SELECT educore_r4.me()'),
      ).rejects.toThrow(/AUTH_REQUIRED/);
    },
  );
  native(
    'B01 HTTP manual approval and explicit execution have one financial effect',
    async () => {
      const { f, s, invoice } = await issuedFixture();
      const base = `/api/v1/tenants/${f.tenant}`;
      await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'TOP_UP',
        studentId: f.student,
        amountVnd: '1000000',
        method: 'CASH',
        receiptReference: randomUUID(),
        evidence: 'Verified local test receipt',
      });
      await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'PAY',
        invoiceId: invoice,
        amountVnd: '800000',
      });
      const req = await request(app.getHttpServer())
        .post(base + `/invoices/${invoice}/adjustment-requests`)
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ amountDeltaVnd: '-100000', reason: 'Approved adjustment test' })
        .expect(201);
      const approval = req.body.id as string;
      const decisionKey = randomUUID();
      const decision = await request(app.getHttpServer())
        .post(base + `/approvals/${approval}/decisions`)
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', decisionKey)
        .send({ decision: 'APPROVE', reason: 'Manual single Manager approval' })
        .expect(200);
      expect(decision.body.status).toBe('APPROVED');
      const decisionReplay = await request(app.getHttpServer())
        .post(base + `/approvals/${approval}/decisions`)
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', decisionKey)
        .send({ decision: 'APPROVE', reason: 'Manual single Manager approval' })
        .expect(200);
      expect(decisionReplay.body).toEqual(decision.body);
      await request(app.getHttpServer()).post(base + `/approvals/${approval}/decisions`)
        .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', decisionKey)
        .send({ decision: 'APPROVE', reason: 'Changed decision payload' }).expect(409);
      const approvedView = await request(app.getHttpServer()).get(base + `/approvals/${approval}`)
        .auth(s.accessToken, { type: 'bearer' }).expect(200);
      expect(approvedView.body).toMatchObject({ status: 'APPROVED', executionReceipt: null,
        decisions: [expect.objectContaining({ decision: 'APPROVE', selfApproved: true })] });
      const [selfDecision] = await admin`SELECT decided_by_membership_id actor, self_approved marker,
        reason FROM approval_decisions WHERE tenant_id=${f.tenant} AND approval_request_id=${approval}`;
      expect(selfDecision).toMatchObject({ actor: f.member, marker: true,
        reason: 'Manual single Manager approval' });
      const [decisionAudit] = await admin`SELECT actor_membership_id actor, correlation_id::text correlation,
        reason FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='APPROVE' AND entity_id=${approval}`;
      expect(decisionAudit).toMatchObject({ actor: f.member,
        correlation: decision.headers['x-request-id'], reason: 'Manual single Manager approval' });
      expect((await admin`SELECT count(*)::int n FROM approval_decisions WHERE tenant_id=${f.tenant}
        AND approval_request_id=${approval}`)[0].n).toBe(1);
      expect(
        (
          await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE approval_request_id=${approval}`
        )[0].n,
      ).toBe(0);
      const effect = await request(app.getHttpServer())
        .post(base + `/approvals/${approval}/execute`)
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'Explicit execution' })
        .expect(200);
      expect(effect.body.status).toBe('COMPLETED');
      expect(effect.body.refundVnd).toBe('100000');
      await request(app.getHttpServer())
        .post(base + `/approvals/${approval}/execute`)
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ reason: 'Explicit replay' })
        .expect(200);
      expect(
        (
          await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE approval_request_id=${approval}`
        )[0].n,
      ).toBe(1);
      expect(
        (
          await admin`SELECT balance_vnd::text value FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}`
        )[0].value,
      ).toBe('300000');
      expect(
        (
          await admin`SELECT self_approved FROM approval_decisions WHERE approval_request_id=${approval}`
        )[0].self_approved,
      ).toBe(true);
      await request(app.getHttpServer())
        .get(base + `/invoices/${invoice}/receivable`)
        .auth(s.accessToken, { type: 'bearer' })
        .expect(200);
    },
  );
  native('R8 F01 HTTP TOP_UP, PAY and scoped finance projections preserve one effect', async () => {
    const { f, s, invoice } = await issuedFixture();
    const base = `/api/v1/tenants/${f.tenant}`;
    const receiptReference = randomUUID(), topKey = randomUUID(), payKey = randomUUID();
    const top = { amountVnd: '1000000', method: 'BANK_TRANSFER', receiptReference,
      evidence: 'Verified test transfer', reason: 'Manual receipt verified', confirmed: true };
    const intake = await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', topKey).send(top).expect(200);
    expect(intake.body.balanceVnd).toBe('1000000');
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', topKey).send(top).expect(200);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', topKey)
      .send({ ...top, amountVnd: '2' }).expect(409);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...top, amountVnd: '0' }).expect(400);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...top, method: 'CASH', receiptReference: ` ${receiptReference} ` }).expect(409);
    expect((await admin`SELECT count(*)::int n FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${invoice}`)[0].n).toBe(0);
    const payment = { amountVnd: '300000', reason: 'Explicit invoice settlement', confirmed: true };
    await request(app.getHttpServer()).post(base + `/invoices/${invoice}/wallet-payments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', payKey).send(payment).expect(200);
    const receipt = await request(app.getHttpServer()).get(base + `/finance/students/${f.student}/outcomes/PAY/${payKey}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(receipt.body.status).toBe('COMMITTED');
    expect(Object.keys(receipt.body.receipt).sort()).toEqual(['id', 'status']);
    expect(receipt.body.receipt.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect((await request(app.getHttpServer()).get(base + `/finance/students/${f.student}/outcomes/PAY/${randomUUID()}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.status).toBe('PENDING_RECONCILIATION');
    await request(app.getHttpServer()).post(base + `/invoices/${invoice}/wallet-payments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', payKey).send(payment).expect(200);
    const wallet = await request(app.getHttpServer()).get(base + `/finance/students/${f.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(wallet.body.balanceVnd).toBe('700000');
    expect(wallet.body.verifiedCashVnd).toBe('1000000');
    expect(wallet.body.walletDebitsVnd).toBe('300000');
    expect(wallet.body.internalCreditsVnd).toBe('0');
    expect(wallet.body.transactions.map((tx: { kind: string }) => tx.kind)).toEqual(['INVOICE_PAYMENT', 'TOP_UP']);
    expect(wallet.body).not.toHaveProperty('invoices');
    const receivables = await request(app.getHttpServer()).get(base + `/finance/students/${f.student}/receivables`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(receivables.body.invoices[0].netAllocatedVnd).toBe('300000');
    expect(receivables.body.invoices[0]).not.toHaveProperty('payments');
    const due = await request(app.getHttpServer()).get(base + `/invoices/${invoice}/receivable`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(due.body.outstandingVnd).toBe('500000');
    const other = await fresh();
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/finance/students/${f.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(403);
    const learner = await actor(f, 'STUDENT');
    await request(app.getHttpServer()).get(base + `/finance/students/${f.student}`)
      .auth(learner.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(learner.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ ...top, receiptReference: randomUUID() }).expect(403);
    await request(app.getHttpServer()).get(base + `/finance/students/${f.student}/outcomes/PAY/${payKey}`)
      .auth(learner.accessToken, { type: 'bearer' }).expect(403);
    expect((await admin`SELECT count(*)::int n FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${invoice}`)[0].n).toBe(1);
  });
  native('R9 N01 finance navigation and split projections enforce TENANT/STUDENT, not CLASS', async () => {
    const { f, s, invoice, period } = await issuedFixture();
    const payment = await actor(f, 'ACCOUNTANT', 'STUDENT', f.student);
    const base = `/api/v1/tenants/${f.tenant}`;
    const [role] = await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACCOUNTANT'`;
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant} AND role_id=${role.id}
      AND permission_id NOT IN (SELECT id FROM permissions WHERE code='payment.read')`;
    const get = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(payment.accessToken, { type: 'bearer' });
    const nav = await get('/access/navigation').expect(200);
    expect(nav.body.screenIds).toContain('BL09');
    expect(nav.body.screenIds).not.toContain('BL10');
    expect((await get('/finance/students?page=1&pageSize=20').expect(200)).body)
      .toMatchObject({ total: 1, items: [{ id: f.student }] });
    const wallet = await get(`/finance/students/${f.student}`).expect(200);
    expect(wallet.body).toHaveProperty('balanceVnd');
    expect(wallet.body).not.toHaveProperty('invoices');
    expect(wallet.body).not.toHaveProperty('canAdjust');
    await get(`/finance/students/${f.student}/receivables`).expect(403);
    await get(`/finance/students/${f.student2}`).expect(403);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(payment.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '1000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Synthetic', reason: 'Denied', confirmed: true }).expect(403);
    const other = await fresh();
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/finance/students/${f.student}`)
      .auth(payment.accessToken, { type: 'bearer' }).expect(403);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant} AND role_id=${role.id}`;
    const [receivablePermission] = await admin`SELECT id FROM permissions WHERE code='receivable.read'`;
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      VALUES(gen_random_uuid(),${f.tenant},${role.id},${receivablePermission.id})`;
    const summary = (await get(`/finance/students/${f.student}/receivables`).expect(200)).body.invoices[0];
    expect(summary.id).toBe(invoice);
    expect(summary.canOpenDetail).toBe(false);
    expect(summary).not.toHaveProperty('payments');
    await get(`/finance/students/${f.student}`).expect(403);
    await put(admin as unknown as Query, 'enrollments', { tenant_id: f.tenant,
      student_id: f.student, class_id: f.class2, status: 'ACTIVE',
      effective_from: '2020-01-01T00:00:00Z', created_by_membership_id: f.member });
    const classActor = await actor(f, 'MANAGER', 'CLASS', f.class2);
    const topUp = await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '1000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Synthetic receipt', reason: 'Scope regression setup', confirmed: true }).expect(200);
    const requested = await request(app.getHttpServer()).post(base + `/invoices/${invoice}/adjustment-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountDeltaVnd: '-1000', reason: 'Scope regression setup' }).expect(201);
    const classGet = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(classActor.accessToken, { type: 'bearer' });
    const classNav = await classGet('/access/navigation').expect(200);
    expect(classNav.body.screenIds).not.toContain('BL09');
    expect(classNav.body.screenIds).not.toContain('BL10');
    await classGet('/finance/students').expect(403);
    await classGet(`/finance/students/${f.student}`).expect(403);
    await classGet(`/finance/students/${f.student}/receivables`).expect(403);
    await classGet(`/finance/invoices/${invoice}/request-preview`).expect(403);
    await classGet(`/billing/invoices/${invoice}`).expect(403);
    const before = (await admin`SELECT
      (SELECT balance_vnd FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance,
      (SELECT count(*)::int FROM wallet_transactions WHERE tenant_id=${f.tenant} AND kind='TOP_UP') top_ups,
      (SELECT count(*)::int FROM payments WHERE tenant_id=${f.tenant}) payments,
      (SELECT count(*)::int FROM approval_requests WHERE tenant_id=${f.tenant}) approvals,
      (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant}) receipts,
      (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${f.tenant}) audits`)[0];
    await classGet(`/invoices/${invoice}/receivable`).expect(403);
    await classGet(`/students/${f.student}/wallet`).expect(403);
    await classGet(`/finance/students/${f.student}/outcomes/TOP_UP/${randomUUID()}`).expect(403);
    await classGet('/approvals').expect(403);
    await classGet(`/approvals/${requested.body.id}`).expect(403);
    await request(app.getHttpServer()).post(base + `/approvals/${requested.body.id}/decision-outcomes`)
      .auth(classActor.accessToken, { type: 'bearer' })
      .send({ key: randomUUID(), decision: 'APPROVE', reason: 'Denied' }).expect(403);
    const classPost = (path: string, body: object) => request(app.getHttpServer()).post(base + path)
      .auth(classActor.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID()).send(body);
    await classPost(`/invoices/${invoice}/wallet-payments`,
      { amountVnd: '1000', reason: 'Denied', confirmed: true }).expect(403);
    await classPost(`/invoices/${invoice}/cancellation-requests`,{ reason: 'Denied' }).expect(403);
    await classPost(`/wallet/top-ups/${topUp.body.id}/reversal-requests`,
      { reason: 'Denied', confirmed: true }).expect(403);
    await classPost(`/approvals/${requested.body.id}/decisions`,
      { decision: 'APPROVE', reason: 'Denied' }).expect(403);
    await classPost(`/approvals/${requested.body.id}/execute`,{ reason: 'Denied' }).expect(403);
    await classPost(`/billing/periods/${period}/students/${f.student}/generations`,
      { reason: 'Denied' }).expect(403);
    const [issuedGeneration] = await admin`SELECT br.current_generation_id id FROM invoices i
      JOIN billing_runs br ON br.tenant_id=i.tenant_id AND br.id=i.billing_run_id
      WHERE i.tenant_id=${f.tenant} AND i.id=${invoice}`;
    await classPost(`/billing/drafts/${invoice}/issue`,
      { reason: 'Denied', confirmed: true, expectedGenerationId: issuedGeneration.id }).expect(403);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(classActor.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '1000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Synthetic class-scope probe', reason: 'Cross-class probe', confirmed: true }).expect(403);
    await request(app.getHttpServer()).post(base + `/invoices/${invoice}/adjustment-requests`)
      .auth(classActor.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountDeltaVnd: '-1000', reason: 'Cross-class probe' }).expect(403);
    const after = (await admin`SELECT
      (SELECT balance_vnd FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance,
      (SELECT count(*)::int FROM wallet_transactions WHERE tenant_id=${f.tenant} AND kind='TOP_UP') top_ups,
      (SELECT count(*)::int FROM payments WHERE tenant_id=${f.tenant}) payments,
      (SELECT count(*)::int FROM approval_requests WHERE tenant_id=${f.tenant}) approvals,
      (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant}) receipts,
      (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${f.tenant}) audits`)[0];
    expect(after).toEqual(before);
    const studentActor = await actor(f, 'MANAGER', 'STUDENT', f.student);
    const tenantActor = await actor(f, 'MANAGER', 'TENANT');
    await request(app.getHttpServer()).get(base + `/invoices/${invoice}/receivable`)
      .auth(studentActor.accessToken, { type: 'bearer' }).expect(200);
    await request(app.getHttpServer()).get(base + `/students/${f.student2}/wallet`)
      .auth(studentActor.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).get(base + `/invoices/${invoice}/receivable`)
      .auth(tenantActor.accessToken, { type: 'bearer' }).expect(200);
    const mixedAssignment = await put(admin as unknown as Query,'membership_roles',{
      tenant_id:f.tenant,membership_id:classActor.member,role_id:role.id,
      assigned_by_membership_id:f.member,
    });
    await put(admin as unknown as Query,'access_scopes',{
      tenant_id:f.tenant,membership_role_id:mixedAssignment,scope_kind:'STUDENT',student_id:f.student,
    });
    await classGet(`/invoices/${invoice}/receivable`).expect(403);
    const [invoicePermission] = await admin`SELECT id FROM permissions WHERE code='invoice.read'`;
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      VALUES(gen_random_uuid(),${f.tenant},${role.id},${invoicePermission.id})`;
    await classGet(`/invoices/${invoice}/receivable`).expect(200);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${mixedAssignment}`;
    await classGet(`/invoices/${invoice}/receivable`).expect(403);
  });
  native('R9 N02 invoice preview binds all rights to one student and excludes wallet data', async () => {
    const { f, invoice } = await issuedFixture();
    const scoped = await actor(f, 'ACCOUNTANT', 'STUDENT', f.student);
    const [role] = await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACCOUNTANT'`;
    const base = `/api/v1/tenants/${f.tenant}`;
    const get = (path: string) => request(app.getHttpServer()).get(base + path)
      .auth(scoped.accessToken, { type: 'bearer' });
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant} AND role_id=${role.id}
      AND permission_id NOT IN (SELECT id FROM permissions WHERE code IN ('billing.read','invoice.read'))`;
    const path = `/finance/invoices/${invoice}/request-preview`;
    const readOnly = await get(path).expect(200);
    expect(readOnly.body).toMatchObject({ invoiceId: invoice, studentId: f.student,
      originalTotalVnd: '800000', canRequestAdjustment: false, canRequestCancellation: false });
    expect(readOnly.body).not.toHaveProperty('balanceVnd');
    expect(readOnly.body).not.toHaveProperty('transactions');
    await get(`/finance/invoices/${randomUUID()}/request-preview`).expect(403);
    expect((await get('/access/navigation').expect(200)).body.screenIds).not.toContain('BL10');
    const [adjustPermission] = await admin`SELECT id FROM permissions WHERE code='invoice.adjust_request'`;
    const unrelatedRole = await put(admin as unknown as Query, 'roles', {
      tenant_id: f.tenant, code: 'FIN_UNRELATED_TEST', name: 'Unrelated action scope' });
    await put(admin as unknown as Query, 'role_permissions', { tenant_id: f.tenant,
      role_id: unrelatedRole, permission_id: adjustPermission.id });
    const unrelatedAssignment = await put(admin as unknown as Query, 'membership_roles', {
      tenant_id: f.tenant, membership_id: scoped.member, role_id: unrelatedRole,
      assigned_by_membership_id: f.member });
    await put(admin as unknown as Query, 'access_scopes', { tenant_id: f.tenant,
      membership_role_id: unrelatedAssignment, scope_kind: 'STUDENT', student_id: f.student2 });
    expect((await get(path).expect(200)).body.canRequestAdjustment).toBe(false);
    expect((await get('/access/navigation').expect(200)).body.screenIds).not.toContain('BL10');
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      VALUES(gen_random_uuid(),${f.tenant},${role.id},${adjustPermission.id})`;
    expect((await get(path).expect(200)).body).toMatchObject({ canRequestAdjustment: true,
      canRequestCancellation: false, policyAvailability: 'AVAILABLE' });
    expect((await get('/access/navigation').expect(200)).body.screenIds).toContain('BL10');
    await get(`/finance/students/${f.student}`).expect(403);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant} AND role_id=${role.id}
      AND permission_id=${adjustPermission.id}`;
    const [cancelPermission] = await admin`SELECT id FROM permissions WHERE code='invoice.cancel_request'`;
    await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
      VALUES(gen_random_uuid(),${f.tenant},${role.id},${cancelPermission.id})`;
    expect((await get(path).expect(200)).body).toMatchObject({ canRequestAdjustment: false,
      canRequestCancellation: true });
    await put(admin as unknown as Query, 'payments', { tenant_id: f.tenant,
      invoice_id: invoice, amount_vnd: '1', method: 'CASH', paid_at: '2025-11-01',
      recorded_by_membership_id: f.member, idempotency_key: randomUUID() });
    expect((await get(path).expect(200)).body).toMatchObject({ policyAvailability: 'BLOCKED_LEGACY_MIXED',
      canRequestAdjustment: false, canRequestCancellation: false });
    await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant} AND role_id=${role.id}
      AND permission_id IN (SELECT id FROM permissions WHERE code IN ('billing.read','invoice.read'))`;
    await get(path).expect(403);
    expect((await get('/access/navigation').expect(200)).body.screenIds).not.toContain('BL10');
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${scoped.assignment}`;
    await get(path).expect(403);
    expect((await get('/access/navigation').expect(200)).body.screenIds).not.toContain('BL10');
  });
  native('R8 H02 receipt lookup authorizes before unknown or existing key reads', async () => {
    const { f, s, invoice } = await issuedFixture(), base = `/api/v1/tenants/${f.tenant}`;
    const topKey = randomUUID(), payKey = randomUUID(), unknownKey = randomUUID();
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', topKey)
      .send({ amountVnd: '500000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Verified receipt', reason: 'Manual intake', confirmed: true }).expect(200);
    await request(app.getHttpServer()).post(base + `/invoices/${invoice}/wallet-payments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', payKey)
      .send({ amountVnd: '100000', reason: 'Explicit payment', confirmed: true }).expect(200);
    const outcome = (student: string, op: string, key: string) =>
      base + `/finance/students/${student}/outcomes/${op}/${key}`;
    expect((await request(app.getHttpServer()).get(outcome(f.student, 'TOP_UP', topKey))
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.status).toBe('COMMITTED');
    expect((await request(app.getHttpServer()).get(outcome(f.student, 'PAY', payKey))
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.status).toBe('COMMITTED');
    expect((await request(app.getHttpServer()).get(outcome(f.student, 'TOP_UP', unknownKey))
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.status).toBe('PENDING_RECONCILIATION');
    const learner = await actor(f, 'STUDENT');
    for (const key of [unknownKey, topKey]) await request(app.getHttpServer())
      .get(outcome(f.student, 'TOP_UP', key)).auth(learner.accessToken, { type: 'bearer' }).expect(403);
    const other = await fresh();
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other.tenant}/finance/students/${f.student}/outcomes/TOP_UP/${topKey}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(403);
    const accountant = await actor(f, 'ACCOUNTANT');
    await request(app.getHttpServer()).get(outcome(f.student, 'TOP_UP', topKey))
      .auth(accountant.accessToken, { type: 'bearer' }).expect(200);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${accountant.assignment}`;
    for (const key of [unknownKey, topKey]) await request(app.getHttpServer())
      .get(outcome(f.student, 'TOP_UP', key)).auth(accountant.accessToken, { type: 'bearer' }).expect(403);
  });
  native('R8 H03 decision outcome proves the original approval key and payload', async () => {
    const { f, s, invoice } = await issuedFixture(), base = `/api/v1/tenants/${f.tenant}`;
    const asked = await request(app.getHttpServer()).post(base + `/invoices/${invoice}/adjustment-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountDeltaVnd: '-100000', reason: 'Correction request' }).expect(201);
    const approvalId = asked.body.id as string, decisionKey = randomUUID();
    const decisionPath = base + `/approvals/${approvalId}/decisions`;
    const outcomePath = base + `/approvals/${approvalId}/decision-outcomes`;
    await request(app.getHttpServer()).post(decisionPath)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', decisionKey)
      .send({ decision: 'APPROVE', reason: 'Manual approval evidence' }).expect(200);
    const committed = await request(app.getHttpServer()).post(outcomePath)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ key: decisionKey, decision: 'APPROVE', reason: 'Manual approval evidence' }).expect(200);
    expect(committed.body).toMatchObject({ status: 'COMMITTED', approvalId, decision: 'APPROVE', decisionStatus: 'APPROVED' });
    expect((await request(app.getHttpServer()).post(outcomePath)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ key: randomUUID(), decision: 'APPROVE', reason: 'Manual approval evidence' }).expect(200)).body.status)
      .toBe('PENDING_RECONCILIATION');
    await request(app.getHttpServer()).post(outcomePath)
      .auth(s.accessToken, { type: 'bearer' })
      .send({ key: decisionKey, decision: 'APPROVE', reason: 'Different payload' }).expect(409);
    const detail = await request(app.getHttpServer()).get(base + `/approvals/${approvalId}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(detail.body.status).toBe('APPROVED');
    expect(detail.body.executionReceipt).toBeNull();
    expect((await admin`SELECT count(*)::int n FROM approval_decisions WHERE approval_request_id=${approvalId}`)[0].n).toBe(1);
    expect((await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE approval_request_id=${approvalId}`)[0].n).toBe(0);
  });
  native('R8 decision receipt isolation checks approval identity before payload conflict', async () => {
    const { f, s, invoice } = await issuedFixture(), base = `/api/v1/tenants/${f.tenant}`;
    const create = (reason: string) => request(app.getHttpServer())
      .post(base + `/invoices/${invoice}/adjustment-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountDeltaVnd: '-100000', reason }).expect(201);
    const first = await create('First correction'), second = await create('Second correction');
    const approvalId = first.body.id as string, otherApprovalId = second.body.id as string;
    expect(otherApprovalId).not.toBe(approvalId);
    const key = randomUUID(), reason = 'Reviewed first correction';
    await request(app.getHttpServer()).post(base + `/approvals/${approvalId}/decisions`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
      .send({ decision: 'APPROVE', reason }).expect(200);
    const outcome = (tenant: string, id: string) =>
      `/api/v1/tenants/${tenant}/approvals/${id}/decision-outcomes`;
    const lookup = (id: string, operationKey: string, payloadReason = reason) =>
      request(app.getHttpServer()).post(outcome(f.tenant, id))
        .auth(s.accessToken, { type: 'bearer' })
        .send({ key: operationKey, decision: 'APPROVE', reason: payloadReason });
    expect((await lookup(approvalId, key).expect(200)).body).toMatchObject({
      status: 'COMMITTED', approvalId, decisionStatus: 'APPROVED',
    });
    const pending = { status: 'PENDING_RECONCILIATION' };
    expect((await lookup(approvalId, randomUUID()).expect(200)).body).toEqual(pending);
    expect((await lookup(otherApprovalId, key).expect(200)).body).toEqual(pending);
    await lookup(approvalId, key, 'Wrong original reason').expect(409);
    const learner = await actor(f, 'STUDENT');
    await request(app.getHttpServer()).post(outcome(f.tenant, approvalId))
      .auth(learner.accessToken, { type: 'bearer' })
      .send({ key, decision: 'APPROVE', reason }).expect(403);
    const wrongStudent = await actor(f, 'ACCOUNTANT', 'STUDENT', f.student2);
    await request(app.getHttpServer()).post(outcome(f.tenant, approvalId))
      .auth(wrongStudent.accessToken, { type: 'bearer' })
      .send({ key, decision: 'APPROVE', reason }).expect(403);
    const scoped = await actor(f, 'ACCOUNTANT', 'STUDENT', f.student);
    await request(app.getHttpServer()).post(outcome(f.tenant, approvalId))
      .auth(scoped.accessToken, { type: 'bearer' })
      .send({ key, decision: 'APPROVE', reason }).expect(200);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${scoped.assignment}`;
    await request(app.getHttpServer()).post(outcome(f.tenant, approvalId))
      .auth(scoped.accessToken, { type: 'bearer' })
      .send({ key, decision: 'APPROVE', reason }).expect(403);
    const otherTenant = await fresh();
    await request(app.getHttpServer()).post(outcome(otherTenant.tenant, approvalId))
      .auth(s.accessToken, { type: 'bearer' })
      .send({ key, decision: 'APPROVE', reason }).expect(403);
  });
  native('R8 decision outcome supports rejected and information-request receipts', async () => {
    for (const [decision, decisionStatus] of [
      ['REJECT', 'REJECTED'], ['REQUEST_INFO', 'NEEDS_INFORMATION'],
    ] as const) {
      const { f, s, invoice } = await issuedFixture(), base = `/api/v1/tenants/${f.tenant}`;
      const asked = await request(app.getHttpServer()).post(base + `/invoices/${invoice}/adjustment-requests`)
        .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
        .send({ amountDeltaVnd: '-100000', reason: 'Review required' }).expect(201);
      const approvalId = asked.body.id as string, key = randomUUID(), reason = `Manual ${decision}`;
      await request(app.getHttpServer()).post(base + `/approvals/${approvalId}/decisions`)
        .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key)
        .send({ decision, reason }).expect(200);
      const path = base + `/approvals/${approvalId}/decision-outcomes`;
      expect((await request(app.getHttpServer()).post(path)
        .auth(s.accessToken, { type: 'bearer' })
        .send({ key, decision, reason }).expect(200)).body).toMatchObject({
        status: 'COMMITTED', approvalId, decision, decisionStatus,
      });
      await request(app.getHttpServer()).post(path)
        .auth(s.accessToken, { type: 'bearer' })
        .send({ key, decision, reason: 'Different reason' }).expect(409);
    }
  });
  native('R8 F02 HTTP request, decision, execution and receipt stay separate', async () => {
    const { f, s, invoice } = await issuedFixture();
    const base = `/api/v1/tenants/${f.tenant}`;
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '800000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Verified receipt', reason: 'Manual intake', confirmed: true }).expect(200);
    await request(app.getHttpServer()).post(base + `/invoices/${invoice}/wallet-payments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '800000', reason: 'Explicit payment', confirmed: true }).expect(200);
    const requested = await request(app.getHttpServer()).post(base + `/invoices/${invoice}/adjustment-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountDeltaVnd: '-100000', reason: 'Approved reduction' }).expect(201);
    const approvalId = requested.body.id as string;
    const before = await request(app.getHttpServer()).get(base + `/finance/students/${f.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(before.body.balanceVnd).toBe('0');
    const list = await request(app.getHttpServer()).get(base + '/approvals')
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(list.body.items.find((a: { id: string }) => a.id === approvalId)?.status).toBe('PENDING_APPROVAL');
    await request(app.getHttpServer()).post(base + `/approvals/${approvalId}/execute`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Premature execution' }).expect(422);
    await request(app.getHttpServer()).post(base + `/approvals/${approvalId}/decisions`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ decision: 'APPROVE', reason: 'Manual decision' }).expect(200);
    const approved = await request(app.getHttpServer()).get(base + `/approvals/${approvalId}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    expect(approved.body.executionReceipt).toBeNull();
    const execution = await request(app.getHttpServer()).post(base + `/approvals/${approvalId}/execute`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Explicit execution' }).expect(200);
    expect(execution.body.refundVnd).toBe('100000');
    const done = await request(app.getHttpServer()).get(base + `/approvals/${approvalId}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.executionReceipt.refundVnd).toBe('100000');
    expect((await request(app.getHttpServer()).get(base + `/finance/students/${f.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.balanceVnd).toBe('100000');
  });
  native('R9 F01 authenticated source-to-invoice-to-wallet-to-approval chain persists once', async () => {
    const { f, s, period } = await issuedFixture(false);
    const base = `/api/v1/tenants/${f.tenant}`;
    const billing = `${base}/billing`;
    const get = (path: string) => request(app.getHttpServer()).get(path)
      .auth(s.accessToken, { type: 'bearer' });
    const post = (path: string, body: object, key = randomUUID()) =>
      request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', key).send(body);

    expect((await get(`${billing}/price-rules`).expect(200)).body.items)
      .toEqual([expect.objectContaining({ scope: 'COURSE', amountVnd: '800000' })]);
    expect((await get(`${billing}/periods`).expect(200)).body.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: period })]));
    const generated = await post(`${billing}/periods/${period}/students/${f.student}/generations`,
      { reason: 'R9 monthly source review' }).expect(200);
    const invoice = generated.body.invoiceId as string;
    expect(generated.body).toMatchObject({ status: 'DRAFT', totalVnd: '800000' });
    const draft = await get(`${billing}/drafts/${invoice}`).expect(200);
    expect(draft.body).toMatchObject({ id: invoice, currentGenerationId: generated.body.id, canIssue: true });
    expect(draft.body.lines).toEqual([expect.objectContaining({
      source: expect.objectContaining({ sessionId: f.session, participantId: f.participant,
        sourceBusinessDate: '2025-09-20', unitPriceVnd: '800000' }),
    })]);
    const issued = await post(`${billing}/drafts/${invoice}/issue`,
      { reason: 'Reviewed source', confirmed: true, expectedGenerationId: generated.body.id }).expect(200);
    expect(issued.body.status).toBe('ISSUED');
    const [original] = await admin`SELECT status, total_vnd::text total,
      snapshot_json::text snapshot, invoice_number number FROM invoices WHERE tenant_id=${f.tenant} AND id=${invoice}`;
    expect(original).toMatchObject({ status: 'ISSUED', total: '800000' });
    expect(original.number).toMatch(/^INV-/);
    expect((await admin`SELECT count(*)::int n FROM invoiced_participation_claims
      WHERE tenant_id=${f.tenant} AND participant_id=${f.participant}`)[0].n).toBe(1);

    const topKey = randomUUID(), payKey = randomUUID();
    const topBody = { amountVnd: '800000', method: 'CASH', receiptReference: randomUUID(),
      evidence: 'Verified synthetic receipt', reason: 'Manual verification', confirmed: true };
    await post(`${base}/students/${f.student}/wallet/top-ups`, topBody, topKey).expect(200);
    expect((await admin`SELECT count(*)::int n FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${invoice}`)[0].n).toBe(0);
    expect((await get(`${base}/invoices/${invoice}/receivable`).expect(200)).body.outstandingVnd).toBe('800000');
    const payBody = { amountVnd: '800000', reason: 'Explicit wallet allocation', confirmed: true };
    await post(`${base}/invoices/${invoice}/wallet-payments`, payBody, payKey).expect(200);
    await post(`${base}/invoices/${invoice}/wallet-payments`, payBody, payKey).expect(200);
    expect((await get(`${base}/invoices/${invoice}/receivable`).expect(200)).body.outstandingVnd).toBe('0');
    const asked = await post(`${base}/invoices/${invoice}/adjustment-requests`,
      { amountDeltaVnd: '-100000', reason: 'Reviewed source correction' }).expect(201);
    const approval = asked.body.id as string;
    expect((await get(`${base}/approvals/${approval}`).expect(200)).body.status).toBe('PENDING_APPROVAL');
    await post(`${base}/approvals/${approval}/decisions`,
      { decision: 'APPROVE', reason: 'Manual approval' }).expect(200);
    const approved = await get(`${base}/approvals/${approval}`).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', executionReceipt: null });
    const [before] = await admin`SELECT
      (SELECT count(*)::int FROM approval_decisions WHERE tenant_id=${f.tenant} AND approval_request_id=${approval}) decisions,
      (SELECT count(*)::int FROM invoice_adjustments WHERE tenant_id=${f.tenant} AND approval_request_id=${approval}) adjustments,
      (SELECT balance_vnd::text FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance`;
    expect(before).toMatchObject({ decisions: 1, adjustments: 0, balance: '0' });

    const executeKey = randomUUID();
    const execution = await post(`${base}/approvals/${approval}/execute`,
      { reason: 'Explicit execution' }, executeKey).expect(200);
    expect(execution.body).toMatchObject({ status: 'COMPLETED', refundVnd: '100000' });
    await post(`${base}/approvals/${approval}/execute`,
      { reason: 'Explicit execution' }, executeKey).expect(200);
    const done = await get(`${base}/approvals/${approval}`).expect(200);
    expect(done.body).toMatchObject({ status: 'COMPLETED',
      executionReceipt: expect.objectContaining({ refundVnd: '100000' }) });
    const [after] = await admin`SELECT
      (SELECT count(*)::int FROM invoice_adjustments WHERE tenant_id=${f.tenant} AND approval_request_id=${approval}) adjustments,
      (SELECT count(*)::int FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${invoice}) payments,
      (SELECT coalesce(sum(amount_vnd),0)::text FROM receivable_allocations WHERE tenant_id=${f.tenant} AND invoice_id=${invoice}) allocated,
      (SELECT count(*)::int FROM wallet_transactions WHERE tenant_id=${f.tenant} AND kind='INVOICE_REFUND'
        AND payment_id IN (SELECT id FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${invoice})) refunds,
      (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant}
        AND operation_type='ROOT_EFFECT' AND idempotency_key=${`APPROVAL:${approval}`}) root_receipts,
      (SELECT balance_vnd::text FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance`;
    expect(after).toMatchObject({ adjustments: 1, payments: 1, allocated: '700000', refunds: 1,
      root_receipts: 1, balance: '100000' });
    const [audit] = await admin`SELECT correlation_id::text correlation FROM audit_logs
      WHERE tenant_id=${f.tenant} AND event_type='EXECUTE_APPROVAL' AND entity_id=${approval}`;
    expect(audit.correlation).toBe(execution.headers['x-request-id']);
    expect((await get(`${base}/invoices/${invoice}/receivable`).expect(200)).body)
      .toMatchObject({ netObligationVnd: '700000', netAllocatedVnd: '700000', outstandingVnd: '0' });
    const [immutable] = await admin`SELECT status, total_vnd::text total,
      snapshot_json::text snapshot, invoice_number number FROM invoices WHERE tenant_id=${f.tenant} AND id=${invoice}`;
    expect(immutable).toEqual(original);
  });
  it.skipIf(!browserAvailable)('R9 F-B01 Edge financial lifecycle uses BL09 TOP_UP and BL10 adjustment UI', async () => {
    const { f, s, period } = await issuedFixture(false);
    const browser = await withAcademicBrowser(app, async (b) => {
      const screen = async (id: string, route: string) => {
        await b.route(`/app/${f.tenant}${route}`);
        await b.wait(`document.querySelector('.billing-page[data-screen-id="${id}"]')
          && !document.querySelector('.billing-page > .billing-state')`, id);
      };
      const action = async (card: number, button = 0) => {
        // Buttons need not be direct siblings of the card; choose by DOM order.
        await b.evaluate(`document.querySelectorAll('.billing-card')[${card}]?.querySelectorAll('button.billing-button')[${button}]?.click()`);
      };
      await b.login(s.email, password, f.tenant);
      await screen('BL01', '/finance/pricing');
      expect(await b.evaluate<boolean>(`document.querySelector('.billing-card')?.textContent.includes('800.000')`)).toBe(true);
      await screen('BL03', '/finance/billing-periods');
      expect(await b.evaluate<boolean>(`document.querySelector('.billing-card')?.textContent.includes('2025-09-01')`)).toBe(true);
      await b.select('.billing-card:nth-of-type(2) select', period);
      await b.select('.billing-card:nth-of-type(2) .billing-form-grid label:nth-child(2) select', f.student);
      await b.value('.billing-card:nth-of-type(2) textarea', 'Browser source review');
      await action(1);
      await b.wait(`document.querySelector('.billing-page[data-screen-id="BL05"]')?.textContent.includes('DRAFT')`, 'DRAFT');
      const [draft] = await admin`SELECT id,status,total_vnd::text amount FROM invoices
        WHERE tenant_id=${f.tenant} AND student_id=${f.student} AND period_id=${period}`;
      expect(draft).toMatchObject({ status: 'DRAFT', amount: '800000' });
      await b.value('.billing-card:nth-of-type(3) textarea', 'Reviewed browser draft');
      await b.click('.billing-card:nth-of-type(3) input[type="checkbox"]');
      await action(2);
      await b.wait(`document.querySelector('.billing-page[data-screen-id="BL07"]')?.textContent.includes('ISSUED')`, 'ISSUED');
      expect((await admin`SELECT status FROM invoices WHERE id=${draft.id}`)[0].status).toBe('ISSUED');
      await b.click(`.sidebar a[href="/app/${f.tenant}/finance/receivables"]`);
      await b.wait(`!!document.querySelector('.billing-page[data-screen-id="BL09"] .billing-card:nth-of-type(3) input[inputmode="numeric"]')`, 'BL09_WALLET_FORM');
      await b.value('.billing-card:nth-of-type(3) input[inputmode="numeric"]', '800000');
      await b.value('.billing-card:nth-of-type(3) .billing-form-grid label:nth-child(3) input', randomUUID());
      await b.value('.billing-card:nth-of-type(3) .billing-form-grid label:nth-child(4) input', 'Synthetic test receipt');
      await b.value('.billing-card:nth-of-type(3) .billing-form-grid label:nth-child(5) input', 'Browser manual top up');
      await b.click('.billing-card:nth-of-type(3) input[type="checkbox"]');
      await b.wait(`document.querySelector('.billing-card:nth-of-type(3) button.billing-button')?.disabled === false`, 'TOP_UP_ENABLED');
      await action(2);
      await until(() => b.network.some((r) => r.path.endsWith('/top-ups')
        && r.method === 'POST' && r.status === 200), 'TOP_UP_HTTP_200');
      expect((await admin`SELECT balance_vnd::text balance FROM wallet_accounts
        WHERE tenant_id=${f.tenant} AND student_id=${f.student}`)[0].balance).toBe('800000');
      expect((await admin`SELECT count(*)::int n FROM payments WHERE tenant_id=${f.tenant}
        AND invoice_id=${draft.id}`)[0].n).toBe(0);
      await screen('BL07', `/finance/invoices/${draft.id}`);
      await b.value('.billing-card:nth-of-type(4) input[inputmode="numeric"]', '800000');
      await b.value('.billing-card:nth-of-type(4) input:not([inputmode])', 'Browser wallet allocation');
      await b.click('.billing-card:nth-of-type(4) input[type="checkbox"]');
      await b.wait(`document.querySelector('.billing-card:nth-of-type(4) button.billing-button')?.disabled === false`, 'PAY_ENABLED');
      await action(3);
      await until(() => b.network.some((r) => r.path.endsWith('/wallet-payments')
        && r.method === 'POST' && r.status === 200), 'PAY_HTTP_200');
      await b.wait(`document.querySelector('.billing-card:nth-of-type(3)')?.textContent.includes('Còn phải thu:')
        && document.querySelector('.billing-card:nth-of-type(3)')?.textContent.includes('0 ₫')`, 'RECEIVABLE_PAID');
      expect((await admin`SELECT count(*)::int n FROM payments WHERE tenant_id=${f.tenant}
        AND invoice_id=${draft.id}`)[0].n).toBe(1);
      await b.click('.billing-card:nth-of-type(4) button.billing-button-secondary:last-of-type');
      await b.wait(`!!document.querySelector('.billing-page[data-screen-id="BL10"] .billing-card:nth-of-type(2) input[inputmode="numeric"]')`, 'BL10_REQUEST_FORM');
      await b.value('.billing-card:nth-of-type(2) input[inputmode="numeric"]', '700000');
      await b.value('.billing-card:nth-of-type(2) textarea', 'Browser approved correction');
      await b.click('.billing-card:nth-of-type(2) input[type="checkbox"]');
      await b.wait(`document.querySelector('.billing-card:nth-of-type(2) button.billing-button')?.disabled === false`, 'ADJUST_REQUEST_ENABLED');
      await action(1);
      await until(() => b.network.some((r) => r.path.endsWith('/adjustment-requests')
        && r.method === 'POST' && r.status === 201), 'ADJUST_REQUEST_HTTP_201');
      const [asked] = await admin`SELECT id FROM approval_requests WHERE tenant_id=${f.tenant}
        AND target_id=${draft.id} AND operation_type='ADJUST_REQUEST' ORDER BY created_at DESC LIMIT 1`;
      await b.wait(`!!document.querySelector('.billing-page[data-screen-id="OP05"]')`, 'OP05_FROM_BL10');
      await b.wait(`document.querySelector('.billing-page[data-screen-id="OP05"]')?.textContent.includes('PENDING_APPROVAL')`, 'APPROVAL_PENDING');
      await b.value('.billing-card:nth-of-type(2) textarea', 'Eligible single Manager approval');
      await b.click('.billing-card:nth-of-type(2) input[type="checkbox"]');
      await action(1);
      await b.wait(`document.querySelector('.billing-page[data-screen-id="OP05"]')?.textContent.includes('APPROVED')`, 'APPROVED');
      expect(await b.evaluate<boolean>(`document.querySelector('.billing-page')?.textContent.includes('COMPLETED')`)).toBe(false);
      const [beforeExecution] = await admin`SELECT
        (SELECT status FROM approval_requests WHERE id=${asked.id}) status,
        (SELECT count(*)::int FROM invoice_adjustments WHERE approval_request_id=${asked.id}) adjustments,
        (SELECT balance_vnd::text FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance,
        (SELECT coalesce(sum(amount_vnd),0)::text FROM receivable_allocations
          WHERE tenant_id=${f.tenant} AND invoice_id=${draft.id}) allocated`;
      expect(beforeExecution).toMatchObject({ status: 'APPROVED', adjustments: 0,
        balance: '0', allocated: '800000' });
      await b.wait(`!!document.querySelector('.billing-page[data-screen-id="OP05"] .billing-card:nth-of-type(2) textarea')`, 'EXECUTE_FORM_RELOADED');
      await b.value('.billing-card:nth-of-type(2) textarea', 'Separate browser execution');
      await b.click('.billing-card:nth-of-type(2) input[type="checkbox"]');
      await action(1);
      await b.wait(`document.querySelector('.billing-page[data-screen-id="OP05"]')?.textContent.includes('COMPLETED')
        && !!document.querySelector('.billing-page [role="status"]')`, 'COMPLETED_WITH_RECEIPT');
      const [effect] = await admin`SELECT
        (SELECT count(*)::int FROM invoice_adjustments WHERE approval_request_id=${asked.id}) adjustments,
        (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant}
          AND operation_type='ROOT_EFFECT' AND idempotency_key=${`APPROVAL:${asked.id}`}) receipts,
        (SELECT balance_vnd::text FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance,
        (SELECT coalesce(sum(amount_vnd),0)::text FROM receivable_allocations
          WHERE tenant_id=${f.tenant} AND invoice_id=${draft.id}) allocated`;
      expect(effect).toMatchObject({ adjustments: 1, receipts: 1, balance: '100000', allocated: '700000' });
      expect((await admin`SELECT status,total_vnd::text total FROM invoices WHERE id=${draft.id}`)[0])
        .toMatchObject({ status: 'ISSUED', total: '800000' });
      expect((await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant}
        AND entity_id=${asked.id} AND event_type='EXECUTE_APPROVAL'`)[0].n).toBe(1);
      const required = ['/generations', '/issue', '/top-ups', '/wallet-payments', '/adjustment-requests', '/decisions', '/execute'];
      for (const suffix of required) expect(b.network.some((r) => r.path.endsWith(suffix)
        && r.method === 'POST' && [200, 201].includes(r.status))).toBe(true);
      await b.route(`/app/${randomUUID()}/finance/receivables`);
      await b.wait(`document.querySelector('.ec-error-page .ec-error-card span')?.textContent === '403'`, 'CROSS_TENANT_FINANCE_FORBIDDEN');
      return { version: b.browserVersion, uiPosts: required, uiScreens: ['BL09', 'BL10'],
        crossTenantUiDenied: true, effect };
    });
    (evidence.cases as Record<string, unknown>).r9FinancialBrowser = browser;
  }, 240_000);
  it.skipIf(!browserAvailable)('R9 F-B02 revoked execution is rejected in Edge without a root effect', async () => {
    const { f, s, invoice } = await issuedFixture();
    const base = `/api/v1/tenants/${f.tenant}`;
    const post = (path: string, body: object) => request(app.getHttpServer()).post(`${base}${path}`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID()).send(body);
    await post(`/students/${f.student}/wallet/top-ups`, { amountVnd: '800000', method: 'CASH',
      receiptReference: randomUUID(), evidence: 'Synthetic receipt', reason: 'Negative browser setup',
      confirmed: true }).expect(200);
    await post(`/invoices/${invoice}/wallet-payments`, { amountVnd: '800000',
      reason: 'Negative browser setup', confirmed: true }).expect(200);
    const asked = await post(`/invoices/${invoice}/adjustment-requests`, { amountDeltaVnd: '-100000',
      reason: 'Revocation scenario' }).expect(201);
    await post(`/approvals/${asked.body.id}/decisions`, { decision: 'APPROVE',
      reason: 'Eligible Manager before execution revoke' }).expect(200);
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.login(s.email, password, f.tenant);
      await b.route(`/app/${f.tenant}/approvals/${asked.body.id}`);
      await b.wait(`!!document.querySelector('.billing-page[data-screen-id="OP05"] .billing-card:nth-of-type(2) button.billing-button')`, 'EXECUTE_FORM');
      await b.value('.billing-card:nth-of-type(2) textarea', 'Execution after revoke');
      await b.click('.billing-card:nth-of-type(2) input[type="checkbox"]');
      await admin`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
        AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='MANAGER')
        AND permission_id=(SELECT id FROM permissions WHERE code='approval.execute')`;
      await b.click('.billing-card:nth-of-type(2) button.billing-button');
      await until(() => b.network.some((r) => r.path.endsWith(`/approvals/${asked.body.id}/execute`)
        && r.method === 'POST' && r.status === 403), 'REVOKED_EXECUTION_HTTP_403');
      await b.wait(`!!document.querySelector('.billing-page [role="alert"]')
        && !document.querySelector('.billing-page')?.textContent.includes('COMPLETED')`, 'EXECUTION_DENIED_UI');
      return { version: b.browserVersion, denied: true, completedShown: false };
    });
    const [result] = await admin`SELECT
      (SELECT status FROM approval_requests WHERE id=${asked.body.id}) status,
      (SELECT count(*)::int FROM invoice_adjustments WHERE approval_request_id=${asked.body.id}) adjustments,
      (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant}
        AND operation_type='ROOT_EFFECT' AND idempotency_key=${`APPROVAL:${asked.body.id}`}) receipts,
      (SELECT balance_vnd::text FROM wallet_accounts WHERE tenant_id=${f.tenant} AND student_id=${f.student}) balance`;
    expect(result).toMatchObject({ status: 'APPROVED', adjustments: 0, receipts: 0, balance: '0' });
    (evidence.cases as Record<string, unknown>).r9FinancialDenied = browser;
  }, 120_000);
  it.skipIf(!browserAvailable)('R9 F-B03 tenant switch and revocation hide financial data in Edge', async () => {
    const a = await issuedFixture(), second = await issuedFixture();
    await admin`UPDATE tenants SET name='R9 Finance Tenant A' WHERE id=${a.f.tenant}`;
    await admin`UPDATE tenants SET name='R9 Finance Tenant B' WHERE id=${second.f.tenant}`;
    await admin`UPDATE student_profiles SET full_name='R9 Finance Student A' WHERE id=${a.f.student}`;
    await admin`UPDATE student_profiles SET full_name='R9 Finance Student B' WHERE id=${second.f.student}`;
    const secondMembership = await put(admin as unknown as Query, 'tenant_memberships', {
      tenant_id: second.f.tenant, user_id: a.f.user, status: 'ACTIVE',
    });
    const [role] = await admin`SELECT id FROM roles WHERE tenant_id=${second.f.tenant} AND code='MANAGER'`;
    const grant = await put(admin as unknown as Query, 'membership_roles', {
      tenant_id: second.f.tenant, membership_id: secondMembership, role_id: role.id,
      assigned_by_membership_id: second.f.member,
    });
    await put(admin as unknown as Query, 'access_scopes', {
      tenant_id: second.f.tenant, membership_role_id: grant, scope_kind: 'TENANT',
    });
    const student = await actor(a.f, 'STUDENT', 'STUDENT', a.f.student);
    const parent = await actor(a.f, 'PARENT');
    for (const denied of [student, parent]) {
      await request(app.getHttpServer()).post(`/api/v1/tenants/${a.f.tenant}/students/${a.f.student}/wallet/top-ups`)
        .auth(denied.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
        .send({ amountVnd: '1000', method: 'CASH', receiptReference: randomUUID(),
          evidence: 'Synthetic', reason: 'Unauthorized role', confirmed: true }).expect(403);
    }
    const browser = await withAcademicBrowser(app, async (b) => {
      await b.login(a.s.email, password, a.f.tenant);
      await b.route(`/app/${a.f.tenant}/finance/invoices/${a.invoice}`);
      await b.wait(`document.querySelector('.billing-page[data-screen-id="BL07"]')?.textContent.includes('R9 Finance Student A')`, 'A_FINANCE_VISIBLE');
      await b.route('/select-tenant');
      await b.wait(`document.querySelectorAll('.ec-tenant-choice').length === 2
        && !document.body.textContent.includes('R9 Finance Student A')`, 'A_FINANCE_CLEARED');
      await b.evaluate(`Array.from(document.querySelectorAll('.ec-tenant-choice'))
        .find(x => x.textContent.includes('R9 Finance Tenant B'))?.click()`);
      await b.wait(`location.pathname.startsWith(${JSON.stringify(`/app/${second.f.tenant}/`)})`, 'B_SELECTED');
      await b.route(`/app/${second.f.tenant}/finance/invoices/${second.invoice}`);
      await b.wait(`document.querySelector('.billing-page[data-screen-id="BL07"]')?.textContent.includes('R9 Finance Student B')
        && !document.body.textContent.includes('R9 Finance Student A')`, 'B_FINANCE_ONLY');
      await b.route(`/app/${a.f.tenant}/finance/invoices/${a.invoice}`);
      await b.wait(`document.querySelector('.ec-error-page .ec-error-card span')?.textContent === '403'
        && !document.body.textContent.includes('R9 Finance Student A')`, 'OLD_TENANT_FORBIDDEN');
      await b.route(`/app/${second.f.tenant}/finance/invoices/${a.invoice}`);
      await b.wait(`!!document.querySelector('.billing-page [role="alert"]')
        && !document.body.textContent.includes('R9 Finance Student A')`, 'CROSS_TENANT_INVOICE_DENIED');
      await admin`UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=${a.f.user}
        AND active_tenant_id=${second.f.tenant} AND revoked_at IS NULL`;
      await b.route(`/app/${second.f.tenant}/finance/invoices/${second.invoice}`);
      await b.wait(`!!document.querySelector('.billing-page [role="alert"]')
        && !document.body.textContent.includes('R9 Finance Student B')`, 'REVOKED_FINANCE_READ');
      expect(b.network.some((r) => r.path.endsWith(`/billing/invoices/${second.invoice}`)
        && r.status === 401)).toBe(true);
      return { version: b.browserVersion, tenantSwitch: true, oldTenantDenied: true,
        crossTenantDenied: true, revokedReadDenied: true };
    });
    (evidence.cases as Record<string, unknown>).r9FinancialIsolation = browser;
  }, 150_000);
  native('R9 V01 HTTP generation replay and reviewed-source revision fail closed', async () => {
    const { f, s, period } = await issuedFixture(false);
    const base = `/api/v1/tenants/${f.tenant}/billing`;
    const path = `${base}/periods/${period}/students/${f.student}/generations`;
    const key = randomUUID(), body = { reason: 'Reviewed source version' };
    const generate = (payload: object) => request(app.getHttpServer()).post(path)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', key).send(payload);
    const first = await generate(body).expect(200);
    expect((await generate(body).expect(200)).body).toEqual(first.body);
    await generate({ reason: 'Changed payload' }).expect(409);
    expect((await admin`SELECT count(*)::int n FROM billing_run_generations WHERE tenant_id=${f.tenant}
      AND student_id=${f.student} AND period_id=${period}`)[0].n).toBe(1);
    // The historical-source guard rejects edits after generation. Review freshness
    // is additionally pinned to the latest generation when a new G2 is created.
    await expect(admin`UPDATE class_sessions SET starts_at=starts_at+interval '1 minute',
      revision=revision+1 WHERE tenant_id=${f.tenant} AND id=${f.session}`)
      .rejects.toThrow(/historical|reviewed correction/i);
    const [state] = await admin`SELECT status FROM invoices WHERE tenant_id=${f.tenant} AND id=${first.body.invoiceId}`;
    expect(state.status).toBe('DRAFT');
    expect((await admin`SELECT count(*)::int n FROM invoiced_participation_claims
      WHERE tenant_id=${f.tenant} AND participant_id=${f.participant}`)[0].n).toBe(0);
    const recomputed = await request(app.getHttpServer()).post(
      `${base}/periods/${period}/students/${f.student}/recomputations`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Re-review changed source', expectedBase: first.body.id,
        expectedApplied: first.body.id }).expect(200);
    expect(recomputed.body).toMatchObject({ status: 'DRAFT', invoiceId: first.body.invoiceId });
    await request(app.getHttpServer()).post(`${base}/drafts/${first.body.invoiceId}/issue`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Stale G1 review', confirmed: true, expectedGenerationId: first.body.id }).expect(409);
    await request(app.getHttpServer()).post(`${base}/periods/${period}/students/${f.student}/recomputations`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Stale CAS', expectedBase: first.body.id,
        expectedApplied: first.body.id }).expect(409);
    await request(app.getHttpServer()).post(`${base}/drafts/${first.body.invoiceId}/issue`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Invalid reviewed generation', confirmed: true,
        expectedGenerationId: randomUUID() }).expect(409);
    expect((await admin`SELECT status FROM invoices WHERE id=${first.body.invoiceId}`)[0].status).toBe('DRAFT');
    expect((await admin`SELECT count(*)::int n FROM invoiced_participation_claims
      WHERE tenant_id=${f.tenant} AND participant_id=${f.participant}`)[0].n).toBe(0);
    await request(app.getHttpServer()).post(`${base}/drafts/${first.body.invoiceId}/issue`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Reviewed current source', confirmed: true,
        expectedGenerationId: recomputed.body.id }).expect(200);
  });
  native('R9 S05 wrong approver and ineligible self-approval leave decision absent', async () => {
    const { f, s, invoice } = await issuedFixture();
    const base = `/api/v1/tenants/${f.tenant}`;
    const otherManager = await actor(f, 'MANAGER');
    const unrelated = await actor(f, 'ACADEMIC_STAFF');
    const parent = await actor(f, 'PARENT');
    const asked = await request(app.getHttpServer()).post(`${base}/invoices/${invoice}/adjustment-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountDeltaVnd: '-10000', reason: 'Separate approval required' }).expect(201);
    const path = `${base}/approvals/${asked.body.id}/decisions`;
    const decision = { decision: 'APPROVE', reason: 'Reviewed by another Manager' };
    await request(app.getHttpServer()).post(path).auth(unrelated.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(decision).expect(403);
    await request(app.getHttpServer()).post(path).auth(s.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(decision).expect(403);
    expect((await admin`SELECT count(*)::int n FROM approval_decisions WHERE tenant_id=${f.tenant}
      AND approval_request_id=${asked.body.id}`)[0].n).toBe(0);
    await request(app.getHttpServer()).post(`${base}/students/${f.student}/wallet/top-ups`)
      .auth(parent.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '1000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Synthetic', reason: 'Forbidden parent mutation', confirmed: true }).expect(403);
    await request(app.getHttpServer()).get(`${base}/students/${f.student}/wallet`)
      .auth(parent.accessToken, { type: 'bearer' }).expect(403);
    await request(app.getHttpServer()).post(path).auth(otherManager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(decision).expect(200);
    const [persisted] = await admin`SELECT status FROM approval_requests WHERE tenant_id=${f.tenant}
      AND id=${asked.body.id}`;
    expect(persisted.status).toBe('APPROVED');
    expect((await admin`SELECT self_approved FROM approval_decisions WHERE tenant_id=${f.tenant}
      AND approval_request_id=${asked.body.id}`)[0].self_approved).toBe(false);
    expect((await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE tenant_id=${f.tenant}
      AND approval_request_id=${asked.body.id}`)[0].n).toBe(0);
  });
  native('R8 F03 invalid TOP_UP reversal is full, approved and balance bounded', async () => {
    const { f, s, invoice } = await issuedFixture();
    const base = `/api/v1/tenants/${f.tenant}`;
    const top = await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '800000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Verified receipt', reason: 'Original intake', confirmed: true }).expect(200);
    await request(app.getHttpServer()).post(base + `/invoices/${invoice}/wallet-payments`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '100000', reason: 'Valid payment', confirmed: true }).expect(200);
    const asked = await request(app.getHttpServer()).post(base + `/wallet/top-ups/${top.body.id}/reversal-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Invalid receipt discovered', confirmed: true }).expect(200);
    await request(app.getHttpServer()).post(base + `/approvals/${asked.body.id}/decisions`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ decision: 'APPROVE', reason: 'Manual review' }).expect(200);
    const executionKey = randomUUID();
    await request(app.getHttpServer()).post(base + `/approvals/${asked.body.id}/execute`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', executionKey)
      .send({ reason: 'Try full reversal' }).expect(422);
    expect((await request(app.getHttpServer()).get(base + `/approvals/${asked.body.id}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200)).body.status).toBe('APPROVED');
    const wallet = await request(app.getHttpServer()).get(base + `/finance/students/${f.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(wallet.body.balanceVnd).toBe('700000');
    expect(wallet.body.transactions.filter((tx: { kind: string }) => tx.kind === 'TOP_UP_REVERSAL')).toHaveLength(0);
    expect((await admin`SELECT count(*)::int n FROM payments WHERE tenant_id=${f.tenant} AND invoice_id=${invoice}`)[0].n).toBe(1);
    await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '100000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Verified separate receipt', reason: 'New legitimate intake', confirmed: true }).expect(200);
    await request(app.getHttpServer()).post(base + `/approvals/${asked.body.id}/execute`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', executionKey)
      .send({ reason: 'Try full reversal' }).expect(200);
    await request(app.getHttpServer()).post(base + `/approvals/${asked.body.id}/execute`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Replay completed reversal' }).expect(200);
    const final = await request(app.getHttpServer()).get(base + `/finance/students/${f.student}`)
      .auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(final.body.balanceVnd).toBe('0');
    expect(final.body.transactions.filter((tx: { kind: string }) => tx.kind === 'TOP_UP_REVERSAL')).toHaveLength(1);
    expect(final.body.transactions.filter((tx: { id: string }) => tx.id === top.body.id)).toHaveLength(1);
  });
  native('R8 H01 net verified cash follows signed TOP_UP and reversal history', async () => {
    const f = await fresh(), s = await sessionFor(f), base = `/api/v1/tenants/${f.tenant}`;
    const top = await request(app.getHttpServer()).post(base + `/students/${f.student}/wallet/top-ups`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ amountVnd: '500000', method: 'CASH', receiptReference: randomUUID(),
        evidence: 'Verified receipt', reason: 'Manual intake', confirmed: true }).expect(200);
    const walletPath = base + `/finance/students/${f.student}`;
    const before = await request(app.getHttpServer()).get(walletPath).auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(before.body.verifiedCashVnd).toBe('500000');
    expect(before.body.balanceVnd).toBe('500000');
    const asked = await request(app.getHttpServer()).post(base + `/wallet/top-ups/${top.body.id}/reversal-requests`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Invalid source receipt', confirmed: true }).expect(200);
    await request(app.getHttpServer()).post(base + `/approvals/${asked.body.id}/decisions`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ decision: 'APPROVE', reason: 'Manual correction decision' }).expect(200);
    await request(app.getHttpServer()).post(base + `/approvals/${asked.body.id}/execute`)
      .auth(s.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ reason: 'Explicit full reversal' }).expect(200);
    const after = await request(app.getHttpServer()).get(walletPath).auth(s.accessToken, { type: 'bearer' }).expect(200);
    expect(after.body.verifiedCashVnd).toBe('0');
    expect(after.body.balanceVnd).toBe('0');
    expect(after.body.reversedTopUpsVnd).toBe('500000');
    const original = after.body.transactions.find((tx: { id: string }) => tx.id === top.body.id);
    const reversal = after.body.transactions.find((tx: { reversedTopUpId: string }) => tx.reversedTopUpId === top.body.id);
    expect(original).toMatchObject({ kind: 'TOP_UP', amountVnd: '500000' });
    expect(reversal).toMatchObject({ kind: 'TOP_UP_REVERSAL', amountVnd: '-500000' });
    expect(reversal.id).not.toBe(original.id);
    await expect(admin`UPDATE wallet_transactions SET amount_vnd=1 WHERE id=${top.body.id}`).rejects.toThrow(/IMMUTABLE/);
  });
  native(
    'B02 reject/request-info are durable and cannot be executed',
    async () => {
      for (const decision of ['REJECT', 'REQUEST_INFO']) {
        const { f, s, invoice } = await issuedFixture();
        const approval = (await runtime.billing(s.accessToken, f.tenant, {
          ...intent(),
          operation: 'ADJUST_REQUEST',
          invoiceId: invoice,
          deltaVnd: '-100000',
        })) as { id: string };
        const value = (await runtime.decide(s.accessToken, f.tenant, {
          ...intent(),
          approvalId: approval.id,
          decision,
        })) as { status: string };
        expect(value.status).toBe(
          decision === 'REJECT' ? 'REJECTED' : 'NEEDS_INFORMATION',
        );
        await expect(
          runtime.execute(s.accessToken, f.tenant, {
            ...intent(),
            approvalId: approval.id,
          }),
        ).rejects.toThrow(/NOT_APPROVED/);
      }
    },
  );
  native(
    'B03 execution failure preserves decision and recovery receipt',
    async () => {
      const { f, s } = await issuedFixture();
      const top = (await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'TOP_UP',
        studentId: f.student,
        amountVnd: '1000000',
        method: 'CASH',
        receiptReference: randomUUID(),
        evidence: 'Verified receipt',
      })) as { id: string };
      const ap = (await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'REVERSE_TOP_UP_REQUEST',
        topUpId: top.id,
      })) as { id: string };
      await runtime.decide(s.accessToken, f.tenant, {
        ...intent(),
        approvalId: ap.id,
        decision: 'APPROVE',
      });
      const invoice = (
        await admin`SELECT id FROM invoices WHERE tenant_id=${f.tenant} AND status='ISSUED'`
      )[0].id as string;
      await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'PAY',
        invoiceId: invoice,
        amountVnd: '800000',
      });
      await expect(
        runtime.execute(s.accessToken, f.tenant, {
          ...intent(),
          approvalId: ap.id,
        }),
      ).rejects.toThrow(/INSUFFICIENT_AVAILABLE_BALANCE/);
      expect(
        (await admin`SELECT status FROM approval_requests WHERE id=${ap.id}`)[0]
          .status,
      ).toBe('APPROVED');
      expect(
        (
          await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant} AND action='EXECUTION_NO_EFFECT'`
        )[0].n,
      ).toBe(1);
      await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'TOP_UP',
        studentId: f.student,
        amountVnd: '800000',
        method: 'CASH',
        receiptReference: randomUUID(),
        evidence: 'Recovery receipt',
      });
      expect(
        (
          (await runtime.execute(s.accessToken, f.tenant, {
            ...intent(),
            approvalId: ap.id,
          })) as { status: string }
        ).status,
      ).toBe('COMPLETED');
    },
  );
  native(
    'C01 enqueue/claim/execute job and replay deduplicate the durable result',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        key = randomUUID();
      const enqueue = () =>
        runtime.run<{ id: string }>(
          s.accessToken,
          'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
          f.tenant,
          'SCHEDULE_CHECK',
          JSON.stringify({ sessionId: f.session }),
          key,
        );
      const j = await enqueue();
      expect((await enqueue()).id).toBe(j.id);
      const claim = await worker.claim();
      expect(claim?.id).toBe(j.id);
      const result = (await worker.perform(claim!)) as { status: string };
      expect(result.status).toBe('COMPLETED');
      await expect(worker.perform(claim!)).rejects.toThrow(/STALE_JOB_LEASE/);
      for (let n = 0; n < 100; n++) expect((await enqueue()).id).toBe(j.id);
      expect(
        (
          await admin`SELECT count(*)::int n FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type='R4:JOB'`
        )[0].n,
      ).toBe(1);
      await expect(
        runtime.run(
          s.accessToken,
          'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
          f.tenant,
          'SCHEDULE_CHECK',
          JSON.stringify({ sessionId: randomUUID() }),
          key,
        ),
      ).rejects.toThrow();
      const otherSession = await put(
        admin as unknown as Query,
        'class_sessions',
        {
          tenant_id: f.tenant,
          class_id: f.classId,
          teacher_id: f.teacher,
          delivery_mode: 'ONLINE',
          starts_at: '2099-09-15T10:00:00Z',
          ends_at: '2099-09-15T11:00:00Z',
          status: 'DRAFT',
          revision: 1,
          policy_version_id: f.policy,
        },
      );
      await expect(
        runtime.run(
          s.accessToken,
          'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
          f.tenant,
          'SCHEDULE_CHECK',
          JSON.stringify({ sessionId: otherSession }),
          key,
        ),
      ).rejects.toThrow(/IDEMPOTENCY_KEY_REUSED/);
    },
  );
  native(
    'C02 expired lease is reclaimed and stale worker cannot commit',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      const j = await runtime.run<{ id: string }>(
        s.accessToken,
        'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
        f.tenant,
        'SCHEDULE_CHECK',
        JSON.stringify({ sessionId: f.session }),
        randomUUID(),
      );
      const first = await worker.claim();
      expect(first!.id).toBe(j.id);
      await admin`UPDATE automation_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=${j.id}`;
      const w2 = connect(secondWorkerConnection);
      const [row] = await w2`SELECT educore_r4.claim_job() result`;
      const second = row.result;
      expect(second.id).toBe(j.id);
      expect(BigInt(second.fence)).toBeGreaterThan(BigInt(first!.fence));
      await expect(worker.perform(first!)).rejects.toThrow(/STALE_JOB_LEASE/);
      expect(
        (
          await w2`SELECT educore_r4.perform_job(${j.id}::uuid,${second.fence}::bigint) result`
        )[0].result.status,
      ).toBe('COMPLETED');
      expect(
        (
          await admin`SELECT count(*)::int n FROM job_attempts WHERE job_id=${j.id}`
        )[0].n,
      ).toBe(2);
    },
  );
  native(
    'C03 revoked worker intent fails without business effects',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        a = await actor(f, 'ACADEMIC_STAFF');
      const j = await runtime.run<{ id: string }>(
        a.accessToken,
        'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
        f.tenant,
        'SCHEDULE_CHECK',
        JSON.stringify({ sessionId: f.session }),
        randomUUID(),
      );
      const claim = await worker.claim();
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'ROLE_REVOKE',
        id: a.member,
        assignmentId: a.assignment,
        reason: 'Revoke worker initiator',
      });
      expect(
        ((await worker.perform(claim!)) as { status: string }).status,
      ).toBe('FAILED');
      expect(
        (
          await admin`SELECT count(*)::int n FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type='R4:JOB'`
        )[0].n,
      ).toBe(0);
      expect(
        (
          await admin`SELECT actor_kind,actor_membership_id FROM audit_logs WHERE tenant_id=${f.tenant} AND entity_id=${j.id} AND event_type='JOB_FAILED'`
        )[0],
      ).toMatchObject({ actor_kind: 'WORKER', actor_membership_id: null });
      await worker.dispatch();
      expect(
        (
          await runtime.run<{ count: number }>(
            s.accessToken,
            'SELECT educore_r4.inbox($1::uuid,$2::text) result',
            f.tenant,
            'UNREAD_COUNT',
          )
        ).count,
      ).toBeGreaterThan(0);
    },
  );
  native(
    'D03 audit actor matching, redaction and immutable retention',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      const id = await put(admin as unknown as Query, 'audit_logs', {
        tenant_id: f.tenant,
        actor_user_id: f.user,
        actor_membership_id: f.member,
        actor_kind: 'USER',
        event_type: 'REDACTION_TEST',
        entity_type: 'User',
        entity_id: f.user,
        action: 'TEST',
        after_json: {
          password: 'sensitive',
          nested: { refreshToken: 'sensitive', otp: '123456' },
        },
        correlation_id: randomUUID(),
      });
      const [row] =
        await admin`SELECT after_json FROM audit_logs WHERE id=${id}`;
      expect(JSON.stringify(row.after_json)).not.toContain('sensitive');
      expect(JSON.stringify(row.after_json)).not.toContain('123456');
      await expect(
        admin`UPDATE audit_logs SET reason='tamper' WHERE id=${id}`,
      ).rejects.toThrow(/IMMUTABLE/);
      await expect(
        repository.api.$executeRawUnsafe('DELETE FROM public.audit_logs'),
      ).rejects.toThrow(/permission denied/);
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/audit`)
        .auth(s.accessToken, { type: 'bearer' })
        .expect(200);
      await expect(
        put(admin as unknown as Query, 'audit_logs', {
          tenant_id: f.tenant,
          actor_user_id: fixture.user,
          actor_membership_id: f.member,
          actor_kind: 'USER',
          event_type: 'MISMATCH',
          entity_type: 'User',
          entity_id: f.user,
          action: 'TEST',
          correlation_id: randomUUID(),
        }),
      ).rejects.toThrow(/AUDIT_ACTOR_MISMATCH/);
    },
  );
  native(
    'X01 concurrent final-two Manager revocations serialize and retain one',
    async () => {
      for (const commit of [true, false]) {
        const f = await fresh(),
          a = await sessionFor(f),
          b = await actor(f, 'MANAGER');
        const command = (id: string, assignment: string) =>
          JSON.stringify({
            operation: 'ROLE_REVOKE',
            id,
            assignmentId: assignment,
            reason: 'Concurrent Manager revoke',
          });
        const result = await race(
          'last-two-manager-revocation',
          {
            token: a.accessToken,
            sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb) result',
            args: [f.tenant, command(f.member, f.membershipRole)],
          },
          {
            token: b.accessToken,
            sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb) result',
            args: [f.tenant, command(b.member, b.assignment)],
          },
          commit,
        );
        expect(result.two.code).toBe(commit ? '23514' : null);
        expect(
          (await admin`SELECT educore_r4.manager_count(${f.tenant}::uuid) n`)[0]
            .n,
        ).toBe(1);
      }
    },
  );
  native(
    'X02 global User disable versus final Manager revoke cannot empty tenant',
    async () => {
      const f = await fresh(),
        b = await actor(f, 'MANAGER');
      const result = await race(
        'global-disable-vs-manager-revoke',
        {
          url: operatorConnection,
          sql: 'SELECT educore_r4.disable_user($1::uuid,$2::text)',
          args: [f.user, 'Operator global disable'],
        },
        {
          token: b.accessToken,
          sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb) result',
          args: [
            f.tenant,
            JSON.stringify({
              operation: 'ROLE_REVOKE',
              id: b.member,
              assignmentId: b.assignment,
              reason: 'Concurrent final Manager revoke',
            }),
          ],
        },
      );
      expect(result.two.code).toBe('23514');
      expect(
        (await admin`SELECT educore_r4.manager_count(${f.tenant}::uuid) n`)[0]
          .n,
      ).toBe(1);
    },
  );
  native('X03 duplicate active role assignments have one commit', async () => {
    const f = await fresh(),
      s = await sessionFor(f),
      subject = await actor(f, 'STUDENT', 'STUDENT', f.student);
    const [role] =
      await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='TEACHER'`;
    const body = JSON.stringify({
      operation: 'ROLE_ASSIGN',
      id: subject.member,
      roleId: role.id,
      scopeKind: 'CLASS',
      classId: f.classId,
      reason: 'Concurrent role grant',
    });
    const result = await race(
      'duplicate-active-grant',
      {
        token: s.accessToken,
        sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
        args: [f.tenant, body],
      },
      {
        token: s.accessToken,
        sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
        args: [f.tenant, body],
      },
    );
    expect(result.two.code).toBe('23505');
  });
  native(
    'X04 parent-link revoke wins before a scoped financial read',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        p = await actor(f, 'PARENT', 'STUDENT', f.student);
      const link = (await runtime.iam(s.accessToken, f.tenant, {
        operation: 'PARENT_CREATE',
        parentMembershipId: p.member,
        studentId: f.student,
        evidenceReference: 'Native evidence',
        reason: 'Create',
      })) as { id: string };
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'PARENT_VERIFY',
        id: link.id,
        reason: 'Verify',
      });
      const result = await race(
        'parent-revoke-vs-scoped-read',
        {
          token: s.accessToken,
          sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
          args: [
            f.tenant,
            JSON.stringify({
              operation: 'PARENT_REVOKE',
              id: link.id,
              reason: 'Concurrent revoke',
            }),
          ],
        },
        {
          token: p.accessToken,
          sql: 'SELECT educore_r2.summary($1::uuid,$2::uuid)',
          args: [f.tenant, f.student],
        },
      );
      expect(result.two.code).toBe('42501');
    },
  );
  native(
    'X05 two OTP consumers have exactly one successful reset',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      await auth.requestOtp(s.email, 'PASSWORD_RESET');
      const [o] =
        await admin`SELECT otp_hash FROM password_reset_otps WHERE user_id=${f.user} AND consumed_at IS NULL`;
      const command = {
        url: authConnection,
        sql: 'SELECT educore_r4.reset_password($1::text,$2::"OtpPurpose",$3::text,$4::text) result',
        args: [
          s.email,
          'PASSWORD_RESET',
          o.otp_hash as string,
          sharedPasswordHash,
        ],
      };
      const result = await race('concurrent-otp-consume', command, command);
      expect(result.one[0].result).toBe(true);
      expect(result.two.rows[0].result).toBe(false);
    },
  );
  native(
    'X06 concurrent refresh rotation detects replay and revokes family',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        claims = auth.tokens.verify(s.accessToken);
      const command = () => ({
        url: authConnection,
        sql: 'SELECT educore_r4.refresh($1::text,$2::text,$3::text,$4::text,$5::text) result',
        args: [
          digest(s.refreshToken),
          digest(s.csrfToken),
          digest(secret()),
          digest(auth.tokens.issue(f.user, claims.sid, f.tenant)),
          digest(secret()),
        ],
      });
      const result = await race(
        'concurrent-refresh-rotation',
        command(),
        command(),
      );
      expect(result.one[0].result).not.toBeNull();
      expect(result.two.rows[0].result).toBeNull();
      expect(
        (
          await admin`SELECT revoked_at IS NOT NULL revoked FROM auth_sessions WHERE id=${claims.sid}`
        )[0].revoked,
      ).toBe(true);
    },
  );
  native('X07 concurrent approve/reject has one durable decision', async () => {
    const { f, s, invoice } = await issuedFixture();
    const ap = (await runtime.billing(s.accessToken, f.tenant, {
      ...intent(),
      operation: 'ADJUST_REQUEST',
      invoiceId: invoice,
      deltaVnd: '10000',
    })) as { id: string };
    const cmd = (decision: string) => ({
      token: s.accessToken,
      sql: 'SELECT educore_r2.r4_decide($1::uuid,$2::jsonb) result',
      args: [
        f.tenant,
        JSON.stringify({ ...intent(), approvalId: ap.id, decision }),
      ],
    });
    const result = await race(
      'approve-vs-reject',
      cmd('APPROVE'),
      cmd('REJECT'),
    );
    expect(result.two.code).toBe('23514');
    expect(
      (
        await admin`SELECT count(*)::int n FROM approval_decisions WHERE approval_request_id=${ap.id}`
      )[0].n,
    ).toBe(1);
  });
  native(
    'X08 two approval executions serialize to one root effect',
    async () => {
      const { f, s, invoice } = await issuedFixture();
      const ap = (await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'ADJUST_REQUEST',
        invoiceId: invoice,
        deltaVnd: '10000',
      })) as { id: string };
      await runtime.decide(s.accessToken, f.tenant, {
        ...intent(),
        approvalId: ap.id,
        decision: 'APPROVE',
      });
      const cmd = () => ({
        token: s.accessToken,
        sql: 'SELECT educore_r2.execute($1::uuid,$2::jsonb) result',
        args: [
          f.tenant,
          JSON.stringify({
            ...intent(),
            approvalId: ap.id,
            operation: 'EXECUTE_APPROVAL',
          }),
        ],
      });
      const result = await race('concurrent-root-execution', cmd(), cmd());
      expect(result.two.code).toBeNull();
      expect(result.two.rows[0].result).toEqual(result.one[0].result);
      expect(
        (
          await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE approval_request_id=${ap.id}`
        )[0].n,
      ).toBe(1);
    },
  );
  native('R9 X12 decision and explicit execution serialize across connections', async () => {
    for (const commit of [true, false]) {
      const { f, s, invoice } = await issuedFixture();
      const ap = await runtime.billing(s.accessToken, f.tenant, {
        ...intent(), operation: 'ADJUST_REQUEST', invoiceId: invoice, deltaVnd: '10000',
      }) as { id: string };
      const result = await race('decision-vs-execution', {
        token: s.accessToken,
        sql: 'SELECT educore_r2.r4_decide($1::uuid,$2::jsonb) result',
        args: [f.tenant, JSON.stringify({ ...intent(), approvalId: ap.id, decision: 'APPROVE' })],
      }, {
        token: s.accessToken,
        sql: 'SELECT educore_r2.execute($1::uuid,$2::jsonb) result',
        args: [f.tenant, JSON.stringify({ ...intent(), approvalId: ap.id, operation: 'EXECUTE_APPROVAL' })],
      }, commit);
      expect(result.two.code).toBe(commit ? null : '23514');
      const [persisted] = await admin`SELECT status FROM approval_requests WHERE tenant_id=${f.tenant} AND id=${ap.id}`;
      expect(persisted.status).toBe(commit ? 'COMPLETED' : 'PENDING_APPROVAL');
      expect((await admin`SELECT count(*)::int n FROM approval_decisions WHERE tenant_id=${f.tenant}
        AND approval_request_id=${ap.id}`)[0].n).toBe(commit ? 1 : 0);
      expect((await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE tenant_id=${f.tenant}
        AND approval_request_id=${ap.id}`)[0].n).toBe(commit ? 1 : 0);
    }
  });
  native(
    'X09 target obligation changes invalidate another approved payload',
    async () => {
      const { f, s, invoice } = await issuedFixture();
      const approvals = [] as string[];
      for (let i = 0; i < 2; i++) {
        const ap = (await runtime.billing(s.accessToken, f.tenant, {
          ...intent(),
          operation: 'ADJUST_REQUEST',
          invoiceId: invoice,
          deltaVnd: '10000',
        })) as { id: string };
        await runtime.decide(s.accessToken, f.tenant, {
          ...intent(),
          approvalId: ap.id,
          decision: 'APPROVE',
        });
        approvals.push(ap.id);
      }
      const cmd = (approvalId: string) => ({
        token: s.accessToken,
        sql: 'SELECT educore_r2.execute($1::uuid,$2::jsonb) result',
        args: [
          f.tenant,
          JSON.stringify({
            ...intent(),
            approvalId,
            operation: 'EXECUTE_APPROVAL',
          }),
        ],
      });
      const result = await race(
        'approved-target-mutation',
        cmd(approvals[0]),
        cmd(approvals[1]),
      );
      expect(result.two.code).toBe('23514');
      expect(
        (
          await admin`SELECT status FROM approval_requests WHERE id=${approvals[1]}`
        )[0].status,
      ).toBe('APPROVED');
    },
  );
  native(
    'X10 completed idempotency result wins over concurrent replay',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      const body = JSON.stringify({
        ...intent(),
        operation: 'TOP_UP',
        studentId: f.student,
        amountVnd: '1000',
        method: 'CASH',
        receiptReference: randomUUID(),
        evidence: 'Native receipt',
      });
      const cmd = {
        token: s.accessToken,
        sql: 'SELECT educore_r2.execute($1::uuid,$2::jsonb) result',
        args: [f.tenant, body],
      };
      const result = await race('completed-idempotency-replay', cmd, cmd);
      expect(result.two.code).toBeNull();
      expect(result.one[0].result).toEqual(result.two.rows[0].result);
      expect(
        (
          await admin`SELECT count(*)::int n FROM wallet_transactions WHERE tenant_id=${f.tenant}`
        )[0].n,
      ).toBe(1);
    },
  );
  native(
    'X11 grant revoke is observed before worker effect execution',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        a = await actor(f, 'ACADEMIC_STAFF');
      const j = await runtime.run<{ id: string }>(
        a.accessToken,
        'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
        f.tenant,
        'SCHEDULE_CHECK',
        JSON.stringify({ sessionId: f.session }),
        randomUUID(),
      );
      const claim = await worker.claim();
      const result = await race(
        'worker-revoke-vs-effect',
        {
          token: s.accessToken,
          sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
          args: [
            f.tenant,
            JSON.stringify({
              operation: 'ROLE_REVOKE',
              id: a.member,
              assignmentId: a.assignment,
              reason: 'Revoke before effect',
            }),
          ],
        },
        {
          url: firstWorkerConnection,
          sql: 'SELECT educore_r4.perform_job($1::uuid,$2::bigint) result',
          args: [j.id, claim!.fence],
        },
      );
      expect(result.two.code).toBeNull();
      expect(result.two.rows[0].result.status).toBe('FAILED');
    },
  );
  native(
    'X12 authorization revoke prevents a scheduling command at execution boundary',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        b = await actor(f, 'MANAGER');
      const result = await race(
        'iam-revoke-vs-r3-confirm',
        {
          token: b.accessToken,
          sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
          args: [
            f.tenant,
            JSON.stringify({
              operation: 'ROLE_REVOKE',
              id: f.member,
              assignmentId: f.membershipRole,
              reason: 'Revoke source command actor',
            }),
          ],
        },
        {
          token: s.accessToken,
          sql: 'SELECT educore_r3.scheduling($1::uuid,$2::jsonb)',
          args: [
            f.tenant,
            JSON.stringify({
              ...intent(),
              operation: 'CONFIRM',
              sessionId: f.session,
            }),
          ],
        },
      );
      expect(result.two.code).toBe('42501');
    },
  );
  native(
    'C04 retries are 1/5/15 minutes and the fourth attempt is terminal',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      const j = await runtime.run<{ id: string }>(
        s.accessToken,
        'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
        f.tenant,
        'SCHEDULE_CHECK',
        JSON.stringify({ sessionId: f.session }),
        randomUUID(),
      );
      await admin.unsafe(
        `CREATE FUNCTION public.r4_retry_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_type='R4:JOB' AND NEW.tenant_id='${f.tenant}'::uuid THEN RAISE EXCEPTION 'INJECTED_TRANSIENT' USING ERRCODE='40001'; END IF; RETURN NEW; END $$`,
      );
      await admin`CREATE TRIGGER r4_retry_fault BEFORE INSERT ON idempotency_records FOR EACH ROW EXECUTE FUNCTION public.r4_retry_fault()`;
      try {
        for (let attempt = 1; attempt <= 4; attempt++) {
          const claim = await worker.claim();
          expect(claim!.id).toBe(j.id);
          const result = (await worker.perform(claim!)) as { status: string };
          expect(result.status).toBe(attempt < 4 ? 'READY' : 'FAILED');
          const [row] =
            await admin`SELECT attempt_count,extract(epoch FROM next_attempt_at-clock_timestamp())::int delay FROM automation_jobs WHERE id=${j.id}`;
          expect(row.attempt_count).toBe(attempt);
          if (attempt < 4) {
            expect(row.delay).toBeGreaterThanOrEqual(
              [60, 300, 900][attempt - 1] - 2,
            );
            await admin`UPDATE automation_jobs SET next_attempt_at=clock_timestamp()-interval '1 second' WHERE id=${j.id}`;
          }
        }
        await expect(
          runtime.run(
            s.accessToken,
            'SELECT educore_r4.retry_job_request($1::uuid,$2::uuid,$3::text,$4::text) result',
            f.tenant,
            j.id,
            'No fifth attempt',
            randomUUID(),
          ),
        ).rejects.toThrow(/JOB_RECOVERY_DENIED/);
        expect(
          (
            await admin`SELECT count(*)::int n FROM job_attempts WHERE job_id=${j.id}`
          )[0].n,
        ).toBe(4);
      } finally {
        await admin`DROP TRIGGER r4_retry_fault ON idempotency_records`;
        await admin`DROP FUNCTION public.r4_retry_fault()`;
      }
    },
  );
  native(
    'C05 Billing worker pins policy, creates draft only, and identifies WORKER audit',
    async () => {
      const { f, s, period } = await issuedFixture(false);
      const j = await runtime.run<{ id: string }>(
        s.accessToken,
        'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
        f.tenant,
        'BILLING_GENERATE',
        JSON.stringify({ studentId: f.student, periodId: period }),
        randomUUID(),
      );
      const [old] =
        await admin`SELECT policy_version_id FROM automation_jobs WHERE id=${j.id}`;
      await put(admin as unknown as Query, 'policy_versions', {
        tenant_id: f.tenant,
        version_code: 'NEW_TEST_SNAPSHOT',
        effective_from: new Date(),
        config_snapshot: { changed: true },
        content_hash: (
          await admin`SELECT educore_r4.digest(' {"changed": true}'::jsonb::text) value`
        )[0].value,
      });
      const claim = await worker.claim();
      expect(claim!.id).toBe(j.id);
      expect(
        ((await worker.perform(claim!)) as { status: string }).status,
      ).toBe('COMPLETED');
      const [g] =
        await admin`SELECT policy_version_id FROM billing_run_generations WHERE tenant_id=${f.tenant}`;
      expect(g.policy_version_id).toBe(old.policy_version_id);
      expect(
        (
          await admin`SELECT status FROM invoices WHERE tenant_id=${f.tenant} AND period_id=${period}`
        )[0].status,
      ).toBe('DRAFT');
      const audits =
        await admin`SELECT actor_kind,actor_membership_id FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='GENERATION'`;
      expect(audits).toHaveLength(1);
      expect(audits[0]).toMatchObject({
        actor_kind: 'WORKER',
        actor_membership_id: null,
      });
      await expect(
        repository.worker!.$queryRawUnsafe(
          'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
          f.tenant,
          JSON.stringify({ operation: 'ROLE_ASSIGN' }),
        ),
      ).rejects.toThrow(/permission denied/);
    },
  );
  native(
    'C06 notifications consume committed R3 events and recheck parent/teacher scope',
    async () => {
      const { f, s } = await confirmedSchedule(),
        p = await actor(f, 'PARENT', 'STUDENT', f.student),
        teacher = await actor(f, 'TEACHER', 'CLASS', f.classId);
      await admin`UPDATE teacher_profiles SET membership_id=${teacher.member} WHERE id=${f.teacher}`;
      const link = (await runtime.iam(s.accessToken, f.tenant, {
        operation: 'PARENT_CREATE',
        parentMembershipId: p.member,
        studentId: f.student,
        evidenceReference: 'Verified evidence',
        reason: 'Create',
      })) as { id: string };
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'PARENT_VERIFY',
        id: link.id,
        reason: 'Verify',
      });
      const event = await scheduleEvent(f, s);
      // Prior failed-job alerts from earlier tests are drained by their own worker;
      // dispatch until this committed event reaches DONE, with an explicit bound.
      for (
        let n = 0;
        n < 20 &&
        (await admin`SELECT status FROM outbox_events WHERE id=${event}`)[0]
          .status !== 'DONE';
        n++
      )
        await worker.dispatch();
      const base = `/api/v1/tenants/${f.tenant}`;
      const inbox = await request(app.getHttpServer())
        .get(base + '/notifications')
        .auth(p.accessToken, { type: 'bearer' })
        .expect(200);
      expect(inbox.body.total).toBe(1);
      const id = inbox.body.items[0].id as string;
      await request(app.getHttpServer())
        .post(base + `/notifications/${id}/read`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(200);
      await request(app.getHttpServer())
        .post(base + `/notifications/${id}/read`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(200);
      await request(app.getHttpServer())
        .post(base + `/notifications/${id}/read`)
        .auth(teacher.accessToken, { type: 'bearer' })
        .expect(403);
      const teach = await request(app.getHttpServer())
        .get(base + '/notifications')
        .auth(teacher.accessToken, { type: 'bearer' })
        .expect(200);
      expect(teach.body.total).toBe(1);
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'PARENT_REVOKE',
        id: link.id,
        reason: 'Revoke',
      });
      expect(
        (
          await request(app.getHttpServer())
            .get(base + '/notifications')
            .auth(p.accessToken, { type: 'bearer' })
            .expect(200)
        ).body.total,
      ).toBe(0);
      await request(app.getHttpServer())
        .post(base + `/notifications/${id}/read`)
        .auth(p.accessToken, { type: 'bearer' })
        .expect(403);
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'ROLE_REVOKE',
        id: teacher.member,
        assignmentId: teacher.assignment,
        reason: 'Teacher scope revoked',
      });
      await request(app.getHttpServer())
        .get(base + '/notifications')
        .auth(teacher.accessToken, { type: 'bearer' })
        .expect(403);
      const [total] =
        await admin`SELECT count(*)::int n FROM notifications WHERE outbox_event_id=${event}`;
      await admin`UPDATE outbox_events SET status='NEW' WHERE id=${event}`;
      await worker.dispatch();
      expect(
        (
          await admin`SELECT count(*)::int n FROM notifications WHERE outbox_event_id=${event}`
        )[0].n,
      ).toBe(total.n);
    },
  );
  native(
    'X13 dispatcher rollback/crash and two workers do not lose or duplicate recipients',
    async () => {
      const { f, s } = await confirmedSchedule();
      const event = await scheduleEvent(f, s);
      const a = connect(firstWorkerConnection),
        b = connect(secondWorkerConnection);
      // Drain unrelated alerts first, before holding this event's tenant gate.
      for (let n = 0; n < 20; n++) {
        const [row] =
          await admin`SELECT count(*)::int n FROM outbox_events WHERE status='NEW' AND available_at<=clock_timestamp() AND id<>${event}`;
        if (!row.n) break;
        await worker.dispatch();
      }
      await a`BEGIN`;
      try {
        const first = (await a`SELECT educore_r4.dispatch_event() result`)[0]
          .result;
        expect(first.id).toBe(event);
        expect(
          (
            await admin`SELECT count(*)::int n FROM notifications WHERE outbox_event_id=${event}`
          )[0].n,
        ).toBe(0);
        expect(
          (await b`SELECT educore_r4.dispatch_event() result`)[0].result,
        ).toBeNull();
        await a`ROLLBACK`;
        expect(
          (await admin`SELECT status FROM outbox_events WHERE id=${event}`)[0]
            .status,
        ).toBe('NEW');
        const second = (await b`SELECT educore_r4.dispatch_event() result`)[0]
          .result;
        expect(second.id).toBe(event);
        expect(
          (
            await admin`SELECT count(*)::int n FROM notifications WHERE outbox_event_id=${event}`
          )[0].n,
        ).toBe(1);
        (evidence.races as unknown[]).push({
          name: 'outbox-two-workers-rollback-replay',
          firstRolledBack: true,
          secondSkippedLocked: true,
          recipientEffects: 1,
        });
      } finally {
        await a`ROLLBACK`;
      }
    },
  );
  native(
    'X14 fault between financial effect and root receipt rolls back all effects',
    async () => {
      const { f, s, invoice } = await issuedFixture();
      const ap = (await runtime.billing(s.accessToken, f.tenant, {
        ...intent(),
        operation: 'ADJUST_REQUEST',
        invoiceId: invoice,
        deltaVnd: '10000',
      })) as { id: string };
      await runtime.decide(s.accessToken, f.tenant, {
        ...intent(),
        approvalId: ap.id,
        decision: 'APPROVE',
      });
      await admin.unsafe(
        `CREATE FUNCTION public.r4_root_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_type='ROOT_EFFECT' AND NEW.tenant_id='${f.tenant}'::uuid THEN RAISE EXCEPTION 'INJECTED_RECEIPT_FAILURE' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await admin`CREATE TRIGGER r4_root_fault BEFORE INSERT ON idempotency_records FOR EACH ROW EXECUTE FUNCTION public.r4_root_fault()`;
      try {
        await expect(
          runtime.execute(s.accessToken, f.tenant, {
            ...intent(),
            approvalId: ap.id,
          }),
        ).rejects.toThrow(/INJECTED_RECEIPT_FAILURE/);
        expect(
          (
            await admin`SELECT status FROM approval_requests WHERE id=${ap.id}`
          )[0].status,
        ).toBe('APPROVED');
        expect(
          (
            await admin`SELECT count(*)::int n FROM invoice_adjustments WHERE approval_request_id=${ap.id}`
          )[0].n,
        ).toBe(0);
      } finally {
        await admin`DROP TRIGGER r4_root_fault ON idempotency_records`;
        await admin`DROP FUNCTION public.r4_root_fault()`;
      }
      expect(
        (
          (await runtime.execute(s.accessToken, f.tenant, {
            ...intent(),
            approvalId: ap.id,
          })) as { status: string }
        ).status,
      ).toBe('COMPLETED');
    },
  );
  native(
    'X15 deferred commit fence rejects a worker stalled after the effect check',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        barrier = 847201;
      const j = await runtime.run<{ id: string }>(
        s.accessToken,
        'SELECT educore_r4.enqueue($1::uuid,$2::text,$3::jsonb,$4::text) result',
        f.tenant,
        'SCHEDULE_CHECK',
        JSON.stringify({ sessionId: f.session }),
        randomUUID(),
      );
      const claim = await worker.claim();
      expect(claim!.id).toBe(j.id);
      await admin.unsafe(
        `CREATE FUNCTION public.r4_commit_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_type='R4:JOB' AND NEW.tenant_id='${f.tenant}'::uuid THEN PERFORM pg_advisory_xact_lock(${barrier}); END IF; RETURN NEW; END $$`,
      );
      await admin`CREATE TRIGGER r4_commit_barrier AFTER INSERT ON idempotency_records FOR EACH ROW EXECUTE FUNCTION public.r4_commit_barrier()`;
      const q = connect(firstWorkerConnection);
      let pending: Promise<{ code: string | null }> | undefined;
      try {
        await admin`SELECT pg_advisory_lock(${barrier})`;
        await admin`UPDATE automation_jobs SET lease_until=clock_timestamp()+interval '2 seconds' WHERE id=${j.id}`;
        await q`BEGIN`;
        const pid = (await q`SELECT pg_backend_pid() pid`)[0].pid as number,
          observerPid = (await admin`SELECT pg_backend_pid() pid`)[0]
            .pid as number;
        pending = (async () => {
          try {
            await q`SELECT educore_r4.perform_job(${j.id}::uuid,${claim!.fence}::bigint)`;
            await q`COMMIT`;
            return { code: null };
          } catch (e) {
            await q`ROLLBACK`;
            return { code: (e as { code: string }).code };
          }
        })();
        await waitBlocked(admin, pid, observerPid);
        const deadline = Date.now() + 4000;
        while (
          !(
            await admin`SELECT clock_timestamp()>=lease_until expired FROM automation_jobs WHERE id=${j.id}`
          )[0].expired
        ) {
          if (Date.now() > deadline) throw Error('LEASE_CLOCK_NOT_OBSERVED');
          await new Promise((r) => setTimeout(r, 10));
        }
        await admin`SELECT pg_advisory_unlock(${barrier})`;
        expect((await pending).code).toBe('40001');
        expect(
          (
            await admin`SELECT count(*)::int n FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type='R4:JOB'`
          )[0].n,
        ).toBe(0);
        expect(
          (await admin`SELECT status FROM automation_jobs WHERE id=${j.id}`)[0]
            .status,
        ).toBe('RUNNING');
        (evidence.races as unknown[]).push({
          name: 'stalled-worker-deferred-commit',
          pid,
          observerPid,
          observedWait: true,
          observedLeaseExpiry: true,
          commitRolledBack: true,
        });
      } finally {
        await admin`SELECT pg_advisory_unlock(${barrier})`;
        await pending;
        await q`ROLLBACK`;
        await admin`DROP TRIGGER r4_commit_barrier ON idempotency_records`;
        await admin`DROP FUNCTION public.r4_commit_barrier()`;
      }
      const w2 = connect(secondWorkerConnection),
        second = (await w2`SELECT educore_r4.claim_job() result`)[0].result;
      expect(second.id).toBe(j.id);
      expect(
        (
          await w2`SELECT educore_r4.perform_job(${j.id}::uuid,${second.fence}::bigint) result`
        )[0].result.status,
      ).toBe('COMPLETED');
    },
  );
  native(
    'A13 member onboarding uses activation and rejects public self-grant',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        email = randomUUID() + '@r4.invalid',
        base = `/api/v1/tenants/${f.tenant}`;
      const member = await request(app.getHttpServer())
        .post(base + '/members')
        .auth(s.accessToken, { type: 'bearer' })
        .send({ email, displayName: 'Pending member', reason: 'Create member' })
        .expect(201);
      expect(member.body.status).toBe('PENDING_ACTIVATION');
      expect(
        (
          await admin`SELECT count(*)::int n FROM credentials c JOIN users u ON u.id=c.user_id WHERE u.email_normalized=${email}`
        )[0].n,
      ).toBe(0);
      await auth.requestOtp(email, 'ACTIVATION');
      await auth.reset(
        email,
        delivery.messages.at(-1)!.otp,
        password,
        'ACTIVATION',
      );
      expect(
        (
          await admin`SELECT status FROM tenant_memberships WHERE id=${member.body.id}`
        )[0].status,
      ).toBe('ACTIVE');
      await expect(
        runtime.iam(s.accessToken, f.tenant, {
          operation: 'ROLE_ASSIGN',
          id: f.member,
          roleId: f.role,
          scopeKind: 'TENANT',
          reason: 'Attempt self grant',
        }),
      ).rejects.toThrow(/INVALID_ROLE_OR_SELF_GRANT/);
    },
  );
  native(
    'A14 multiple tenants do not union roles across tenant boundaries',
    async () => {
      const f = await fresh(),
        g = await fresh(),
        owner = await sessionFor(g),
        [user] =
          await admin`SELECT email_normalized FROM users WHERE id=${f.user}`;
      const member = await runtime.run<{ id: string }>(
        owner.accessToken,
        'SELECT educore_r4.create_member($1::uuid,$2::text,$3::text,$4::text) result',
        g.tenant,
        user.email_normalized,
        'Existing user',
        'Explicit existing-user attachment',
      );
      const [role] =
        await admin`SELECT id FROM roles WHERE tenant_id=${g.tenant} AND code='TEACHER'`;
      await runtime.iam(owner.accessToken, g.tenant, {
        operation: 'ROLE_ASSIGN',
        id: member.id,
        roleId: role.id,
        scopeKind: 'CLASS',
        classId: g.classId,
        reason: 'Teacher only in second tenant',
      });
      const login = await auth.login(user.email_normalized as string, password);
      expect((login.allowedTenants as unknown[]).length).toBe(2);
      const selected = await auth.selectTenant(login.accessToken, g.tenant);
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${g.tenant}/roles`)
        .auth(selected.accessToken, { type: 'bearer' })
        .expect(403);
      const first = await auth.selectTenant(selected.accessToken, f.tenant);
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/roles`)
        .auth(first.accessToken, { type: 'bearer' })
        .expect(200);
    },
  );
  native('R8 management readers require tenant grants and return current assignments', async () => {
    const f = await fresh(), s = await sessionFor(f), subject = await actor(f, 'STUDENT', 'STUDENT', f.student);
    const list = await runtime.managementRead(s.accessToken, f.tenant, 'MEMBERS') as { items: { id: string; email: string; assignments: { roleCode: string }[] }[] };
    expect(list.items.some((m) => m.id === subject.member && m.assignments.some((a) => a.roleCode === 'STUDENT'))).toBe(true);
    const detail = await runtime.managementRead(s.accessToken, f.tenant, 'MEMBER', subject.member) as { id: string; email: string; assignments: { roleCode: string }[] };
    expect(detail.id).toBe(subject.member);
    expect(detail.email).toBeTruthy();
    await expect(runtime.managementRead(subject.accessToken, f.tenant, 'MEMBERS')).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
    const other = await fresh();
    await expect(runtime.managementRead(s.accessToken, other.tenant, 'MEMBER', subject.member)).rejects.toThrow();
  });
  native('R8 relationship reader tracks pending, verified and revoked without opening Parent access', async () => {
    const f = await fresh(), s = await sessionFor(f), parent = await actor(f, 'PARENT', 'STUDENT', f.student);
    const created = await runtime.iam(s.accessToken, f.tenant, {
      operation: 'PARENT_CREATE', parentMembershipId: parent.member, studentId: f.student,
      evidenceReference: 'R8 evidence', reason: 'R8 create',
    }) as { id: string };
    const links = () => runtime.managementRead(s.accessToken, f.tenant, 'RELATIONSHIPS') as Promise<{ items: { id: string; status: string }[] }>;
    expect((await links()).items.find((l) => l.id === created.id)?.status).toBe('PENDING_VERIFICATION');
    await expect(runtime.managementRead(parent.accessToken, f.tenant, 'RELATIONSHIPS')).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
    await runtime.iam(s.accessToken, f.tenant, { operation: 'PARENT_VERIFY', id: created.id, reason: 'R8 verify' });
    expect((await links()).items.find((l) => l.id === created.id)?.status).toBe('ACTIVE');
    await runtime.iam(s.accessToken, f.tenant, { operation: 'PARENT_REVOKE', id: created.id, reason: 'R8 revoke' });
    expect((await links()).items.find((l) => l.id === created.id)?.status).toBe('INACTIVE');
    const other = await fresh();
    await expect(runtime.managementRead(s.accessToken, other.tenant, 'RELATIONSHIPS')).rejects.toThrow();
  });
  native('R8 relationship selectors require their own TENANT read permissions', async () => {
    const f = await fresh();
    const academic = await actor(f, 'ACADEMIC_STAFF');
    const parent = await actor(f, 'PARENT', 'STUDENT', f.student);
    const parents = await runtime.managementRead(academic.accessToken, f.tenant, 'PARENTS') as { items: { id: string }[] };
    const students = await runtime.managementRead(academic.accessToken, f.tenant, 'STUDENTS') as { items: { id: string }[] };
    expect(parents.items.some((p) => p.id === parent.member)).toBe(true);
    expect(students.items.some((s) => s.id === f.student)).toBe(true);
    const accountant = await actor(f, 'ACCOUNTANT');
    await expect(runtime.managementRead(accountant.accessToken, f.tenant, 'PARENTS')).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
    await expect(runtime.managementRead(accountant.accessToken, f.tenant, 'STUDENTS')).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
    await expect(runtime.managementRead(parent.accessToken, f.tenant, 'PARENTS')).rejects.toThrow(/PERMISSION_OR_SCOPE_DENIED/);
  });
  native(
    'A15 unrelated TENANT role cannot rescue a CLASS-only financial grant',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        a = await actor(f, 'ACCOUNTANT', 'CLASS', f.classId),
        [role] =
          await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='TEACHER'`;
      await runtime.iam(s.accessToken, f.tenant, {
        operation: 'ROLE_ASSIGN',
        id: a.member,
        roleId: role.id,
        scopeKind: 'TENANT',
        reason: 'Unrelated teacher role',
      });
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/students/${f.student2}/wallet`)
        .auth(a.accessToken, { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/students/${f.student}/wallet`)
        .auth(a.accessToken, { type: 'bearer' })
        .expect(403);
    },
  );
  native(
    'A16 global disable is atomic across all Manager tenants',
    async () => {
      const f = await fresh(),
        g = await fresh(),
        s = await sessionFor(g),
        [user] =
          await admin`SELECT email_normalized FROM users WHERE id=${f.user}`;
      const m = await runtime.run<{ id: string }>(
        s.accessToken,
        'SELECT educore_r4.create_member($1::uuid,$2::text,$3::text,$4::text) result',
        g.tenant,
        user.email_normalized,
        'Existing Manager',
        'Attach current identity',
      );
      await runtime.iam(s.accessToken, g.tenant, {
        operation: 'ROLE_ASSIGN',
        id: m.id,
        roleId: g.role,
        scopeKind: 'TENANT',
        reason: 'Second tenant Manager',
      });
      const q = connect(operatorConnection);
      await expect(
        q`SELECT educore_r4.disable_user(${f.user}::uuid,'Multi-tenant disable')`,
      ).rejects.toThrow(/LAST_ACTIVE_MANAGER/);
      expect(
        (await admin`SELECT status FROM users WHERE id=${f.user}`)[0].status,
      ).toBe('ACTIVE');
      expect(
        (await admin`SELECT educore_r4.manager_count(${g.tenant}::uuid) n`)[0]
          .n,
      ).toBe(2);
    },
  );
  native(
    'D04 password change revokes every old session and HTTP error details are sanitized',
    async () => {
      const f = await fresh(),
        one = await sessionFor(f),
        two = await sessionFor(f),
        next = 'Changed password 123!';
      await request(app.getHttpServer())
        .post('/api/v1/auth/password/change')
        .auth(one.accessToken, { type: 'bearer' })
        .send({ oldPassword: password, newPassword: next })
        .expect(204);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .auth(two.accessToken, { type: 'bearer' })
        .expect(401);
      const error = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/roles`)
        .set('X-User-Id', f.user)
        .set('X-Membership-Id', f.member)
        .expect(401);
      expect(Object.keys(error.body).sort()).toEqual([
        'code',
        'correlationId',
        'message',
      ]);
      expect(JSON.stringify(error.body)).not.toMatch(
        /prisma|password|SELECT|stack|educore_r4/,
      );
      expect((await auth.login(one.email, next)).accessToken).toBeTypeOf(
        'string',
      );
    },
  );
  native(
    'D05 HTTP correlation reaches atomic role audit and authorized explanation',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        a = await actor(f, 'STUDENT', 'STUDENT', f.student),
        correlation = randomUUID(),
        [role] =
          await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='TEACHER'`;
      const response = await request(app.getHttpServer())
        .post(
          `/api/v1/tenants/${f.tenant}/members/${a.member}/role-assignments`,
        )
        .auth(s.accessToken, { type: 'bearer' })
        .set('X-Request-Id', correlation)
        .send({
          roleId: role.id,
          scopeKind: 'CLASS',
          classId: f.classId,
          reason: 'Audited role assignment',
        })
        .expect(201);
      expect(response.headers['x-request-id']).toBe(correlation);
      const explanation = await request(app.getHttpServer())
        .get(`/api/v1/tenants/${f.tenant}/audit/operations/${correlation}`)
        .auth(s.accessToken, { type: 'bearer' })
        .expect(200);
      expect(explanation.body.total).toBe(1);
      expect(explanation.body.items[0].eventType).toBe('ROLE_ASSIGN');
    },
  );
  native(
    'D06 outbox refuses secret-bearing payloads before commit',
    async () => {
      const f = await fresh();
      await expect(
        put(admin as unknown as Query, 'outbox_events', {
          tenant_id: f.tenant,
          event_key: randomUUID(),
          event_type: 'ADMIN_ALERT',
          aggregate_type: 'Tenant',
          aggregate_id: f.tenant,
          payload_json: { otp: '123456' },
          occurred_at: new Date(),
          status: 'NEW',
          attempt_count: 0,
          available_at: new Date(),
          correlation_id: randomUUID(),
        }),
      ).rejects.toThrow(/OUTBOX_SECRET_PAYLOAD_FORBIDDEN/);
    },
  );
  native(
    'D07 fixed owners/search paths, no PUBLIC function execution and no raw runtime DML',
    async () => {
      const rows =
        await admin`SELECT p.proname,r.rolname,p.prosecdef,p.proconfig,EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner WHERE n.nspname='educore_r4' ORDER BY p.proname`;
      for (const f of rows) {
        expect(f.rolname).toBe('educore_r4_owner');
        expect(f.public_execute).toBe(false);
        expect(
          (f.proconfig as string[]).some(
            (x) =>
              x.startsWith('search_path=pg_catalog,') && x.endsWith('pg_temp'),
          ),
        ).toBe(true);
      }
      for (const table of [
        'users',
        'tenant_memberships',
        'membership_roles',
        'access_scopes',
        'audit_logs',
        'approval_decisions',
        'job_attempts',
        'automation_jobs',
        'idempotency_records',
        'wallet_transactions',
      ])
        await expect(
          repository.api.$executeRawUnsafe(`DELETE FROM public.${table}`),
        ).rejects.toThrow(/permission denied/);
      await expect(
        repository.api.$executeRawUnsafe(
          'CREATE TABLE public.r4_forbidden_ddl(id int)',
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        repository.api.$executeRawUnsafe('SET ROLE educore_r4_owner'),
      ).rejects.toThrow(/permission denied/);
      evidence.functions = rows;
    },
  );
  native(
    'D08 successful migrate deploy replay and schema drift remain clean',
    async () => {
      const url = process.env.R4_TEST_URL!,
        cli = createRequire(import.meta.url).resolve('prisma/build/index.js');
      for (const args of [
        ['migrate', 'deploy'],
        [
          'migrate',
          'diff',
          '--from-config-datasource',
          '--to-schema',
          'prisma/schema.prisma',
          '--exit-code',
        ],
      ]) {
        try {
          execFileSync(process.execPath, [cli, ...args], {
            cwd: resolve('.'),
            env: { ...process.env, DATABASE_URL: url },
            stdio: 'pipe',
            timeout: 60_000,
          });
        } catch (e) {
          const x = e as { stdout?: Buffer; stderr?: Buffer };
          throw Error(
            (String(x.stdout ?? '') + String(x.stderr ?? ''))
              .replaceAll(url, '[URL]')
              .replaceAll(new URL(url).password, '[SECRET]'),
          );
        }
      }
      evidence.redeploy = 'NO_PENDING_MIGRATIONS';
      evidence.schemaDrift = 'EMPTY';
    },
  );
  native(
    'X16 rotated access tokens cannot change session state after waiting for User lock',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        c = auth.tokens.verify(s.accessToken);
      const result = await race(
        'refresh-vs-logout-fresh-session',
        {
          url: authConnection,
          sql: 'SELECT educore_r4.refresh($1::text,$2::text,$3::text,$4::text,$5::text) result',
          args: [
            digest(s.refreshToken),
            digest(s.csrfToken),
            digest(secret()),
            digest(auth.tokens.issue(f.user, c.sid, f.tenant)),
            digest(secret()),
          ],
        },
        { token: s.accessToken, sql: 'SELECT educore_r4.logout()', args: [] },
      );
      expect(result.two.code).toBe('28000');
    },
  );
  native(
    'X17 role revoke/regrant preserves history and active uniqueness',
    async () => {
      for (const commit of [true, false]) {
        const f = await fresh(),
          s = await sessionFor(f),
          a = await actor(f, 'ACCOUNTANT'),
          [role] =
            await admin`SELECT role_id FROM membership_roles WHERE id=${a.assignment}`;
        const result = await race(
          'role-revoke-vs-regrant',
          {
            token: s.accessToken,
            sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
            args: [
              f.tenant,
              JSON.stringify({
                operation: 'ROLE_REVOKE',
                id: a.member,
                assignmentId: a.assignment,
                reason: 'Revoke role',
              }),
            ],
          },
          {
            token: s.accessToken,
            sql: 'SELECT educore_r4.iam($1::uuid,$2::jsonb)',
            args: [
              f.tenant,
              JSON.stringify({
                operation: 'ROLE_ASSIGN',
                id: a.member,
                roleId: role.role_id,
                scopeKind: 'TENANT',
                reason: 'Regrant role',
              }),
            ],
          },
          commit,
        );
        expect(result.two.code).toBe(commit ? null : '23505');
        expect(
          (
            await admin`SELECT count(*)::int n FROM membership_roles WHERE tenant_id=${f.tenant} AND membership_id=${a.member} AND revoked_at IS NULL`
          )[0].n,
        ).toBe(1);
      }
    },
  );
  native(
    'C07 authorized manual retry is idempotent and preserves attempt/policy history',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f),
        base = `/api/v1/tenants/${f.tenant}`;
      const j = await request(app.getHttpServer())
        .post(base + '/jobs')
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ kind: 'SCHEDULE_CHECK', payload: { sessionId: f.session } })
        .expect(201);
      await admin.unsafe(
        `CREATE FUNCTION public.r4_manual_retry_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operation_type='R4:JOB' AND NEW.tenant_id='${f.tenant}'::uuid THEN RAISE EXCEPTION 'MANUAL_RECOVERY_TEST' USING ERRCODE='23514'; END IF; RETURN NEW; END $$`,
      );
      await admin`CREATE TRIGGER r4_manual_retry_fault BEFORE INSERT ON idempotency_records FOR EACH ROW EXECUTE FUNCTION public.r4_manual_retry_fault()`;
      try {
        const claim = await worker.claim();
        expect(claim!.id).toBe(j.body.id);
        expect(
          ((await worker.perform(claim!)) as { status: string }).status,
        ).toBe('FAILED');
      } finally {
        await admin`DROP TRIGGER r4_manual_retry_fault ON idempotency_records`;
        await admin`DROP FUNCTION public.r4_manual_retry_fault()`;
      }
      const key = randomUUID(),
        retry = () =>
          request(app.getHttpServer())
            .post(base + `/jobs/${j.body.id}/retry`)
            .auth(s.accessToken, { type: 'bearer' })
            .set('Idempotency-Key', key)
            .send({ reason: 'Explicit operator retry', confirmed: true });
      expect((await retry().expect(200)).body.status).toBe('READY');
      expect((await retry().expect(200)).body.status).toBe('READY');
      const claim = await worker.claim();
      expect(
        ((await worker.perform(claim!)) as { status: string }).status,
      ).toBe('COMPLETED');
      const current = await request(app.getHttpServer())
        .get(base + `/jobs/${j.body.id}`)
        .auth(s.accessToken, { type: 'bearer' })
        .expect(200);
      expect(current.body.attemptCount).toBe(2);
      expect(current.body.status).toBe('COMPLETED');
    },
  );
  native(
    'D09 production cookie flags and CORS allowlist are enforced over real HTTP',
    async () => {
      const f = await fresh(),
        [u] =
          await admin`SELECT email_normalized FROM users WHERE id=${f.user}`;
      const repo = new R4Repository(authConnection, apiConnection),
        config = {
          ...auth.config,
          production: true,
          origins: ['https://web.educore.example'],
        };
      const module = await Test.createTestingModule({
        imports: [
          R4Module.register(repo, config, new UnavailableOtpDelivery()),
        ],
      }).compile();
      const prod = module.createNestApplication();
      configureR4Http(prod, config);
      await prod.init();
      try {
        const response = await request(prod.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Origin', config.origins[0])
          .send({ email: u.email_normalized, password })
          .expect(200);
        const cookie = response.headers['set-cookie'][0] as string;
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/Secure/);
        expect(cookie).toMatch(/SameSite=Lax/);
        expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
        expect(cookie).not.toMatch(/Domain=/);
        const blocked = await request(prod.getHttpServer())
          .options('/api/v1/auth/refresh')
          .set('Origin', 'https://attacker.example')
          .set('Access-Control-Request-Method', 'POST');
        expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
      } finally {
        await prod.close();
        await repo.close();
      }
    },
  );
  native(
    'D10 slow OTP delivery does not delay the generic known-email HTTP response',
    async () => {
      const f = await fresh(),
        [u] =
          await admin`SELECT email_normalized FROM users WHERE id=${f.user}`;
      const repo = new R4Repository(authConnection, apiConnection);
      let release!: () => void,
        started = false;
      const deliveryGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const port = {
        deliver: async () => {
          started = true;
          await deliveryGate;
        },
      };
      const module = await Test.createTestingModule({
        imports: [R4Module.register(repo, auth.config, port)],
      }).compile();
      const isolated = module.createNestApplication();
      configureR4Http(isolated, auth.config);
      await isolated.init();
      try {
        const known = await request(isolated.getHttpServer())
          .post('/api/v1/auth/password/otp/request')
          .send({ email: u.email_normalized })
          .timeout({ response: 5000 })
          .expect(202);
        expect(started).toBe(false);
        const unknown = await request(isolated.getHttpServer())
          .post('/api/v1/auth/password/otp/request')
          .send({ email: randomUUID() + '@r4.invalid' })
          .expect(202);
        expect(known.body).toEqual(unknown.body);
        // The delivery promise remains unresolved until AFTER both responses.
      } finally {
        release();
        await isolated.close();
        await repo.close();
      }
    },
  );
  native(
    'A17 expired OTP/session and globally disabled account are rejected',
    async () => {
      const f = await fresh(),
        s = await sessionFor(f);
      await actor(f, 'MANAGER');
      await auth.requestOtp(s.email, 'PASSWORD_RESET');
      expect(await recoveryWorker.tick()).toBe('DONE');
      const otp = delivery.messages.at(-1)!.otp;
      await admin`UPDATE password_reset_otps SET requested_at=statement_timestamp()-interval '16 minutes',expires_at=statement_timestamp()-interval '1 minute' WHERE user_id=${f.user} AND consumed_at IS NULL`;
      await expect(
        auth.reset(s.email, otp, password, 'PASSWORD_RESET'),
      ).rejects.toThrow('INVALID_OTP');
      const claims = auth.tokens.verify(s.accessToken);
      await admin`UPDATE auth_sessions SET issued_at=clock_timestamp()-interval '8 days',expires_at=clock_timestamp()-interval '1 day',access_expires_at=clock_timestamp()-interval '1 day' WHERE id=${claims.sid}`;
      await expect(auth.me(s.accessToken)).rejects.toThrow();
      await expect(auth.refresh(s.refreshToken, s.csrfToken)).rejects.toThrow(
        'AUTH_REQUIRED',
      );
      const op = connect(operatorConnection);
      await op`SELECT educore_r4.disable_user(${f.user}::uuid,'Disabled login verification')`;
      await expect(auth.login(s.email, password)).rejects.toThrow(
        'INVALID_CREDENTIALS',
      );
    },
  );
});
