/** Opt-in LOCAL synthetic paired recovery. Existing cohort passwords remain
 * in memory; no credential/OTP injection, production URL or exported dump. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, openSync, closeSync } from 'node:fs';
import { resolve, join, sep, dirname } from 'node:path';
import { createServer } from 'node:net';
import postgres from 'postgres';
import type { AuthConfig } from '../../src/identity-access/auth.service.js';
import { until } from './browser-auth.js';

type Account = { alias: string; email: string; profile?: string; navigation?: string[] };
export async function pairedRecovery(input: { directory: string; tenant: string; foreignTenant: string;
  accounts: Account[]; managerEmail: string; password: string; config: AuthConfig }) {
  assert.equal(process.env.R13_MASTER_RECOVERY, 'LOCAL_PAIRED_RESTORE_ONLY');
  assert.equal(process.env.R4_TEST_DISPOSABLE, 'I_OWN_THIS_DISPOSABLE_CLUSTER');
  const api = resolve('.'), root = resolve('../..', '.local'), dir = resolve(input.directory, 'recovery');
  assert.ok(dir.startsWith(root + sep)); mkdirSync(dir, { recursive: true });
  const sourceUrl = new URL(process.env.R4_TEST_URL!);
  assert.equal(sourceUrl.hostname, '127.0.0.1'); assert.equal(sourceUrl.search + sourceUrl.hash, '');
  const run = sourceUrl.pathname.match(/^\/educore_r4_native_([a-f0-9]{32})$/)?.[1]; assert.ok(run);
  const sourceContainer = 'educore-r4-native-' + run;
  const docker = (...args: string[]) => execFileSync('docker', ['--context', 'desktop-linux', ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  assert.match(docker('context', 'inspect', 'desktop-linux', '--format', '{{.Endpoints.docker.Host}}'), /^npipe:/);
  const inspect = (name: string) => {
    assert.match(name, /^educore-r4-native-[a-f0-9]{32}$/);
    const v = JSON.parse(docker('inspect', '--format', '{{json .}}', name));
    assert.equal(v.Config.Labels['educore.r4.disposable'], name.slice(-32)); assert.equal(v.State.Running, true);
    const binding = v.NetworkSettings.Ports['5432/tcp']; assert.equal(binding.length, 1); assert.equal(binding[0].HostIp, '127.0.0.1');
    const env = Object.fromEntries((v.Config.Env as string[]).map(x => { const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1)]; }));
    assert.equal(env.POSTGRES_DB, 'educore_r4_native_' + name.slice(-32));
    return new URL(`postgresql://${encodeURIComponent(env.POSTGRES_USER)}:${encodeURIComponent(env.POSTGRES_PASSWORD)}@127.0.0.1:${binding[0].HostPort}/${env.POSTGRES_DB}`);
  };
  const admittedSource = inspect(sourceContainer); assert.ok(admittedSource.toString() === sourceUrl.toString(), 'LOCAL_SOURCE_ADMISSION_MISMATCH');
  const connections: postgres.Sql[] = [];
  const connect = (url: URL) => { const sql = postgres(url.toString(), { max: 1, prepare: false, onnotice() {} }); connections.push(sql); return sql; };
  const source = connect(sourceUrl), sourceFiles = join(dir, 'private-source'), restoredFiles = join(dir, 'private-restored');
  const roles: string[] = [];
  const runtimeUrls = async (db: postgres.Sql, url: URL) => {
    const urls: string[] = [];
    for (const kind of ['auth', 'api']) {
      const name = 'r13_restore_' + kind + '_' + randomBytes(6).toString('hex'), password = randomBytes(32).toString('hex');
      await db.unsafe(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE educore_r4_${kind}`);
      const u = new URL(url); u.username = name; u.password = password; urls.push(u.toString()); roles.push(name);
    }
    return urls;
  };
  const children: ChildProcess[] = [], handles: number[] = [];
  const start = async (urls: string[], files: string, mode: 'open' | 'closed', label: string) => {
    const probe = createServer(); await new Promise<void>(r => probe.listen(0, '127.0.0.1', r));
    const port = (probe.address() as { port: number }).port; await new Promise<void>(r => probe.close(() => r()));
    const log = openSync(join(dir, label + '-private.log'), 'wx'); handles.push(log);
    const osEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      ['path','systemroot','windir','comspec','temp','tmp','localappdata','userprofile','systemdrive','pathext'].includes(name.toLowerCase())));
    const child = spawn(process.execPath, [join(api, 'dist/main.js')], { cwd: api, windowsHide: true,
      env: { ...osEnv, NODE_ENV: 'development', PORT: String(port), R4_BIND_HOST: '127.0.0.1',
        R4_AUTH_URL: urls[0], R4_API_URL: urls[1], R4_WORKER_ENABLED: '0', R4_OTP_MODE: 'unavailable',
        R4_JWT_SECRET: input.config.jwtSecret, R4_OTP_PEPPER: input.config.otpPepper,
        R4_JWT_ISSUER: input.config.issuer, R4_JWT_AUDIENCE: input.config.audience,
        R4_WEB_ORIGINS: input.config.origins.join(','), R5_PRIVATE_STORAGE_ROOT: files, R13_ADMISSION_MODE: mode },
      stdio: ['ignore', log, log] });
    children.push(child); const base = `http://127.0.0.1:${port}`;
    await until(async () => { if (child.exitCode !== null) throw Error('BUILT_API_STARTUP_FAILED');
      try { const r = await fetch(base + '/', { redirect: 'error', signal: AbortSignal.timeout(1000) }); return r.status === 200 && await r.text() === 'Hello World!'; } catch { return false; }
    }, 'BUILT_API_READY');
    return { child, base };
  };
  const stop = async (child: ChildProcess) => {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    await until(() => Promise.resolve(child.exitCode !== null || child.signalCode !== null), 'BUILT_API_STOPPED');
  };
  const call = async (base: string, path: string, token = '', body?: object, expected = 200) => {
    const response = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', redirect: 'error',
      headers: { Origin: input.config.origins[0], ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
    assert.equal(response.status, expected, 'LOCAL_RECOVERY_HTTP_STATUS_' + path);
    return response.status === 204 ? null : response.json();
  };
  const login = async (base: string, email: string) => {
    const result = await call(base, '/api/v1/auth/login', '', { email, password: input.password });
    const selected = await call(base, '/api/v1/auth/select-tenant', result.accessToken, { tenantId: input.tenant });
    return selected.accessToken as string;
  };
  const stable = async (db: postgres.Sql) => (await db`SELECT
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM classes x) classes,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM enrollments x) enrollments,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM class_sessions x) sessions,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM attendance_records x) attendance,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM invoices x) invoices,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY id)::text,'[]')) FROM idempotency_records x) receipts`)[0];
  try {
    const sourceRuntime = await runtimeUrls(source, sourceUrl), sourceApi = await start(sourceRuntime, sourceFiles, 'open', 'source');
    const student = input.accounts.find(a => a.alias === 'S1')!;
    const token = await login(sourceApi.base, student.email);
    const [recipient] = await source`SELECT id FROM assignment_recipients WHERE tenant_id=${input.tenant} AND student_id=${student.profile!} AND revoked_at IS NULL`;
    assert.ok(recipient);
    const pdf = Buffer.from('%PDF-1.4\n% EduCore synthetic local recovery fixture\n%%EOF\n');
    const form = new FormData(); form.set('recipientId', recipient.id as string);
    form.set('file', new Blob([pdf], { type: 'application/pdf' }), 'local-recovery.pdf');
    const upload = await fetch(sourceApi.base + `/api/v1/tenants/${input.tenant}/files`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form, redirect: 'error' });
    assert.equal(upload.status, 201, 'LOCAL_FILE_UPLOAD_STATUS'); const file = await upload.json(); assert.equal(file.status, 'READY');
    const submission = await fetch(sourceApi.base + `/api/v1/tenants/${input.tenant}/assignment-recipients/${recipient.id}/submissions`, {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': 'R13:RECOVERY:' + randomBytes(12).toString('hex') }, body: JSON.stringify({ fileIds: [file.id] }), redirect: 'error' });
    assert.equal(submission.status, 201, 'LOCAL_SUBMISSION_STATUS');
    const [stored] = await source`SELECT private_storage_key FROM stored_files WHERE tenant_id=${input.tenant} AND id=${file.id}`;
    assert.match(stored.private_storage_key as string, /^[a-f0-9-]{36}\/[a-f0-9-]{36}$/);
    await stop(sourceApi.child);
    await until(async () => (await source`SELECT count(*)::int n FROM pg_stat_activity WHERE usename=ANY(${roles}::text[])`)[0].n === 0, 'SOURCE_RUNTIME_CONNECTIONS_CLOSED');
    execFileSync('powershell', ['-NoProfile','-ExecutionPolicy','Bypass','-File',join(api,'test/r4/b1-recovery.ps1'),
      '-SourceContainer',sourceContainer,'-TenantId',input.tenant,'-EvidenceDirectory',join(dir,'checkpoint')],
      { cwd: api, stdio: 'pipe', timeout: 120_000 });
    const raw = readFileSync(join(dir,'checkpoint/recovery.json'),'utf8').replace(/^\uFEFF/,'');
    const checkpoint = JSON.parse(raw); assert.equal(checkpoint.status, 'PASS');
    const targetUrl = inspect(checkpoint.destinationContainer); assert.notEqual(targetUrl.pathname, sourceUrl.pathname);
    const target = connect(targetUrl), before = await stable(target);
    const sourcePath = resolve(sourceFiles, stored.private_storage_key as string), targetPath = resolve(restoredFiles, stored.private_storage_key as string);
    assert.ok(sourcePath.startsWith(sourceFiles + sep) && targetPath.startsWith(restoredFiles + sep));
    mkdirSync(dirname(targetPath), { recursive: true }); copyFileSync(sourcePath, targetPath);
    const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha(readFileSync(sourcePath)), sha(readFileSync(targetPath))); assert.equal(sha(pdf), file.sha256);
    const targetRuntime = await runtimeUrls(target, targetUrl), closed = await start(targetRuntime, restoredFiles, 'closed', 'restored-closed');
    const principalBefore = (await target`SELECT count(*)::int n FROM educore_r4.transaction_principals`)[0].n;
    await call(closed.base, '/api/v1/auth/login', '', { email: student.email, password: input.password }, 503);
    await call(closed.base, `/api/v1/tenants/${input.tenant}/files/${file.id}/download`, '', undefined, 503);
    assert.equal((await target`SELECT count(*)::int n FROM educore_r4.transaction_principals`)[0].n, principalBefore);
    await stop(closed.child);
    const opened = await start(targetRuntime, restoredFiles, 'open', 'restored-open'), tokens = new Map<string,string>();
    const actors = [{ alias: 'MANAGER', email: input.managerEmail }, ...input.accounts];
    for (const actor of actors) {
      const access = await login(opened.base, actor.email); tokens.set(actor.alias, access);
      const nav = await call(opened.base, `/api/v1/tenants/${input.tenant}/access/navigation`, access);
      assert.equal(nav.tenantId, input.tenant);
      assert.ok(Array.isArray(nav.screenIds));
      if ('navigation' in actor && actor.navigation) assert.deepEqual(nav.screenIds, actor.navigation);
    }
    await call(opened.base, `/api/v1/tenants/${input.foreignTenant}/portal/context`, tokens.get('S1')!, undefined, 403);
    const download = await fetch(opened.base + `/api/v1/tenants/${input.tenant}/files/${file.id}/download`, { headers: { Authorization: 'Bearer ' + tokens.get('S1') }, redirect: 'error' });
    assert.equal(download.status, 200); assert.equal(sha(Buffer.from(await download.arrayBuffer())), file.sha256);
    await call(opened.base, `/api/v1/tenants/${input.tenant}/files/${file.id}/download`, tokens.get('T2')!, undefined, 403);
    assert.deepEqual(await stable(target), before);
    await stop(opened.child);
    writeFileSync(join(dir,'application-recovery.json'), JSON.stringify({ status:'PASS',sourceContainer,
      destinationContainer:checkpoint.destinationContainer,sourceQuiesced:true,checkpointAllTablesMatch:true,
      restoredBuiltApiClosedStartup:'PASS',closedAuthAndDownload:503,closedContextWrites:0,
      restoredBuiltApiOpenStartup:'PASS',normalPasswordLogins:actors.length,roleNavigation:actors.map(a=>a.alias),
      crossTenant:403,foreignTeacherFile:403,privateFile:{fileId:file.id,sha256:file.sha256,status:'READY',download:200,submission:'REAL_LOCAL_API'},
      businessSourcesUnchangedDuringRestoreAcceptance:true,otpAndExternalDelivery:'NOT_REQUESTED',
      limitations:'Local built entry/development cookies only; original credentials restored unchanged. Fresh restricted DB logins are local-only. No Render, production SMTP, live backup or deployment.' },null,2));
  } finally {
    for (const child of children) if(child.exitCode===null&&child.signalCode===null)await stop(child).catch(()=>undefined);
    await Promise.all(connections.map(db=>db.end({timeout:5}))); for(const handle of handles)closeSync(handle);
  }
}
