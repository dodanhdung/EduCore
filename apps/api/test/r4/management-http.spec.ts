import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RuntimeController } from '../../src/workflow-approval/runtime.controller.js';
import { RuntimeService } from '../../src/workflow-approval/runtime.service.js';
import { SessionGuard } from '../../src/identity-access/session.guard.js';
import { configureR4Http } from '../../src/identity-access/r4.module.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';

const tenant = '00000000-0000-4000-8000-000000000001';
const member = '00000000-0000-4000-8000-000000000002';
const base = `/api/v1/tenants/${tenant}`;

describe('R8 management HTTP transport', () => {
  let app: INestApplication;
  const service = {
    managementRead: vi.fn(async (_token: string, _tenant: string, kind: string) => kind === 'MEMBER'
      ? { id: member, assignments: [] } : { items: [], page: 1, pageSize: 20, total: 0 }),
    iam: vi.fn(async () => ({ id: member })),
    run: vi.fn(async () => ({ id: member, status: 'PENDING_ACTIVATION' })),
    read: vi.fn(async () => ({ items: [] })),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [RuntimeController],
      providers: [{ provide: RuntimeService, useValue: service }] })
      .overrideGuard(SessionGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    configureR4Http(app, { origins: ['http://localhost:5173'] } as AuthService['config']);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('routes tenant-scoped member and relationship reads through the authorized service', async () => {
    await request(app.getHttpServer()).get(base + '/members?page=2').set('Authorization', 'Bearer token').expect(200);
    expect(service.managementRead).toHaveBeenCalledWith('token', tenant, 'MEMBERS', undefined, { page: 2 });
    await request(app.getHttpServer()).get(base + `/members/${member}`).set('Authorization', 'Bearer token').expect(200);
    expect(service.managementRead).toHaveBeenCalledWith('token', tenant, 'MEMBER', member);
    await request(app.getHttpServer()).get(base + '/parent-student-links').set('Authorization', 'Bearer token').expect(200);
    expect(service.managementRead).toHaveBeenCalledWith('token', tenant, 'RELATIONSHIPS', undefined, {});
    await request(app.getHttpServer()).get(base + '/parent-student-links/students?pageSize=100').set('Authorization', 'Bearer token').expect(200);
    expect(service.managementRead).toHaveBeenCalledWith('token', tenant, 'STUDENTS', undefined, { pageSize: 100 });
  });
  it('rejects invalid IDs and pages before invoking SQL', async () => {
    service.managementRead.mockClear();
    await request(app.getHttpServer()).get(base + '/members/not-an-id').set('Authorization', 'Bearer token').expect(400);
    await request(app.getHttpServer()).get(base + '/members?page=bad').set('Authorization', 'Bearer token').expect(400);
    expect(service.managementRead).not.toHaveBeenCalled();
  });
  it('accepts only disable status and forwards a reason for IAM mutation', async () => {
    await request(app.getHttpServer()).patch(base + `/members/${member}`).set('Authorization', 'Bearer token')
      .send({ status: 'ACTIVE', reason: 'No unlock' }).expect(400);
    await request(app.getHttpServer()).patch(base + `/members/${member}`).set('Authorization', 'Bearer token')
      .send({ status: 'DISABLED', reason: 'Approved disable' }).expect(200);
    expect(service.iam).toHaveBeenCalledWith('token', tenant, expect.objectContaining({ id: member, operation: 'MEMBER_DEACTIVATE', reason: 'Approved disable' }));
  });
});
