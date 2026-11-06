/** Local-only R13 release drill. Run after start-r4-native.ps1 (without
 * -RunTests) in the SAME PowerShell process, then Node from apps/api.
 * Never consumes DATABASE_URL, reads .env, repairs a failed ledger, or edits
 * canonical migrations. Requires a fresh admitted task-owned PG16 database.
 * Reports only allowlisted metadata; temporary SQL copies stay under .local.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, sep } from 'node:path';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync, openSync, closeSync } from 'node:fs';
import postgres from 'postgres';

const api = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const local = resolve(api, '../../.local');
const source = join(api, 'prisma/migrations');
const lastThree = ['202611050001_r13_attendance_integrity', '202611050002_r13_profile_membership_link', '202611050003_r13_class_activation'];
const hash = value => createHash('sha256').update(value).digest('hex');
const report = { startedAt: new Date().toISOString(), status: 'STARTED', checks: {} };
let db, output;

async function main() {
  assert.equal(process.env.R4_TEST_DISPOSABLE, 'I_OWN_THIS_DISPOSABLE_CLUSTER');
  const url = new URL(process.env.R4_TEST_URL ?? '');
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/educore_r4_native_[a-f0-9]{32}$/);
  assert.equal(url.search + url.hash, '');
  const destination = resolve(process.env.R13_RELEASE_EVIDENCE_DIR ?? '');
  assert.ok(destination.startsWith(local + sep));
  assert.ok(!existsSync(join(destination, 'migration-rehearsal.json')), 'REFUSE_EVIDENCE_OVERWRITE');
  mkdirSync(destination, { recursive: true });
  output = destination;
  db = postgres(url.toString(), { max: 1, prepare: false, onnotice() {}, connect_timeout: 5 });
  const [admission] = await db`SELECT current_database() database,current_setting('server_version_num')::int version,
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') tables,
    (SELECT count(*)::int FROM pg_roles WHERE rolname LIKE 'educore_%') project_roles,
    (SELECT count(*)::int FROM pg_database WHERE NOT datistemplate AND datname NOT IN ('postgres',current_database())) other_databases`;
  assert.ok(admission.version >= 160000 && admission.version < 170000);
  assert.equal(admission.tables + admission.project_roles + admission.other_databases, 0);
  report.admission = admission;
  const names = readdirSync(source).filter(n => existsSync(join(source, n, 'migration.sql'))).sort();
  assert.equal(names.length, 53);
  assert.deepEqual(names.slice(-3), lastThree);
  const originalHashes = names.map(name => ({ name, sha256Raw: hash(readFileSync(join(source, name, 'migration.sql'))),
    sha256LF: hash(readFileSync(join(source, name, 'migration.sql'), 'utf8').replace(/\r\n/g, '\n')) }));
  report.manifest = originalHashes;
  const work = mkdtempSync(join(output, 'local-migration-copy-'));
  const schema = join(work, 'schema.prisma');
  copyFileSync(join(api, 'prisma/schema.prisma'), schema);
  const migrations = join(work, 'migrations');
  mkdirSync(migrations);
  copyFileSync(join(source, 'migration_lock.toml'), join(migrations, 'migration_lock.toml'));
  const copy = name => {
    mkdirSync(join(migrations, name));
    copyFileSync(join(source, name, 'migration.sql'), join(migrations, name, 'migration.sql'));
  };
  names.slice(0, -3).forEach(copy);
  const prisma = createRequire(import.meta.url).resolve('prisma/build/index.js');
  const deploy = () => {
    const start = performance.now();
    const result = spawnSync(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], {
      cwd: api, env: { ...process.env, DATABASE_URL: url.toString() }, timeout: 120_000, encoding: 'utf8', maxBuffer: 8_000_000,
    });
    // Never persist CLI output: it can echo datasource credentials.
    return { exit: result.status, durationMs: Math.round(performance.now() - start),
      noPending: /No pending migrations/i.test(result.stdout ?? ''),
      failedLedgerRefusal: /P3009/.test((result.stdout ?? '') + (result.stderr ?? '')) };
  };
  const ledger = () => db`SELECT migration_name,checksum,finished_at IS NOT NULL finished,
    rolled_back_at IS NOT NULL rolled_back FROM _prisma_migrations ORDER BY started_at`;
  const metadata = () => db`SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) signature,
    r.rolname owner,r.rolcanlogin owner_login,r.rolsuper owner_super,r.rolbypassrls owner_bypass,
    p.prosecdef security_definer,p.provolatile volatility,p.proconfig config,p.proacl::text acl,md5(p.prosrc) body_hash,
    EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
    has_function_privilege('educore_r4_api',p.oid,'EXECUTE') api_execute,
    has_function_privilege('educore_r4_auth',p.oid,'EXECUTE') auth_execute,
    has_function_privilege('educore_r4_worker',p.oid,'EXECUTE') worker_execute
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_roles r ON r.oid=p.proowner
    WHERE n.nspname IN ('educore_r3','educore_r4') AND p.proname IN ('attendance','attendance_review_version',
    'attendance_reasons','attendance_sheet_contract','attendance_mvp_read','navigation_access','profile_membership_link','class_activate')
    ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)`;
  report.phase = 'BASELINE_50_DEPLOY';
  report.baselineDeploy = deploy();
  assert.equal(report.baselineDeploy.exit, 0);
  report.baselineLedger = await ledger();
  assert.equal(report.baselineLedger.length, 50);
  assert.ok(report.baselineLedger.every(r => r.finished && !r.rolled_back));
  const before = await metadata();
  report.baselineFunctions = before;
  report.checks.baseline50 = 'PASS';

  // Prove the existing startup ACL check is not an R13 contract/version gate.
  // Fresh, restricted LOCAL logins only; passwords never enter a report.
  report.phase = 'BASELINE_RUNTIME_COMPATIBILITY';
  const connections = [];
  for (const role of ['educore_r4_auth', 'educore_r4_api']) {
    const name = role + '_release_test', password = randomBytes(32).toString('hex');
    await db.unsafe(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${role}`);
    const login = new URL(url); login.username = name; login.password = password;
    connections.push(login.toString());
  }
  const { R4Repository } = await import(pathToFileURL(join(api, 'dist/identity-access/r4-repository.js')).href);
  const repository = new R4Repository(connections[0], connections[1]);
  try { await repository.assertRuntime(); } finally { await repository.close(); }
  report.baselineCurrentRuntimeACLCheck = 'PASS_WITHOUT_R13_FUNCTIONS; NOT_A_SCHEMA_VERSION_GUARD';
  report.checks.roleStartupAloneInsufficient = 'VERIFIED';

  // A CLOSED bridge can safely replace the old API BEFORE migrations: prove
  // actual production entry starts on baseline50, and no request reaches DB.
  report.phase = 'CLOSED_PRODUCTION_BRIDGE_ON_50';
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const privateLog = openSync(join(output, 'closed-bridge-private.log'), 'wx');
  const osEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ['path','systemroot','windir','comspec','temp','tmp','localappdata','userprofile','systemdrive','pathext'].includes(key.toLowerCase())));
  const bridge = spawn(process.execPath, [join(api, 'dist/main.js')], { cwd: api, windowsHide: true,
    env: { ...osEnv, NODE_ENV:'production', PORT:String(port), R4_BIND_HOST:'127.0.0.1',
      R4_AUTH_URL:connections[0], R4_API_URL:connections[1], R4_WORKER_ENABLED:'0',
      R4_OTP_MODE:'unavailable', R4_JWT_SECRET:randomBytes(32).toString('hex'),
      R4_OTP_PEPPER:randomBytes(32).toString('hex'), R4_JWT_ISSUER:'local-release-bridge',
      R4_JWT_AUDIENCE:'local-release-web', R4_WEB_ORIGINS:'https://release.invalid',
      R5_PRIVATE_STORAGE_ROOT:join(output,'bridge-private-files'), R13_ADMISSION_MODE:'closed' },
    stdio:['ignore',privateLog,privateLog] });
  try {
    const deadline = Date.now() + 15_000; let ready = false;
    while (Date.now() < deadline) {
      if (bridge.exitCode !== null) throw Error('CLOSED_BRIDGE_STARTUP_FAILED');
      try { const r = await fetch(`http://127.0.0.1:${port}/`, { redirect:'error',signal:AbortSignal.timeout(1000) }); ready = r.status===200 && await r.text()==='Hello World!'; } catch { /* Startup only. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve,100));
    }
    assert.ok(ready);
    for (const [method,path] of [['POST','/api/v1/auth/login'],['GET','/api/v1/tenants/00000000-0000-4000-8000-000000000001/academic/classes']]) {
      const r = await fetch(`http://127.0.0.1:${port}${path}`, { method,redirect:'error',signal:AbortSignal.timeout(3000) });
      assert.equal(r.status,503); assert.equal((await r.json()).code,'MAINTENANCE');
    }
    assert.equal((await db`SELECT count(*)::int n FROM educore_r4.transaction_principals`)[0].n,0);
    assert.equal((await ledger()).filter(row=>row.finished).length,50);
    report.closedProductionBridge={status:'PASS',databaseMigrations:50,health:200,auth:503,protectedGet:503,principalRows:0,externalOTP:'NOT_REQUESTED'};
    report.checks.closedBridgeBeforeMigrations='PASS';
  } finally {
    if(bridge.exitCode===null&&bridge.signalCode===null)bridge.kill();
    await new Promise(resolve => { if(bridge.exitCode!==null||bridge.signalCode!==null)resolve();else bridge.once('exit',resolve); });
    closeSync(privateLog);
  }

  // Deliberately fail the first pending migration AFTER its DDL, before COMMIT,
  // on a disposable COPY. This is not an altered production migration artifact.
  lastThree.forEach(copy);
  const faultFile = join(migrations, lastThree[0], 'migration.sql');
  const sql = readFileSync(faultFile, 'utf8');
  assert.equal((sql.match(/COMMIT;/g) ?? []).length, 1);
  writeFileSync(faultFile, sql.replace('COMMIT;', "DO $$ BEGIN RAISE EXCEPTION 'R13_LOCAL_RELEASE_INJECTED_FAILURE'; END $$;\nCOMMIT;"));
  report.phase = 'INJECTED_R13_FAILURE';
  report.injectedDeploy = deploy();
  assert.notEqual(report.injectedDeploy.exit, 0);
  report.failedLedger = await ledger();
  const failed = report.failedLedger.filter(r => !r.finished && !r.rolled_back);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].migration_name, lastThree[0]);
  assert.equal(report.failedLedger.filter(r => r.finished).length, 50);
  assert.deepEqual(await metadata(), before);
  const [rolledBack] = await db`SELECT to_regprocedure('educore_r3.attendance_review_version(uuid,uuid)') IS NULL helper_absent,
    to_regprocedure('educore_r4.profile_membership_link(uuid,text,uuid,jsonb)') IS NULL link_absent,
    to_regprocedure('educore_r4.class_activate(uuid,uuid,jsonb)') IS NULL activate_absent`;
  assert.deepEqual(rolledBack, { helper_absent: true, link_absent: true, activate_absent: true });
  report.rollback = { unchangedFunctionBodiesOwnersACL: true, ...rolledBack };
  report.refusedRetry = deploy();
  assert.notEqual(report.refusedRetry.exit, 0);
  assert.equal(report.refusedRetry.failedLedgerRefusal, true);
  report.checks.failureAtomicity = 'PASS';
  report.checks.failedLedgerStopsRetry = 'PASS';
  report.recoveryDecision = 'STOP_FAILED_DATABASE_RETAIN_FOR_REVIEW; RESTORE_VERIFIED_CHECKPOINT_OR_USE_SEPARATE_FRESH_CLUSTER. NO_MIGRATE_RESOLVE_NO_DELETE_LEDGER_NO_RETRY_LOOP';
  assert.deepEqual(names.map(name => hash(readFileSync(join(source, name, 'migration.sql')))), originalHashes.map(x => x.sha256Raw));
  report.checks.canonicalSourcesUnchanged = 'PASS';
  report.phase = 'COMPLETE';
  report.status = 'PASS';
}

try { await main(); }
catch (error) {
  report.status = 'FAIL';
  // No raw error or SQL text: it may contain the private connection string.
  report.error = { kind: error?.name === 'AssertionError' ? 'ASSERTION_FAILED' : 'LOCAL_DRILL_FAILED',
    code: /^[A-Z0-9_]{3,40}$/.test(error?.code ?? '') ? error.code : undefined };
  process.exitCode = 1;
} finally {
  await db?.end({ timeout: 5 });
  report.finishedAt = new Date().toISOString();
  if (output) writeFileSync(join(output, 'migration-rehearsal.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, checks: report.checks, error: report.error }));
}
