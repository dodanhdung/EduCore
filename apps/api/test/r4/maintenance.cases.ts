import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { Test } from '@nestjs/testing';
import { expect, it } from 'vitest';
import request from 'supertest';
import postgres from 'postgres';
import { AppModule } from '../../src/app.module.js';
import { R4Module, configureR4Http } from '../../src/identity-access/r4.module.js';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import type { AuthConfig } from '../../src/identity-access/auth.service.js';
import type { OtpDeliveryPort } from '../../src/identity-access/otp-delivery.js';
import { R4Worker } from '../../src/automation-jobs/worker.js';
import { AdmissionClosed, WriteAdmission } from '../../src/operations/write-admission.js';
import { until } from './browser-auth.js';
import type { ProfileLinkContext } from './profile-link.cases.js';

type Context = ProfileLinkContext & { authUrl: () => string; workerUrl: () => string;
  config: () => AuthConfig; delivery: () => OtpDeliveryPort };
export function registerMaintenanceTests(ctx: Context) {
  const evidence: unknown[] = [];
  const record = (value: unknown) => {
    evidence.push(value);
    if (!process.env.R13_MASTER_EVIDENCE_DIR) return;
    const dir = resolve(process.env.R13_MASTER_EVIDENCE_DIR);
    if (!dir.startsWith(resolve('../..', '.local') + sep)) throw Error('LOCAL_EVIDENCE_REQUIRED');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, 'maintenance.json'), JSON.stringify(evidence, null, 2));
  };
  const setup = async (mode: 'open' | 'closed', workerEnabled = false) => {
    const gate = new WriteAdmission(mode);
    const repo = new R4Repository(ctx.authUrl(), ctx.apiUrl(), ctx.workerUrl(), gate);
    await repo.assertRuntime();
    const module = await Test.createTestingModule({ imports: [AppModule,
      R4Module.register(repo, ctx.config(), ctx.delivery(), workerEnabled, undefined, gate)] }).compile();
    const app = module.createNestApplication(); configureR4Http(app, ctx.config(), gate);
    await app.listen(0, '127.0.0.1');
    return { gate, repo, app, worker: module.get(R4Worker) };
  };
  const state = async () => (await ctx.admin()`SELECT
    (SELECT count(*)::int FROM auth_sessions) sessions,
    (SELECT count(*)::int FROM audit_logs) audits,
    (SELECT count(*)::int FROM idempotency_records) receipts,
    (SELECT count(*)::int FROM subjects) subjects,
    (SELECT count(*)::int FROM educore_r4.transaction_principals) principals,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY backend_pid)::text,'[]')) FROM educore_r4.transaction_principals x) principalDigest,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM automation_jobs x) jobs,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM outbox_events x) outbox,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY key_hash)::text,'[]')) FROM educore_r4.auth_throttles x) throttle`)[0];

  it('MA01 CLOSED rejects direct-origin auth, protected reads and mutations before DB/context effects', async () => {
    const f = await ctx.fresh(), actor = await ctx.sessionFor(f), s = await setup('closed', true);
    try {
      const before = await state();
      const paths: [string, string][] = [
        ['get', '/api/v1/auth/me'], ['post', '/api/v1/auth/login'],
        ['post', '/api/v1/auth/activation/otp/request'], ['post', '/api/v1/auth/password/otp/request'],
        ['get', `/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}`],
        ['post', `/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}/activate`],
        ['post', `/api/v1/tenants/${f.tenant}/attendance/sessions/${f.session}/finalize`],
        ['post', `/api/v1/tenants/${f.tenant}/academic/profiles/teachers/${f.teacher}/membership-link`],
        ['post', `/api/v1/tenants/${f.tenant}/students/${f.student}/wallet/top-ups`],
        ['get', '/?maintenance=open'], ['post', '/'], ['get', '/health'],
      ];
      for (const [method, path] of paths) {
        const response = await request(s.app.getHttpServer())[method as 'get' | 'post'](path)
          .auth(actor.accessToken, { type: 'bearer' }).set('X-Maintenance-Bypass', 'true');
        expect(response.status).toBe(503); expect(response.body.code).toBe('MAINTENANCE');
        expect(response.headers['cache-control']).toBe('no-store');
      }
      await request(s.app.getHttpServer()).get('/').expect(200, 'Hello World!');
      await request(s.app.getHttpServer()).head('/').expect(200);
      await expect(s.repo.transaction(actor.accessToken, async () => undefined)).rejects.toBeInstanceOf(AdmissionClosed);
      expect(await state()).toEqual(before);
      record({ case: 'MA01', rejected: paths.length, health: 'GET_HEAD_ONLY', dbAndPrincipalEffects: 0 });
    } finally { await s.app.close(); }
  });
  it('MA02 CLOSED blocks worker claim, perform, dispatch and tick without touching queues', async () => {
    const s = await setup('closed', true);
    try {
      const before = await state();
      await expect(s.worker.claim()).rejects.toBeInstanceOf(AdmissionClosed);
      await expect(s.worker.perform({ id: randomUUID(), tenantId: randomUUID(), fence: '1', leaseUntil: new Date().toISOString() })).rejects.toBeInstanceOf(AdmissionClosed);
      await expect(s.worker.dispatch()).rejects.toBeInstanceOf(AdmissionClosed);
      await expect(s.worker.tick()).rejects.toBeInstanceOf(AdmissionClosed);
      expect(await state()).toEqual(before); record({ case: 'MA02', blockedEntrypoints: 4, effects: 0 });
    } finally { await s.app.close(); }
  });
  for (const abort of [false, true]) it(`MA03 drain waits for a real blocked transaction, clientAbort=${abort}`, async () => {
    const f = await ctx.fresh(), actor = await ctx.sessionFor(f), s = await setup('open');
    const blocker = postgres(process.env.R4_TEST_URL!, { max: 1, prepare: false, onnotice() {} });
    const code = 'MA-' + randomUUID(), url = `/api/v1/tenants/${f.tenant}/academic/catalog/subjects`;
    const port = s.app.getHttpServer().address().port as number;
    let release!: () => void, locked!: () => void;
    const ready = new Promise<void>(r => { locked = r; }), barrier = new Promise<void>(r => { release = r; });
    const holding = blocker.begin(async tx => { await tx`SELECT id FROM tenants WHERE id=${f.tenant} FOR UPDATE`; locked(); await barrier; });
    let outgoing: ReturnType<typeof httpRequest> | undefined;
    try {
      await ready;
      const response = new Promise<number>((resolveStatus, reject) => {
        outgoing = httpRequest({ hostname: '127.0.0.1', port, path: url, method: 'POST', headers: {
          Authorization: `Bearer ${actor.accessToken}`, 'Content-Type': 'application/json' } }, res => {
          res.resume(); res.on('end', () => resolveStatus(res.statusCode!));
        });
        outgoing.on('error', reject);
        outgoing.end(JSON.stringify({ code, name: 'Maintenance native subject', reason: 'Local admission race' }));
      });
      void response.catch(() => undefined);
      await until(async () => (await ctx.admin()`SELECT count(*)::int n FROM pg_stat_activity
        WHERE datname=current_database() AND cardinality(pg_blocking_pids(pid))>0`)[0].n > 0, 'MA_DB_BLOCKED');
      if (abort) outgoing!.destroy();
      let drained = false;
      const draining = (abort ? s.app.close() : s.gate.closeAndDrain(10_000)).then(() => { drained = true; });
      await until(() => Promise.resolve(s.gate.snapshot().mode === 'closed'), 'MA_SHUTDOWN_CLOSED');
      await request(s.app.getHttpServer()).post(url).send({ code: code + '-denied' }).expect(503);
      await new Promise(r => setImmediate(r)); expect(drained).toBe(false);
      release(); await holding;
      if (!abort) expect(await response).toBe(201); else await response.catch(() => undefined);
      await draining;
      expect(s.gate.snapshot()).toEqual({ mode: 'closed', active: 0, drained: true });
      expect((await ctx.admin()`SELECT count(*)::int n FROM subjects WHERE tenant_id=${f.tenant} AND code=${code}`)[0].n).toBe(1);
      expect((await ctx.admin()`SELECT count(*)::int n FROM subjects WHERE tenant_id=${f.tenant} AND code=${code+'-denied'}`)[0].n).toBe(0);
      record({ case: 'MA03', clientAbort: abort, throughNestShutdown: abort, observedPGBlocking: true, admittedWriteCommitted: 1, postCloseWrites: 0, drainAfterCommit: true });
    } finally { release?.(); await holding.catch(() => undefined); outgoing?.destroy(); await blocker.end(); await s.app.close(); }
  });
  it('MA04 OPEN retains normal 401 and tenant-scoped 403 without granting new authority', async () => {
    const f = await ctx.fresh(), foreign = await ctx.fresh(), actor = await ctx.sessionFor(f), s = await setup('open');
    try {
      await request(s.app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}`).expect(401);
      await request(s.app.getHttpServer()).get(`/api/v1/tenants/${foreign.tenant}/academic/classes/${foreign.classId}`)
        .auth(actor.accessToken, { type: 'bearer' }).expect(403);
      await request(s.app.getHttpServer()).get(`/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}`)
        .auth(actor.accessToken, { type: 'bearer' }).expect(200);
      record({ case: 'MA04', unauthenticated: 401, foreignTenant: 403, ownScope: 200 });
    } finally { await s.app.close(); }
  });
}
