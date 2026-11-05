import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import postgres from 'postgres';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import { R4Module, configureR4Http } from '../../src/identity-access/r4.module.js';
import { CaptureOtpDelivery } from '../../src/identity-access/otp-delivery.js';
import { passwordHash } from '../../src/identity-access/crypto.js';
import { preserveFixtureManager, put, seed, waitBlocked, type Query } from '../schema-integrity/support.js';

const password = 'R8 disposable test password!';
const origin = 'http://localhost:5173';
let admin: postgres.Sql, repository: R4Repository, app: INestApplication;
let fixture: Awaited<ReturnType<typeof seed>>;
let address: string;
let apiConnection: string;

beforeAll(async () => {
  if (process.env.R8_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER') throw Error('DISPOSABLE_REQUIRED');
  const url = new URL(process.env.R8_TEST_URL ?? '');
  if (url.hostname !== '127.0.0.1' || !/^\/educore_r4_r8$/.test(url.pathname) || url.search || url.hash)
    throw Error('UNSAFE_TARGET');
  admin = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => undefined });
  const [admission] = await admin`SELECT current_setting('server_version_num')::int version,
    (SELECT count(*)::int FROM _prisma_migrations WHERE finished_at IS NOT NULL) migrations,
    (SELECT count(*)::int FROM public.tenants) tenants`;
  if (admission.version < 160000 || admission.version >= 170000 || admission.migrations < 36 || admission.tenants !== 0)
    throw Error('R8_TARGET_NOT_FRESH');
  const connection = async (role: string) => {
    const name = `r8_${role.slice(-3)}_${randomBytes(4).toString('hex')}`;
    const pass = randomBytes(24).toString('hex');
    await admin.unsafe(`CREATE ROLE ${name} LOGIN PASSWORD '${pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${role}`);
    const next = new URL(url); next.username = name; next.password = pass; return next.toString();
  };
  apiConnection = await connection('educore_r4_api');
  repository = new R4Repository(await connection('educore_r4_auth'), apiConnection);
  await repository.assertRuntime();
  fixture = await admin.begin(async (tx) => {
    const f = await seed(tx as unknown as Query, { enrollmentFrom: '2020-01-01T00:00:00Z', policyEffectiveFrom: '2020-01-01T00:00:00Z' });
    await tx`SELECT educore_r4.seed(${f.tenant}::uuid)`;
    await tx`UPDATE membership_roles SET role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='MANAGER') WHERE id=${f.membershipRole}`;
    await tx`UPDATE teacher_profiles SET membership_id=${f.member} WHERE id=${f.teacher}`;
    return f;
  });
  await put(admin as unknown as Query, 'class_teacher_assignments', {
    tenant_id: fixture.tenant, class_id: fixture.classId, teacher_id: fixture.teacher,
    role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: fixture.member,
  });
  await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at)
    VALUES(${fixture.user},${await passwordHash(password)},clock_timestamp())`;
  address = (await admin`SELECT email_normalized FROM users WHERE id=${fixture.user}`)[0].email_normalized as string;
  const config = { jwtSecret: randomBytes(32).toString('hex'), otpPepper: randomBytes(32).toString('hex'),
    issuer: 'educore-r8-test', audience: 'educore-web', origins: [origin], production: false };
  const module = await Test.createTestingModule({ imports: [R4Module.register(repository, config, new CaptureOtpDelivery())] }).compile();
  app = module.createNestApplication(); configureR4Http(app, config); await app.init();
}, 120_000);

afterAll(async () => { await app?.close(); await repository?.close(); await admin?.end(); });

describe('R8 real HTTP Scheduling to Attendance journey', () => {
  it('logs in, selects tenant, creates room/session, confirms, marks, finalizes, and reads the result', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ email: address, password }).expect(200);
    const selected = await request(app.getHttpServer()).post('/api/v1/auth/select-tenant')
      .set('Authorization', `Bearer ${login.body.accessToken}`).send({ tenantId: fixture.tenant }).expect(200);
    const token = selected.body.accessToken as string;
    const base = `/api/v1/tenants/${fixture.tenant}`;
    const bearer = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
    const key = () => randomUUID();
    const room = await bearer(request(app.getHttpServer()).post(`${base}/scheduling/rooms`))
      .set('Idempotency-Key', key()).send({ code: 'R8-ROOM', name: 'R8 Room', capacity: 10, reason: 'MVP journey' }).expect(201);
    const startsAt = new Date(Date.now() + 8_000).toISOString();
    const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
    const created = await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions`))
      .set('Idempotency-Key', key()).send({ classId: fixture.classId, teacherId: fixture.teacher, roomId: room.body.id,
        deliveryMode: 'ONSITE', startsAt, endsAt, reason: 'MVP journey' }).expect(201);
    const preview = await bearer(request(app.getHttpServer()).get(`${base}/scheduling/drafts/${created.body.id}/preview`)).expect(200);
    expect(preview.body).toMatchObject({ ready: true, reserved: false });
    await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions/${created.body.id}/confirm`))
      .set('Idempotency-Key', key()).send({ reason: 'MVP journey' }).expect(201);
    const conflict = await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions`))
      .set('Idempotency-Key', key()).send({ classId: fixture.classId, teacherId: fixture.teacher, roomId: room.body.id,
        deliveryMode: 'ONSITE', startsAt: new Date(Date.parse(startsAt) + 1_000).toISOString(),
        endsAt: new Date(Date.parse(endsAt) + 1_000).toISOString(), reason: 'Expected conflict' }).expect(201);
    await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions/${conflict.body.id}/confirm`))
      .set('Idempotency-Key', key()).send({ reason: 'Expected conflict' }).expect(409);
    const adjacent = await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions`))
      .set('Idempotency-Key', key()).send({ classId: fixture.classId, teacherId: fixture.teacher, roomId: room.body.id,
        deliveryMode: 'ONSITE', startsAt: endsAt, endsAt: new Date(Date.parse(endsAt) + 3_600_000).toISOString(),
        reason: 'Adjacent interval' }).expect(201);
    await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions/${adjacent.body.id}/confirm`))
      .set('Idempotency-Key', key()).send({ reason: 'Adjacent interval' }).expect(201);
    const calendar = await bearer(request(app.getHttpServer()).get(`${base}/scheduling/calendar`))
      .query({ from: new Date(Date.parse(startsAt) - 3_600_000).toISOString(), to: new Date(Date.parse(endsAt) + 3_600_000).toISOString() }).expect(200);
    expect(calendar.body.items.some((row: { id: string }) => row.id === created.body.id)).toBe(true);
    const sheet = await bearer(request(app.getHttpServer()).get(`${base}/attendance/sessions/${created.body.id}`)).expect(200);
    expect(sheet.body.participants).toHaveLength(1);
    const parentUser = await put(admin as unknown as Query, 'users', {
      email_normalized: `${randomUUID()}@r8.invalid`, display_name: 'R8 parent', status: 'ACTIVE',
    });
    const parentMember = await put(admin as unknown as Query, 'tenant_memberships', {
      tenant_id: fixture.tenant, user_id: parentUser, status: 'ACTIVE',
    });
    const [parentRole] = await admin`SELECT id FROM roles WHERE tenant_id=${fixture.tenant} AND code='PARENT'`;
    const parentAssignment = await put(admin as unknown as Query, 'membership_roles', {
      tenant_id: fixture.tenant, membership_id: parentMember, role_id: parentRole.id,
      assigned_by_membership_id: fixture.member,
    });
    const parentScope = await put(admin as unknown as Query, 'access_scopes', {
      tenant_id: fixture.tenant, membership_role_id: parentAssignment,
      scope_kind: 'TENANT',
    });
    await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at)
      VALUES(${parentUser},${await passwordHash(password)},clock_timestamp())`;
    const parentEmail = (await admin`SELECT email_normalized FROM users WHERE id=${parentUser}`)[0].email_normalized as string;
    const parentLogin = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ email: parentEmail, password }).expect(200);
    const parentSelected = await request(app.getHttpServer()).post('/api/v1/auth/select-tenant')
      .set('Authorization', `Bearer ${parentLogin.body.accessToken}`).send({ tenantId: fixture.tenant }).expect(200);
    const parentBearer = (r: request.Test) => r.set('Authorization', `Bearer ${parentSelected.body.accessToken}`);
    const absenceId = await put(admin as unknown as Query, 'absence_requests', {
      tenant_id: fixture.tenant, participant_id: sheet.body.participants[0].id,
      requester_membership_id: fixture.member, submitted_at: new Date(), reason: 'Scoped leave read',
      is_late_notice: false, status: 'PENDING_APPROVAL',
    });
    const parentLeaves = () => parentBearer(request(app.getHttpServer()).get(`${base}/attendance/leaves`));
    expect((await parentLeaves().expect(200)).body.items).toHaveLength(0);
    const link = await put(admin as unknown as Query, 'parent_student_links', {
      tenant_id: fixture.tenant, parent_membership_id: parentMember, student_id: fixture.student,
      relationship: 'PARENT', evidence_reference: 'R8 focused permission test',
      verified_by_membership_id: fixture.member, verified_at: new Date(),
    });
    const visible = await parentLeaves().expect(200);
    expect(visible.body.items.map((row: { id: string }) => row.id)).toEqual([absenceId]);
    expect(visible.body.items[0].canDecide).toBe(false);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${fixture.tenant} AND role_id=${parentRole.id}
      AND permission_id=(SELECT id FROM permissions WHERE code='absence.read')`;
    expect((await parentLeaves().expect(200)).body.items).toHaveLength(0);
    await admin.unsafe(readFileSync('prisma/migrations/202610250009_r8_parent_leave_read/migration.sql', 'utf8'));
    expect((await parentLeaves().expect(200)).body.items.map((row: { id: string }) => row.id)).toEqual([absenceId]);
    await parentBearer(request(app.getHttpServer()).get(`/api/v1/tenants/${randomUUID()}/attendance/leaves`)).expect(403);
    await admin`DELETE FROM access_scopes WHERE tenant_id=${fixture.tenant} AND id=${parentScope}`;
    expect((await parentLeaves().expect(200)).body.items).toHaveLength(0);
    await put(admin as unknown as Query, 'access_scopes', {
      tenant_id: fixture.tenant, membership_role_id: parentAssignment,
      scope_kind: 'STUDENT', student_id: fixture.student,
    });
    await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE tenant_id=${fixture.tenant} AND id=${link}`;
    expect((await parentLeaves().expect(200)).body.items).toHaveLength(0);
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/leaves`))
      .set('Idempotency-Key', key()).send({ participantId: sheet.body.participants[0].id, reason: 'Manager cannot submit self leave' }).expect(403);
    const remaining = Date.parse(startsAt) - Date.now() + 100;
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    const participantId = sheet.body.participants[0].id as string;
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/sessions/${created.body.id}/finalize`))
      .set('Idempotency-Key', key()).send({ reason: 'Incomplete roster', expectedSheetVersion: sheet.body.sheetVersion }).expect(422);
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/sessions/${created.body.id}/marks`))
      .set('Idempotency-Key', key()).send({ participantId, status: 'ATTENDED', revision: 0, reason: 'Teacher marked present' }).expect(201);
    const reviewedSheet = await bearer(request(app.getHttpServer()).get(`${base}/attendance/sessions/${created.body.id}`)).expect(200);
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/sessions/${created.body.id}/finalize`))
      .set('Idempotency-Key', key()).send({ reason: 'Complete roster', expectedSheetVersion: reviewedSheet.body.sheetVersion }).expect(201);
    const result = await bearer(request(app.getHttpServer()).get(`${base}/attendance/sessions/${created.body.id}`)).expect(200);
    expect(result.body.finalized).toBe(true);
    expect(result.body.participants[0].status).toBe('ATTENDED');
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/sessions/${created.body.id}/marks`))
      .set('Idempotency-Key', key()).send({ participantId, status: 'UNEXCUSED', revision: 1, reason: 'Must remain finalized' }).expect(422);
    await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions/${adjacent.body.id}/cancel`))
      .set('Idempotency-Key', key()).send({ revision: 2, reason: 'Release booking' }).expect(201);
    const freed = await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions`))
      .set('Idempotency-Key', key()).send({ classId: fixture.classId, teacherId: fixture.teacher, roomId: room.body.id,
        deliveryMode: 'ONSITE', startsAt: endsAt, endsAt: new Date(Date.parse(endsAt) + 3_600_000).toISOString(),
        reason: 'Reuse cancelled slot' }).expect(201);
    await bearer(request(app.getHttpServer()).post(`${base}/scheduling/sessions/${freed.body.id}/confirm`))
      .set('Idempotency-Key', key()).send({ reason: 'Reuse cancelled slot' }).expect(201);
    await bearer(request(app.getHttpServer()).get(`/api/v1/tenants/${randomUUID()}/attendance/sessions/${created.body.id}`)).expect(403);
  }, 40_000);
});

type IntegrityOptions = {
  role?: 'MANAGER' | 'TEACHER'; assigned?: boolean; hoursAgo?: number;
  status?: 'CONFIRMED' | 'COMPLETED' | 'DRAFT' | 'CANCELLED'; empty?: 'removed' | 'none'; extraParticipant?: boolean;
};

// Synthetic fixture construction is permitted only after the fresh local PG16
// admission above. Commands under review always use normal authenticated HTTP.
async function integrityCase(options: IntegrityOptions = {}) {
  const startsAt = new Date(Date.now() - (options.hoursAgo ?? 2) * 3_600_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
  const f = await admin.begin(async tx => {
    const value = await seed(tx as unknown as Query, { start: startsAt, end: endsAt,
      sessionStatus: options.status === 'CANCELLED' ? 'CANCELLED' : 'DRAFT',
      enrollmentFrom: '2020-01-01T00:00:00Z',
      policyEffectiveFrom: '2020-01-01T00:00:00Z' });
    await tx`SELECT educore_r4.seed(${value.tenant}::uuid)`;
    if (options.extraParticipant) {
      const enrollment = await put(tx as unknown as Query, 'enrollments', { tenant_id: value.tenant, student_id: value.student2,
        class_id: value.classId, status: 'ACTIVE', effective_from: '2020-01-01', created_by_membership_id: value.member });
      await put(tx as unknown as Query, 'session_participants', { tenant_id: value.tenant, session_id: value.session,
        student_id: value.student2, enrollment_id: enrollment, participant_kind: 'REGULAR' });
    }
    if (options.role === 'TEACHER') await preserveFixtureManager(tx as unknown as Query, value);
    await tx`UPDATE membership_roles SET role_id=(SELECT id FROM roles WHERE tenant_id=${value.tenant}
      AND code=${options.role ?? 'MANAGER'}) WHERE id=${value.membershipRole}`;
    if (options.assigned !== false) await tx`UPDATE teacher_profiles SET membership_id=${value.member} WHERE id=${value.teacher}`;
    if (options.empty) {
      // Class2 has no enrollments. Insert synthetic history in its final shape;
      // never remove or rewrite a participant after the session has started.
      value.classId = value.class2;
      value.session = await put(tx as unknown as Query, 'class_sessions', {
        tenant_id: value.tenant, class_id: value.classId, teacher_id: value.teacher, delivery_mode: 'ONLINE',
        starts_at: startsAt, ends_at: endsAt, status: options.status ?? 'CONFIRMED', revision: 1, policy_version_id: value.policy,
      });
      if (options.empty === 'removed') value.participant = await put(tx as unknown as Query, 'session_participants', {
        tenant_id: value.tenant, session_id: value.session, student_id: value.student, participant_kind: 'REGULAR',
        added_at: new Date(Date.parse(startsAt) - 86_400_000).toISOString(),
        removed_at: new Date(Date.parse(startsAt) - 3_600_000).toISOString(),
      });
    }
    await put(tx as unknown as Query, 'class_teacher_assignments', {
      tenant_id: value.tenant, class_id: value.classId, teacher_id: value.teacher,
      role_kind: 'PRIMARY', valid_from: '2020-01-01T00:00:00Z', assigned_by_membership_id: value.member,
    });
    if (!options.empty) await tx`UPDATE class_sessions SET status=${options.status ?? 'CONFIRMED'}::"ClassSessionStatus" WHERE id=${value.session}`;
    if ((options.status ?? 'CONFIRMED') === 'CONFIRMED') await tx`SELECT educore_r3.book(${value.tenant}::uuid,${value.session}::uuid)`;
    return value;
  });
  await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at)
    VALUES(${f.user},${await passwordHash(password)},clock_timestamp())`;
  const email = (await admin`SELECT email_normalized FROM users WHERE id=${f.user}`)[0].email_normalized as string;
  const client = async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ email, password }).expect(200);
    const selection = await request(app.getHttpServer()).post('/api/v1/auth/select-tenant')
      .set('Authorization', `Bearer ${login.body.accessToken}`).send({ tenantId: f.tenant }).expect(200);
    const token = selection.body.accessToken as string;
    return Object.assign((r: request.Test) => r.set('Authorization', `Bearer ${token}`), { token });
  };
  return { f, client, base: `/api/v1/tenants/${f.tenant}/attendance` };
}

async function integrityCounts(f: Awaited<ReturnType<typeof seed>>) {
  const [row] = await admin`SELECT
    (SELECT count(*)::int FROM session_participants WHERE tenant_id=${f.tenant} AND session_id=${f.session}) participants,
    (SELECT count(*)::int FROM session_participants WHERE tenant_id=${f.tenant} AND session_id=${f.session} AND removed_at IS NULL) active,
    (SELECT count(*)::int FROM attendance_records WHERE tenant_id=${f.tenant} AND session_id=${f.session}) records,
    (SELECT count(*)::int FROM attendance_finalizations WHERE tenant_id=${f.tenant} AND session_id=${f.session}) finalizations,
    (SELECT count(*)::int FROM attendance_corrections c JOIN attendance_records a ON a.tenant_id=c.tenant_id AND a.id=c.attendance_id
      WHERE a.tenant_id=${f.tenant} AND a.session_id=${f.session}) corrections,
    (SELECT count(*)::int FROM attendance_records WHERE tenant_id=${f.tenant} AND session_id=${f.session} AND finalization_id IS NOT NULL) finalizedRecordLinks,
    (SELECT count(*)::int FROM invoice_lines WHERE tenant_id=${f.tenant} AND session_id=${f.session}) invoiceLines,
    (SELECT count(*)::int FROM invoiced_participation_claims c JOIN session_participants p ON p.tenant_id=c.tenant_id AND p.id=c.participant_id
      WHERE p.tenant_id=${f.tenant} AND p.session_id=${f.session}) issuedClaims,
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='R3:FINALIZE'
      AND after_json->'command'->>'sessionId'=${f.session}) audits,
    (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type='R3:FINALIZE') receipts`;
  return row;
}

async function versionOf(tenant: string, sessionId: string) {
  const [row] = await admin`SELECT educore_r3.attendance_review_version(${tenant}::uuid,${sessionId}::uuid) version`;
  return row.version as string;
}
type IntegrityCase = Awaited<ReturnType<typeof integrityCase>>;
type IntegrityClient = Awaited<ReturnType<IntegrityCase['client']>>;
async function readIntegrity(c: IntegrityCase, auth: IntegrityClient) {
  return (await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200)).body;
}
async function markIntegrity(c: IntegrityCase, auth: IntegrityClient, participantId: string, status = 'ATTENDED', revision = 0, expected = 201) {
  return auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`)).set('Idempotency-Key', randomUUID())
    .send({ participantId, status, revision, reason: 'Native integrity regression' }).expect(expected);
}
async function finalizeIntegrity(c: IntegrityCase, auth: IntegrityClient, expectedSheetVersion: string, expected: number) {
  return auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)).set('Idempotency-Key', randomUUID())
    .send({ expectedSheetVersion, reason: 'Native reviewed confirmation' }).expect(expected);
}

// Real restricted API connections, normal login token and identical transaction
// isolation/timeouts/bind/constraints as R4Repository.transaction. The operator
// observes waits and installs a timing-only gate; it never executes MARK/GET.
async function snapshotConnection(token: string) {
  const q = postgres(apiConnection, { max: 1, prepare: false, onnotice: () => undefined });
  await q.unsafe('BEGIN ISOLATION LEVEL READ COMMITTED');
  await q.unsafe("SET LOCAL lock_timeout='3s'");
  await q.unsafe("SET LOCAL statement_timeout='15s'");
  await q`SELECT educore_r4.bind(${token}::text)`;
  const [row] = await q`SELECT pg_backend_pid() pid,current_setting('transaction_isolation') isolation,
    NOT rolsuper AND NOT rolbypassrls AND pg_has_role(session_user,'educore_r4_api','MEMBER') restricted
    FROM pg_roles WHERE rolname=session_user`;
  expect(row.restricted).toBe(true); expect(row.isolation).toBe('read committed');
  return { q, pid: Number(row.pid) };
}
async function snapshotSheet(q: postgres.Sql, c: IntegrityCase) {
  const [row] = await q`SELECT educore_r4.attendance_mvp_read(${c.f.tenant}::uuid,'SHEET',${c.f.session}::uuid,NULL,NULL,1,20) result`;
  return row.result;
}
async function snapshotMark(q: postgres.Sql, c: IntegrityCase, revision = 0, status = 'ATTENDED') {
  await q`SELECT educore_r3.attendance(${c.f.tenant}::uuid,${JSON.stringify({ operation: 'MARK', key: randomUUID(),
    sessionId: c.f.session, participantId: c.f.participant, status, revision, reason: 'Snapshot race normal command' })}::text::jsonb)`;
  await q.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
}
function sheetSnapshot(sheet: Awaited<ReturnType<typeof readIntegrity>>) {
  const { evaluatedAt: _evaluatedAt, ...capabilities } = sheet.capabilities;
  return { ...sheet, capabilities };
}

describe('R13 approved attendance integrity regression', () => {
  it('CAP-01 finalize-only Teacher uses independent permission and version ignores capability evaluation time', async () => {
    const c = await integrityCase({ role: 'TEACHER' }), auth = await c.client();
    await markIntegrity(c, auth, c.f.participant);
    const before = await readIntegrity(c, auth);
    expect(before.capabilities).toMatchObject({ canMark: true, canFinalize: true });
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.mark')`;
    const after = await readIntegrity(c, auth);
    expect(after.sheetVersion).toBe(before.sheetVersion);
    expect(after.capabilities).toMatchObject({ canMark: false, canFinalize: true });
    expect(after.participants[0].capabilities).toMatchObject({ canMark: false, markReasons: ['NOT_AUTHORIZED'] });
    const navigation = await auth(request(app.getHttpServer()).get(`/api/v1/tenants/${c.f.tenant}/access/navigation`)).expect(200);
    expect(navigation.body.screenIds).toEqual(expect.arrayContaining(['AT01', 'AT02']));
    await markIntegrity(c, auth, c.f.participant, 'UNEXCUSED', 1, 403);
    await finalizeIntegrity(c, auth, after.sheetVersion, 201);
    expect(await integrityCounts(c.f)).toMatchObject({ finalizations: 1, audits: 1, receipts: 1 });
  });

  it('CAP-01 per-student MARK scope does not inherit whole-sheet FINALIZE scope', async () => {
    const c = await integrityCase({ extraParticipant: true }), auth = await c.client();
    const role = await put(admin as unknown as Query, 'roles', { tenant_id: c.f.tenant, code: 'QA_PARTIAL_MARK', name: 'Synthetic scoped grant' });
    const assignment = await put(admin as unknown as Query, 'membership_roles', { tenant_id: c.f.tenant, membership_id: c.f.member, role_id: role, assigned_by_membership_id: c.f.member });
    await put(admin as unknown as Query, 'access_scopes', { tenant_id: c.f.tenant, membership_role_id: assignment, scope_kind: 'STUDENT', student_id: c.f.student });
    await put(admin as unknown as Query, 'role_permissions', { tenant_id: c.f.tenant, role_id: role, permission_id: (await admin`SELECT id FROM permissions WHERE code='attendance.mark'`)[0].id });
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.mark')`;
    const sheet = await readIntegrity(c, auth);
    expect(sheet.capabilities.canMark).toBe(true);
    const own = sheet.participants.find((p: { studentId: string }) => p.studentId === c.f.student);
    const other = sheet.participants.find((p: { studentId: string }) => p.studentId === c.f.student2);
    expect(own.capabilities.canMark).toBe(true); expect(other.capabilities.canMark).toBe(false);
    await markIntegrity(c, auth, other.id, 'ATTENDED', 0, 403);
    await markIntegrity(c, auth, own.id);
    expect(await integrityCounts(c.f)).toMatchObject({ records: 1, finalizations: 0 });
  });

  it('CAP-01 status/time/empty decisions and late-staff exact48 boundary match domain predicates', async () => {
    for (const [options, reason] of [
      [{ role: 'TEACHER', status: 'DRAFT' }, 'SESSION_NOT_ELIGIBLE'],
      [{ role: 'TEACHER', status: 'CANCELLED' }, 'SESSION_NOT_ELIGIBLE'],
      [{ role: 'TEACHER', hoursAgo: -2 }, 'SESSION_NOT_STARTED'],
    ] as const) {
      const c = await integrityCase(options), auth = await c.client(), sheet = await readIntegrity(c, auth);
      expect(sheet.capabilities.canMark).toBe(false); expect(sheet.capabilities.finalizeReasons).toEqual([reason]);
      await markIntegrity(c, auth, c.f.participant, 'ATTENDED', 0, 422);
      await finalizeIntegrity(c, auth, sheet.sheetVersion, 422);
    }
    const c = await integrityCase({ assigned: false }), auth = await c.client(), sheet = await readIntegrity(c, auth);
    const [boundary] = await admin`SELECT
      educore_r3.time_locked(ends_at+interval '48 hours'-interval '1 microsecond',ends_at) before,
      educore_r3.time_locked(ends_at+interval '48 hours',ends_at) exact
      FROM class_sessions WHERE id=${c.f.session}`;
    // Pure boundary predicate: operator connections deliberately have no bound
    // application principal. Capability parity is checked through normal HTTP.
    expect(boundary.before).toBe(false); expect(boundary.exact).toBe(true);
    expect(sheet.capabilities.markReasons).toEqual(['STAFF_WINDOW_NOT_REACHED']);
    await finalizeIntegrity(c, auth, sheet.sheetVersion, 403);
    const late = await integrityCase({ assigned: false, hoursAgo: 50 }), lateAuth = await late.client();
    expect((await readIntegrity(late, lateAuth)).capabilities.canMark).toBe(true);
    await markIntegrity(late, lateAuth, late.f.participant);
    await finalizeIntegrity(late, lateAuth, (await readIntegrity(late, lateAuth)).sheetVersion, 201);
    const sealed = await readIntegrity(late, lateAuth);
    expect(sealed.capabilities).toMatchObject({ canMark: false, canFinalize: false, canCorrect: true });
    await markIntegrity(late, lateAuth, late.f.participant, 'UNEXCUSED', 1, 403);
  });

  it('CON-02 canonical content rejects ABA and detects changes independent of names and roster order', async () => {
    const c = await integrityCase({ role: 'TEACHER', extraParticipant: true }), auth = await c.client();
    const rows = (await readIntegrity(c, auth)).participants;
    for (const p of rows) await markIntegrity(c, auth, p.id);
    const original = await readIntegrity(c, auth);
    await admin`UPDATE student_profiles SET full_name='ZZ cosmetic name' WHERE id=${c.f.student}`;
    const reordered = await readIntegrity(c, auth);
    expect(reordered.sheetVersion).toBe(original.sheetVersion);
    await markIntegrity(c, auth, c.f.participant, 'UNEXCUSED', 1);
    await markIntegrity(c, auth, c.f.participant, 'ATTENDED', 2);
    const aba = await readIntegrity(c, auth);
    expect(aba.sheetVersion === original.sheetVersion).toBe(false);
    const before = await integrityCounts(c.f);
    await finalizeIntegrity(c, auth, original.sheetVersion, 409);
    expect(await integrityCounts(c.f)).toEqual(before);
    await finalizeIntegrity(c, auth, aba.sheetVersion, 201);
  });

  it('CON-02 guarded synthetic canonical fixtures distinguish equal count/max/sum and bind identities/session context', async () => {
    const c = await integrityCase({ extraParticipant: true }), auth = await c.client();
    // Canonical-property fixture only: all business command assertions below
    // still use normal HTTP. No trigger is disabled or historical source moved.
    await admin.begin(async tx => {
      const rows = await tx`SELECT id FROM session_participants WHERE session_id=${c.f.session} ORDER BY id`;
      for (let i = 0; i < rows.length; i++) await put(tx as unknown as Query, 'attendance_records', {
        tenant_id: c.f.tenant, session_id: c.f.session, participant_id: rows[i].id, attendance_status: i ? 'UNEXCUSED' : 'ATTENDED',
        recorded_by_membership_id: c.f.member, recorded_at: new Date().toISOString(), revision: i + 1,
      });
    });
    const original = await readIntegrity(c, auth);
    const [summary] = await admin`SELECT count(*)::int n,max(revision)::int max,sum(revision)::int sum FROM attendance_records WHERE session_id=${c.f.session}`;
    await admin`UPDATE attendance_records SET attendance_status=CASE WHEN attendance_status='ATTENDED' THEN 'UNEXCUSED'::"AttendanceStatus" ELSE 'ATTENDED'::"AttendanceStatus" END WHERE session_id=${c.f.session}`;
    const [sameSummary] = await admin`SELECT count(*)::int n,max(revision)::int max,sum(revision)::int sum FROM attendance_records WHERE session_id=${c.f.session}`;
    expect(sameSummary).toEqual(summary);
    const changed = await readIntegrity(c, auth); expect(changed.sheetVersion === original.sheetVersion).toBe(false);
    await finalizeIntegrity(c, auth, original.sheetVersion, 409);
    const beforeContext = changed.sheetVersion;
    await admin`UPDATE class_sessions SET status='COMPLETED',revision=revision+1 WHERE id=${c.f.session}`;
    const context = await readIntegrity(c, auth); expect(context.sheetVersion === beforeContext).toBe(false);
    await finalizeIntegrity(c, auth, beforeContext, 409);
    expect(await integrityCounts(c.f)).toMatchObject({ records: 2, finalizations: 0, audits: 0, receipts: 0 });
    const foreign = await integrityCase();
    await finalizeIntegrity(c, auth, await versionOf(foreign.f.tenant, foreign.f.session), 409);
  });

  it('CON-02 approved-leave evidence changes version without changing attendance revisions', async () => {
    const c = await integrityCase(), auth = await c.client();
    const requesterUser = await put(admin as unknown as Query, 'users', { email_normalized: randomUUID() + '@fixture.invalid', display_name: 'Synthetic leave requester', status: 'ACTIVE' });
    const requester = await put(admin as unknown as Query, 'tenant_memberships', { tenant_id: c.f.tenant, user_id: requesterUser, status: 'ACTIVE' });
    const cs = (await admin`SELECT starts_at FROM class_sessions WHERE id=${c.f.session}`)[0];
    const leave = await put(admin as unknown as Query, 'absence_requests', { tenant_id: c.f.tenant, participant_id: c.f.participant,
      requester_membership_id: requester, submitted_at: new Date(new Date(cs.starts_at).getTime() - 25 * 3_600_000).toISOString(),
      reason: 'Synthetic existing request', status: 'PENDING_APPROVAL', is_late_notice: false, policy_version_id: c.f.policy });
    const original = await readIntegrity(c, auth);
    await auth(request(app.getHttpServer()).post(`${c.base}/leaves/${leave}/approve`)).set('Idempotency-Key', randomUUID()).send({ reason: 'Normal authorized approval' }).expect(201);
    const approved = await readIntegrity(c, auth);
    expect(approved.sheetVersion === original.sheetVersion).toBe(false);
    expect(approved.participants[0].approvedLeave).toBe(true);
    expect(approved.participants[0].revision).toBe(0);
    await finalizeIntegrity(c, auth, original.sheetVersion, 409);
    await markIntegrity(c, auth, c.f.participant, 'EXCUSED');
    expect((await readIntegrity(c, auth)).capabilities.canFinalize).toBe(true);
  });

  it('CON-02/EMP-03 future guarded roster replacement/removal invalidates review and cannot finalize an empty started roster', async () => {
    const c = await integrityCase({ role: 'TEACHER', hoursAgo: -10 / 3600 }), auth = await c.client();
    const original = await readIntegrity(c, auth);
    let replacement = '', enrollment = '';
    // A fixture writer models legal pre-start roster changes while all source,
    // enrollment, booking and historical-immutability guards stay enabled.
    await admin.begin(async tx => {
      await tx`UPDATE enrollments SET status='WITHDRAWN',effective_to=(SELECT starts_at-interval '1 millisecond' FROM class_sessions WHERE id=${c.f.session}) WHERE id=${c.f.enrollment}`;
      await tx`UPDATE session_participants SET removed_at=clock_timestamp() WHERE id=${c.f.participant}`;
      enrollment = await put(tx as unknown as Query, 'enrollments', { tenant_id: c.f.tenant, student_id: c.f.student2, class_id: c.f.classId,
        status: 'ACTIVE', effective_from: '2020-01-01', created_by_membership_id: c.f.member });
      replacement = await put(tx as unknown as Query, 'session_participants', { tenant_id: c.f.tenant, session_id: c.f.session,
        student_id: c.f.student2, enrollment_id: enrollment, participant_kind: 'REGULAR' });
      await tx`SELECT educore_r3.book(${c.f.tenant}::uuid,${c.f.session}::uuid)`;
    });
    const replaced = await readIntegrity(c, auth);
    expect(replaced.participants).toHaveLength(1); expect(replaced.participants[0].id).toBe(replacement);
    expect(replaced.sheetVersion === original.sheetVersion).toBe(false);
    await finalizeIntegrity(c, auth, original.sheetVersion, 409);
    await admin.begin(async tx => {
      await tx`UPDATE enrollments SET status='WITHDRAWN',effective_to=(SELECT starts_at-interval '1 millisecond' FROM class_sessions WHERE id=${c.f.session}) WHERE id=${enrollment}`;
      await tx`UPDATE session_participants SET removed_at=clock_timestamp() WHERE id=${replacement}`;
      await tx`SELECT educore_r3.book(${c.f.tenant}::uuid,${c.f.session}::uuid)`;
    });
    const remaining = Date.parse(original.startsAt) - Date.now() + 50;
    if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    await finalizeIntegrity(c, auth, replaced.sheetVersion, 409);
    const empty = await readIntegrity(c, auth);
    expect(empty.participants).toEqual([]); expect(empty.capabilities.finalizeReasons).toEqual(['EMPTY_ROSTER']);
    await finalizeIntegrity(c, auth, empty.sheetVersion, 422);
    expect(await integrityCounts(c.f)).toMatchObject({ active: 0, records: 0, finalizations: 0, audits: 0, receipts: 0 });
  });

  it('CAP-01 a readable Manager sheet does not establish MARK or FINALIZE eligibility', async () => {
    const c = await integrityCase({ assigned: false }), auth = await c.client();
    const sheet = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    expect(sheet.body.participants).toHaveLength(1);
    expect(sheet.body.sheetVersion).toMatch(/^av1:[a-f0-9]{64}$/);
    expect(sheet.body.capabilities).toMatchObject({ protocolVersion: 1, canMark: false, canFinalize: false, canCorrect: false, markReasons: ['STAFF_WINDOW_NOT_REACHED'] });
    expect(sheet.body.participants[0].capabilities.canMark).toBe(false);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'ATTENDED', revision: 0, reason: 'Recent unassigned Manager' }).expect(403);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'No current late eligibility', expectedSheetVersion: sheet.body.sheetVersion }).expect(403);
    expect(await integrityCounts(c.f)).toMatchObject({ active: 1, records: 0, finalizations: 0, audits: 0, receipts: 0 });
    console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'CAP-01', get: 200, mark: 403, finalize: 403, capabilityFields: 'server-derived', effects: await integrityCounts(c.f) }));
  });

  it('CAP-01 operation permissions are independent and revocation still wins after a successful GET', async () => {
    const c = await integrityCase({ role: 'TEACHER' }), auth = await c.client();
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.finalize')`;
    const markOnly = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    expect(markOnly.body.capabilities).toMatchObject({ canMark: true, canFinalize: false, finalizeReasons: ['NOT_AUTHORIZED'] });
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'ATTENDED', revision: 0, reason: 'Assigned Teacher draft' }).expect(201);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Missing finalize permission', expectedSheetVersion: await versionOf(c.f.tenant, c.f.session) }).expect(403);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.mark')`;
    await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(403);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'UNEXCUSED', revision: 1, reason: 'Revoked after read' }).expect(403);
    expect(await integrityCounts(c.f)).toMatchObject({ records: 1, finalizations: 0, audits: 0, receipts: 0 });
    const [record] = await admin`SELECT attendance_status,revision FROM attendance_records WHERE participant_id=${c.f.participant}`;
    expect(record).toMatchObject({ attendance_status: 'ATTENDED', revision: 1 });
  });

  it('CON-02 rejects A stale review without effects, then accepts an explicit V2 review and idempotent replay', async () => {
    const c = await integrityCase({ role: 'TEACHER' }), clientA = await c.client(), clientB = await c.client();
    expect((await admin`SELECT count(*)::int n FROM auth_sessions WHERE user_id=${c.f.user} AND revoked_at IS NULL`)[0].n).toBeGreaterThanOrEqual(2);
    await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'ATTENDED', revision: 0, reason: 'Initial complete draft' }).expect(201);
    const reviewed = await clientA(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    const reviewedRows = reviewed.body.participants.map((p: { id: string; status: string; revision: number }) => ({ id: p.id, status: p.status, revision: p.revision }));
    expect(reviewedRows).toEqual([{ id: c.f.participant, status: 'ATTENDED', revision: 1 }]);
    expect(reviewed.body.finalized).toBe(false);
    await clientB(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'UNEXCUSED', revision: 1, reason: 'Other client commits after A review' }).expect(201);
    const key = randomUUID(), reason = 'A confirms previously reviewed sheet';
    const beforeStale = await integrityCounts(c.f);
    await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason, expectedSheetVersion: reviewed.body.sheetVersion }).expect(409);
    expect(await integrityCounts(c.f)).toEqual(beforeStale);
    const reviewedV2 = await clientA(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    expect(reviewedV2.body.sheetVersion === reviewed.body.sheetVersion).toBe(false);
    const expectedSheetVersion = reviewedV2.body.sheetVersion;
    const result = await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', key).send({ reason, expectedSheetVersion }).expect(201);
    expect(result.body.status).toBe('FINALIZED');
    const persisted = await clientA(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    expect(persisted.body.finalized).toBe(true);
    expect(persisted.body.participants.map((p: { id: string; status: string; revision: number }) => ({ id: p.id, status: p.status, revision: p.revision })))
      .toEqual([{ id: c.f.participant, status: 'UNEXCUSED', revision: 2 }]);
    const [record] = await admin`SELECT finalization_id,revision,attendance_status FROM attendance_records WHERE tenant_id=${c.f.tenant} AND participant_id=${c.f.participant}`;
    expect(record).toMatchObject({ finalization_id: result.body.id, revision: 2, attendance_status: 'UNEXCUSED' });
    const [correction] = await admin`SELECT old_status,new_status,old_revision,new_revision FROM attendance_corrections WHERE tenant_id=${c.f.tenant} AND attendance_id=${persisted.body.participants[0].attendanceId}`;
    expect(correction).toMatchObject({ old_status: 'ATTENDED', new_status: 'UNEXCUSED', old_revision: 1, new_revision: 2 });
    await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)).set('Idempotency-Key', key).send({ reason, expectedSheetVersion }).expect(201);
    await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)).set('Idempotency-Key', key)
      .send({ reason, expectedSheetVersion: persisted.body.sheetVersion }).expect(409);
    expect(await integrityCounts(c.f)).toMatchObject({ active: 1, records: 1, finalizations: 1, audits: 1, receipts: 1 });
    console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'CON-02', staleHTTP: 409, staleEffects: 'none', explicitReviewHTTP: 201, replayHTTP: 201, changedBodyHTTP: 409, persistedRevision: record.revision, effects: await integrityCounts(c.f) }));
  });

  it('EMP-03 rejects empty or all-removed rosters for eligible Teacher/staff without any finalize effects', async () => {
    for (const options of [
      { role: 'TEACHER', status: 'CONFIRMED', empty: 'none', hoursAgo: 2 },
      { role: 'TEACHER', status: 'COMPLETED', empty: 'removed', hoursAgo: 2 },
      { role: 'MANAGER', assigned: false, status: 'CONFIRMED', empty: 'removed', hoursAgo: 50 },
      { role: 'MANAGER', assigned: false, status: 'COMPLETED', empty: 'none', hoursAgo: 50 },
    ] as const) {
      const c = await integrityCase(options), auth = await c.client();
      const sheet = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
      expect(sheet.body.participants).toEqual([]); expect(sheet.body.finalized).toBe(false);
      expect(sheet.body.capabilities).toMatchObject({ canFinalize: false, finalizeReasons: ['EMPTY_ROSTER'] });
      const before = await integrityCounts(c.f);
      expect(before).toMatchObject({ active: 0, records: 0, finalizations: 0, audits: 0, receipts: 0 });
      const key = randomUUID(), reason = 'Empty roster is prohibited', expectedSheetVersion = sheet.body.sheetVersion;
      await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
        .set('Idempotency-Key', key).send({ reason, expectedSheetVersion }).expect(422);
      const persisted = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
      expect(persisted.body.participants).toEqual([]); expect(persisted.body.finalized).toBe(false);
      await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)).set('Idempotency-Key', key).send({ reason, expectedSheetVersion }).expect(422);
      const after = await integrityCounts(c.f);
      expect(after).toEqual(before);
      expect((await admin`SELECT status FROM class_sessions WHERE id=${c.f.session}`)[0].status).toBe(options.status);
      console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'EMP-03', ...options, finalizeHTTP: 422, before, after }));
    }
  });

  it('EMP-03 empty roster does not bypass current status, time, role, permission or tenant guards', async () => {
    for (const options of [
      { role: 'TEACHER', status: 'DRAFT', expected: 422 },
      { role: 'TEACHER', status: 'CANCELLED', expected: 422 },
      { role: 'TEACHER', hoursAgo: -2, expected: 422 },
      { role: 'MANAGER', assigned: false, hoursAgo: 2, expected: 403 },
      { role: 'TEACHER', assigned: false, expected: 403 },
    ] as const) {
      const c = await integrityCase({ ...options, empty: 'removed' }), auth = await c.client();
      const before = await integrityCounts(c.f);
      await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
        .set('Idempotency-Key', randomUUID()).send({ reason: 'Empty roster must not bypass authority', expectedSheetVersion: await versionOf(c.f.tenant, c.f.session) }).expect(options.expected);
      expect(await integrityCounts(c.f)).toEqual(before);
    }
    const c = await integrityCase({ role: 'TEACHER', empty: 'none' }), auth = await c.client();
    await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.finalize')`;
    const before = await integrityCounts(c.f);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Permission revoked after GET', expectedSheetVersion: await versionOf(c.f.tenant, c.f.session) }).expect(403);
    await auth(request(app.getHttpServer()).post(`/api/v1/tenants/${fixture.tenant}/attendance/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Other tenant' }).expect(403);
    await request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)
      .set('Idempotency-Key', randomUUID()).send({ reason: 'No authentication' }).expect(401);
    expect(await integrityCounts(c.f)).toEqual(before);
    console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'EMP-03-negative', draft: 422, cancelled: 422, future: 422, recentUnassignedManager: 403, unassignedTeacher: 403, revokedPermission: 403, wrongTenant: 403, unauthenticated: 401, failedCommandsAddedEffects: false }));
  });
});

describe('R13 GET snapshot consistency during response construction', () => {
  for (const writerKind of ['MARK', 'ROSTER'] as const) {
    it(`GET-first blocks concurrent ${writerKind} after base roster materialization until capabilities/version finish`, async () => {
      const c = await integrityCase({ role: 'TEACHER', ...(writerKind === 'ROSTER' ? { hoursAgo: -2 } : {}) });
      const authA = await c.client();
      // Two MARK variants share one real session login and fixture, retaining
      // the normal auth rate limit without waits, resets or additional grants.
      for (const writer of writerKind === 'MARK' ? ['MARK','MARK_REVISION'] as const : ['ROSTER'] as const) {
        const reviewed = await readIntegrity(c, authA);
        const a = await snapshotConnection(authA.token);
        // Roster-only connection is a guarded synthetic fixture writer. Runtime
        // roles have no raw DML; no new grant, disabled guard or auth bypass.
        const b = writer !== 'ROSTER' ? await snapshotConnection(authA.token) : {
          q: postgres(process.env.R8_TEST_URL!, { max: 1, prepare: false, onnotice: () => undefined }), pid: 0,
        };
        if (writer === 'ROSTER') {
          await b.q.unsafe('BEGIN ISOLATION LEVEL READ COMMITTED');
          await b.q.unsafe("SET LOCAL lock_timeout='3s'");
          b.pid = Number((await b.q`SELECT pg_backend_pid() pid`)[0].pid);
        }
        const [definition] = await admin`SELECT pg_get_functiondef('educore_r3.attendance_sheet_contract(uuid,uuid,uuid,jsonb)'::regprocedure) ddl`;
        const original = definition.ddl as string;
        // The base jsonb argument has ALREADY been evaluated when execution enters
        // this helper. Pause at precisely the old-data/new-version risk boundary.
        // Only timing is changed in this admitted test DB; preserve owner/ACL and
        // the entire real projection, capabilities, version and locking logic.
        const marker = ' FOR row_data IN SELECT value FROM jsonb_array_elements';
        expect(original).toContain(marker);
        const gate = 1731301;
        let reading: Promise<Awaited<ReturnType<typeof snapshotSheet>>> | undefined, writing: Promise<void> | undefined;
        let writerCommitted = false;
        try {
          await admin.unsafe(original.replace(marker, ` IF s='${c.f.session}'::uuid THEN PERFORM pg_advisory_xact_lock(${gate},1); END IF;\n${marker}`));
          await admin`SELECT pg_advisory_lock(${gate},1)`;
          const observerPid = Number((await admin`SELECT pg_backend_pid() pid`)[0].pid);
          reading = snapshotSheet(a.q,c); void reading.catch(() => undefined);
          await waitBlocked(admin,a.pid,observerPid);
          const [pause] = await admin`SELECT EXISTS(SELECT FROM pg_locks WHERE pid=${a.pid} AND locktype='advisory' AND NOT granted) in_helper,
            EXISTS(SELECT FROM pg_locks WHERE pid=${a.pid} AND locktype='transactionid' AND mode='ExclusiveLock' AND granted) holds_transaction`;
          expect(pause.in_helper).toBe(true); expect(pause.holds_transaction).toBe(true);
          writing = (async () => {
            if (writer !== 'ROSTER') await snapshotMark(b.q,c,writer==='MARK_REVISION'?1:0,writer==='MARK_REVISION'?'UNEXCUSED':'ATTENDED');
            else {
              await b.q`UPDATE enrollments SET status='WITHDRAWN',effective_to=(SELECT starts_at-interval '1 millisecond' FROM class_sessions WHERE id=${c.f.session}) WHERE id=${c.f.enrollment}`;
              await b.q`UPDATE session_participants SET removed_at=clock_timestamp() WHERE id=${c.f.participant}`;
              await b.q`SELECT educore_r3.book(${c.f.tenant}::uuid,${c.f.session}::uuid)`;
              await b.q.unsafe('SET CONSTRAINTS ALL IMMEDIATE');
            }
            await b.q.unsafe('COMMIT'); writerCommitted = true;
          })(); void writing.catch(() => undefined);
          await waitBlocked(admin,b.pid,a.pid);
          expect(writerCommitted).toBe(false);
          await admin`SELECT pg_advisory_unlock(${gate},1)`;
          const sheet = await reading;
          // Same rows/status/revision/leave/locks AND same capabilities/version,
          // compared to a complete paired pre-race GET, not a hash-only assertion.
          expect(sheetSnapshot(sheet)).toEqual(sheetSnapshot(reviewed));
          expect(writerCommitted).toBe(false);
          await a.q.unsafe('SET CONSTRAINTS ALL IMMEDIATE'); await a.q.unsafe('COMMIT');
          await writing;
          const fresh = await readIntegrity(c,authA);
          expect(fresh.sheetVersion).not.toBe(sheet.sheetVersion);
          if (writer !== 'ROSTER') {
            expect(sheet.participants[0]).toMatchObject(writer==='MARK_REVISION'?{status:'ATTENDED',revision:1}:{ status: null, revision: 0 });
            expect(sheet.capabilities).toMatchObject(writer==='MARK_REVISION'?{canFinalize:true,finalizeReasons:[]}:{ canFinalize: false, finalizeReasons: ['RESULTS_INCOMPLETE'] });
            expect(fresh.participants[0]).toMatchObject(writer==='MARK_REVISION'?{status:'UNEXCUSED',revision:2}:{ status: 'ATTENDED', revision: 1 });
            expect(fresh.capabilities.canFinalize).toBe(true);
            const beforeFinalize = await integrityCounts(c.f);
            await finalizeIntegrity(c,authA,sheet.sheetVersion,409);
            expect(await integrityCounts(c.f)).toEqual(beforeFinalize);
            if (writer === 'MARK_REVISION') await finalizeIntegrity(c,authA,fresh.sheetVersion,201);
          } else {
            expect(sheet.participants).toHaveLength(1); expect(fresh.participants).toHaveLength(0);
            expect(fresh.capabilities).toMatchObject({ canMark: false, canFinalize: false, markReasons: ['EMPTY_ROSTER'] });
          }
          console.info('R13_GET_SNAPSHOT_EVIDENCE',JSON.stringify({ writer,order:'GET_FIRST',readerPid:a.pid,writerPid:b.pid,
            pausedAfterBase:true,observedWriterBlocked:true,writerCommittedOnlyAfterReadTransaction:true,
            pairedResponseConsistent:true,oldReviewFinalize:writer!=='ROSTER'?409:'not applicable to future roster fixture' }));
        } finally {
          await admin`SELECT pg_advisory_unlock(${gate},1)`;
          await a.q.unsafe('ROLLBACK'); await b.q.unsafe('ROLLBACK');
          await Promise.allSettled([...(reading ? [reading] : []),...(writing ? [writing] : [])]);
          await admin.unsafe(original);
          expect((await admin`SELECT pg_get_functiondef('educore_r3.attendance_sheet_contract(uuid,uuid,uuid,jsonb)'::regprocedure) ddl`)[0].ddl).toBe(original);
          await a.q.end(); await b.q.end();
        }
      }
    });
  }

  it('MARK-first commits while GET is already waiting and the resumed GET returns the fully new state/version', async () => {
    const c = await integrityCase({ role:'TEACHER' }), authA = await c.client();
    const before = await readIntegrity(c,authA), a = await snapshotConnection(authA.token), b = await snapshotConnection(authA.token);
    let reading: Promise<Awaited<ReturnType<typeof snapshotSheet>>> | undefined;
    try {
      await snapshotMark(b.q,c); // Uncommitted real MARK owns the tenant lock.
      reading = snapshotSheet(a.q,c); void reading.catch(() => undefined);
      await waitBlocked(admin,a.pid,b.pid); // GET has started, not a GET-after-write test.
      await b.q.unsafe('COMMIT');
      const sheet = await reading;
      await a.q.unsafe('SET CONSTRAINTS ALL IMMEDIATE'); await a.q.unsafe('COMMIT');
      const fresh = await readIntegrity(c,authA);
      expect(sheetSnapshot(sheet)).toEqual(sheetSnapshot(fresh));
      expect(sheet.sheetVersion).not.toBe(before.sheetVersion);
      expect(sheet.participants[0]).toMatchObject({ status:'ATTENDED',revision:1 });
      expect(sheet.capabilities).toMatchObject({canMark:true,canFinalize:true,finalizeReasons:[]});
      await finalizeIntegrity(c,authA,sheet.sheetVersion,201);
      console.info('R13_GET_SNAPSHOT_EVIDENCE',JSON.stringify({writer:'MARK',order:'WRITER_FIRST',readerPid:a.pid,writerPid:b.pid,
        getStartedBeforeCommit:true,observedReaderBlocked:true,commitDuringGet:true,pairedResponseConsistent:true,reviewedFinalize:201}));
    } finally {
      await b.q.unsafe('ROLLBACK'); await a.q.unsafe('ROLLBACK');
      await Promise.allSettled(reading ? [reading] : []); await a.q.end(); await b.q.end();
    }
  });
});
