import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from '../../src/identity-access/auth.service.js';
import { SessionGuard } from '../../src/identity-access/session.guard.js';
import { configureR4Http } from '../../src/identity-access/r4.module.js';
import { SchedulingController } from '../../src/scheduling/scheduling.controller.js';
import { AttendanceController } from '../../src/attendance/attendance.controller.js';

const tenant = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const session = '00000000-0000-4000-8000-000000000003';
const participant = '00000000-0000-4000-8000-000000000004';
const root = `/api/v1/tenants/${tenant}`;

describe('R8 Scheduling and Attendance HTTP boundary', () => {
  let app: INestApplication;
  const queries: { sql: string; args: unknown[] }[] = [];
  const auth = {
    me: vi.fn(async () => ({ tenantId: tenant, allowedTenants: [{ id: tenant }] })),
    repository: { transaction: vi.fn(async (_token: string, action: (tx: unknown) => Promise<unknown>) =>
      action({ $queryRawUnsafe: async (sql: string, ...args: unknown[]) => {
        queries.push({ sql, args });
        return [{ result: sql.includes('mvp_read') ? { items: [], page: 1, pageSize: 20, total: 0 } : { id: session } }];
      } })) },
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [SchedulingController, AttendanceController],
      providers: [{ provide: AuthService, useValue: auth }, SessionGuard],
    }).compile();
    app = module.createNestApplication();
    configureR4Http(app, { origins: ['http://localhost:5173'] } as AuthService['config']);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('rejects a different tenant before any schedule or roster read', async () => {
    queries.length = 0;
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other}/scheduling/calendar`)
      .set('Authorization', 'Bearer token').query({ from: '2026-10-25T00:00:00Z', to: '2026-10-26T00:00:00Z' }).expect(403);
    await request(app.getHttpServer()).get(`/api/v1/tenants/${other}/attendance/sessions/${session}`)
      .set('Authorization', 'Bearer token').expect(403);
    expect(queries).toHaveLength(0);
  });

  it('routes bounded reads through the R4 transaction and rejects malformed scope inputs', async () => {
    queries.length = 0;
    await request(app.getHttpServer()).get(`${root}/scheduling/calendar`)
      .set('Authorization', 'Bearer token').query({ from: '2026-10-25T00:00:00Z', to: '2026-10-26T00:00:00Z' }).expect(200);
    await request(app.getHttpServer()).get(`${root}/attendance/sessions/${session}`)
      .set('Authorization', 'Bearer token').expect(200);
    expect(queries[0].sql).toContain('educore_r4.schedule_mvp_read');
    expect(queries[1].sql).toContain('educore_r4.attendance_mvp_read');
    expect(queries[1].args).toContain(session);
    queries.length = 0;
    await request(app.getHttpServer()).get(`${root}/scheduling/calendar?from=bad&to=bad`)
      .set('Authorization', 'Bearer token').expect(400);
    await request(app.getHttpServer()).get(`${root}/attendance/sessions/not-a-uuid`)
      .set('Authorization', 'Bearer token').expect(400);
    expect(queries).toHaveLength(0);
  });

  it('passes only typed scheduling commands with an idempotency key', async () => {
    queries.length = 0;
    await request(app.getHttpServer()).post(`${root}/scheduling/sessions`).set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'schedule-1').send({ classId: session, teacherId: participant,
        deliveryMode: 'ONLINE', startsAt: '2026-11-01T10:00:00Z', endsAt: '2026-11-01T11:00:00Z', reason: 'Class lesson' }).expect(201);
    expect(queries[0].sql).toContain('educore_r3.scheduling');
    expect(JSON.parse(queries[0].args[1] as string)).toMatchObject({ operation: 'CREATE', key: 'schedule-1', roomId: null });
    queries.length = 0;
    await request(app.getHttpServer()).post(`${root}/scheduling/sessions`).set('Authorization', 'Bearer token')
      .send({ classId: session, teacherId: participant, deliveryMode: 'ONLINE', startsAt: 'bad', endsAt: 'bad', reason: 'x' }).expect(400);
    expect(queries).toHaveLength(0);
  });

  it('checks the self or linked child guard before submitting leave', async () => {
    queries.length = 0;
    await request(app.getHttpServer()).post(`${root}/attendance/leaves`).set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'leave-1').send({ participantId: participant, reason: 'Illness' }).expect(201);
    expect(queries.map((q) => q.sql)).toEqual([
      expect.stringContaining('educore_r4.leave_self_guard'), expect.stringContaining('educore_r3.attendance'),
    ]);
    queries.length = 0;
    await request(app.getHttpServer()).post(`${root}/attendance/leaves`).set('Authorization', 'Bearer token')
      .set('Idempotency-Key', 'leave-2').send({ participantId: other, reason: '' }).expect(400);
    expect(queries).toHaveLength(0);
  });
});
