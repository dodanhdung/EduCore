import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AuthService } from '../../src/identity-access/auth.service.js';
import { AuthController } from '../../src/identity-access/http.js';
import { configureR4Http } from '../../src/identity-access/r4.module.js';

// HTTP contract tests with an injected service double; no claim about PostgreSQL grants.
describe('R7 browser ↔ NestJS authentication HTTP contract', () => {
  let app: INestApplication;
  const origin = 'http://localhost:5173';
  const config = { production: false, origins: [origin], jwtSecret: 'k'.repeat(64), otpPepper: 'p'.repeat(64), issuer: 'local', audience: 'web' };
  const principal = { id: 'user', sessionId: 'session', tenantId: null, allowedTenants: [] };
  const service = {
    config,
    throttle: vi.fn(async () => true),
    login: vi.fn(async () => ({ accessToken: 'test-access', refreshToken: 'test-refresh', csrfToken: 'test-csrf', expiresInSeconds: 900, requiresTenantSelection: true })),
    refresh: vi.fn(async () => ({ accessToken: 'next-access', refreshToken: 'next-refresh', csrfToken: 'next-csrf', expiresInSeconds: 900 })),
    me: vi.fn(async () => principal),
    selectTenant: vi.fn(async (_token: string, tenantId: string) => ({ accessToken: 'selected-access', expiresInSeconds: 900, principal: { ...principal, tenantId } })),
    logout: vi.fn(async () => undefined),
    requestOtp: vi.fn(async () => undefined),
    reset: vi.fn(async () => undefined),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AuthController], providers: [{ provide: AuthService, useValue: service }] }).compile();
    app = module.createNestApplication();
    configureR4Http(app, config);
    await app.init();
  });
  afterAll(async () => { await app?.close(); });

  it('allows the configured browser preflight with credentials, Authorization and CSRF headers', async () => {
    const response = await request(app.getHttpServer()).options('/api/v1/auth/refresh')
      .set('Origin', origin).set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-csrf-token,authorization');
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
  });
  it('login returns memory access/CSRF and a path-limited HttpOnly refresh cookie without exposing refresh in JSON', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').set('Origin', origin)
      .send({ email: 'person@example.test', password: 'test password' });
    expect(response.status).toBe(200);
    expect(service.login).toHaveBeenCalledWith('person@example.test', 'test password');
    expect(response.body.csrfToken).toBe('test-csrf');
    expect(response.body.refreshToken).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(cookie).not.toContain('Secure');
  });
  it('refresh denies absent Origin or CSRF and requires the refresh cookie', async () => {
    for (const mode of ['origin', 'csrf', 'cookie']) {
      const call = request(app.getHttpServer()).post('/api/v1/auth/refresh');
      if (mode !== 'origin') call.set('Origin', origin);
      if (mode !== 'csrf') call.set('X-CSRF-Token', 'test-csrf');
      if (mode !== 'cookie') call.set('Cookie', 'educore_refresh=test-refresh');
      const response = await call;
      expect(response.status).toBe(mode === 'cookie' ? 401 : 403);
    }
  });
  it('me requires Bearer and returns the principal without permission evidence', async () => {
    expect((await request(app.getHttpServer()).get('/api/v1/auth/me')).status).toBe(401);
    const response = await request(app.getHttpServer()).get('/api/v1/auth/me').set('Authorization', 'Bearer test-access');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(principal);
    expect(response.body.screenIds).toBeUndefined();
  });
  it('tenant selection forwards the actual UUID and returns the selected principal', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const response = await request(app.getHttpServer()).post('/api/v1/auth/select-tenant')
      .set('Authorization', 'Bearer test-access').send({ tenantId });
    expect(response.status).toBe(200);
    expect(service.selectTenant).toHaveBeenCalledWith('test-access', tenantId);
    expect(response.body.principal.tenantId).toBe(tenantId);
  });
  it('refresh passes exact cookie and CSRF to the service and rotates both response channels', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Origin', origin)
      .set('Cookie', 'educore_refresh=test-refresh').set('X-CSRF-Token', 'test-csrf');
    expect(response.status).toBe(200);
    expect(service.refresh).toHaveBeenCalledWith('test-refresh', 'test-csrf');
    expect(response.body).toEqual({ accessToken: 'next-access', csrfToken: 'next-csrf', expiresInSeconds: 900 });
    expect(response.headers['set-cookie'][0]).toContain('educore_refresh=next-refresh');
  });
  it('logout requires Bearer and returns 204 plus cookie clearing on confirmed revocation', async () => {
    expect((await request(app.getHttpServer()).post('/api/v1/auth/logout')).status).toBe(401);
    const response = await request(app.getHttpServer()).post('/api/v1/auth/logout').set('Authorization', 'Bearer test-access');
    expect(response.status).toBe(204);
    expect(service.logout).toHaveBeenCalledWith('test-access');
    expect(response.headers['set-cookie'][0]).toContain('educore_refresh=;');
  });
  it('auth-only unit module does not mount the navigation endpoint', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/tenants/00000000-0000-4000-8000-000000000001/access/navigation');
    expect(response.status).toBe(404);
  });
  it('password OTP request uses the public PASSWORD_RESET purpose and generic HTTP 202', async () => {
    const known = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request')
      .send({ email: ' Person@Example.Test ' });
    const unknown = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request')
      .send({ email: 'unknown@example.test' });
    expect(known.status).toBe(202);
    expect(known.body).toEqual({ accepted: true });
    expect(unknown.body).toEqual(known.body);
    expect(service.requestOtp).toHaveBeenCalledWith('person@example.test', 'PASSWORD_RESET');
    const invalid = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request').send({ email: 'bad' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_INPUT');
  });
  it('password reset accepts only exact DTO and returns an empty HTTP 204', async () => {
    const body = { email: 'person@example.test', otp: '123456', newPassword: 'new password 123' };
    const response = await request(app.getHttpServer()).post('/api/v1/auth/password/reset').send(body);
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
    expect(service.reset).toHaveBeenCalledWith(body.email, body.otp, body.newPassword, 'PASSWORD_RESET');
    for (const invalid of [{ ...body, otp: 'abc' }, { ...body, confirmation: 'secret' }]) {
      const failed = await request(app.getHttpServer()).post('/api/v1/auth/password/reset').send(invalid);
      expect(failed.status).toBe(400);
      expect(failed.body.code).toBe('INVALID_INPUT');
    }
    service.reset.mockRejectedValueOnce(Error('INVALID_OTP'));
    const badOtp = await request(app.getHttpServer()).post('/api/v1/auth/password/reset').send(body);
    expect(badOtp.status).toBe(400);
    expect(badOtp.body.code).toBe('INVALID_INPUT');
  });
  it('OTP and reset throttling use public 429 without calling the service command', async () => {
    const beforeRequest = service.requestOtp.mock.calls.length;
    service.throttle.mockResolvedValueOnce(false);
    const otp = await request(app.getHttpServer()).post('/api/v1/auth/password/otp/request').send({ email: 'person@example.test' });
    expect(otp.status).toBe(429);
    expect(otp.body.code).toBe('RATE_LIMITED');
    expect(service.requestOtp.mock.calls.length).toBe(beforeRequest);
    const beforeReset = service.reset.mock.calls.length;
    service.throttle.mockResolvedValueOnce(false);
    const reset = await request(app.getHttpServer()).post('/api/v1/auth/password/reset')
      .send({ email: 'person@example.test', otp: '123456', newPassword: 'new password 123' });
    expect(reset.status).toBe(429);
    expect(reset.body.code).toBe('RATE_LIMITED');
    expect(service.reset.mock.calls.length).toBe(beforeReset);
  });
});
