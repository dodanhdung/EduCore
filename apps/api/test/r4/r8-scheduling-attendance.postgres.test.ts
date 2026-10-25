import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import postgres from 'postgres';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import { R4Module, configureR4Http } from '../../src/identity-access/r4.module.js';
import { CaptureOtpDelivery } from '../../src/identity-access/otp-delivery.js';
import { passwordHash } from '../../src/identity-access/crypto.js';
import { put, seed, type Query } from '../schema-integrity/support.js';

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
