import { beforeAll, afterAll, afterEach, it, expect } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { cpus, totalmem } from 'node:os';
import request from 'supertest';
import { AssignmentService } from '../../src/assignments-grading/assignment.service.js';
import { SubmissionService } from '../../src/assignments-grading/submission.service.js';
import { FileService } from '../../src/file-management/file.service.js';
import { GradingService } from '../../src/assignments-grading/grading.service.js';
import { PrivateVolumeStorageAdapter } from '../../src/file-management/private-volume.adapter.js';
import { pdf } from '../r5/file-fixtures.js';
import {
  seed,
  put,
  waitBlocked,
  type Query,
} from '../schema-integrity/support.js';
import {
  admin,
  app,
  auth,
  repository,
  storage,
  storageRoot,
  ownerUrl,
  evidenceRoot,
  evidence,
  initialize,
  finish,
  save,
  sha,
  docker,
  prisma,
  newCluster,
  migrationChecksum,
  fresh,
  actor,
  rolePasswords,
  runId,
  connect,
} from './support.js';

beforeAll(initialize);
afterEach((context) =>
  context.onTestFinished(() => {
    (evidence.cases as Record<string, string>)[context.task.name] =
      context.task.result?.state === 'pass' ? 'PASS' : 'FAIL';
  }),
);
afterAll(finish);
let latencyFixture: Awaited<ReturnType<typeof fresh>> | undefined;
const migrationManifest = () => readdirSync(resolve('prisma/migrations'))
  .filter((name) => /^\d/.test(name)).sort();

it('R6-01 all historical checksums, live catalog, owners, search paths and privilege inventory', async () => {
  const migrations =
    await admin`SELECT migration_name,checksum,finished_at IS NOT NULL AND rolled_back_at IS NULL healthy
      FROM _prisma_migrations ORDER BY started_at,id`;
  expect(migrations.map((m) => m.migration_name)).toEqual(migrationManifest());
  for (const m of migrations) {
    expect(m.healthy).toBe(true);
    expect(m.checksum).toBe(migrationChecksum(String(m.migration_name)));
  }
  const functions =
    await admin`SELECT n.nspname schema,p.proname name,pg_get_function_identity_arguments(p.oid) arguments,
    p.proowner::regrole::text owner,p.prosecdef security_definer,p.proconfig configuration,p.proacl::text acl,
    pg_get_functiondef(p.oid) definition,
    NOT EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') private
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname LIKE 'educore%' ORDER BY 1,2,3`;
  for (const f of functions) {
    expect(f.private, f.schema + '.' + f.name).toBe(true);
    if (f.security_definer)
      expect(
        (f.configuration as string[] | null)?.some((c) =>
          c.startsWith('search_path=pg_catalog'),
        ),
        String(f.name),
      ).toBe(true);
  }
  const constraints =
    await admin`SELECT c.conname name,c.contype type,c.conrelid::regclass::text table_name,c.confrelid::regclass::text referenced_table,
    c.conindid::regclass::text supporting_index,c.convalidated validated,c.condeferrable deferrable,c.condeferred initially_deferred,
    pg_get_constraintdef(c.oid) definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY 3,1`;
  expect(constraints.every((c) => c.validated)).toBe(true);
  const triggers =
    await admin`SELECT t.tgname name,t.tgrelid::regclass::text table_name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition,
    t.tgfoid::regprocedure::text function_name FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 2,1`;
  expect(triggers.every((t) => t.enabled === 'O')).toBe(true);
  const indexes =
    await admin`SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`;
  const roles =
    await admin`SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolcanlogin,rolbypassrls FROM pg_roles WHERE rolname LIKE 'educore%' ORDER BY rolname`;
  for (const r of roles) {
    expect(r.rolsuper).toBe(false);
    expect(r.rolcreatedb).toBe(false);
    expect(r.rolcreaterole).toBe(false);
    expect(r.rolbypassrls).toBe(false);
  }
  const memberships =
    await admin`SELECT member::regrole::text member,roleid::regrole::text role,admin_option FROM pg_auth_members ORDER BY 1,2`;
  const grants =
    await admin`SELECT grantee,table_schema,table_name,privilege_type FROM information_schema.role_table_grants WHERE grantee LIKE 'educore%' ORDER BY 1,2,3,4`;
  const columns =
    await admin`SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`;
  const extensions =
    await admin`SELECT extname,extversion FROM pg_extension ORDER BY extname`;
  const sources = readdirSync(resolve('prisma/migrations'))
    .filter((n) => /^\d/.test(n))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(
        resolve('prisma/migrations', name, 'migration.sql'),
        'utf8',
      ),
    }));
  const lineage = functions.map((f) => ({
    signature: `${f.schema}.${f.name}(${f.arguments})`,
    sha256: sha(String(f.definition)),
    declarationMigrations: sources
      .filter((s) =>
        new RegExp(
          `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+${String(f.schema)}\\.${String(f.name)}\\s*\\(`,
          'i',
        ).test(s.sql),
      )
      .map((s) => s.name),
    note: 'Effective definition is catalog authority; dynamic pg_get_functiondef/replace sites listed separately.',
  }));
  const dynamicReplacements = sources
    .filter((s) => s.sql.includes('pg_get_functiondef'))
    .map((s) => ({
      migration: s.name,
      sites: s.sql
        .split('\n')
        .filter((line) => /pg_get_functiondef|ddl:=replace/.test(line)),
    }));
  save('catalog', {
    migrations,
    functions,
    lineage,
    dynamicReplacements,
    constraints,
    triggers,
    indexes,
    roles,
    memberships,
    grants,
    columns,
    extensions,
  });
  evidence.catalog = {
    migrations: migrations.length,
    functions: functions.length,
    constraints: constraints.length,
    triggers: triggers.length,
    indexes: indexes.length,
    columns: columns.length,
  };
  // A second deployment must be a no-op, not another history row.
  expect(prisma(['migrate', 'deploy'])).toContain('No pending migrations');
  expect(
    (await admin`SELECT count(*)::int n FROM _prisma_migrations`)[0].n,
  ).toBe(migrationManifest().length);
  const drift = prisma([
    'migrate',
    'diff',
    '--from-config-datasource',
    '--to-schema',
    resolve('prisma/schema.prisma'),
    '--exit-code',
  ]);
  evidence.drift = drift.trim();
});

it('R6-02 real Prisma failed migration history, DDL rollback, refusal, resolve and redeploy', async () => {
  const target = await newCluster('recovery');
  prisma(['migrate', 'deploy'], target.url);
  const root = resolve(evidenceRoot, 'recovery-' + runId),
    dir = join(root, 'migrations');
  mkdirSync(dir, { recursive: true });
  for (const name of readdirSync('prisma/migrations')) {
    if (name === 'migration_lock.toml')
      copyFileSync(resolve('prisma/migrations', name), join(dir, name));
    else if (/^\d/.test(name)) {
      mkdirSync(join(dir, name));
      copyFileSync(
        resolve('prisma/migrations', name, 'migration.sql'),
        join(dir, name, 'migration.sql'),
      );
    }
  }
  const latest = migrationManifest().at(-1)!;
  const probe = `${String(BigInt(latest.slice(0, 12)) + 1n).padStart(12, '0')}_r6_test_only_probe`;
  mkdirSync(join(dir, probe));
  writeFileSync(
    join(dir, probe, 'migration.sql'),
    'BEGIN; CREATE TABLE public.r6_probe(id int PRIMARY KEY); SELECT 1/0; COMMIT;',
  );
  const config = join(root, 'prisma.config.mjs');
  writeFileSync(
    config,
    `export default {schema:${JSON.stringify(resolve('prisma/schema.prisma'))},migrations:{path:${JSON.stringify(dir)}},datasource:{url:process.env.DATABASE_URL}};`,
  );
  expect(() =>
    prisma(['migrate', 'deploy', '--config', config], target.url),
  ).toThrow(/division by zero|P3018|current transaction is aborted/);
  const [failed] =
    await target.db`SELECT finished_at,rolled_back_at,logs FROM _prisma_migrations WHERE migration_name=${probe}`;
  expect(failed.finished_at).toBeNull();
  expect(failed.rolled_back_at).toBeNull();
  expect(
    (await target.db`SELECT to_regclass('public.r6_probe') missing`)[0].missing,
  ).toBeNull();
  // Prisma's failed-TX logging can hide the original SQLSTATE. Independently
  // reproduce it and prove the failed DDL cannot persist.
  try {
    await expect(
      target.db
        .unsafe(readFileSync(join(dir, probe, 'migration.sql'), 'utf8'))
        .simple(),
    ).rejects.toMatchObject({ code: '22012' });
  } finally {
    await target.db`ROLLBACK`;
  }
  expect(
    (await target.db`SELECT to_regclass('public.r6_probe') missing`)[0].missing,
  ).toBeNull();
  expect(() =>
    prisma(['migrate', 'deploy', '--config', config], target.url),
  ).toThrow(/P3009|failed migrations/);
  prisma(
    ['migrate', 'resolve', '--rolled-back', probe, '--config', config],
    target.url,
  );
  // Only the disposable probe is corrected; repository migrations remain immutable.
  writeFileSync(
    join(dir, probe, 'migration.sql'),
    'BEGIN; CREATE TABLE public.r6_probe(id int PRIMARY KEY); COMMIT;',
  );
  prisma(['migrate', 'deploy', '--config', config], target.url);
  expect(
    (
      await target.db`SELECT count(*)::int n FROM _prisma_migrations WHERE migration_name=${probe} AND finished_at IS NOT NULL AND rolled_back_at IS NULL`
    )[0].n,
  ).toBe(1);
  const aborted = await target.db.reserve();
  try {
    await aborted`BEGIN`;
    await expect(aborted`SELECT 1/0`).rejects.toMatchObject({ code: '22012' });
    await expect(aborted`SELECT 1`).rejects.toMatchObject({ code: '25P02' });
    await aborted`ROLLBACK`;
    expect((await aborted`SELECT 1 n`)[0].n).toBe(1);
  } finally {
    aborted.release();
  }
  evidence.migrationRecovery = {
    database: target.name,
    ddlRolledBack: true,
    failedHistoryRefused: true,
    supportedResolveUsed: true,
    redeploy: true,
    abortedTransaction: true,
  };
});

it('R6-03 populated synthetic R4 checkpoint upgrades to R5 without rewriting source history', async () => {
  const target = await newCluster('upgrade'),
    root = resolve(evidenceRoot, 'upgrade-' + runId),
    dir = join(root, 'migrations');
  mkdirSync(dir, { recursive: true });
  copyFileSync(
    'prisma/migrations/migration_lock.toml',
    join(dir, 'migration_lock.toml'),
  );
  for (const name of readdirSync('prisma/migrations').filter(
    (n) => /^\d/.test(n) && n.slice(0, 12) <= '202610190018',
  )) {
    mkdirSync(join(dir, name));
    copyFileSync(
      resolve('prisma/migrations', name, 'migration.sql'),
      join(dir, name, 'migration.sql'),
    );
  }
  const config = join(root, 'prisma.config.mjs');
  writeFileSync(
    config,
    `export default {schema:${JSON.stringify(resolve('prisma/schema.prisma'))},migrations:{path:${JSON.stringify(dir)}},datasource:{url:process.env.DATABASE_URL}};`,
  );
  prisma(['migrate', 'deploy', '--config', config], target.url);
  const f = await target.db.begin((tx) => seed(tx as unknown as Query));
  const validReversedPair = await put(
    target.db,
    'verified_sibling_relationships',
    {
      tenant_id: f.tenant,
      student_a_id: f.student2,
      student_b_id: f.student,
      verified_by_membership_id: f.member,
      verified_at: new Date(),
    },
  );
  const before =
    await target.db`SELECT to_jsonb(e) row FROM enrollments e WHERE id=${f.enrollment}`;
  const definitions = (
    db: typeof target.db,
  ) => db`SELECT n.nspname||'.'||p.proname signature,p.prosrc source,
    p.proowner::regrole::text owner,p.proacl::text acl,p.proconfig configuration,p.prosecdef definer
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname LIKE 'educore%' ORDER BY 1`;
  const oldFunctions = await definitions(target.db);
  const historicalTarget = '202610200024_r6_sibling_integrity';
  const historicalManifest = migrationManifest().filter((name) => name <= historicalTarget);
  expect(historicalManifest.at(-1)).toBe(historicalTarget);
  for (const name of historicalManifest.filter((name) => name > '202610190018_r4_members')) {
    mkdirSync(join(dir, name));
    copyFileSync(resolve('prisma/migrations', name, 'migration.sql'), join(dir, name, 'migration.sql'));
  }
  prisma(['migrate', 'deploy', '--config', config], target.url);
  expect(
    await target.db`SELECT to_jsonb(e) row FROM enrollments e WHERE id=${f.enrollment}`,
  ).toEqual(before);
  const upgradedHistory = await target.db`SELECT migration_name,checksum,
    finished_at IS NOT NULL AND rolled_back_at IS NULL healthy FROM _prisma_migrations ORDER BY started_at,id`;
  expect(upgradedHistory.map((row) => row.migration_name)).toEqual(historicalManifest);
  for (const row of upgradedHistory) {
    expect(row.healthy).toBe(true);
    expect(row.checksum).toBe(migrationChecksum(String(row.migration_name)));
  }
  expect(
    (
      await target.db`SELECT id FROM verified_sibling_relationships WHERE id=${validReversedPair}`
    )[0].id,
  ).toBe(validReversedPair);
  const newFunctions = await definitions(target.db),
    changed: string[] = [];
  const notificationSql = readFileSync(
    'prisma/migrations/202610200023_r5_notification_source/migration.sql',
    'utf8',
  );
  const notificationPatch = notificationSql.match(
    /\$source\$([\s\S]*?)\$source\$/,
  )?.[1];
  expect(notificationPatch).toBeTruthy();
  for (const old of oldFunctions) {
    const current = newFunctions.find((fn) => fn.signature === old.signature);
    expect(current, String(old.signature)).toBeDefined();
    for (const key of ['owner', 'acl', 'configuration', 'definer'])
      expect(current![key], old.signature + ':' + key).toEqual(old[key]);
    let expected = String(old.source);
    if (old.signature === 'educore_r4.has_permission') {
      expected = expected
        .replace(
          "r.code='PARENT' AND p IN (",
          "r.code='PARENT' AND p IN ('assignment.read','submission.read','grade.read_published','file.read','file.download',",
        )
        .replace(
          "r.code='STUDENT' AND p IN (",
          "r.code='STUDENT' AND p IN ('assignment.read','submission.read','submission.create','file.read','file.upload','file.download','grade.read_published',",
        )
        .replace(
          "r.code='TEACHER' AND p IN (",
          "r.code='TEACHER' AND p IN ('assignment.read','assignment.create','assignment.update','assignment.publish','submission.read','grade.write','grade.publish','grade.correct','grade.read_published','file.read','file.download',",
        );
    } else if (old.signature === 'educore_r4.seed')
      expected = expected.replace(
        "'grade.write','grade.publish','grade.read_published'",
        "'grade.write','grade.publish','grade.correct','grade.read_published'",
      );
    else if (old.signature === 'educore_r3.published_grade_evidence')
      expected = expected.replace(
        'cl.id=a.class_id',
        'cl.id=COALESCE(a.class_id,ar.class_id)',
      );
    else if (old.signature === 'educore_r4.can_event')
      expected = expected.replace(
        "IF e.event_type='ADMIN_ALERT' THEN",
        notificationPatch!,
      );
    expect(current!.source, String(old.signature)).toBe(expected);
    if (current!.source !== old.source) changed.push(String(old.signature));
  }
  expect(changed.sort()).toEqual([
    'educore_r3.published_grade_evidence',
    'educore_r4.can_event',
    'educore_r4.has_permission',
    'educore_r4.seed',
  ]);
  save('r4-r5-function-preservation', {
    reviewed: oldFunctions.length,
    changed,
    oldFunctions,
    newFunctions,
  });
  evidence.upgrade = {
    database: target.name,
    source: '018 synthetic enrollment/session/draft invoice fixtures',
    target: '024',
    historyPreserved: true,
    limitation:
      'No legacy learning/file rows or production data; not historical adoption sign-off.',
  };
});

it('R6-04 authenticated HTTP cannot borrow another principal, leak pool state or raw-write history', async () => {
  const f = await fresh(),
    other = await fresh(),
    base = '/api/v1/tenants/' + f.tenant;
  await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  await request(app.getHttpServer())
    .post('/api/v1/auth/select-tenant')
    .auth(f.studentActor.token, { type: 'bearer' })
    .send({ tenantId: other.tenant })
    .expect(403);
  await request(app.getHttpServer())
    .get(base + '/students/' + f.student + '/published-grades')
    .auth(other.studentActor.token, { type: 'bearer' })
    .expect(403);
  await request(app.getHttpServer())
    .post(base + '/assignment-recipients/' + randomUUID() + '/submissions')
    .auth(f.studentActor.token, { type: 'bearer' })
    .set('Idempotency-Key', randomUUID())
    .send({ userId: other.user, answerText: 'forgery' })
    .expect(400);
  const denied = repository.api.$executeRawUnsafe(
    'UPDATE public.invoices SET total_vnd=0',
  );
  await expect(denied).rejects.toThrow(/permission denied/);
  await expect(
    repository.api.$executeRawUnsafe(
      'GRANT educore_r4_owner TO educore_r4_api_r6_test',
    ),
  ).rejects.toThrow(/permission denied|admin option/);
  await expect(
    repository.api.$queryRawUnsafe('SELECT educore_r4.me()'),
  ).rejects.toThrow(/PRINCIPAL|AUTH|bound|binding/i);
  for (let n = 0; n < 12; n++) {
    const who = n % 2 ? f.studentActor : other.studentActor;
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .auth(who.token, { type: 'bearer' })
      .expect(200);
    expect(JSON.stringify(me.body)).toContain(who.user);
    expect(JSON.stringify(me.body)).not.toContain(
      n % 2 ? other.studentActor.user : f.studentActor.user,
    );
  }
  await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${f.studentActor.grant}`;
  await request(app.getHttpServer())
    .get(base + '/students/' + f.student + '/published-grades')
    .auth(f.studentActor.token, { type: 'bearer' })
    .expect(403);
});

it('R6-05 malformed refresh cookies receive authentication denial', async () => {
  for (const value of [
    '%ZZ',
    '%E0%A4%A',
    '%',
    'synthetic',
    'one; educore_refresh=two',
  ]) {
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('X-CSRF-Token', 'synthetic')
      .set('Cookie', 'educore_refresh=' + value)
      .expect(401);
  }
});

it('R6-06 coordinated quiescent DB and real private-volume restore with fresh global-role provisioning', async () => {
  const f = await fresh(),
    assignments = new AssignmentService(auth),
    files = new FileService(auth, storage),
    submissions = new SubmissionService(auth, storage);
  const a = (await assignments.command(f.teacherActor.token, f.tenant, {
    operation: 'CREATE',
    classId: f.classId,
    title: 'Restore evidence',
    description: 'Synthetic recovery fixture',
    priority: 3,
    deadlineAt: new Date(Date.now() + 86400000).toISOString(),
    key: randomUUID(),
  })) as { id: string };
  await assignments.command(f.teacherActor.token, f.tenant, {
    operation: 'PUBLISH',
    id: a.id,
    expectedRevision: 1,
    key: randomUUID(),
  });
  const [recipient] =
    await admin`SELECT id FROM assignment_recipients WHERE assignment_id=${a.id}`;
  const upload = await files.upload(
    f.studentActor.token,
    f.tenant,
    recipient.id as string,
    'restore.pdf',
    'application/pdf',
    pdf,
  );
  const submitted = (await submissions.submit(f.studentActor.token, f.tenant, {
    recipientId: recipient.id,
    fileIds: [upload.id],
    key: randomUUID(),
  })) as { versionId: string };
  const grading = new GradingService(auth);
  await grading.grade(f.teacherActor.token, f.tenant, {
    operation: 'SAVE_DRAFT',
    versionId: submitted.versionId,
    score: '8.5',
    key: randomUUID(),
  });
  await grading.grade(f.teacherActor.token, f.tenant, {
    operation: 'PUBLISH_GRADE',
    versionId: submitted.versionId,
    revision: 1,
    key: randomUUID(),
  });
  const [meta] = await admin`SELECT * FROM stored_files WHERE id=${upload.id}`;
  await repository.transaction(f.managerActor.token, (tx) =>
    tx.$queryRawUnsafe(
      'SELECT educore_r2.execute($1::uuid,$2::jsonb)',
      f.tenant,
      JSON.stringify({
        operation: 'TOP_UP',
        studentId: f.student,
        amountVnd: '123456',
        method: 'CASH',
        receiptReference: 'R6-restore-' + runId,
        evidence: 'Synthetic verified receipt',
        reason: 'R6 restore fixture',
        key: randomUUID(),
      }),
    ),
  );
  const source = process.env.R6_CONTAINER!,
    sourceDb = new URL(ownerUrl).pathname.slice(1);
  // This sequential test owns all writers: no worker, no pending operation.
  const tableManifest = async (db: typeof admin) => {
    const tables =
      await db`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
    const rows = [];
    for (const t of tables) {
      if (!/^[a-z_][a-z0-9_]*$/.test(String(t.tablename)))
        throw Error('UNEXPECTED_TABLE_NAME');
      const [summary] = await db.unsafe(
        `SELECT count(*)::int rows,md5(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),'')) checksum FROM public."${t.tablename}" t`,
      );
      rows.push({
        table: t.tablename,
        rows: summary.rows,
        checksum: summary.checksum,
      });
    }
    const functions =
      await db`SELECT n.nspname schema,p.proname name,md5(p.prosrc) hash,p.proowner::regrole::text owner,p.proacl::text acl,
      p.proconfig configuration,p.prosecdef definer FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname LIKE 'educore%' ORDER BY 1,2`;
    const triggers =
      await db`SELECT t.tgname name,t.tgrelid::regclass::text table_name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 2,1`;
    return { rows, functions, triggers };
  };
  const sourceManifest = await tableManifest(admin);
  const recoveryPoint = new Date().toISOString(),
    backupRoot = resolve(evidenceRoot, 'volume-backup-' + runId),
    restoredRoot = resolve(evidenceRoot, 'volume-restored-' + runId);
  await cp(storageRoot, backupRoot, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const started = performance.now();
  const globals = docker([
    'exec',
    source,
    'pg_dumpall',
    '-U',
    'r6_test_admin',
    '--roles-only',
    '--no-role-passwords',
  ]);
  const dump = docker([
    'exec',
    source,
    'pg_dump',
    '-U',
    'r6_test_admin',
    '-d',
    sourceDb,
    '--format=custom',
  ]);
  const restoreContainer = 'educore-r6-restore-' + runId;
  const previous = process.env.POSTGRES_PASSWORD;
  const restorePassword = randomBytes(32).toString('hex');
  process.env.POSTGRES_PASSWORD = restorePassword;
  try {
    docker([
      'run',
      '--detach',
      '--name',
      restoreContainer,
      '--label',
      'educore.r6.restore=' + runId,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD',
      '--env',
      'POSTGRES_USER=r6_test_admin',
      'postgres:16',
    ]);
  } finally {
    if (previous === undefined) delete process.env.POSTGRES_PASSWORD;
    else process.env.POSTGRES_PASSWORD = previous;
  }
  const container = JSON.parse(
    docker(['inspect', '--format', '{{json .}}', restoreContainer]).toString(),
  );
  expect(container.Config.Labels['educore.r6.restore']).toBe(runId);
  expect(container.NetworkSettings.Ports['5432/tcp'][0].HostIp).toBe(
    '127.0.0.1',
  );
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      docker([
        'exec',
        restoreContainer,
        'pg_isready',
        '--host',
        '127.0.0.1',
        '-q',
        '-U',
        'r6_test_admin',
      ]);
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  expect(ready).toBe(true);
  // The matching bootstrap superuser already exists. Preserve every ALTER and
  // membership grant from pg_dumpall, omitting exactly its CREATE statement.
  // A different grantor failed the initial rehearsal under PostgreSQL 16.
  expect(globals.toString().split('CREATE ROLE r6_test_admin;')).toHaveLength(
    2,
  );
  docker(
    [
      'exec',
      '-i',
      restoreContainer,
      'psql',
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'r6_test_admin',
      '-d',
      'postgres',
    ],
    globals
      .toString()
      .replace(
        'CREATE ROLE r6_test_admin;',
        '-- bootstrap administrator already provisioned',
      ),
  );
  const restoredDb = 'educore_r6_restored_' + runId;
  docker([
    'exec',
    restoreContainer,
    'createdb',
    '-U',
    'r6_test_admin',
    restoredDb,
  ]);
  docker(
    [
      'exec',
      '-i',
      restoreContainer,
      'pg_restore',
      '-U',
      'r6_test_admin',
      '--exit-on-error',
      '-d',
      restoredDb,
    ],
    dump,
  );
  await cp(backupRoot, restoredRoot, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });
  const elapsedMs = performance.now() - started;
  // Passwords are separately provisioned in memory, never included in role dump.
  for (const [role, pass] of Object.entries(rolePasswords))
    docker(
      [
        'exec',
        '-i',
        restoreContainer,
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'r6_test_admin',
        '-d',
        'postgres',
      ],
      `ALTER ROLE ${role} PASSWORD '${pass}';`,
    );
  const port = container.NetworkSettings.Ports['5432/tcp'][0].HostPort;
  const u = new URL(ownerUrl);
  u.port = port;
  u.pathname = '/' + restoredDb;
  u.password = restorePassword;
  const restoredOwner = connect(u.toString());
  const restoredManifest = await tableManifest(restoredOwner);
  expect(restoredManifest).toEqual(sourceManifest);
  save('restore-manifest', {
    source: sourceManifest,
    restored: restoredManifest,
  });
  // Source administrator role is intentionally restored passwordless; use local
  // psql for owner verification and the separately provisioned restricted LOGIN.
  u.username = 'educore_r4_api_r6_test';
  u.password = rolePasswords[u.username];
  const { R4Repository } =
    await import('../../src/identity-access/r4-repository.js');
  const authU = new URL(u);
  authU.username = 'educore_r4_auth_r6_test';
  authU.password = rolePasswords[authU.username];
  const workerU = new URL(u);
  workerU.username = 'educore_r4_worker_r6_test';
  workerU.password = rolePasswords[workerU.username];
  const restoredRepo = new R4Repository(
    authU.toString(),
    u.toString(),
    workerU.toString(),
  );
  const restoredStorage = new PrivateVolumeStorageAdapter(restoredRoot);
  await restoredStorage.initialize();
  const { AuthService } =
    await import('../../src/identity-access/auth.service.js');
  const { UnavailableOtpDelivery } =
    await import('../../src/identity-access/otp-delivery.js');
  const restoredAuth = new AuthService(
    restoredRepo,
    new UnavailableOtpDelivery(),
    auth.config,
  );
  const restoredFiles = new FileService(restoredAuth, restoredStorage);
  let builtApiRestored: 'PASS' | 'NOT_RUN' = 'NOT_RUN';
  try {
    await restoredRepo.assertRuntime();
    if (process.env.R6_VERIFY_BUILT_API === '1') {
      const portServer = createServer();
      await new Promise<void>((resolveListen) => portServer.listen(0, '127.0.0.1', resolveListen));
      const address = portServer.address();
      if (!address || typeof address === 'string') throw Error('RESTORE_API_PORT_UNAVAILABLE');
      const apiPort = address.port;
      await new Promise<void>((resolveClose) => portServer.close(() => resolveClose()));
      const built = spawn(process.execPath, ['dist/main.js'], {
        cwd: resolve('.'), windowsHide: true, stdio: 'ignore', env: {
          ...process.env, NODE_ENV: 'development', PORT: String(apiPort),
          R4_AUTH_URL: authU.toString(), R4_API_URL: u.toString(), R4_WORKER_URL: workerU.toString(),
          R4_WORKER_ENABLED: '0', R4_JWT_SECRET: auth.config.jwtSecret,
          R4_OTP_PEPPER: auth.config.otpPepper, R4_JWT_ISSUER: auth.config.issuer,
          R4_JWT_AUDIENCE: auth.config.audience, R4_WEB_ORIGINS: 'http://localhost:5173',
          R4_OTP_MODE: 'unavailable', R5_PRIVATE_STORAGE_ROOT: restoredRoot,
        },
      });
      try {
        let ready = false;
        for (let attempt = 0; attempt < 80; attempt++) {
          if (built.exitCode !== null) throw Error('RESTORED_BUILT_API_EXITED');
          try { ready = (await fetch(`http://127.0.0.1:${apiPort}/`)).status === 200; } catch { /* booting */ }
          if (ready) break;
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
        }
        if (!ready) throw Error('RESTORED_BUILT_API_TIMEOUT');
        const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/tenants/${f.tenant}/portal/overview`, {
          headers: { Authorization: `Bearer ${f.managerActor.token}` },
        });
        expect(response.status).toBe(200);
        const overview = await response.json() as { tenantId?: string; students?: number | null; classes?: number | null };
        expect(overview.tenantId).toBe(f.tenant);
        expect(overview.students).not.toBeNull();
        expect(overview.classes).not.toBeNull();
        builtApiRestored = 'PASS';
      } finally { built.kill(); }
    }
    const wallet = await restoredRepo.transaction(f.managerActor.token, (tx) =>
      tx.$queryRawUnsafe<{ result: unknown }[]>(
        'SELECT educore_r2.summary($1::uuid,$2::uuid) result',
        f.tenant,
        f.student,
      ),
    );
    expect(JSON.stringify(wallet)).toContain('123456');
    const downloaded = await restoredFiles.download(
      f.studentActor.token,
      f.tenant,
      upload.id,
    );
    expect(downloaded.bytes).toEqual(pdf);
    expect(sha(downloaded.bytes)).toBe(meta.sha256);
    const grades = await new GradingService(restoredAuth).published(
      f.studentActor.token,
      f.tenant,
      f.student,
      {},
    );
    expect(JSON.stringify(grades)).toContain('8.5');
    await expect(
      restoredFiles.download(f.teacherActor.token, f.tenant, upload.id),
    ).resolves.toBeDefined();
    const stranger = await actor(f, 'STUDENT', f.student2);
    // Stranger was created after the recovery point; its token is absent after restore.
    await expect(
      restoredFiles.download(stranger.token, f.tenant, upload.id),
    ).rejects.toThrow();
    const snapshot = JSON.parse(
      docker([
        'exec',
        restoreContainer,
        'psql',
        '-X',
        '-t',
        '-A',
        '-U',
        'r6_test_admin',
        '-d',
        restoredDb,
        '-c',
        `SELECT json_build_object('migrations',(SELECT count(*) FROM _prisma_migrations),'invalidConstraints',(SELECT count(*) FROM pg_constraint WHERE NOT convalidated),'submissionLinks',(SELECT count(*) FROM submission_files),'databaseBytes',pg_database_size(current_database()),'sourceTimezone',(SELECT timezone FROM tenants WHERE id='${f.tenant}'))`,
      ]).toString(),
    );
    expect(snapshot.migrations).toBe(migrationManifest().length);
    expect(snapshot.invalidConstraints).toBe(0);
    expect(Number(snapshot.submissionLinks)).toBeGreaterThan(0);
    const counts = await admin`SELECT count(*)::int n FROM stored_files`;
    const rolesText = globals.toString();
    expect(rolesText).not.toContain('SCRAM-SHA-256$');
    // Both directions of snapshot skew and corrupt/missing bytes are detected,
    // without deleting or rewriting any immutable metadata.
    const objectPath = join(restoredRoot, String(meta.private_storage_key));
    await writeFile(objectPath, Buffer.from('%PDF-wrong'));
    await expect(
      restoredFiles.download(f.studentActor.token, f.tenant, upload.id),
    ).rejects.toThrow('FILE_BYTES_UNAVAILABLE');
    const corrupt = await restoredFiles.reconcile(
      f.managerActor.token,
      f.tenant,
    );
    expect(corrupt.anomalyCount).toBeGreaterThan(0);
    expect(corrupt.physicalDeletes).toBe(0);
    await writeFile(objectPath, pdf);
    // Missing-object case uses a separate clone; the successful restore remains intact.
    const missingRoot = resolve(evidenceRoot, 'volume-empty-' + runId);
    await mkdir(missingRoot);
    const missingStorage = new PrivateVolumeStorageAdapter(missingRoot);
    await missingStorage.initialize();
    const missing = await new FileService(
      restoredAuth,
      missingStorage,
    ).reconcile(f.managerActor.token, f.tenant);
    expect(missing.anomalies.some((a) => a.kind === 'MISSING_OBJECT')).toBe(
      true,
    );
    const unknownKey = f.tenant + '/' + randomUUID();
    await restoredStorage.writeStaging(unknownKey, pdf);
    await restoredStorage.promote(unknownKey);
    const excess = await restoredFiles.reconcile(
      f.managerActor.token,
      f.tenant,
    );
    expect(excess.unreferencedObjects).toBeGreaterThan(0);
    expect((await admin`SELECT count(*)::int n FROM stored_files`)[0].n).toBe(
      counts[0].n,
    );
    evidence.restore = {
      builtApiRestored,
      recoveryPoint,
      method:
        'quiescent single-writer fixture; logical dump + copied file tree',
      container: restoreContainer,
      port,
      database: restoredDb,
      elapsedMs,
      dumpBytes: dump.length,
      dumpSha256: sha(dump),
      fileBytes: pdf.length,
      fileSha256: sha(pdf),
      migrationRevision: migrationManifest().at(-1),
      snapshot,
      globalRoles:
        'restored passwordless then restricted passwords separately provisioned',
      authenticatedFileReads: true,
      corruptionDetected: true,
      missingDetected: true,
      excessDetected: true,
      physicalDeletes: 0,
      limitation:
        'Same PostgreSQL image/tzdata; tiny local fixture; production backup schedule, RPO/RTO and live-writer recovery point unverified.',
    };
  } finally {
    await restoredRepo.close();
  }
});

it('R6-08 scheduling conflict timings include teacher, room, student, weekly recurrence and unavailability', async () => {
  const f = await fresh();
  latencyFixture = f;
  const command = (
    domain: 'scheduling' | 'academic',
    body: Record<string, unknown>,
  ) =>
    repository.transaction(f.managerActor.token, async (tx) => {
      const query =
        domain === 'scheduling'
          ? 'SELECT educore_r3.scheduling($1::uuid,$2::jsonb) result'
          : 'SELECT educore_r3.academic($1::uuid,$2::jsonb) result';
      const [row] = await tx.$queryRawUnsafe<
        { result: { id: string; sessionIds?: string[] } }[]
      >(
        query,
        f.tenant,
        JSON.stringify({
          ...body,
          key: randomUUID(),
          reason: 'R6 scheduling fixture',
        }),
      );
      return row.result;
    });
  const room = await command('scheduling', {
    operation: 'ROOM',
    code: 'R6',
    name: 'R6 room',
    capacity: 10,
  });
  const room2 = await command('scheduling', {
    operation: 'ROOM',
    code: 'R62',
    name: 'R6 other room',
    capacity: 10,
  });
  const teacher2 = await put(admin, 'teacher_profiles', {
    tenant_id: f.tenant,
    teacher_code: 'R62',
    full_name: 'R6 teacher',
    status: 'ACTIVE',
  });
  for (const teacher of [teacher2, f.teacher])
    await put(admin, 'class_teacher_assignments', {
      tenant_id: f.tenant,
      class_id: f.class2,
      teacher_id: teacher,
      role_kind: 'PRIMARY',
      valid_from: '2020-01-01',
      assigned_by_membership_id: f.member,
    });
  const series = await command('scheduling', {
    operation: 'CREATE_SERIES',
    classId: f.classId,
    teacherId: f.teacher,
    roomId: room.id,
    deliveryMode: 'ONSITE',
    weekday: 1,
    localStartTime: '09:00',
    durationMinutes: 60,
    validFrom: '2099-01-01',
    validTo: '2099-06-30',
  });
  const before = performance.now();
  await command('scheduling', {
    operation: 'CONFIRM_SERIES',
    seriesId: series.id,
  });
  const recurrenceMs = performance.now() - before;
  const [first] =
    await admin`SELECT starts_at,ends_at FROM class_sessions WHERE series_id=${series.id} ORDER BY starts_at LIMIT 1`;
  const make = (teacherId: string, roomId?: string) =>
    command('scheduling', {
      operation: 'CREATE',
      classId: f.class2,
      teacherId,
      roomId,
      deliveryMode: roomId ? 'ONSITE' : 'ONLINE',
      startsAt: new Date(first.starts_at).toISOString(),
      endsAt: new Date(first.ends_at).toISOString(),
    });
  const teacherOnly = await make(f.teacher),
    roomOnly = await make(teacher2, room.id);
  const timings: Record<string, number[]> = {};
  const measure = async (kind: string, body: Record<string, unknown>) => {
    timings[kind] = [];
    for (let n = 0; n < 10; n++) {
      const start = performance.now();
      await expect(command('scheduling', body)).rejects.toThrow(
        /conflict|overlap|exclusion/i,
      );
      timings[kind].push(performance.now() - start);
    }
  };
  await measure('teacher', { operation: 'CONFIRM', sessionId: teacherOnly.id });
  await measure('room', { operation: 'CONFIRM', sessionId: roomOnly.id });
  await command('academic', {
    operation: 'ENROLL',
    classId: f.class2,
    studentId: f.student,
    effectiveFrom: '2099-01-01',
    placement: {
      basis: 'STAFF_CONFIRMATION',
      subjectId: (
        await admin`SELECT subject_id FROM courses WHERE id=${f.course}`
      )[0].subject_id,
      levelId: (
        await admin`SELECT level_id FROM courses WHERE id=${f.course}`
      )[0].level_id,
      reason: 'R6 suitability confirmed',
    },
  });
  const studentOnly = await make(teacher2, room2.id);
  await measure('student', { operation: 'CONFIRM', sessionId: studentOnly.id });
  const busy = await command('scheduling', {
    operation: 'BUSY_CREATE',
    resourceKind: 'TEACHER',
    resourceId: teacher2,
    startsAt: '2099-08-01T01:00:00Z',
    endsAt: '2099-08-01T02:00:00Z',
  });
  await command('scheduling', {
    operation: 'BUSY_CONFIRM',
    unavailabilityId: busy.id,
  });
  const blocked = await command('scheduling', {
    operation: 'CREATE',
    classId: f.class2,
    teacherId: teacher2,
    deliveryMode: 'ONLINE',
    startsAt: '2099-08-01T01:00:00Z',
    endsAt: '2099-08-01T02:00:00Z',
  });
  await measure('unavailability', {
    operation: 'CONFIRM',
    sessionId: blocked.id,
  });
  const sorted = Object.values(timings)
      .flat()
      .sort((a, b) => a - b),
    count =
      await admin`SELECT count(*)::int n FROM resource_bookings WHERE tenant_id=${f.tenant} AND status='ACTIVE'`;
  evidence.schedulingPerformance = {
    fixture: {
      tenant: f.tenant,
      classes: 2,
      teachers: 2,
      rooms: 2,
      students: 1,
      weeklySessions: series.sessionIds?.length,
      activeBookings: count[0].n,
      weeklyRange: ['2099-01-01', '2099-06-30'],
    },
    authentication:
      'Actual HTTP login/select-tenant token, restricted R4 transaction bound to that token; domain command timing, no public scheduling-write HTTP route',
    requests: sorted.length,
    concurrency: 1,
    recurrenceConfirmMs: recurrenceMs,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    worstMs: sorted.at(-1),
    timings,
    verdict:
      Math.max(recurrenceMs, sorted.at(-1) ?? 0) <= 2000
        ? 'PASS on declared small fixture'
        : 'FAIL on declared small fixture',
    limitation:
      'Not representative production scale, no multi-tenant throughput or sustained contention acceptance.',
  };
  save('scheduling-performance', evidence.schedulingPerformance);
});

it('R6-09 timezone boundaries, DST gap/overlap fail-closed and restored tzdata fingerprint', async () => {
  const [boundaries] = await admin`SELECT
    ('2025-12-31T17:00:00Z'::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text local_year,
    ('2025-09-30T17:00:00Z'::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text local_month,
    ('2025-09-30T16:59:59.999999Z'::timestamptz AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text previous_month`;
  expect(boundaries).toEqual({
    local_year: '2026-01-01',
    local_month: '2025-10-01',
    previous_month: '2025-09-30',
  });
  for (const local of ['2026-03-08 02:30:00', '2026-11-01 01:30:00']) {
    await expect(
      admin`SELECT educore_r3.local_instant(${local}::text::timestamp,'America/New_York')`,
    ).rejects.toMatchObject({ code: '22007' });
  }
  const [dst] =
    await admin`SELECT educore_r3.local_instant('2026-03-09 09:00'::timestamp,'America/New_York')::text valid`;
  expect(dst.valid).toContain('13:00:00');
  const fingerprint = docker([
    'exec',
    process.env.R6_CONTAINER!,
    'sha256sum',
    '/usr/share/zoneinfo/Asia/Ho_Chi_Minh',
    '/usr/share/zoneinfo/America/New_York',
  ]).toString();
  evidence.timezone = {
    boundaries,
    dst,
    fingerprint,
    changedTzdataUpgrade:
      'NOT RUN: only one PostgreSQL image/tzdata version available; same-image restore is not upgrade evidence',
    invoiceDueGap:
      'R2 I04 rerun independently: safe rejection; no new DST policy selected',
  };
});

it('R6-10 verified sibling evidence cannot link a student to itself or duplicate a live unordered pair', async () => {
  const f = await fresh();
  let accepted = false,
    eligible: unknown = false;
  try {
    await put(admin, 'verified_sibling_relationships', {
      tenant_id: f.tenant,
      student_a_id: f.student,
      student_b_id: f.student,
      verified_by_membership_id: f.member,
      verified_at: new Date(),
    });
    accepted = true;
  } catch (error) {
    expect((error as { code?: string }).code).toBe('23514');
  }
  if (accepted) {
    const closedPeriod = await put(admin, 'billing_periods', {
      tenant_id: f.tenant,
      month_start: '2025-09-01',
      month_end: '2025-10-01',
      status: 'OPEN',
    });
    const [source] =
      await admin`SELECT educore_r2.capture(${f.tenant}::uuid,${f.student}::uuid,${closedPeriod}::uuid) result`;
    eligible = source.result.sibling;
  }
  evidence.siblingAdmission = {
    selfAccepted: accepted,
    selfSelectedForDiscount: eligible,
  };
  expect(
    accepted,
    'self relationship must be rejected before any billing capture',
  ).toBe(false);
  for (const commit of [true, false]) {
    const a = connect(ownerUrl),
      b = connect(ownerUrl);
    const apid = Number((await a`SELECT pg_backend_pid() pid`)[0].pid),
      bpid = Number((await b`SELECT pg_backend_pid() pid`)[0].pid);
    let release!: () => void, admitted!: () => void;
    const latch = new Promise<void>((resolve) => {
        release = resolve;
      }),
      firstInserted = new Promise<void>((resolve) => {
        admitted = resolve;
      });
    const rollback = Symbol('test rollback');
    const first = a
      .begin(async (tx) => {
        await put(tx, 'verified_sibling_relationships', {
          tenant_id: f.tenant,
          student_a_id: f.student,
          student_b_id: f.student2,
          verified_by_membership_id: f.member,
          verified_at: new Date(),
        });
        admitted();
        await latch;
        if (!commit) throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
    await firstInserted;
    const second = b
      .begin((tx) =>
        put(tx, 'verified_sibling_relationships', {
          tenant_id: f.tenant,
          student_a_id: f.student2,
          student_b_id: f.student,
          verified_by_membership_id: f.member,
          verified_at: new Date(),
        }),
      )
      .then(
        () => ({ code: null }),
        (error: { code: string }) => ({ code: error.code }),
      );
    try {
      await waitBlocked(admin, bpid, apid);
    } finally {
      release();
    }
    await first;
    expect((await second).code).toBe(commit ? '23505' : null);
    evidence.siblingRaces ??= [] as unknown[];
    (evidence.siblingRaces as unknown[]).push({
      apid,
      bpid,
      observedWait: true,
      firstCommit: commit,
    });
    expect(
      (
        await admin`SELECT count(*)::int n FROM verified_sibling_relationships WHERE tenant_id=${f.tenant} AND revoked_at IS NULL`
      )[0].n,
    ).toBe(1);
    // Regrant may reverse orientation; both historical rows remain intact.
    await admin`UPDATE verified_sibling_relationships SET revoked_at=clock_timestamp() WHERE tenant_id=${f.tenant} AND revoked_at IS NULL`;
  }
  await expect(
    put(admin, 'verified_sibling_relationships', {
      tenant_id: f.tenant,
      student_a_id: f.student2,
      student_b_id: f.student,
      verified_by_membership_id: f.member,
      verified_at: new Date(),
    }),
  ).resolves.toBeDefined();
});

it('R6-11 corrective sibling migration refuses invalid existing evidence without rewriting it', async () => {
  const target = await newCluster('sibling'),
    root = resolve(evidenceRoot, 'sibling-' + runId),
    dir = join(root, 'migrations');
  mkdirSync(dir, { recursive: true });
  copyFileSync(
    'prisma/migrations/migration_lock.toml',
    join(dir, 'migration_lock.toml'),
  );
  for (const name of readdirSync('prisma/migrations').filter(
    (n) => /^\d/.test(n) && n < '202610200024',
  )) {
    mkdirSync(join(dir, name));
    copyFileSync(
      resolve('prisma/migrations', name, 'migration.sql'),
      join(dir, name, 'migration.sql'),
    );
  }
  const config = join(root, 'prisma.config.mjs');
  writeFileSync(
    config,
    `export default {schema:${JSON.stringify(resolve('prisma/schema.prisma'))},migrations:{path:${JSON.stringify(dir)}},datasource:{url:process.env.DATABASE_URL}};`,
  );
  prisma(['migrate', 'deploy', '--config', config], target.url);
  const f = await target.db.begin((tx) => seed(tx as unknown as Query));
  const invalid = await put(target.db, 'verified_sibling_relationships', {
    tenant_id: f.tenant,
    student_a_id: f.student,
    student_b_id: f.student,
    verified_by_membership_id: f.member,
    verified_at: new Date(),
  });
  const before =
    await target.db`SELECT to_jsonb(s) row FROM verified_sibling_relationships s WHERE id=${invalid}`;
  await expect(
    target.db
      .unsafe(
        readFileSync(
          'prisma/migrations/202610200024_r6_sibling_integrity/migration.sql',
          'utf8',
        ),
      )
      .simple(),
  ).rejects.toMatchObject({
    code: '23514',
    message: 'R6_SIBLING_EVIDENCE_ADOPTION_REQUIRED',
  });
  await target.db`ROLLBACK`;
  expect(
    await target.db`SELECT to_jsonb(s) row FROM verified_sibling_relationships s WHERE id=${invalid}`,
  ).toEqual(before);
  expect(
    (
      await target.db`SELECT count(*)::int n FROM pg_constraint WHERE conname='r6_sibling_distinct'`
    )[0].n,
  ).toBe(0);
  expect(
    (
      await target.db`SELECT to_regclass('public.r6_active_sibling_pair') missing`
    )[0].missing,
  ).toBeNull();
  evidence.siblingMigrationPreflight = {
    refusedInvalidData: true,
    preservedEvidence: true,
    ddlRolledBack: true,
    action:
      'Target-specific inventory/disposition required; no automatic repair or mark-applied.',
  };
});

it('R6-12 exact mixed session-date prices, expired SESSION fallback, and zero CANCELLED issued claims', async () => {
  const setup = async (days: string[], cancelled = false) => {
    const f = await fresh(),
      source: { session: string; participant: string }[] = [];
    for (const day of days) {
      const session = await put(admin, 'class_sessions', {
        tenant_id: f.tenant,
        class_id: f.classId,
        teacher_id: f.teacher,
        delivery_mode: 'ONLINE',
        starts_at: day + 'T02:00:00Z',
        ends_at: day + 'T03:00:00Z',
        status: cancelled ? 'CANCELLED' : 'COMPLETED',
        revision: 1,
        policy_version_id: f.policy,
      });
      const participant = await put(admin, 'session_participants', {
        tenant_id: f.tenant,
        session_id: session,
        student_id: f.student,
        enrollment_id: f.enrollment,
        participant_kind: 'REGULAR',
      });
      if (!cancelled) {
        const finalization = await put(admin, 'attendance_finalizations', {
          tenant_id: f.tenant,
          session_id: session,
          confirmed_by_membership_id: f.member,
          confirmed_at: day + 'T04:00:00Z',
          revision: 1,
        });
        await put(admin, 'attendance_records', {
          tenant_id: f.tenant,
          session_id: session,
          participant_id: participant,
          finalization_id: finalization,
          attendance_status: 'ATTENDED',
          recorded_by_membership_id: f.member,
          recorded_at: day + 'T04:00:00Z',
          revision: 1,
        });
      }
      source.push({ session, participant });
    }
    const period = await put(admin, 'billing_periods', {
      tenant_id: f.tenant,
      month_start: '2025-09-01',
      month_end: '2025-10-01',
      status: 'OPEN',
    });
    const price = (
      target: Record<string, unknown>,
      amount: string,
      from: string,
      to?: string,
    ) =>
      put(admin, 'price_rules', {
        tenant_id: f.tenant,
        ...target,
        unit_price_vnd: amount,
        effective_from: from,
        effective_to: to ?? null,
        policy_version_id: f.policy,
        created_by_membership_id: f.member,
        created_at: '2019-01-01',
      });
    const execute = (body: Record<string, unknown>) =>
      repository.transaction(f.managerActor.token, async (tx) => {
        const [row] = await tx.$queryRawUnsafe<
          { result: Record<string, unknown> }[]
        >(
          'SELECT educore_r2.execute($1::uuid,$2::jsonb) result',
          f.tenant,
          JSON.stringify({
            ...body,
            key: randomUUID(),
            reason: 'R6 exact pricing vector',
          }),
        );
        return row.result;
      });
    return {
      f,
      source,
      period,
      price,
      execute,
      generate: () =>
        execute({
          operation: 'GENERATE',
          studentId: f.student,
          periodId: period,
        }),
    };
  };
  // Raw synthetic original facts isolate pricing; they are not proof that a
  // public historical attendance writer exists or a production backfill is safe.
  const mixed = await setup(['2025-09-10', '2025-09-20']);
  await mixed.price(
    { scope_kind: 'COURSE', course_id: mixed.f.course },
    '100000',
    '2020-01-01',
    '2025-09-15',
  );
  await mixed.price(
    { scope_kind: 'COURSE', course_id: mixed.f.course },
    '120000',
    '2025-09-15',
  );
  const g = await mixed.generate();
  expect(g.totalVnd).toBe('220000');
  const lines = (g.source as { lines: { unitPriceVnd: string }[] }).lines;
  expect(lines.map((l) => l.unitPriceVnd).sort()).toEqual(['100000', '120000']);
  const fallback = await setup(['2025-09-20']);
  await fallback.price(
    { scope_kind: 'COURSE', course_id: fallback.f.course },
    '100000',
    '2020-01-01',
  );
  await fallback.price(
    { scope_kind: 'CLASS', class_id: fallback.f.classId },
    '150000',
    '2020-01-01',
  );
  await fallback.price(
    { scope_kind: 'SESSION', session_id: fallback.source[0].session },
    '300000',
    '2025-09-01',
    '2025-09-15',
  );
  const fall = await fallback.generate();
  expect(fall.totalVnd).toBe('150000');
  expect(
    (fall.source as { lines: { priceScope: string }[] }).lines[0].priceScope,
  ).toBe('CLASS');
  const zero = await setup(['2025-09-20'], true);
  await zero.price(
    { scope_kind: 'COURSE', course_id: zero.f.course },
    '0',
    '2020-01-01',
  );
  const zg = await zero.generate();
  expect(zg.totalVnd).toBe('0');
  const invoice = String(zg.invoiceId);
  await zero.execute({ operation: 'ISSUE', invoiceId: invoice });
  const [claim] =
    await admin`SELECT c.participant_id,l.unit_price_vnd::text price,l.charge_units,l.attendance_id FROM invoiced_participation_claims c
    JOIN invoice_lines l ON l.id=c.invoice_line_id WHERE c.tenant_id=${zero.f.tenant}`;
  expect(claim).toMatchObject({
    participant_id: zero.source[0].participant,
    price: '0',
    charge_units: 0,
    attendance_id: null,
  });
  await expect(
    zero.execute({
      operation: 'RECOMPUTE',
      studentId: zero.f.student,
      periodId: zero.period,
      expectedBase: zg.id,
      expectedApplied: zg.id,
    }),
  ).rejects.toThrow(/ISSUED_RECOMPUTE_DENIED/);
  await expect(admin`INSERT INTO invoice_lines(id,tenant_id,invoice_id,student_id,participant_id,session_id,attendance_id,price_rule_id,
    source_status,charge_units,unit_price_vnd,base_amount_vnd,reason_code,source_snapshot_json,updated_at)
    SELECT ${randomUUID()},tenant_id,${zero.f.invoice},student_id,participant_id,session_id,attendance_id,price_rule_id,
    source_status,charge_units,unit_price_vnd,base_amount_vnd,reason_code,source_snapshot_json,clock_timestamp() FROM invoice_lines WHERE invoice_id=${invoice}`).rejects.toMatchObject(
    { code: '23514' },
  );
  expect(
    (
      await admin`SELECT count(*)::int n FROM invoiced_participation_claims WHERE tenant_id=${zero.f.tenant}`
    )[0].n,
  ).toBe(1);
  evidence.exactPricing = {
    mixedTotalVnd: g.totalVnd,
    expiredSessionFallbackVnd: fall.totalVnd,
    zeroCancelledIssued: true,
    permanentClaim: true,
    crossPeriodReuseRejected: true,
    limitation:
      'Synthetic original source facts; actual producer/transport coverage remains a separate H-04 obligation.',
  };
});

it('R6-13 one hundred outbox redeliveries preserve one notification and the committed publication', async () => {
  const f = await fresh(),
    service = new AssignmentService(auth);
  const created = (await service.command(f.teacherActor.token, f.tenant, {
    operation: 'CREATE',
    classId: f.classId,
    title: 'Replay fixture',
    description: 'Synthetic committed source',
    priority: 3,
    deadlineAt: new Date(Date.now() + 86400000).toISOString(),
    key: randomUUID(),
  })) as { id: string };
  await service.command(f.teacherActor.token, f.tenant, {
    operation: 'PUBLISH',
    id: created.id,
    expectedRevision: 1,
    key: randomUUID(),
  });
  const [event] =
    await admin`SELECT id FROM outbox_events WHERE tenant_id=${f.tenant} AND aggregate_id=${created.id}`;
  const drain = async () => {
    for (let n = 0; n < 200; n++) {
      const [r] = await repository.worker!.$queryRawUnsafe<
        { result: unknown }[]
      >('SELECT educore_r4.dispatch_event() result');
      if (!r.result) return;
    }
    throw Error('OUTBOX_DRAIN_LIMIT');
  };
  const [before] =
    await admin`SELECT count(*)::int n FROM wallet_transactions WHERE tenant_id=${f.tenant}`;
  for (let n = 0; n < 100; n++) {
    await admin`UPDATE outbox_events SET status='NEW' WHERE id=${event.id}`;
    await drain();
  }
  expect(
    (
      await admin`SELECT count(*)::int n FROM notifications WHERE tenant_id=${f.tenant} AND outbox_event_id=${event.id}`
    )[0].n,
  ).toBe(1);
  expect(
    (await admin`SELECT status FROM assignments WHERE id=${created.id}`)[0]
      .status,
  ).toBe('PUBLISHED');
  expect(
    (
      await admin`SELECT count(*)::int n FROM wallet_transactions WHERE tenant_id=${f.tenant}`
    )[0].n,
  ).toBe(before.n);
  evidence.outboxReplay = {
    redeliveries: 100,
    notifications: 1,
    publicationPreserved: true,
    fundingEffects: 0,
  };
});

it('R6-07 authenticated warm API latency and scoped scheduling query plans on a declared small fixture', async () => {
  // Reuse this suite's already authenticated, unchanged Student fixture. More
  // than30 setup logins/minute correctly trigger the real login throttle; do
  // not disable/reset it or spoof the request IP for a latency measurement.
  const f = latencyFixture ?? (await fresh()),
    server = app.getHttpServer();
  const path =
    '/api/v1/tenants/' +
    f.tenant +
    '/students/' +
    f.student +
    '/published-grades';
  const first = performance.now();
  await request(server)
    .get(path)
    .auth(f.studentActor.token, { type: 'bearer' })
    .expect(200);
  const coldMs = performance.now() - first;
  for (let n = 0; n < 5; n++)
    await request(server)
      .get(path)
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
  const samples: number[] = [];
  let completed = 0;
  const work = async () => {
    while (completed < 100) {
      completed++;
      const start = performance.now();
      await request(server)
        .get(path)
        .auth(f.studentActor.token, { type: 'bearer' })
        .expect(200);
      samples.push(performance.now() - start);
    }
  };
  await Promise.all(Array.from({ length: 4 }, work));
  samples.sort((a, b) => a - b);
  const percentile = (p: number) => samples[Math.ceil(samples.length * p) - 1];
  const plan = await admin.unsafe(
    `EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM resource_bookings
    WHERE tenant_id=$1 AND status='ACTIVE' AND starts_at<'2099-10-02'::timestamptz AND ends_at>'2099-10-01'::timestamptz`,
    [f.tenant],
  );
  evidence.performance = {
    fixture:
      'One tenant, one student, zero published grades in queried scope; synthetic data from preceding R6 cases remains',
    requests: samples.length,
    concurrency: 4,
    warmup: 5,
    coldMs,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    p99Ms: percentile(0.99),
    worstMs: samples.at(-1),
    cpu: cpus()[0]?.model,
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    samplesMs: samples,
    verdict:
      percentile(0.95) <= 1000
        ? 'PASS for this local fixture only'
        : 'FAIL for this local fixture',
    scheduling:
      'Query-plan inspection only; full conflict/recurrence/room/student fixture measured separately or NOT VERIFIED',
    plan,
  };
  save('performance', evidence.performance);
});
