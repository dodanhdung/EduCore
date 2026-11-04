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
import { preserveFixtureManager, put, seed, type Query } from '../schema-integrity/support.js';

const password = 'R8 disposable test password!';
const origin = 'http://localhost:5173';
let admin: postgres.Sql, repository: R4Repository, app: INestApplication;
let fixture: Awaited<ReturnType<typeof seed>>;
let address: string;

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
  repository = new R4Repository(await connection('educore_r4_auth'), await connection('educore_r4_api'));
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
      .set('Idempotency-Key', key()).send({ reason: 'Incomplete roster' }).expect(422);
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/sessions/${created.body.id}/marks`))
      .set('Idempotency-Key', key()).send({ participantId, status: 'ATTENDED', revision: 0, reason: 'Teacher marked present' }).expect(201);
    await bearer(request(app.getHttpServer()).post(`${base}/attendance/sessions/${created.body.id}/finalize`))
      .set('Idempotency-Key', key()).send({ reason: 'Complete roster' }).expect(201);
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
  status?: 'CONFIRMED' | 'COMPLETED' | 'DRAFT' | 'CANCELLED'; empty?: 'removed' | 'none';
};

// Synthetic fixture construction is permitted only after the fresh local PG16
// admission above. Commands under review always use normal authenticated HTTP.
async function integrityCase(options: IntegrityOptions = {}) {
  const startsAt = new Date(Date.now() - (options.hoursAgo ?? 2) * 3_600_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 3_600_000).toISOString();
  const f = await admin.begin(async tx => {
    const value = await seed(tx as unknown as Query, { start: startsAt, end: endsAt,
      enrollmentFrom: '2020-01-01T00:00:00Z',
      policyEffectiveFrom: '2020-01-01T00:00:00Z' });
    await tx`SELECT educore_r4.seed(${value.tenant}::uuid)`;
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
    return (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  };
  return { f, client, base: `/api/v1/tenants/${f.tenant}/attendance` };
}

async function integrityCounts(f: Awaited<ReturnType<typeof seed>>) {
  const [row] = await admin`SELECT
    (SELECT count(*)::int FROM session_participants WHERE tenant_id=${f.tenant} AND session_id=${f.session}) participants,
    (SELECT count(*)::int FROM session_participants WHERE tenant_id=${f.tenant} AND session_id=${f.session} AND removed_at IS NULL) active,
    (SELECT count(*)::int FROM attendance_records WHERE tenant_id=${f.tenant} AND session_id=${f.session}) records,
    (SELECT count(*)::int FROM attendance_finalizations WHERE tenant_id=${f.tenant} AND session_id=${f.session}) finalizations,
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='R3:FINALIZE'
      AND after_json->'command'->>'sessionId'=${f.session}) audits,
    (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type='R3:FINALIZE') receipts`;
  return row;
}

describe('R13 attendance integrity: current contract characterization, not approval of a new contract', () => {
  it('CAP-01 a readable Manager sheet does not establish MARK or FINALIZE eligibility', async () => {
    const c = await integrityCase({ assigned: false }), auth = await c.client();
    const sheet = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    expect(sheet.body.participants).toHaveLength(1);
    for (const field of ['canMark', 'canFinalize', 'canCorrect', 'capabilities', 'sheetVersion']) {
      expect(Object.hasOwn(sheet.body, field)).toBe(false);
    }
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'ATTENDED', revision: 0, reason: 'Recent unassigned Manager' }).expect(403);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'No current late eligibility' }).expect(403);
    expect(await integrityCounts(c.f)).toMatchObject({ active: 1, records: 0, finalizations: 0, audits: 0, receipts: 0 });
    console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'CAP-01', get: 200, mark: 403, finalize: 403, capabilityFields: 'absent', effects: await integrityCounts(c.f) }));
  });

  it('CAP-01 operation permissions are independent and revocation still wins after a successful GET', async () => {
    const c = await integrityCase({ role: 'TEACHER' }), auth = await c.client();
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.finalize')`;
    await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/marks`))
      .set('Idempotency-Key', randomUUID()).send({ participantId: c.f.participant, status: 'ATTENDED', revision: 0, reason: 'Assigned Teacher draft' }).expect(201);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Missing finalize permission' }).expect(403);
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

  it('CON-02 Client A finalizes Client B committed revision rather than the complete revision A reviewed', async () => {
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
    const result = await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', key).send({ reason }).expect(201);
    expect(result.body.status).toBe('FINALIZED');
    const persisted = await clientA(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    expect(persisted.body.finalized).toBe(true);
    expect(persisted.body.participants.map((p: { id: string; status: string; revision: number }) => ({ id: p.id, status: p.status, revision: p.revision })))
      .toEqual([{ id: c.f.participant, status: 'UNEXCUSED', revision: 2 }]);
    const [record] = await admin`SELECT finalization_id,revision,attendance_status FROM attendance_records WHERE tenant_id=${c.f.tenant} AND participant_id=${c.f.participant}`;
    expect(record).toMatchObject({ finalization_id: result.body.id, revision: 2, attendance_status: 'UNEXCUSED' });
    const [correction] = await admin`SELECT old_status,new_status,old_revision,new_revision FROM attendance_corrections WHERE tenant_id=${c.f.tenant} AND attendance_id=${persisted.body.participants[0].attendanceId}`;
    expect(correction).toMatchObject({ old_status: 'ATTENDED', new_status: 'UNEXCUSED', old_revision: 1, new_revision: 2 });
    await clientA(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)).set('Idempotency-Key', key).send({ reason }).expect(201);
    expect(await integrityCounts(c.f)).toMatchObject({ active: 1, records: 1, finalizations: 1, audits: 1, receipts: 1 });
    console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'CON-02', reviewed: { status: 'ATTENDED', revision: 1 }, clientBCommitted: { status: 'UNEXCUSED', revision: 2 }, finalizeHTTP: 201, persisted: { status: record.attendance_status, revision: record.revision, linkedToReturnedFinalization: record.finalization_id === result.body.id }, effects: await integrityCounts(c.f) }));
  });

  it('EMP-03 eligible empty sheets currently create finalization, audit and replay receipt with zero attendance records', async () => {
    for (const options of [
      { role: 'TEACHER', status: 'CONFIRMED', empty: 'none', hoursAgo: 2 },
      { role: 'TEACHER', status: 'COMPLETED', empty: 'removed', hoursAgo: 2 },
      { role: 'MANAGER', assigned: false, status: 'CONFIRMED', empty: 'removed', hoursAgo: 50 },
      { role: 'MANAGER', assigned: false, status: 'COMPLETED', empty: 'none', hoursAgo: 50 },
    ] as const) {
      const c = await integrityCase(options), auth = await c.client();
      const sheet = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
      expect(sheet.body.participants).toEqual([]); expect(sheet.body.finalized).toBe(false);
      const before = await integrityCounts(c.f);
      expect(before).toMatchObject({ active: 0, records: 0, finalizations: 0, audits: 0, receipts: 0 });
      const key = randomUUID(), reason = 'Characterize empty roster; policy not changed';
      const result = await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
        .set('Idempotency-Key', key).send({ reason }).expect(201);
      expect(result.body.status).toBe('FINALIZED');
      const persisted = await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
      expect(persisted.body.participants).toEqual([]); expect(persisted.body.finalized).toBe(true);
      const [af] = await admin`SELECT confirmed_by_membership_id,revision FROM attendance_finalizations WHERE id=${result.body.id} AND tenant_id=${c.f.tenant} AND session_id=${c.f.session}`;
      expect(af).toMatchObject({ confirmed_by_membership_id: c.f.member, revision: 1 });
      const [audit] = await admin`SELECT reason,policy_version_id,correlation_id,after_json FROM audit_logs WHERE tenant_id=${c.f.tenant} AND event_type='R3:FINALIZE' AND entity_id=${result.body.id}`;
      expect(audit.reason).toBe(reason); expect(audit.policy_version_id).toBe(c.f.policy); expect(audit.correlation_id).toBeTruthy();
      expect(audit.after_json.command).toMatchObject({ operation: 'FINALIZE', sessionId: c.f.session, key });
      await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)).set('Idempotency-Key', key).send({ reason }).expect(201);
      const after = await integrityCounts(c.f);
      expect(after).toEqual({ ...before, finalizations: 1, audits: 1, receipts: 1 });
      expect((await admin`SELECT status FROM class_sessions WHERE id=${c.f.session}`)[0].status).toBe(options.status);
      console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'EMP-03', ...options, finalizeHTTP: 201, before, after, auditPolicyAndActorVerified: true, replayDuplicatedEffects: false }));
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
        .set('Idempotency-Key', randomUUID()).send({ reason: 'Empty roster must not bypass authority' }).expect(options.expected);
      expect(await integrityCounts(c.f)).toEqual(before);
    }
    const c = await integrityCase({ role: 'TEACHER', empty: 'none' }), auth = await c.client();
    await auth(request(app.getHttpServer()).get(`${c.base}/sessions/${c.f.session}`)).expect(200);
    await admin`DELETE FROM role_permissions WHERE tenant_id=${c.f.tenant}
      AND role_id=(SELECT role_id FROM membership_roles WHERE id=${c.f.membershipRole})
      AND permission_id=(SELECT id FROM permissions WHERE code='attendance.finalize')`;
    const before = await integrityCounts(c.f);
    await auth(request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Permission revoked after GET' }).expect(403);
    await auth(request(app.getHttpServer()).post(`/api/v1/tenants/${fixture.tenant}/attendance/sessions/${c.f.session}/finalize`))
      .set('Idempotency-Key', randomUUID()).send({ reason: 'Other tenant' }).expect(403);
    await request(app.getHttpServer()).post(`${c.base}/sessions/${c.f.session}/finalize`)
      .set('Idempotency-Key', randomUUID()).send({ reason: 'No authentication' }).expect(401);
    expect(await integrityCounts(c.f)).toEqual(before);
    console.info('R13_INTEGRITY_EVIDENCE', JSON.stringify({ case: 'EMP-03-negative', draft: 422, cancelled: 422, future: 422, recentUnassignedManager: 403, unassignedTeacher: 403, revokedPermission: 403, wrongTenant: 403, unauthenticated: 401, failedCommandsAddedEffects: false }));
  });
});
