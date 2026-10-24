import 'reflect-metadata';
import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
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
import { browserAuthJourney, browserAvailable } from './browser-auth.js';

let admin: postgres.Sql;
let repository: R4Repository;
let auth: AuthService;
const delivery = new CaptureOtpDelivery();
let app: INestApplication;
let fixture: Awaited<ReturnType<typeof seed>>;
const password = 'Test password 123!';
let email: string;
let authConnection: string,
  apiConnection: string,
  operatorConnection: string,
  secondWorkerConnection: string;
let firstWorkerConnection: string;
let runtime: RuntimeService, worker: R4Worker, sharedPasswordHash: string;
const clients: postgres.Sql[] = [];
const evidence: Record<string, unknown> = { races: [], cases: {} };
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
  auth = new AuthService(repository, delivery, {
    jwtSecret: randomBytes(32).toString('hex'),
    otpPepper: randomBytes(32).toString('hex'),
    issuer: 'educore-test',
    audience: 'educore-web',
    origins: ['http://localhost:5173'],
    production: false,
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
    expect(response.body).toMatchObject({ userId: f.user, tenantId: f.tenant,
      screenIds: ['OP01', 'OP04', 'OP05', 'OP06', 'OP07'] });
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
    expect(empty.body.screenIds).toEqual([]);
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
    expect(menu.body.screenIds).toEqual(['OP04', 'OP05']);
    const resource = await request(app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/approvals/${randomUUID()}`)
      .set('Authorization', authorization).expect(404);
    expect(resource.body.code).toBe('NOT_FOUND');
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
      email: user.email_normalized as string, password, tenantId: f.tenant });
    expect(Object.values(verified).every((value) => value === true)).toBe(true);
    const [row] = await admin`SELECT count(*)::int revoked FROM auth_sessions WHERE user_id=${f.user} AND revoked_at IS NOT NULL`;
    expect(row.revoked).toBeGreaterThanOrEqual(1);
    (evidence.cases as Record<string, unknown>).browser = verified;
  });
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
      const decision = await request(app.getHttpServer())
        .post(base + `/approvals/${approval}/decisions`)
        .auth(s.accessToken, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ decision: 'APPROVE', reason: 'Manual single Manager approval' })
        .expect(200);
      expect(decision.body.status).toBe('APPROVED');
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
  native(
    'A15 unrelated TENANT role cannot widen a CLASS financial grant',
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
        .expect(200);
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
            .send({ reason: 'Explicit operator retry' });
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
        expect(started).toBe(true);
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
