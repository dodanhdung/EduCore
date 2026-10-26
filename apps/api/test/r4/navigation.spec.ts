import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { navigationAccess } from '../../src/identity-access/navigation.dto.js';
import { NavigationService } from '../../src/identity-access/navigation.service.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';
import { NavigationController } from '../../src/identity-access/navigation.controller.js';
import { SessionGuard } from '../../src/identity-access/session.guard.js';
import { configureR4Http } from '../../src/identity-access/r4.module.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const tenantId = '00000000-0000-4000-8000-000000000003';
const good = () => ({ userId, sessionId, tenantId, screenIds: ['OP01', 'OP04', 'OP05'], validUntil: Date.now() + 30_000 });

describe('Phase B navigation DTO and service boundary', () => {
  it('migration matches the frozen draft with only the approved NC-01 correction', () => {
    const draft = readFileSync(resolve('../../docs/ai/integration/proposals/R7_navigation_access.sql'), 'utf8');
    const migrated = readFileSync(resolve('prisma/migrations/202610240001_r7_navigation_access/migration.sql'), 'utf8');
    const body = (text: string) => text.slice(text.indexOf('-- Conservative TENANT-scoped operations only;'));
    const corrected = draft.replace('  m := educore_r3.principal(t);', `  BEGIN
    m := educore_r3.principal(t);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    IF educore_r4.session_id() IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='28000';
    END IF;
    RAISE;
  END;`);
    expect(body(migrated).replace(/\r\n/g, '\n')).toBe(body(corrected).replace(/\r\n/g, '\n'));
  });
  it('accepts only the reviewed sorted screen subset and exact identity fields', () => {
    expect(navigationAccess(good()).screenIds).toEqual(['OP01', 'OP04', 'OP05']);
    expect(navigationAccess({ ...good(), screenIds: ['OP01', 'OP02', 'OP03', 'OP04', 'OP05'] }).screenIds)
      .toEqual(['OP01', 'OP02', 'OP03', 'OP04', 'OP05']);
    expect(navigationAccess({ ...good(), screenIds: [] }).screenIds).toEqual([]);
    expect(navigationAccess({ ...good(), screenIds: ['AC01', 'AC02', 'OP01'] }).screenIds)
      .toEqual(['AC01', 'AC02', 'OP01']);
    expect(navigationAccess({ ...good(), screenIds: ['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07'] }).screenIds)
      .toEqual(['BL01', 'BL02', 'BL03', 'BL04', 'BL05', 'BL06', 'BL07']);
    expect(navigationAccess({ ...good(), screenIds: ['BL09', 'BL10'] }).screenIds)
      .toEqual(['BL09', 'BL10']);
    for (const bad of [
      { ...good(), screenIds: ['AC02'] },
      { ...good(), screenIds: ['OP05'] },
      { ...good(), screenIds: ['OP04', 'OP04', 'OP05'] },
      { ...good(), screenIds: ['OP05', 'OP04'] },
      { ...good(), screenIds: ['OP02'] },
      { ...good(), screenIds: ['BL05'] },
      { ...good(), screenIds: ['BL07'] },
      { ...good(), screenIds: ['OP01'], extra: true },
      { ...good(), userId: 'user' },
      { ...good(), validUntil: Number.MAX_SAFE_INTEGER + 1 },
    ]) expect(() => navigationAccess(bad)).toThrow();
  });

  it('binds the SQL response to independently verified JWT claims', async () => {
    let raw: unknown = good();
    const calls: unknown[][] = [];
    const auth = {
      tokens: { verify: () => ({ sub: userId, sid: sessionId, tid: tenantId }) },
      repository: { transaction: async (token: string, action: (tx: unknown) => Promise<unknown>) => {
        calls.push([token]);
        return action({ $queryRawUnsafe: async (query: string, id: string) => {
          calls.push([query, id]);
          return [{ result: raw }];
        } });
      } },
    } as unknown as AuthService;
    const service = new NavigationService(auth);
    expect((await service.read('test-token', tenantId)).screenIds).toEqual(['OP01', 'OP04', 'OP05']);
    expect(calls[0]).toEqual(['test-token']);
    expect(calls[1]).toEqual(['SELECT educore_r4.navigation_access($1::uuid) result', tenantId]);
    raw = { ...good(), sessionId: userId };
    await expect(service.read('test-token', tenantId)).rejects.toMatchObject({ status: 500 });
    raw = { ...good(), validUntil: Date.now() - 1 };
    await expect(service.read('test-token', tenantId)).rejects.toMatchObject({ status: 401 });
    raw = { ...good(), screenIds: ['BL08'] };
    await expect(service.read('test-token', tenantId)).rejects.toMatchObject({ status: 500 });
  });
});

describe('Phase B HTTP transport with service and guard doubles', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NavigationController],
      providers: [
        { provide: NavigationService, useValue: { read: async () => good() } },
      ],
    }).overrideGuard(SessionGuard).useValue({ canActivate: () => true }).compile();
    app = module.createNestApplication();
    configureR4Http(app, { origins: ['http://localhost:5173'] } as AuthService['config']);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('emits exact JSON, no-store and no ETag or conditional 304', async () => {
    const path = `/api/v1/tenants/${tenantId}/access/navigation`;
    for (const response of [
      await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer token').expect(200),
      await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer token').set('If-None-Match', '*').expect(200),
    ]) {
      expect(Object.keys(response.body).sort()).toEqual(['screenIds', 'sessionId', 'tenantId', 'userId', 'validUntil']);
      expect(response.headers['content-type']).toMatch(/^application\/json; charset=utf-8/);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.etag).toBeUndefined();
      expect(response.headers['x-request-id']).toBeTruthy();
    }
  });

  it('rejects query/body with safe error envelope and no ETag', async () => {
    const path = `/api/v1/tenants/${tenantId}/access/navigation`;
    for (const response of [
      await request(app.getHttpServer()).get(path).query({ role: 'MANAGER' }).expect(400),
      await request(app.getHttpServer()).get(path).send({ screenIds: ['OP01'] }).expect(400),
    ]) {
      expect(response.body.code).toBe('INVALID_INPUT');
      expect(response.body.message).toBe('INVALID_INPUT');
      expect(response.body.correlationId).toBe(response.headers['x-request-id']);
      expect(response.headers.etag).toBeUndefined();
      expect(response.headers['cache-control']).toBe('no-store');
    }
  });
});
