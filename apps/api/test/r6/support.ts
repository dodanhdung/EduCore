import 'reflect-metadata';
import postgres from 'postgres';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { R4Repository } from '../../src/identity-access/r4-repository.js';
import { AuthService } from '../../src/identity-access/auth.service.js';
import { CaptureOtpDelivery } from '../../src/identity-access/otp-delivery.js';
import { passwordHash } from '../../src/identity-access/crypto.js';
import {
  R4Module,
  configureR4Http,
} from '../../src/identity-access/r4.module.js';
import { PrivateVolumeStorageAdapter } from '../../src/file-management/private-volume.adapter.js';
import { seed, put, type Query } from '../schema-integrity/support.js';

export const evidenceRoot = resolve('coverage/r6');
export const sha = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
export const evidence: Record<string, unknown> = {
  cases: {},
  assessment: 'independent R6 local fixtures',
};
export let admin: postgres.Sql,
  repository: R4Repository,
  app: INestApplication,
  auth: AuthService,
  storage: PrivateVolumeStorageAdapter,
  ownerUrl: string;
export let rolePasswords: Record<string, string>;
export const clients: postgres.Sql[] = [];
export const password = 'R6 synthetic test password 123!';
let hash: string;
export const runId = randomUUID().replaceAll('-', '');
export const storageRoot = resolve(evidenceRoot, 'volume-' + runId);
export const connect = (url: string) => {
  const q = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(q);
  return q;
};
export function docker(args: string[], input?: Buffer | string) {
  return execFileSync(
    'docker',
    ['--context', process.env.R6_DOCKER_CONTEXT!, ...args],
    {
      input,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 90000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}
export function prisma(args: string[], url = ownerUrl) {
  try {
    return execFileSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('prisma/build/index.js'),
        ...args,
      ],
      {
        env: { ...process.env, DATABASE_URL: url },
        stdio: 'pipe',
        timeout: 90000,
      },
    ).toString();
  } catch (error) {
    const e = error as { stdout?: Buffer; stderr?: Buffer };
    throw Error(
      (String(e.stdout ?? '') + String(e.stderr ?? ''))
        .replaceAll(url, '[URL]')
        .replaceAll(new URL(url).password, '[SECRET]'),
    );
  }
}
export function save(name: string, value: unknown) {
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(
    resolve(evidenceRoot, name + '.json'),
    JSON.stringify(value, null, 2),
  );
}
export async function initialize() {
  if (process.env.R6_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER')
    throw Error('DISPOSABLE_REQUIRED');
  const url = new URL(process.env.R6_TEST_URL ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^\/educore_r6_[a-z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error('UNSAFE_TARGET');
  const name = process.env.R6_CONTAINER ?? '';
  const context = process.env.R6_DOCKER_CONTEXT ?? '';
  if (!/^educore-r6-native-[a-f0-9]{32}$/.test(name) || !context)
    throw Error('CONTAINER_ADMISSION_REQUIRED');
  const info = JSON.parse(
    docker(['inspect', '--format', '{{json .}}', name]).toString(),
  );
  const binding = info.NetworkSettings.Ports['5432/tcp'];
  if (
    info.Config.Labels['educore.r6.disposable'] !==
      name.slice('educore-r6-native-'.length) ||
    binding.length !== 1 ||
    binding[0].HostIp !== '127.0.0.1' ||
    binding[0].HostPort !== url.port
  )
    throw Error('CLUSTER_OWNERSHIP_MISMATCH');
  ownerUrl = url.toString();
  admin = connect(ownerUrl);
  const [admission] =
    await admin`SELECT current_database() name, current_setting('server_version_num')::int version,
    (SELECT count(*)::int FROM pg_tables WHERE schemaname='public') tables,
    (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser`;
  if (
    admission.tables ||
    !admission.superuser ||
    admission.version < 160000 ||
    admission.version >= 170000
  )
    throw Error('FRESH_POSTGRES16_REQUIRED');
  prisma(['migrate', 'deploy']);
  rolePasswords = {};
  const login = async (role: string) => {
    const user = role + '_r6_test',
      pass = randomBytes(32).toString('hex');
    await admin.unsafe(
      `CREATE ROLE ${user} LOGIN PASSWORD '${pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${role}`,
    );
    rolePasswords[user] = pass;
    const u = new URL(ownerUrl);
    u.username = user;
    u.password = pass;
    return u.toString();
  };
  repository = new R4Repository(
    await login('educore_r4_auth'),
    await login('educore_r4_api'),
    await login('educore_r4_worker'),
  );
  await repository.assertRuntime();
  hash = await passwordHash(password);
  storage = new PrivateVolumeStorageAdapter(storageRoot);
  await storage.initialize();
  const config = {
    jwtSecret: randomBytes(32).toString('hex'),
    otpPepper: randomBytes(32).toString('hex'),
    issuer: 'educore-r6-test',
    audience: 'educore-web',
    origins: ['http://localhost:5173'],
    production: false,
  };
  const module = await Test.createTestingModule({
    imports: [
      R4Module.register(
        repository,
        config,
        new CaptureOtpDelivery(),
        false,
        storage,
      ),
    ],
  }).compile();
  app = module.createNestApplication();
  configureR4Http(app, config);
  await app.init();
  auth = module.get(AuthService);
  evidence.environment = {
    ...admission,
    container: name,
    image: info.Image,
    host: '127.0.0.1',
    port: url.port,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    storageRoot,
  };
  save('environment', evidence.environment);
}
export async function finish() {
  await app?.close();
  await repository?.close();
  await Promise.all(clients.map((q) => q.end({ timeout: 2 })));
  save('verification', evidence);
}
/** R1b deliberately refuses cluster roles from another database. Migration
 * rehearsals therefore need an entirely fresh cluster, not just another DB. */
export async function newCluster(suffix: string) {
  if (!/^[a-z]+$/.test(suffix)) throw Error('INVALID_TEST_CLUSTER');
  const name = 'educore-r6-' + suffix + '-' + runId;
  const database = 'educore_r6_' + suffix + '_' + runId;
  const pass = randomBytes(32).toString('hex'),
    previous = process.env.POSTGRES_PASSWORD;
  process.env.POSTGRES_PASSWORD = pass;
  try {
    docker([
      'run',
      '--detach',
      '--name',
      name,
      '--label',
      'educore.r6.auxiliary=' + runId,
      '--publish',
      '127.0.0.1::5432',
      '--env',
      'POSTGRES_PASSWORD',
      '--env',
      'POSTGRES_USER=r6_test_admin',
      '--env',
      'POSTGRES_DB=' + database,
      'postgres:16',
    ]);
  } finally {
    if (previous === undefined) delete process.env.POSTGRES_PASSWORD;
    else process.env.POSTGRES_PASSWORD = previous;
  }
  const info = JSON.parse(
    docker(['inspect', '--format', '{{json .}}', name]).toString(),
  );
  const binding = info.NetworkSettings.Ports['5432/tcp'];
  if (
    info.Config.Labels['educore.r6.auxiliary'] !== runId ||
    binding.length !== 1 ||
    binding[0].HostIp !== '127.0.0.1'
  )
    throw Error('AUXILIARY_CLUSTER_MISMATCH');
  let ready = false;
  for (let n = 0; n < 60; n++) {
    try {
      docker([
        'exec',
        name,
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
  if (!ready) throw Error('AUXILIARY_NOT_READY');
  const url = new URL(ownerUrl);
  url.pathname = '/' + database;
  url.port = binding[0].HostPort;
  url.password = pass;
  const db = connect(url.toString());
  const [admission] =
    await db`SELECT current_setting('server_version_num')::int version,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') tables`;
  if (
    admission.tables ||
    admission.version < 160000 ||
    admission.version >= 170000
  )
    throw Error('AUXILIARY_NOT_FRESH_POSTGRES16');
  return { name: database, container: name, url: url.toString(), db };
}
export type Fixture = Awaited<ReturnType<typeof seed>>;
export async function actor(f: Fixture, role: string, student?: string) {
  const email = randomUUID() + '@r6.invalid';
  const user = await put(admin, 'users', {
    email_normalized: email,
    display_name: 'Synthetic R6 actor',
    status: 'ACTIVE',
  });
  const member = await put(admin, 'tenant_memberships', {
    tenant_id: f.tenant,
    user_id: user,
    status: 'ACTIVE',
  });
  const [r] =
    await admin`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code=${role}`;
  const grant = await put(admin, 'membership_roles', {
    tenant_id: f.tenant,
    membership_id: member,
    role_id: r.id,
    assigned_by_membership_id: f.member,
  });
  await put(admin, 'access_scopes', {
    tenant_id: f.tenant,
    membership_role_id: grant,
    scope_kind: student ? 'STUDENT' : 'TENANT',
    student_id: student ?? null,
  });
  await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES(${user},${hash},clock_timestamp())`;
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email, password })
    .expect(200);
  const selected = await request(app.getHttpServer())
    .post('/api/v1/auth/select-tenant')
    .auth(response.body.accessToken, { type: 'bearer' })
    .send({ tenantId: f.tenant })
    .expect(200);
  return {
    user,
    member,
    grant,
    email,
    token: selected.body.accessToken as string,
  };
}
export async function fresh() {
  const f = await admin.begin(async (tx) => {
    const f = await seed(tx as unknown as Query, {
      enrollmentFrom: '2020-01-01T00:00:00Z',
    });
    await tx`SELECT educore_r4.seed(${f.tenant}::uuid)`;
    return f;
  });
  const teacher = await actor(f, 'TEACHER'),
    student = await actor(f, 'STUDENT', f.student),
    manager = await actor(f, 'MANAGER');
  await admin`UPDATE teacher_profiles SET membership_id=${teacher.member} WHERE id=${f.teacher}`;
  await admin`UPDATE student_profiles SET membership_id=${student.member} WHERE id=${f.student}`;
  await put(admin, 'class_teacher_assignments', {
    tenant_id: f.tenant,
    class_id: f.classId,
    teacher_id: f.teacher,
    role_kind: 'PRIMARY',
    valid_from: '2020-01-01T00:00:00Z',
    assigned_by_membership_id: f.member,
  });
  return {
    ...f,
    teacherActor: teacher,
    studentActor: student,
    managerActor: manager,
  };
}
export const migrationChecksum = (name: string) =>
  sha(readFileSync(resolve('prisma/migrations', name, 'migration.sql')));
