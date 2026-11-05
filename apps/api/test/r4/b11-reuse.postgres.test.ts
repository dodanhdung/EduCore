import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import postgres from 'postgres';
import request from 'supertest';
import { expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import { R4Module, configureR4Http } from '../../src/identity-access/r4.module.js';
import { CaptureOtpDelivery } from '../../src/identity-access/otp-delivery.js';
import { parseRecoveryKey } from '../../src/identity-access/recovery-envelope.js';
import { RecoveryWorker } from '../../src/identity-access/recovery-worker.js';
import { withAcademicBrowser, type BrowserDriver } from './browser-academic.js';

type Inventory = { tenant: string; foreignTenant: string; classIds: string[]; students: string[]; teachers: string[] };
type Existing = { alias: string; member: string; role: string; profile?: string; classId?: string; navigation: string[] };

// No schema/data seeding and no new core identities: reuse the B1 cohort after
// guarded container admission. Recover access using the real recovery protocol,
// local-only delivery worker and normal login. Never inject application hashes.
it('B11 reuses the B1 cohort and verifies truthful class/portal presentation', async () => {
  if (process.env.R13_B11_ADMITTED !== 'VERIFIED_OWNED_B1_COHORT_ONLY') throw Error('B1_ADMISSION_REQUIRED');
  const url = new URL(process.env.R13_B11_TEST_URL ?? '');
  if (url.hostname !== '127.0.0.1' || !/^\/educore_r4_native_[a-f0-9]{32}$/.test(url.pathname) || url.search || url.hash) throw Error('LOCAL_ONLY');
  const phase = process.env.R13_B11_PHASE;
  if (phase !== 'BEFORE' && phase !== 'AFTER') throw Error('PHASE_REQUIRED');
  const root = resolve('../..', '.local');
  const files = ['R13_B11_INVENTORY', 'R13_B11_EXECUTION', 'R13_B11_EVIDENCE_DIR'] as const;
  for (const key of files) if (!resolve(process.env[key] ?? '').startsWith(root + sep)) throw Error('LOCAL_PATH_REQUIRED');
  const load = (name: typeof files[number]) => JSON.parse(readFileSync(process.env[name]!, 'utf8').replace(/^\uFEFF/, ''));
  const inventory: Inventory = load('R13_B11_INVENTORY');
  const original: { accounts: Existing[] } = load('R13_B11_EXECUTION');
  const directory = process.env.R13_B11_EVIDENCE_DIR!;
  mkdirSync(directory, { recursive: true });
  const admin = postgres(url.toString(), { max: 1, prepare: false, onnotice: () => undefined });
  let repository: R4Repository | undefined, workerDb: PrismaClient | undefined, app: INestApplication | undefined;
  const ledger: { method: string; path: string; status: number; expected: number }[] = [];
  const result: Record<string, unknown> = { phase, tenant: inventory.tenant, source: 'REUSED_B1_COHORT_REAL_HTTP_LOCAL_CAPTURE', ledger };
  const save = () => writeFileSync(resolve(directory, 'execution.json'), JSON.stringify(result, null, 2));
  try {
    const before = await admin`SELECT id,status FROM classes WHERE tenant_id=${inventory.tenant} ORDER BY id`;
    expect(before).toHaveLength(2); expect(before.every(c => c.status === 'PLANNED')).toBe(true);
    const core = await admin`SELECT m.id,u.email_normalized email FROM tenant_memberships m JOIN users u ON u.id=m.user_id
      WHERE m.tenant_id=${inventory.tenant} AND u.email_normalized LIKE '%@b1.invalid' ORDER BY m.id`;
    expect(core).toHaveLength(9);
    const connection = async (group: string) => {
      const login = `b11_${randomBytes(6).toString('hex')}`, password = randomBytes(32).toString('hex');
      await admin.unsafe(`CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${group}`);
      const next = new URL(url); next.username = login; next.password = password; return next.toString();
    };
    const authUrl = await connection('educore_r4_auth'), apiUrl = await connection('educore_r4_api');
    const workerUrl = await connection('educore_r4_otp_delivery');
    repository = new R4Repository(authUrl, apiUrl); await repository.assertRuntime();
    const delivery = new CaptureOtpDelivery();
    const recoveryKey = parseRecoveryKey('b11-local', randomBytes(32).toString('base64'));
    const config = { jwtSecret: randomBytes(32).toString('hex'), otpPepper: randomBytes(32).toString('hex'),
      issuer: 'educore-b11-local', audience: 'educore-web', origins: ['http://localhost:5173'], production: false, recoveryKey };
    const module = await Test.createTestingModule({ imports: [R4Module.register(repository, config, delivery)] }).compile();
    app = module.createNestApplication(); configureR4Http(app, config); await app.init();
    workerDb = new PrismaClient({ adapter: new PrismaPg({ connectionString: workerUrl }) });
    const capture = new Map<string, string>();
    const worker = new RecoveryWorker(workerDb, new Map([[recoveryKey.id, recoveryKey]]), {
      send: async (email, code) => { if (!email.endsWith('.invalid')) throw Error('LOCAL_RECIPIENT_REQUIRED'); capture.set(email, code); return 'ACCEPTED'; },
    });
    await worker.assertRuntime();
    const call = async (method: 'get' | 'post', path: string, token = '', body?: object, expected = 200) => {
      let req = request(app!.getHttpServer())[method](path);
      if (token) req = req.auth(token, { type: 'bearer' });
      if (path === '/api/v1/auth/login') req = req.set('Origin', 'http://localhost:5173');
      if (body !== undefined) req = req.send(body);
      const response = await req; ledger.push({ method, path, status: response.status, expected }); save();
      if (response.status !== expected) throw Error(`B11_${method}_${path}_${response.status}_EXPECTED_${expected}`);
      return response.body;
    };
    const password = 'Aa1!' + randomBytes(24).toString('base64url');
    const reset = async (email: string) => {
      await call('post', '/api/v1/auth/password/otp/request', '', { email }, 202);
      for (let i = 0; i < 20 && !capture.has(email); i++) await worker.tick();
      if (!capture.has(email)) throw Error('LOCAL_RECOVERY_DELIVERY_MISSING');
      await call('post', '/api/v1/auth/password/reset', '', { email, otp: capture.get(email), newPassword: password }, 204);
    };
    const login = async (email: string) => {
      const auth = await call('post', '/api/v1/auth/login', '', { email, password });
      return (await call('post', '/api/v1/auth/select-tenant', auth.accessToken, { tenantId: inventory.tenant })).accessToken as string;
    };
    const identities: { alias: string; email: string; token: string; member: string }[] = [];
    for (const member of core) {
      const spec = original.accounts.find(a => a.member === member.id);
      await reset(member.email); identities.push({ alias: spec?.alias ?? 'MANAGER', email: member.email, member: member.id, token: await login(member.email) });
    }
    const by = (alias: string) => identities.find(i => i.alias === alias)!;
    const base = `/api/v1/tenants/${inventory.tenant}`, manager = by('MANAGER');
    const get = (suffix: string, token = manager.token, status = 200) => call('get', base + suffix, token, undefined, status);
    const post = (suffix: string, body: object) => call('post', base + suffix, manager.token, body, 201);
    // One supplemental no-enrollment child/guardian is reconciled by immutable
    // code/email. It is not a recreated core demo account or a broad scope grant.
    const reason = 'B11 local no-enrollment presentation verification';
    const [existingStudent] = await admin`SELECT id FROM student_profiles WHERE tenant_id=${inventory.tenant} AND student_code='B11-NONE'`;
    const student = existingStudent?.id ?? (await post('/academic/profiles/students', { code: 'B11-NONE', name: 'Học sinh chưa ghi danh B11', reason })).id;
    const email = `no-enrollment-${inventory.tenant}@b11.invalid`;
    const [oldMember] = await admin`SELECT m.id FROM tenant_memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=${inventory.tenant} AND u.email_normalized=${email}`;
    let extraMember: string;
    if (oldMember) { extraMember = oldMember.id; await reset(email); }
    else {
      extraMember = (await post('/members', { email, displayName: 'Phụ huynh chưa có ghi danh B11', reason })).id;
      const [role] = await admin`SELECT id FROM roles WHERE tenant_id=${inventory.tenant} AND code='PARENT' AND is_system_seeded`;
      await post(`/members/${extraMember}/role-assignments`, { roleId: role.id, scopeKind: 'STUDENT', studentId: student, reason });
      await call('post', '/api/v1/auth/activation/otp/request', '', { email }, 202);
      const code = delivery.messages.findLast(m => m.email === email)?.otp;
      if (!code) throw Error('LOCAL_ACTIVATION_MISSING');
      await call('post', '/api/v1/auth/activation/complete', '', { email, otp: code, newPassword: password }, 204);
      const link = await post('/parent-student-links', { parentMembershipId: extraMember, studentId: student, evidenceReference: 'B11 synthetic guardian', reason });
      await post(`/parent-student-links/${link.id}/verify`, { reason });
    }
    const extraToken = await login(email);
    const planned = await get(`/portal/children/${inventory.students[0]}`, by('P1').token);
    const none = await get(`/portal/children/${student}`, extraToken);
    expect(planned.classes).toEqual([]); expect(none.classes).toEqual([]);
    const [activeEnrollment] = await admin`SELECT count(*)::int n FROM enrollments WHERE tenant_id=${inventory.tenant} AND student_id=${inventory.students[0]} AND status='ACTIVE'`;
    expect(activeEnrollment.n).toBe(1);
    expect((await admin`SELECT count(*)::int n FROM enrollments WHERE tenant_id=${inventory.tenant} AND student_id=${student}`)[0].n).toBe(0);
    await withAcademicBrowser(app, async b => {
      for (const [alias, suffix, screen, expected] of [
        ['MANAGER', '/classes', 'AC07', 'Toán 6'], ['MANAGER', `/classes/${inventory.classIds[0]}`, 'AC08', 'Lê Khánh An'],
        ['MANAGER', '/overview', 'G01', 'Tổng quan'], ['T1', '/teacher', '', 'Nguyễn Minh Anh'],
        ['T2', '/teacher', '', 'Trần Thanh Bình'], ['S1', '/student', '', 'Lê Khánh An'], ['S2', '/student', '', 'Phạm Hải Đăng'],
        ['P1', '/parent', '', 'Lê Khánh An'], ['P2', '/parent', '', 'Phạm Hải Đăng'],
        ['P1', `/parent/children/${inventory.students[0]}`, '', 'Lê Khánh An'], ['S1', '/my/schedule', 'SC06', 'Lịch cá nhân'],
        ['AS1', '/notifications', 'GL01', 'Thông báo'], ['ACC1', '/finance/receivables', 'BL09', 'Công nợ'],
      ]) {
        await b.login(by(alias).email, password, inventory.tenant);
        await page(b, inventory.tenant, suffix, expected, screen);
        await b.capture(`B11-${phase}-${alias}-${screen || (suffix.includes('/children/') ? 'PO04-PLANNED' : suffix.slice(1))}`);
      }
      await b.login(email, password, inventory.tenant);
      await page(b, inventory.tenant, `/parent/children/${student}`, 'Học sinh chưa ghi danh B11');
      if (phase === 'AFTER') {
        expect(await b.evaluate<boolean>(`document.body.textContent.includes('Chưa có lớp đang hoạt động trong phạm vi được cấp.')`)).toBe(true);
        expect(await b.evaluate<boolean>(`document.body.textContent.includes('Chưa có ghi danh đang hoạt động.')`)).toBe(false);
      }
      await b.capture(`B11-${phase}-PO04-NO-ENROLLMENT`);
      await b.login(by('P1').email, password, inventory.tenant);
      await b.route(`/app/${inventory.tenant}/parent/children/${inventory.students[1]}`);
      await b.wait(`document.body.textContent.includes('Không thể tải dữ liệu') && !document.body.textContent.includes('Phạm Hải Đăng')`, 'B11_OTHER_CHILD_DENIED');
      await b.capture(`B11-${phase}-CROSS-CHILD-DENIED`);
      await b.route(`/app/${inventory.foreignTenant}/parent`);
      await b.wait(`document.querySelector('.ec-error-card span')?.textContent==='403' && !document.body.textContent.includes('Lê Khánh An')`, 'B11_FOREIGN_TENANT');
      await b.capture(`B11-${phase}-CROSS-TENANT-DENIED`);
      writeFileSync(resolve(directory, 'browser-network.json'), JSON.stringify(b.network, null, 2));
    });
    for (const a of original.accounts) {
      const who = by(a.alias); const menu = await get('/access/navigation', who.token);
      expect(menu.screenIds).toEqual(a.navigation);
      await call('get', `/api/v1/tenants/${inventory.foreignTenant}/portal/context`, who.token, undefined, 403);
    }
    const persisted = await admin`SELECT id,status FROM classes WHERE tenant_id=${inventory.tenant} ORDER BY id`;
    expect(persisted).toEqual(before);
    result.status = 'PASS'; result.existingCoreAccountsReused = 9; result.coreAccountsCreated = 0;
    result.supplementalNoEnrollmentGuardian = extraMember; result.classesBeforeAndAfter = persisted;
    result.activeClassCohort = 'BLOCKED_NO_LEGITIMATE_ACTIVE_CLASS_IN_PRIMARY_TENANT';
    result.readback = { activeEnrollmentCount: activeEnrollment.n, plannedChildClassCount: planned.classes.length, noEnrollmentChildClassCount: none.classes.length };
    save();
  } finally { await app?.close(); await repository?.close(); await workerDb?.$disconnect(); await admin.end(); }
});

async function page(b: BrowserDriver, tenant: string, suffix: string, expected: string, screen = '') {
  await b.route(`/app/${tenant}${suffix}`);
  await b.wait(`!!document.querySelector('.app-shell') && document.querySelector('main')?.textContent.includes(${JSON.stringify(expected)})
    && !document.body.textContent.includes('Đang kiểm tra') && !document.body.textContent.includes('Đang tải') && !document.body.textContent.includes('Đang đọc')
    ${screen && screen !== 'SC06' ? `&& !!document.querySelector('[data-screen-id="${screen}"]')` : ''}`, 'B11_PAGE_' + (screen || expected.replace(/[^a-z0-9]/gi, '').slice(0, 20)));
}
