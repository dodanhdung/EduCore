import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdtemp, writeFile, unlink } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
import { AssignmentService } from '../../src/assignments-grading/assignment.service.js';
import { SubmissionService } from '../../src/assignments-grading/submission.service.js';
import { GradingService } from '../../src/assignments-grading/grading.service.js';
import { FileService } from '../../src/file-management/file.service.js';
import { PrivateVolumeStorageAdapter } from '../../src/file-management/private-volume.adapter.js';
import { pdf, png } from './file-fixtures.js';
import {
  seed,
  put,
  type Query,
  waitBlocked,
} from '../schema-integrity/support.js';

let admin: postgres.Sql,
  repository: R4Repository,
  app: INestApplication,
  auth: AuthService,
  assignments: AssignmentService;
let hash: string,
  apiUrl: string,
  ownerUrl: string,
  submissions: SubmissionService,
  grading: GradingService,
  files: FileService,
  storage: PrivateVolumeStorageAdapter,
  storageRoot: string;
const evidence: {
  cases: Record<string, string>;
  races: unknown[];
  [k: string]: unknown;
} = { cases: {}, races: [] };
afterEach((context) =>
  context.onTestFinished(() => {
    evidence.cases[context.task.name] =
      context.task.result?.state === 'pass' ? 'PASS' : 'FAIL';
  }),
);
const password = 'R5 test password 123!';
type Fixture = Awaited<ReturnType<typeof seed>>;
const clients: postgres.Sql[] = [];
const connect = (url: string) => {
  const c = postgres(url, {
    max: 1,
    prepare: false,
    onnotice: () => undefined,
  });
  clients.push(c);
  return c;
};
beforeAll(async () => {
  if (process.env.R5_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER')
    throw Error('DISPOSABLE_REQUIRED');
  const url = new URL(process.env.R5_TEST_URL ?? '');
  if (
    url.hostname !== '127.0.0.1' ||
    !/^\/educore_r5_[a-z0-9_]+$/.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw Error('UNSAFE_TARGET');
  admin = connect(url.toString());
  ownerUrl = url.toString();
  const [info] =
    await admin`SELECT current_setting('server_version_num')::int version,(SELECT count(*)::int FROM pg_tables WHERE schemaname='public') tables`;
  expect(info.version).toBeGreaterThanOrEqual(160000);
  expect(info.version).toBeLessThan(170000);
  expect(info.tables).toBe(0);
  try {
    execFileSync(
      process.execPath,
      [
        createRequire(import.meta.url).resolve('prisma/build/index.js'),
        'migrate',
        'deploy',
      ],
      {
        cwd: resolve('.'),
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
        timeout: 90000,
      },
    );
  } catch (e) {
    const x = e as { stdout?: Buffer; stderr?: Buffer };
    throw Error(
      (String(x.stdout ?? '') + String(x.stderr ?? ''))
        .replaceAll(url.toString(), '[URL]')
        .replaceAll(url.password, '[SECRET]'),
    );
  }
  const connection = async (role: string) => {
    const name = role + '_r5_test',
      pass = randomBytes(32).toString('hex');
    await admin.unsafe(
      `CREATE ROLE ${name} LOGIN PASSWORD '${pass}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS IN ROLE ${role}`,
    );
    const u = new URL(url);
    u.username = name;
    u.password = pass;
    return u.toString();
  };
  apiUrl = await connection('educore_r4_api');
  repository = new R4Repository(
    await connection('educore_r4_auth'),
    apiUrl,
    await connection('educore_r4_worker'),
  );
  await repository.assertRuntime();
  hash = await passwordHash(password);
  const config = {
    jwtSecret: randomBytes(32).toString('hex'),
    otpPepper: randomBytes(32).toString('hex'),
    issuer: 'educore-r5-test',
    audience: 'educore-web',
    origins: ['http://localhost:5173'],
    production: false,
  };
  storageRoot = await mkdtemp(join(tmpdir(), 'educore-r5-native-volume-'));
  storage = new PrivateVolumeStorageAdapter(storageRoot);
  await storage.initialize();
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
  assignments = module.get(AssignmentService);
  submissions = module.get(SubmissionService);
  grading = module.get(GradingService);
  files = module.get(FileService);
  const migrations =
    await admin`SELECT migration_name,checksum FROM _prisma_migrations ORDER BY migration_name`;
  for (const row of migrations)
    expect(row.checksum).toBe(
      createHash('sha256')
        .update(
          readFileSync(
            resolve(
              'prisma/migrations',
              String(row.migration_name),
              'migration.sql',
            ),
          ),
        )
        .digest('hex'),
    );
  evidence.database = url.pathname.slice(1);
  evidence.version = info.version;
  evidence.migrations = migrations;
  evidence.volume = storageRoot;
});
describe('Checkpoint D', () => {
  it('D01 real multipart upload, submission and private authorized download', async () => {
    const f = await published(),
      base = '/api/v1/tenants/' + f.tenant;
    const upload = await request(app.getHttpServer())
      .post(base + '/files')
      .auth(f.studentActor.token, { type: 'bearer' })
      .field('recipientId', f.recipient)
      .attach('file', pdf, {
        filename: 'answer.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(upload.body.status).toBe('READY');
    expect(JSON.stringify(upload.body)).not.toContain('private_storage_key');
    await request(app.getHttpServer())
      .get(base + '/files/' + upload.body.id + '/download')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post(base + '/assignment-recipients/' + f.recipient + '/submissions')
      .auth(f.studentActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ fileIds: [upload.body.id] })
      .expect(201);
    const download = await request(app.getHttpServer())
      .get(base + '/files/' + upload.body.id + '/download')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
    expect(download.body).toEqual(pdf);
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(download.headers['content-disposition']).toContain('attachment');
    expect(download.headers['cache-control']).toContain('no-store');
    await request(app.getHttpServer())
      .get(base + '/files/' + upload.body.id + '/download')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .expect(200);
    const wrong = await actor(f, 'STUDENT', f.student2);
    await admin`UPDATE student_profiles SET membership_id=${wrong.member} WHERE id=${f.student2}`;
    await request(app.getHttpServer())
      .get(base + '/files/' + upload.body.id + '/download')
      .auth(wrong.token, { type: 'bearer' })
      .expect(403);
  });
  it('D02 duplicate/file-count/staging rejection and immutable submitted attachments', async () => {
    const f = await published(),
      ids: string[] = [];
    for (let n = 0; n < 6; n++) {
      const file = await files.upload(
        f.studentActor.token,
        f.tenant,
        f.recipient,
        'same.pdf',
        'application/pdf',
        pdf,
      );
      ids.push(file.id);
    }
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        fileIds: ids,
        key: randomUUID(),
      }),
    ).rejects.toThrow(/FILE_COUNT/);
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        fileIds: [ids[0], ids[0]],
        key: randomUUID(),
      }),
    ).rejects.toThrow();
    const v = (await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: f.recipient,
      fileIds: ids.slice(0, 5),
      key: randomUUID(),
    })) as { versionId: string };
    await expect(
      admin`INSERT INTO submission_files(id,tenant_id,submission_version_id,file_id,sort_order) VALUES(${randomUUID()},${f.tenant},${v.versionId},${ids[5]},5)`,
    ).rejects.toThrow(/SEALED|slot/);
    await expect(
      admin`DELETE FROM submission_files WHERE tenant_id=${f.tenant} AND submission_version_id=${v.versionId}`,
    ).rejects.toThrow(/IMMUTABLE/);
  });
  it('D03 crash after promote leaves STAGING, scan is non-destructive; missing/corrupt bytes block submit', async () => {
    const f = await published();
    const faulty = new FileService(auth, {
      writeStaging: (k, b) => storage.writeStaging(k, b),
      promote: async (k) => {
        await storage.promote(k);
        throw Error('Simulated crash after promotion');
      },
      read: (k) => storage.read(k),
      inventory: () => storage.inventory(),
    });
    await expect(
      faulty.upload(
        f.studentActor.token,
        f.tenant,
        f.recipient,
        'crash.pdf',
        'application/pdf',
        pdf,
      ),
    ).rejects.toThrow(/NOT_FINALIZED/);
    const [staged] =
      await admin`SELECT * FROM stored_files WHERE tenant_id=${f.tenant}`;
    expect(staged.storage_status).toBe('STAGING');
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        fileIds: [staged.id],
        key: randomUUID(),
      }),
    ).rejects.toThrow(/NOT_READY/);
    const manager = await actor(f, 'MANAGER');
    // Manager is explicitly tenant-scoped for reconciliation, not just class-scoped.
    await admin`UPDATE access_scopes SET scope_kind='TENANT',class_id=NULL WHERE membership_role_id=${manager.grant}`;
    const scan = await files.reconcile(manager.token, f.tenant);
    expect(scan.physicalDeletes).toBe(0);
    expect(scan.anomalies[0].kind).toBe('PROMOTED_NOT_FINALIZED');
    expect(await storage.read(staged.private_storage_key as string)).toEqual(
      pdf,
    );
    const ready = await files.upload(
      f.studentActor.token,
      f.tenant,
      f.recipient,
      'missing.pdf',
      'application/pdf',
      pdf,
    );
    const [row] =
      await admin`SELECT private_storage_key FROM stored_files WHERE id=${ready.id}`;
    const path = join(
      storageRoot,
      ...String(row.private_storage_key).split('/'),
    );
    await writeFile(path, png);
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        fileIds: [ready.id],
        key: randomUUID(),
      }),
    ).rejects.toThrow(/UNAVAILABLE/);
    await unlink(path);
    const missing = await files.reconcile(manager.token, f.tenant);
    expect(missing.anomalies.some((a) => a.kind === 'MISSING_OBJECT')).toBe(
      true,
    );
    expect(
      (
        await admin`SELECT count(*)::int n FROM submissions WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(0);
  });
});
describe('Checkpoint B', () => {
  it('B01 real HTTP submission/replay/resubmission preserves immutable versions', async () => {
    const f = await published(),
      path =
        '/api/v1/tenants/' +
        f.tenant +
        '/assignment-recipients/' +
        f.recipient +
        '/submissions',
      key = randomUUID();
    const first = await request(app.getHttpServer())
      .post(path)
      .auth(f.studentActor.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({ answerText: 'First answer' })
      .expect(201);
    await request(app.getHttpServer())
      .post(path)
      .auth(f.studentActor.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({ answerText: 'First answer' })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(path)
      .auth(f.studentActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ answerText: 'Second answer' })
      .expect(201);
    expect(first.body.versionNo).toBe(1);
    expect(second.body.versionNo).toBe(2);
    const history = await request(app.getHttpServer())
      .get(path)
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
    expect(
      history.body.versions.map((v: { answer_text: string }) => v.answer_text),
    ).toEqual(['First answer', 'Second answer']);
    await expect(
      admin`UPDATE submission_versions SET answer_text='overwrite' WHERE id=${first.body.versionId}`,
    ).rejects.toThrow(/IMMUTABLE/);
    await expect(
      admin`DELETE FROM submission_versions WHERE id=${first.body.versionId}`,
    ).rejects.toThrow(/IMMUTABLE/);
    await expect(
      admin.begin(async (tx) => {
        await tx`UPDATE submissions SET current_version_id=${first.body.versionId} WHERE id=${first.body.submissionId}`;
        await tx`SET CONSTRAINTS ALL IMMEDIATE`;
      }),
    ).rejects.toThrow(/NOT_LATEST/);
  });
  it('B02 inclusive exact timestamp cutoff, late flag, extension audit and sealed requirements', async () => {
    const [bounds] =
      await admin`SELECT educore_r5.is_late('2026-01-01Z','2026-01-01Z') at_deadline,educore_r5.is_late('2026-01-01 00:00:00.000001Z','2026-01-01Z') after_deadline,educore_r5.is_late('2026-01-08Z','2026-01-01Z') at_cutoff`;
    expect(bounds).toEqual({
      at_deadline: false,
      after_deadline: true,
      at_cutoff: true,
    });
    await expect(
      admin`SELECT educore_r5.is_late('2026-01-08 00:00:00.000001Z','2026-01-01Z')`,
    ).rejects.toThrow(/CLOSED/);
    const f = await published();
    await assignments.command(f.teacherActor.token, f.tenant, {
      id: f.assignment,
      expectedRevision: 2,
      operation: 'EDIT',
      key: randomUUID(),
      deadlineAt: new Date(Date.now() - 86400000).toISOString(),
    });
    const v = (await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: f.recipient,
      answerText: 'Late answer',
      key: randomUUID(),
    })) as { isLate: boolean };
    expect(v.isLate).toBe(true);
    await expect(
      assignments.command(f.teacherActor.token, f.tenant, {
        id: f.assignment,
        expectedRevision: 3,
        operation: 'EDIT',
        key: randomUUID(),
        description: 'Changed requirements',
      }),
    ).rejects.toThrow(/LOCKED/);
    await expect(
      assignments.command(f.teacherActor.token, f.tenant, {
        id: f.assignment,
        expectedRevision: 3,
        operation: 'EDIT',
        key: randomUUID(),
        deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toThrow(/REASON/);
    await assignments.command(f.teacherActor.token, f.tenant, {
      id: f.assignment,
      expectedRevision: 3,
      operation: 'EDIT',
      key: randomUUID(),
      deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      reason: 'Approved extension',
    });
    const next = (await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: f.recipient,
      answerText: 'After extension',
      key: randomUUID(),
    })) as { isLate: boolean };
    expect(next.isLate).toBe(false);
  });
  it('B03 concurrent first submissions have one container and ordered versions', async () => {
    const f = await published();
    await Promise.all(
      [1, 2].map((n) =>
        submissions.submit(f.studentActor.token, f.tenant, {
          recipientId: f.recipient,
          answerText: 'Answer ' + n,
          key: randomUUID(),
        }),
      ),
    );
    expect(
      (
        await admin`SELECT count(*)::int n FROM submissions WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(1);
    expect(
      (
        await admin`SELECT version_no FROM submission_versions WHERE tenant_id=${f.tenant} ORDER BY version_no`
      ).map((v) => v.version_no),
    ).toEqual([1, 2]);
  });
  it('B04 foreign student, Parent submission and over-cutoff writes fail', async () => {
    const f = await published(),
      wrong = await actor(f, 'STUDENT', f.student2),
      parent = await actor(f, 'PARENT', f.student);
    await admin`UPDATE student_profiles SET membership_id=${wrong.member} WHERE id=${f.student2}`;
    for (const token of [wrong.token, parent.token])
      await expect(
        submissions.submit(token, f.tenant, {
          recipientId: f.recipient,
          answerText: 'Forged',
          key: randomUUID(),
        }),
      ).rejects.toThrow(/DENIED/);
    await assignments.command(f.teacherActor.token, f.tenant, {
      id: f.assignment,
      expectedRevision: 2,
      operation: 'EDIT',
      key: randomUUID(),
      deadlineAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    });
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        answerText: 'Too late',
        key: randomUUID(),
      }),
    ).rejects.toThrow(/CLOSED/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM submissions WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(0);
  });
});
async function submitted() {
  const f = await published();
  const v = (await submissions.submit(f.studentActor.token, f.tenant, {
    recipientId: f.recipient,
    answerText: 'Answer',
    key: randomUUID(),
  })) as { versionId: string; submissionId: string };
  return { ...f, ...v };
}
describe('Checkpoint C', () => {
  it('C01 draft locks resubmit, cancellation reopens, published correction preserves evidence', async () => {
    const f = await submitted(),
      token = f.teacherActor.token;
    const _draft = (await grading.grade(token, f.tenant, {
      operation: 'SAVE_DRAFT',
      versionId: f.versionId,
      score: '8.5',
      feedback: 'Private draft',
      key: randomUUID(),
    })) as { id: string };
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        answerText: 'After grading',
        key: randomUUID(),
      }),
    ).rejects.toThrow(/RESUBMISSION/);
    const hidden = (await grading.published(
      f.studentActor.token,
      f.tenant,
      f.student,
      {},
    )) as { items: unknown[] };
    expect(hidden.items).toHaveLength(0);
    await expect(
      grading.draft(f.studentActor.token, f.tenant, f.versionId),
    ).rejects.toThrow(/DENIED/);
    await grading.grade(token, f.tenant, {
      operation: 'CANCEL_DRAFT',
      versionId: f.versionId,
      revision: 1,
      key: randomUUID(),
      reason: 'Reopen submission',
    });
    const v2 = (await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: f.recipient,
      answerText: 'Improved',
      key: randomUUID(),
    })) as { versionId: string };
    await expect(
      grading.grade(token, f.tenant, {
        operation: 'SAVE_DRAFT',
        versionId: f.versionId,
        score: '9',
        expectedRevision: 1,
        key: randomUUID(),
      }),
    ).rejects.toThrow(/NOT_CURRENT/);
    const grade = (await grading.grade(token, f.tenant, {
      operation: 'SAVE_DRAFT',
      versionId: v2.versionId,
      score: '9',
      key: randomUUID(),
    })) as { id: string };
    await grading.grade(token, f.tenant, {
      operation: 'PUBLISH_GRADE',
      versionId: v2.versionId,
      revision: 1,
      key: randomUUID(),
    });
    const before = (
      await admin`SELECT to_jsonb(g) data FROM grades g WHERE id=${grade.id}`
    )[0].data;
    await grading.grade(token, f.tenant, {
      operation: 'CORRECT',
      gradeId: grade.id,
      score: '7.5',
      reason: 'Correct transcription',
      expectedRevision: 1,
      key: randomUUID(),
    });
    const visible = (await grading.published(
      f.studentActor.token,
      f.tenant,
      f.student,
      {},
    )) as { items: { score: string }[] };
    expect(visible.items[0].score).toBe('9');
    await grading.grade(token, f.tenant, {
      operation: 'PUBLISH_GRADE',
      versionId: v2.versionId,
      revision: 2,
      key: randomUUID(),
    });
    expect(
      (
        (await grading.published(
          f.studentActor.token,
          f.tenant,
          f.student,
          {},
        )) as { items: { score: string }[] }
      ).items[0].score,
    ).toBe('7.5');
    expect(
      (
        await admin`SELECT to_jsonb(g) data FROM grades g WHERE id=${grade.id}`
      )[0].data,
    ).toEqual(before);
    await expect(
      admin`UPDATE grades SET score=1 WHERE id=${grade.id}`,
    ).rejects.toThrow(/IMMUTABLE/);
    await expect(
      admin`DELETE FROM grades WHERE id=${grade.id}`,
    ).rejects.toThrow(/IMMUTABLE/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM audit_logs WHERE tenant_id=${f.tenant} AND after_json::text LIKE '%Private draft%'`
      )[0].n,
    ).toBe(0);
  });
  it('C02 score precision rejected before casting and draft isolation through real HTTP', async () => {
    const f = await submitted(),
      path =
        '/api/v1/tenants/' +
        f.tenant +
        '/submission-versions/' +
        f.versionId +
        '/grade-draft';
    for (const value of ['8.55', '10.1', '-0.1', 'NaN', 8.5])
      await request(app.getHttpServer())
        .put(path)
        .auth(f.teacherActor.token, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ score: value })
        .expect(400);
    await request(app.getHttpServer())
      .put(path)
      .auth(f.teacherActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ score: '10.0', feedback: 'Private' })
      .expect(200);
    await request(app.getHttpServer())
      .get(path)
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(403);
    await expect(
      admin`INSERT INTO grades(id,tenant_id,submission_version_id,revision_no,score,graded_by_teacher_id,graded_at,status,updated_at) VALUES(${randomUUID()},${f.tenant},${f.versionId},2,8.55,${f.teacher},clock_timestamp(),'DRAFT',clock_timestamp())`,
    ).rejects.toThrow();
  });
  it('C03 verified Parent only sees published grades; revoked link stops access', async () => {
    const f = await submitted(),
      parent = await actor(f, 'PARENT', f.student),
      base = '/api/v1/tenants/' + f.tenant;
    const link = await put(admin, 'parent_student_links', {
      tenant_id: f.tenant,
      parent_membership_id: parent.member,
      student_id: f.student,
      relationship: 'PARENT',
      verified_at: new Date(),
      verified_by_membership_id: f.member,
      evidence_reference: 'Test verified',
    });
    await grading.grade(f.teacherActor.token, f.tenant, {
      operation: 'SAVE_DRAFT',
      versionId: f.versionId,
      score: '8',
      key: randomUUID(),
    });
    const draftView = await request(app.getHttpServer())
      .get(base + '/students/' + f.student + '/published-grades')
      .auth(parent.token, { type: 'bearer' })
      .expect(200);
    expect(draftView.body.items).toEqual([]);
    await request(app.getHttpServer())
      .get(base + '/submission-versions/' + f.versionId + '/grade-draft')
      .auth(parent.token, { type: 'bearer' })
      .expect(403);
    await grading.grade(f.teacherActor.token, f.tenant, {
      operation: 'PUBLISH_GRADE',
      versionId: f.versionId,
      revision: 1,
      key: randomUUID(),
    });
    const visible = await request(app.getHttpServer())
      .get(base + '/students/' + f.student + '/published-grades')
      .auth(parent.token, { type: 'bearer' })
      .expect(200);
    expect(visible.body.items).toHaveLength(1);
    await admin`UPDATE parent_student_links SET revoked_at=clock_timestamp() WHERE id=${link}`;
    await request(app.getHttpServer())
      .get(base + '/students/' + f.student + '/published-grades')
      .auth(parent.token, { type: 'bearer' })
      .expect(403);
  });
  it('C04 competing draft/revisions use CAS; teacher revocation is current', async () => {
    const f = await submitted(),
      token = f.teacherActor.token;
    const result = await Promise.allSettled(
      [1, 2].map(() =>
        grading.grade(token, f.tenant, {
          operation: 'SAVE_DRAFT',
          versionId: f.versionId,
          score: '8',
          key: randomUUID(),
        }),
      ),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await admin`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${f.teacherActor.grant}`;
    await expect(
      grading.grade(token, f.tenant, {
        operation: 'PUBLISH_GRADE',
        versionId: f.versionId,
        revision: 1,
        key: randomUUID(),
      }),
    ).rejects.toThrow(/DENIED/);
  });
});
async function dispatchAll() {
  for (let n = 0; n < 200; n++) {
    const rows = await repository.worker!.$queryRawUnsafe<
      { result: unknown }[]
    >('SELECT educore_r4.dispatch_event() result');
    if (!rows[0].result) return;
  }
  throw Error('OUTBOX_DRAIN_LIMIT');
}
describe('Checkpoint E integration', () => {
  it('E03 HTTP file limits and private function ACLs enforce the final security contract', async () => {
    const f = await submitted(),
      base = '/api/v1/tenants/' + f.tenant;
    await request(app.getHttpServer())
      .post(base + '/assignment-recipients/' + f.recipient + '/submissions')
      .auth(f.studentActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ fileIds: Array.from({ length: 6 }, () => randomUUID()) })
      .expect(422);
    await request(app.getHttpServer())
      .post(base + '/files')
      .auth(f.studentActor.token, { type: 'bearer' })
      .field('recipientId', f.recipient)
      .attach('file', png, {
        filename: 'fake.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);
    await request(app.getHttpServer())
      .post(base + '/files')
      .auth(f.studentActor.token, { type: 'bearer' })
      .field('recipientId', f.recipient)
      .attach('file', Buffer.alloc(10_000_001), {
        filename: 'large.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);
    await expect(
      admin`INSERT INTO grades(id,tenant_id,submission_version_id,revision_no,score,graded_by_teacher_id,graded_at,status,updated_at) VALUES(${randomUUID()},${f.tenant},${f.versionId},1,8.55,${f.teacher},clock_timestamp(),'DRAFT',clock_timestamp())`,
    ).rejects.toThrow(/r5_score/);
    const functions =
      await admin`SELECT p.proname,p.prosecdef,p.proconfig,NOT EXISTS(SELECT FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') private FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='educore_r5'`;
    expect(functions.length).toBeGreaterThan(0);
    for (const f of functions) {
      expect(f.private).toBe(true);
      expect(
        (f.proconfig as string[]).some((c) =>
          c.startsWith('search_path=pg_catalog'),
        ),
      ).toBe(true);
      if (f.proname !== 'is_late') expect(f.prosecdef).toBe(true);
    }
    expect(
      (
        await admin`SELECT count(*)::int n FROM stored_files WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(0);
  });
  it('E01 real HTTP end-to-end publication/upload/submit/grade/Parent/placement and outbox replay', async () => {
    const f = await fresh(true),
      base = '/api/v1/tenants/' + f.tenant,
      { key, operation: _operation, ...body } = createBody(f);
    const classes = await request(app.getHttpServer())
      .get(base + '/teaching/assignment-classes')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .expect(200);
    expect(classes.body.classes.some((c: { id: string }) => c.id === f.classId)).toBe(true);
    const a = await request(app.getHttpServer())
      .post(base + '/assignments')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post(base + '/assignments/' + a.body.id + '/publish')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .set('If-Match', '1')
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
    const teacherList = await request(app.getHttpServer())
      .get(base + '/teaching/assignments')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .expect(200);
    expect(teacherList.body.some((item: { id: string }) => item.id === a.body.id)).toBe(true);
    const studentList = await request(app.getHttpServer())
      .get(base + '/my/assignments')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
    expect(studentList.body.items.find((item: { id: string }) => item.id === a.body.id)?.recipientId).toBeTruthy();
    const teacherRecipients = await request(app.getHttpServer())
      .get(base + '/teaching/assignments/' + a.body.id + '/recipients')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .expect(200);
    expect(teacherRecipients.body[0].studentName).toBeTruthy();
    const [ar] =
      await admin`SELECT id FROM assignment_recipients WHERE assignment_id=${a.body.id}`;
    const upload = await request(app.getHttpServer())
      .post(base + '/files')
      .auth(f.studentActor.token, { type: 'bearer' })
      .field('recipientId', ar.id as string)
      .attach('file', pdf, {
        filename: 'answer.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    const v = await request(app.getHttpServer())
      .post(base + '/assignment-recipients/' + ar.id + '/submissions')
      .auth(f.studentActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ answerText: 'Full journey', fileIds: [upload.body.id] })
      .expect(201);
    const queue = await request(app.getHttpServer())
      .get(base + '/grading/queue')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .expect(200);
    expect(queue.body.items.find((item: { submissionId: string }) => item.submissionId === v.body.submissionId)?.versionId).toBe(v.body.versionId);
    const gradingContext = await request(app.getHttpServer())
      .get(base + '/submissions/' + v.body.submissionId + '/grading-context')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .expect(200);
    expect(gradingContext.body.currentVersionId).toBe(v.body.versionId);
    await request(app.getHttpServer())
      .get(base + '/submissions/' + v.body.submissionId + '/grading-context')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(403);
    const path = base + '/submission-versions/' + v.body.versionId;
    const g = await request(app.getHttpServer())
      .put(path + '/grade-draft')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ score: '8.5', feedback: 'Completed' })
      .expect(200);
    const parent = await actor(f, 'PARENT', f.student, true);
    await put(admin, 'parent_student_links', {
      tenant_id: f.tenant,
      parent_membership_id: parent.member,
      student_id: f.student,
      relationship: 'PARENT',
      verified_at: new Date(),
      verified_by_membership_id: f.member,
      evidence_reference: 'Verified E2E',
    });
    const hidden = await request(app.getHttpServer())
      .get(base + '/students/' + f.student + '/published-grades')
      .auth(parent.token, { type: 'bearer' })
      .expect(200);
    expect(hidden.body.items).toEqual([]);
    const studentDraft = await request(app.getHttpServer())
      .get(base + '/my/assignments')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
    expect(studentDraft.body.items.find((item: { id: string }) => item.id === a.body.id)?.score).toBeNull();
    await request(app.getHttpServer())
      .post(path + '/grades/publish')
      .auth(f.teacherActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ revision: 1 })
      .expect(201);
    for (const actor of [f.studentActor, parent]) {
      const result = await request(app.getHttpServer())
        .get(base + '/students/' + f.student + '/published-grades')
        .auth(actor.token, { type: 'bearer' })
        .expect(200);
      expect(result.body.items[0].score).toBe('8.5');
    }
    const studentPublished = await request(app.getHttpServer())
      .get(base + '/my/assignments')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
    expect(studentPublished.body.items.find((item: { id: string }) => item.id === a.body.id)?.score).toBe('8.5');
    const staff = await actor(f, 'ACADEMIC_STAFF', undefined, true);
    const context = await request(app.getHttpServer())
      .get(base + '/students/' + f.student + '/placement-context')
      .query({ classId: f.classId })
      .auth(staff.token, { type: 'bearer' })
      .expect(200);
    expect(context.body.publishedAssessments[0].gradeId).toBe(g.body.id);
    const pinned = context.body.publishedAssessments[0];
    const placement = {
      basis: 'PUBLISHED_GRADES',
      reason: 'Staff confirms using actual published grade',
      subjectId: context.body.targetSubjectId,
      levelId: context.body.targetLevelId,
      grades: [
        {
          gradeId: pinned.gradeId,
          revision: pinned.revision,
          evidenceHash: pinned.evidenceHash,
        },
      ],
    };
    // R3 enrollment pins the actual published revision; the future enrollment
    // uses the other existing class while retaining this assessment subject.
    await admin`UPDATE access_scopes SET scope_kind='TENANT',class_id=NULL WHERE membership_role_id=${staff.grant}`;
    const targetContext = (await grading.placement(
      staff.token,
      f.tenant,
      f.student,
      f.class2,
    )) as { targetSubjectId: string; targetLevelId: string };
    const enrolled = await repository.transaction(staff.token, async (tx) => {
      const rows = await tx.$queryRawUnsafe<
        { result: { id: string; placementEvidence: unknown } }[]
      >(
        'SELECT educore_r3.academic($1::uuid,$2::jsonb) result',
        f.tenant,
        JSON.stringify({
          operation: 'ENROLL',
          classId: f.class2,
          studentId: f.student,
          effectiveFrom: '2099-01-01',
          placement: {
            ...placement,
            subjectId: targetContext.targetSubjectId,
            levelId: targetContext.targetLevelId,
          },
          key: randomUUID(),
          reason: 'Confirm placement',
        }),
      );
      return rows[0].result;
    });
    const before = JSON.stringify(enrolled.placementEvidence);
    await grading.grade(f.teacherActor.token, f.tenant, {
      operation: 'CORRECT',
      gradeId: g.body.id,
      score: '7',
      reason: 'Corrected result',
      expectedRevision: 1,
      key: randomUUID(),
    });
    await grading.grade(f.teacherActor.token, f.tenant, {
      operation: 'PUBLISH_GRADE',
      versionId: v.body.versionId,
      revision: 2,
      key: randomUUID(),
    });
    const [receipt] =
      await admin`SELECT result_snapshot FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type='R3:ENROLL' AND result_snapshot->>'id'=${enrolled.id}`;
    expect(JSON.stringify(receipt.result_snapshot.placementEvidence)).toBe(
      before,
    );
    await dispatchAll();
    const notifications = await request(app.getHttpServer())
      .get(base + '/notifications')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
    expect(notifications.body.items).toHaveLength(1);
    await admin`UPDATE outbox_events SET status='NEW' WHERE tenant_id=${f.tenant} AND aggregate_id=${a.body.id}`;
    await dispatchAll();
    expect(
      (
        await admin`SELECT count(*)::int n FROM notifications WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(1);
    await request(app.getHttpServer())
      .get(base + '/files/' + upload.body.id + '/download')
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(200);
  });
  it('E02 recipient override/revocation retains history; wrong tenant cannot read resources', async () => {
    const f = await submitted();
    await assignments.changeRecipient(f.teacherActor.token, f.tenant, {
      id: f.recipient,
      operation: 'EXTEND_RECIPIENT',
      expectedRevision: 2,
      deadlineAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      reason: 'Individual extension',
      key: randomUUID(),
    });
    const next = (await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: f.recipient,
      answerText: 'Extended',
      key: randomUUID(),
    })) as { effectiveDeadlineAt: string };
    expect(Date.parse(next.effectiveDeadlineAt)).toBeGreaterThan(
      Date.now() + 2 * 86400000,
    );
    await assignments.changeRecipient(f.teacherActor.token, f.tenant, {
      id: f.recipient,
      operation: 'REVOKE_RECIPIENT',
      expectedRevision: 3,
      reason: 'Recipient withdrawn',
      key: randomUUID(),
    });
    await expect(
      submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        answerText: 'Revoked',
        key: randomUUID(),
      }),
    ).rejects.toThrow(/DENIED/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM submission_versions WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(2);
    const other = await fresh();
    await request(app.getHttpServer())
      .get('/api/v1/tenants/' + other.tenant + '/assignments/' + f.assignment)
      .auth(f.studentActor.token, { type: 'bearer' })
      .expect(403);
    await expect(
      repository.api.$executeRawUnsafe('UPDATE public.grades SET score=10'),
    ).rejects.toThrow(/permission denied/);
  });
});

function latch() {
  let release!: () => void;
  const promise = new Promise<void>((r) => {
    release = r;
  });
  return { promise, release };
}
type Command = (q: postgres.TransactionSql) => PromiseLike<unknown>;
async function orderedRace(
  tenant: string,
  firstToken: string,
  first: Command,
  secondToken: string,
  second: Command,
  label: string,
  rollback = false,
  privilegedFirst = false,
  privilegedSecond = false,
) {
  const one = connect(privilegedFirst ? ownerUrl : apiUrl),
    two = connect(privilegedSecond ? ownerUrl : apiUrl),
    held = latch(),
    release = latch();
  const [p1] = await one`SELECT pg_backend_pid() pid`,
    [p2] = await two`SELECT pg_backend_pid() pid`;
  const firstRun = one.begin(async (q) => {
    await q`SELECT educore_r4.bind(${firstToken})`;
    await first(q);
    await q`SET CONSTRAINTS ALL IMMEDIATE`;
    held.release();
    await release.promise;
    if (rollback) throw Error('EXPECTED_ROLLBACK');
  });
  // Catch immediately so a rejected transaction never becomes unhandled.
  let firstError: string | null = null;
  const firstOutcome = firstRun.then(
    () => null,
    (e) => {
      firstError = String(e);
      held.release();
      return firstError;
    },
  );
  await held.promise;
  if (firstError) throw Error(firstError);
  const secondOutcome = two
    .begin(async (q) => {
      await q`SELECT educore_r4.bind(${secondToken})`;
      await second(q);
      await q`SET CONSTRAINTS ALL IMMEDIATE`;
    })
    .then(
      () => null,
      (e) => String(e),
    );
  try {
    await waitBlocked(admin, Number(p2.pid), Number(p1.pid));
  } finally {
    release.release();
  }
  const outcomes = await Promise.all([firstOutcome, secondOutcome]);
  expect(outcomes[0]).toBe(rollback ? 'Error: EXPECTED_ROLLBACK' : null);
  evidence.races.push({ label, rollback, observedWait: true, outcomes });
  return outcomes[1];
}
const sqlSubmit =
  (f: Awaited<ReturnType<typeof published>>, answer = 'Concurrent'): Command =>
  (q) =>
    q`SELECT educore_r5.submit(${f.tenant}::uuid,${JSON.stringify({ recipientId: f.recipient, answerText: answer, key: randomUUID(), operation: 'SUBMIT' })}::text::jsonb)`;
const sqlGrade =
  (
    f: Awaited<ReturnType<typeof submitted>>,
    operation: string,
    extra: Record<string, unknown> = {},
  ): Command =>
  (q) =>
    q`SELECT educore_r5.grade(${f.tenant}::uuid,${JSON.stringify({ versionId: f.versionId, key: randomUUID(), operation, ...extra })}::text::jsonb)`;
describe('R5 deterministic PostgreSQL races', () => {
  it.each([false, true])(
    'R01 two submissions observe lock wait, rollback=%s',
    async (rollback) => {
      const f = await published();
      expect(
        await orderedRace(
          f.tenant,
          f.studentActor.token,
          sqlSubmit(f, 'First'),
          f.studentActor.token,
          sqlSubmit(f, 'Second'),
          'two first submissions',
          rollback,
        ),
      ).toBeNull();
      const versions =
        await admin`SELECT version_no FROM submission_versions WHERE tenant_id=${f.tenant} ORDER BY version_no`;
      expect(versions.map((v) => v.version_no)).toEqual(
        rollback ? [1] : [1, 2],
      );
    },
  );
  it.each([true, false])(
    'R02 resubmit vs draft, gradeFirst=%s',
    async (gradeFirst) => {
      const f = await submitted(),
        grade = sqlGrade(f, 'SAVE_DRAFT', { score: '8' }),
        submit = sqlSubmit(f);
      const outcome = await orderedRace(
        f.tenant,
        gradeFirst ? f.teacherActor.token : f.studentActor.token,
        gradeFirst ? grade : submit,
        gradeFirst ? f.studentActor.token : f.teacherActor.token,
        gradeFirst ? submit : grade,
        'resubmit vs draft',
      );
      expect(outcome).toMatch(
        gradeFirst ? /RESUBMISSION_NOT_ALLOWED/ : /GRADE_VERSION_NOT_CURRENT/,
      );
    },
  );
  it.each([true, false])(
    'R03 resubmit vs publish, publishFirst=%s',
    async (publishFirst) => {
      const f = await submitted();
      await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'SAVE_DRAFT',
        versionId: f.versionId,
        score: '8',
        key: randomUUID(),
      });
      if (publishFirst) {
        expect(
          await orderedRace(
            f.tenant,
            f.teacherActor.token,
            sqlGrade(f, 'PUBLISH_GRADE', { revision: 1 }),
            f.studentActor.token,
            sqlSubmit(f),
            'publish vs submit',
          ),
        ).toMatch(/RESUBMISSION/);
      } else {
        await expect(
          submissions.submit(f.studentActor.token, f.tenant, {
            recipientId: f.recipient,
            answerText: 'Draft already locks',
            key: randomUUID(),
          }),
        ).rejects.toThrow(/RESUBMISSION/);
      }
    },
  );
  it('R04 competing grade revisions wait and CAS rejects the stale writer', async () => {
    const f = await submitted();
    await grading.grade(f.teacherActor.token, f.tenant, {
      operation: 'SAVE_DRAFT',
      versionId: f.versionId,
      score: '8',
      key: randomUUID(),
    });
    await grading.grade(f.teacherActor.token, f.tenant, {
      operation: 'PUBLISH_GRADE',
      versionId: f.versionId,
      revision: 1,
      key: randomUUID(),
    });
    const [g] = await admin`SELECT id FROM grades WHERE tenant_id=${f.tenant}`;
    const correction = sqlGrade(f, 'CORRECT', {
      gradeId: g.id,
      expectedRevision: 1,
      score: '7',
      reason: 'Correction',
    });
    expect(
      await orderedRace(
        f.tenant,
        f.teacherActor.token,
        correction,
        f.teacherActor.token,
        correction,
        'two grade corrections',
      ),
    ).toMatch(/STALE/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM grades WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(2);
  });
  it.each([true, false])(
    'R05 assignment edit vs submit, editFirst=%s',
    async (editFirst) => {
      const f = await published(),
        edit: Command = (q) =>
          q`SELECT educore_r5.assignment(${f.tenant}::uuid,${JSON.stringify({ id: f.assignment, operation: 'EDIT', expectedRevision: 2, description: 'New instructions', key: randomUUID() })}::text::jsonb)`;
      const outcome = await orderedRace(
        f.tenant,
        editFirst ? f.teacherActor.token : f.studentActor.token,
        editFirst ? edit : sqlSubmit(f),
        editFirst ? f.studentActor.token : f.teacherActor.token,
        editFirst ? sqlSubmit(f) : edit,
        'edit vs submit',
      );
      if (editFirst) expect(outcome).toBeNull();
      else expect(outcome).toMatch(/LOCKED/);
    },
  );
  it('R06 deadline extension vs submission serializes and snapshots the effective deadline', async () => {
    const f = await published(),
      deadline = new Date(Date.now() + 3 * 86400000).toISOString();
    const extend: Command = (q) =>
      q`SELECT educore_r5.assignment(${f.tenant}::uuid,${JSON.stringify({ id: f.assignment, operation: 'EDIT', expectedRevision: 2, deadlineAt: deadline, reason: 'Extension', key: randomUUID() })}::text::jsonb)`;
    expect(
      await orderedRace(
        f.tenant,
        f.teacherActor.token,
        extend,
        f.studentActor.token,
        sqlSubmit(f),
        'extension vs submit',
      ),
    ).toBeNull();
    expect(
      new Date(
        (
          await admin`SELECT effective_deadline_at FROM submission_versions WHERE tenant_id=${f.tenant}`
        )[0].effective_deadline_at as Date,
      ).toISOString(),
    ).toBe(deadline);
  });
  it.each([true, false])(
    'R07 publication vs enrollment change, publicationFirst=%s',
    async (publicationFirst) => {
      const f = await fresh(),
        a = (await assignments.command(
          f.teacherActor.token,
          f.tenant,
          createBody(f),
        )) as { id: string };
      const publish: Command = (q) =>
        q`SELECT educore_r5.assignment(${f.tenant}::uuid,${JSON.stringify({ operation: 'PUBLISH', id: a.id, expectedRevision: 1, key: randomUUID() })}::text::jsonb)`;
      const withdraw: Command = (q) =>
        q`UPDATE enrollments SET status='WITHDRAWN',effective_to=clock_timestamp() WHERE tenant_id=${f.tenant} AND id=${f.enrollment}`;
      const outcome = await orderedRace(
        f.tenant,
        f.teacherActor.token,
        publicationFirst ? publish : withdraw,
        f.teacherActor.token,
        publicationFirst ? withdraw : publish,
        'publication vs enrollment',
        false,
        !publicationFirst,
        publicationFirst,
      );
      if (publicationFirst) expect(outcome).toBeNull();
      else expect(outcome).toMatch(/MEMBERSHIP_CHANGED/);
    },
  );
  it('R08 competing publications and two resubmissions observe independent connection waits', async () => {
    const f = await fresh(),
      a = (await assignments.command(
        f.teacherActor.token,
        f.tenant,
        createBody(f),
      )) as { id: string };
    const publish: Command = (q) =>
      q`SELECT educore_r5.assignment(${f.tenant}::uuid,${JSON.stringify({ operation: 'PUBLISH', id: a.id, expectedRevision: 1, key: randomUUID() })}::text::jsonb)`;
    expect(
      await orderedRace(
        f.tenant,
        f.teacherActor.token,
        publish,
        f.teacherActor.token,
        publish,
        'two publications',
      ),
    ).toMatch(/STALE/);
    const [ar] =
      await admin`SELECT id FROM assignment_recipients WHERE assignment_id=${a.id}`;
    const context = { ...f, assignment: a.id, recipient: ar.id as string };
    await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: ar.id,
      answerText: 'First',
      key: randomUUID(),
    });
    expect(
      await orderedRace(
        f.tenant,
        f.studentActor.token,
        sqlSubmit(context),
        f.studentActor.token,
        sqlSubmit(context),
        'two resubmissions',
      ),
    ).toBeNull();
    expect(
      (
        await admin`SELECT version_no FROM submission_versions WHERE tenant_id=${f.tenant} ORDER BY version_no`
      ).map((v) => v.version_no),
    ).toEqual([1, 2, 3]);
  });
  it.each([true, false])(
    'R09 publishing a correction vs another correction, publishFirst=%s',
    async (publishFirst) => {
      const f = await submitted();
      const g = (await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'SAVE_DRAFT',
        versionId: f.versionId,
        score: '8',
        key: randomUUID(),
      })) as { id: string };
      await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'PUBLISH_GRADE',
        versionId: f.versionId,
        revision: 1,
        key: randomUUID(),
      });
      await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'CORRECT',
        gradeId: g.id,
        expectedRevision: 1,
        score: '7',
        reason: 'Correction 1',
        key: randomUUID(),
      });
      const publish = sqlGrade(f, 'PUBLISH_GRADE', { revision: 2 }),
        correct = sqlGrade(f, 'CORRECT', {
          gradeId: g.id,
          expectedRevision: 2,
          score: '6',
          reason: 'Correction 2',
        });
      const outcome = await orderedRace(
        f.tenant,
        f.teacherActor.token,
        publishFirst ? publish : correct,
        f.teacherActor.token,
        publishFirst ? correct : publish,
        'publish vs correction',
      );
      expect(outcome).toMatch(
        publishFirst ? /LATEST_PUBLISHED/ : /DRAFT_NOT_CURRENT/,
      );
    },
  );
  it.each([true, false])(
    'R10 grade publication vs R3 evidence read, publishFirst=%s',
    async (publishFirst) => {
      const f = await submitted(),
        staff = await actor(f, 'ACADEMIC_STAFF');
      await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'SAVE_DRAFT',
        versionId: f.versionId,
        score: '8',
        key: randomUUID(),
      });
      const publish = sqlGrade(f, 'PUBLISH_GRADE', { revision: 1 });
      let count = -1;
      const read: Command = async (q) => {
        const [row] =
          await q`SELECT educore_r3.placement_context(${f.tenant}::uuid,${f.student}::uuid,${f.classId}::uuid) result`;
        count = row.result.publishedAssessments.length;
      };
      expect(
        await orderedRace(
          f.tenant,
          publishFirst ? f.teacherActor.token : staff.token,
          publishFirst ? publish : read,
          publishFirst ? staff.token : f.teacherActor.token,
          publishFirst ? read : publish,
          'published grade vs R3 evidence',
        ),
      ).toBeNull();
      expect(count).toBe(publishFirst ? 1 : 0);
    },
  );
  it('R11 concurrent attachment snapshots from four files cannot produce six; reconciliation never deletes', async () => {
    const f = await published(),
      ids: string[] = [];
    for (let n = 0; n < 6; n++)
      ids.push(
        (
          await files.upload(
            f.studentActor.token,
            f.tenant,
            f.recipient,
            'same.pdf',
            'application/pdf',
            pdf,
          )
        ).id,
      );
    await submissions.submit(f.studentActor.token, f.tenant, {
      recipientId: f.recipient,
      fileIds: ids.slice(0, 4),
      key: randomUUID(),
    });
    const submit =
      (count: number): Command =>
      (q) =>
        q`SELECT educore_r5.submit(${f.tenant}::uuid,${JSON.stringify({ operation: 'SUBMIT', recipientId: f.recipient, fileIds: ids.slice(0, count), key: randomUUID() })}::text::jsonb)`;
    expect(
      await orderedRace(
        f.tenant,
        f.studentActor.token,
        submit(5),
        f.studentActor.token,
        submit(6),
        'attach vs attach from four',
      ),
    ).toMatch(/FILE_COUNT/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM submission_files WHERE tenant_id=${f.tenant} GROUP BY submission_version_id ORDER BY n`
      ).map((r) => r.n),
    ).toEqual([4, 5]);
    const manager = await actor(f, 'MANAGER');
    await admin`UPDATE access_scopes SET scope_kind='TENANT',class_id=NULL WHERE membership_role_id=${manager.grant}`;
    const scan: Command = (q) =>
      q`SELECT educore_r5.file_inventory(${f.tenant}::uuid)`;
    expect(
      await orderedRace(
        f.tenant,
        f.studentActor.token,
        submit(5),
        manager.token,
        scan,
        'link vs reconciliation',
      ),
    ).toBeNull();
    const result = await files.reconcile(manager.token, f.tenant);
    expect(result.physicalDeletes).toBe(0);
    expect(result.anomalies).toEqual([]);
  });
  it.each(['PUBLISH', 'GRADE'])(
    'R12 current Teacher revocation vs %s denies the waiting mutation',
    async (mode) => {
      const f = mode === 'GRADE' ? await submitted() : await published(),
        manager = await actor(f, 'MANAGER');
      await admin`UPDATE access_scopes SET scope_kind='TENANT',class_id=NULL WHERE membership_role_id=${manager.grant}`;
      const revoke: Command = (q) =>
        q`SELECT educore_r4.iam(${f.tenant}::uuid,${JSON.stringify({ operation: 'ROLE_REVOKE', id: f.teacherActor.member, assignmentId: f.teacherActor.grant, reason: 'Current revoke' })}::text::jsonb)`;
      let write: Command;
      if (mode === 'GRADE')
        write = sqlGrade(
          f as Awaited<ReturnType<typeof submitted>>,
          'SAVE_DRAFT',
          { score: '8' },
        );
      else {
        const a = (await assignments.command(
          f.teacherActor.token,
          f.tenant,
          createBody(f),
        )) as { id: string };
        write = (q) =>
          q`SELECT educore_r5.assignment(${f.tenant}::uuid,${JSON.stringify({ operation: 'PUBLISH', id: a.id, expectedRevision: 1, key: randomUUID() })}::text::jsonb)`;
      }
      expect(
        await orderedRace(
          f.tenant,
          manager.token,
          revoke,
          f.teacherActor.token,
          write,
          'Teacher revocation vs ' + mode,
        ),
      ).toMatch(/DENIED/);
    },
  );
  it.each(['GRADE', 'FILE'])(
    'R13 Parent revoke vs %s read uses the current link',
    async (kind) => {
      const f = await published(),
        file = await files.upload(
          f.studentActor.token,
          f.tenant,
          f.recipient,
          'answer.pdf',
          'application/pdf',
          pdf,
        );
      const v = (await submissions.submit(f.studentActor.token, f.tenant, {
        recipientId: f.recipient,
        fileIds: [file.id],
        key: randomUUID(),
      })) as { versionId: string };
      const parent = await actor(f, 'PARENT', f.student),
        manager = await actor(f, 'MANAGER');
      await admin`UPDATE access_scopes SET scope_kind='TENANT',class_id=NULL WHERE membership_role_id=${manager.grant}`;
      const link = await put(admin, 'parent_student_links', {
        tenant_id: f.tenant,
        parent_membership_id: parent.member,
        student_id: f.student,
        relationship: 'PARENT',
        verified_at: new Date(),
        verified_by_membership_id: f.member,
        evidence_reference: 'Verified race',
      });
      // Test an explicitly granted Parent file-read permission; it is not a new
      // default permission and never bypasses the active verified link.
      await admin`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id) SELECT ${randomUUID()},${f.tenant},r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.tenant_id=${f.tenant} AND r.code='PARENT' AND p.code='file.download' ON CONFLICT DO NOTHING`;
      await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'SAVE_DRAFT',
        versionId: v.versionId,
        score: '8',
        key: randomUUID(),
      });
      await grading.grade(f.teacherActor.token, f.tenant, {
        operation: 'PUBLISH_GRADE',
        versionId: v.versionId,
        revision: 1,
        key: randomUUID(),
      });
      const revoke: Command = (q) =>
        q`SELECT educore_r4.iam(${f.tenant}::uuid,${JSON.stringify({ operation: 'PARENT_REVOKE', id: link, reason: 'Revoke verified relationship' })}::text::jsonb)`;
      const read: Command =
        kind === 'GRADE'
          ? (q) =>
              q`SELECT educore_r5.published_grades(${f.tenant}::uuid,${f.student}::uuid,'{}'::jsonb)`
          : (q) =>
              q`SELECT educore_r5.file_info(${f.tenant}::uuid,${file.id}::uuid,'file.download')`;
      expect(
        await orderedRace(
          f.tenant,
          manager.token,
          revoke,
          parent.token,
          read,
          'Parent revocation vs ' + kind,
        ),
      ).toMatch(/DENIED/);
    },
  );
  it('R14 current pointer cannot race backwards after a resubmission', async () => {
    const f = await submitted();
    const stale: Command = (q) =>
      q`UPDATE submissions SET current_version_id=${f.versionId} WHERE id=${f.submissionId}`;
    expect(
      await orderedRace(
        f.tenant,
        f.studentActor.token,
        sqlSubmit(f),
        f.studentActor.token,
        stale,
        'current pointer vs resubmission',
        false,
        false,
        true,
      ),
    ).toMatch(/NOT_LATEST/);
  });
  it('R15 publication stays invisible to dispatch until commit and replay creates one notification', async () => {
    await dispatchAll();
    const f = await fresh(),
      a = (await assignments.command(
        f.teacherActor.token,
        f.tenant,
        createBody(f),
      )) as { id: string };
    const q = connect(apiUrl),
      held = latch(),
      release = latch(),
      body = {
        operation: 'PUBLISH',
        id: a.id,
        expectedRevision: 1,
        key: randomUUID(),
      };
    const pending = q.begin(async (tx) => {
      await tx`SELECT educore_r4.bind(${f.teacherActor.token})`;
      await tx`SELECT educore_r5.assignment(${f.tenant}::uuid,${JSON.stringify(body)}::text::jsonb)`;
      held.release();
      await release.promise;
    });
    const outcome = pending.then(
      () => null,
      (e) => {
        held.release();
        return String(e);
      },
    );
    await held.promise;
    try {
      const rows = await repository.worker!.$queryRawUnsafe<
        { result: unknown }[]
      >('SELECT educore_r4.dispatch_event() result');
      expect(rows[0].result).toBeNull();
    } finally {
      release.release();
    }
    expect(await outcome).toBeNull();
    await dispatchAll();
    await assignments.command(f.teacherActor.token, f.tenant, body);
    await admin`UPDATE outbox_events SET status='NEW' WHERE tenant_id=${f.tenant}`;
    await dispatchAll();
    expect(
      (
        await admin`SELECT count(*)::int n FROM notifications WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(1);
    evidence.races.push({
      label: 'publication vs outbox replay',
      uncommittedInvisible: true,
      replayDeduplicated: true,
    });
  });
  it('R16 storage failure racing submission cannot finalize a successful version', async () => {
    const f = await published(),
      promoted = latch(),
      release = latch();
    const broken = new FileService(auth, {
      writeStaging: (k, b) => storage.writeStaging(k, b),
      promote: async (k) => {
        await storage.promote(k);
        promoted.release();
        await release.promise;
        throw Error('Injected finalize failure');
      },
      read: (k) => storage.read(k),
      inventory: () => storage.inventory(),
    });
    const upload = broken
      .upload(
        f.studentActor.token,
        f.tenant,
        f.recipient,
        'interrupted.pdf',
        'application/pdf',
        pdf,
      )
      .then(
        () => null,
        (e) => String(e),
      );
    await promoted.promise;
    const [file] =
      await admin`SELECT id,private_storage_key FROM stored_files WHERE tenant_id=${f.tenant}`;
    try {
      await expect(
        submissions.submit(f.studentActor.token, f.tenant, {
          recipientId: f.recipient,
          fileIds: [file.id],
          key: randomUUID(),
        }),
      ).rejects.toThrow(/NOT_READY/);
    } finally {
      release.release();
    }
    expect(await upload).toMatch(/NOT_FINALIZED/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM submissions WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(0);
    expect(await storage.read(String(file.private_storage_key))).toEqual(pdf);
    evidence.races.push({
      label: 'storage finalize failure vs submission',
      promotedBarrier: true,
      successfulVersions: 0,
    });
  });
});
afterAll(async () => {
  await app?.close();
  await repository?.close();
  await Promise.all(clients.map((c) => c.end({ timeout: 2 })));
  const dir = await mkdtemp(join(tmpdir(), 'educore-r5-evidence-'));
  writeFileSync(join(dir, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('R5 sanitized evidence: ' + join(dir, 'evidence.json'));
});
async function actor(
  f: Fixture,
  role: string,
  student?: string,
  viaHttp = false,
) {
  const user = await put(admin, 'users', {
    email_normalized: randomUUID() + '@r5.invalid',
    display_name: 'R5 actor',
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
    scope_kind: student ? 'STUDENT' : 'CLASS',
    student_id: student ?? null,
    class_id: student ? null : f.classId,
  });
  await admin`INSERT INTO credentials(user_id,password_hash,password_changed_at) VALUES(${user},${hash},clock_timestamp())`;
  const [u] = await admin`SELECT email_normalized FROM users WHERE id=${user}`;
  const login = viaHttp
    ? (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .set('Origin', 'http://localhost:5173')
          .send({ email: u.email_normalized, password })
          .expect(200)
      ).body
    : await auth.login(String(u.email_normalized), password);
  const selected = viaHttp
    ? (
        await request(app.getHttpServer())
          .post('/api/v1/auth/select-tenant')
          .set('Authorization', 'Bearer ' + login.accessToken)
          .send({ tenantId: f.tenant })
          .expect(200)
      ).body
    : await auth.selectTenant(login.accessToken, f.tenant);
  return { user, member, grant, token: selected.accessToken as string };
}
async function fresh(viaHttp = false) {
  const f = await admin.begin(async (tx) => {
    const f = await seed(tx as unknown as Query, {
      enrollmentFrom: '2020-01-01T00:00:00Z',
    });
    await tx`SELECT educore_r4.seed(${f.tenant}::uuid)`;
    return f;
  });
  const teacher = await actor(f, 'TEACHER', undefined, viaHttp);
  await admin`UPDATE teacher_profiles SET membership_id=${teacher.member} WHERE tenant_id=${f.tenant} AND id=${f.teacher}`;
  await put(admin, 'class_teacher_assignments', {
    tenant_id: f.tenant,
    class_id: f.classId,
    teacher_id: f.teacher,
    role_kind: 'PRIMARY',
    valid_from: '2020-01-01T00:00:00Z',
    assigned_by_membership_id: f.member,
  });
  const student = await actor(f, 'STUDENT', f.student, viaHttp);
  await admin`UPDATE student_profiles SET membership_id=${student.member} WHERE tenant_id=${f.tenant} AND id=${f.student}`;
  return { ...f, teacherActor: teacher, studentActor: student };
}
const createBody = (f: Fixture) => ({
  classId: f.classId,
  title: 'Homework',
  description: 'Answer the question',
  priority: 3,
  deadlineAt: new Date(Date.now() + 86400000).toISOString(),
  key: randomUUID(),
  operation: 'CREATE',
});
async function published(viaHttp = false) {
  const f = await fresh(viaHttp);
  const a = (await assignments.command(
    f.teacherActor.token,
    f.tenant,
    createBody(f),
  )) as { id: string };
  await assignments.command(f.teacherActor.token, f.tenant, {
    id: a.id,
    expectedRevision: 1,
    key: randomUUID(),
    operation: 'PUBLISH',
  });
  const [r] =
    await admin`SELECT id FROM assignment_recipients WHERE tenant_id=${f.tenant} AND assignment_id=${a.id} AND revoked_at IS NULL`;
  return { ...f, assignment: a.id, recipient: r.id as string };
}
describe('Checkpoint A', () => {
  it('A05 rejects invalid calendar deadlines and preserves microseconds when normalizing UTC', async () => {
    const f = await fresh(),
      base = '/api/v1/tenants/' + f.tenant + '/assignments';
    const { key: _key, operation: _operation, ...body } = createBody(f);
    for (const deadlineAt of [
      '2026-02-30T12:00:00Z',
      '2026-01-01T24:00:00Z',
      '0000-01-01T12:00:00Z',
    ])
      await request(app.getHttpServer())
        .post(base)
        .auth(f.teacherActor.token, { type: 'bearer' })
        .set('Idempotency-Key', randomUUID())
        .send({ ...body, deadlineAt })
        .expect(400);
    const created = await request(app.getHttpServer())
      .post(base)
      .auth(f.teacherActor.token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ ...body, deadlineAt: '2099-01-01T12:34:56.123456+07:00' })
      .expect(201);
    const [row] =
      await admin`SELECT to_char(deadline_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') deadline FROM assignments WHERE id=${created.body.id}`;
    expect(row.deadline).toBe('2099-01-01T05:34:56.123456Z');
  });
  it('A01 real teacher/student HTTP, immutable recipient and atomic publication/outbox', async () => {
    const f = await fresh(),
      base = '/api/v1/tenants/' + f.tenant;
    await request(app.getHttpServer())
      .get(base + '/assignments')
      .expect(401);
    const body = createBody(f);
    const { key, operation: _operation, ...input } = body;
    const created = await request(app.getHttpServer())
      .post(base + '/assignments')
      .set('Authorization', 'Bearer ' + f.teacherActor.token)
      .set('Idempotency-Key', key)
      .send(input)
      .expect(201);
    const id = created.body.id;
    await request(app.getHttpServer())
      .get(base + '/assignments/' + id)
      .set('Authorization', 'Bearer ' + f.studentActor.token)
      .expect(404);
    const publishKey = randomUUID();
    for (let n = 0; n < 2; n++)
      await request(app.getHttpServer())
        .post(base + '/assignments/' + id + '/publish')
        .set('Authorization', 'Bearer ' + f.teacherActor.token)
        .set('If-Match', '1')
        .set('Idempotency-Key', publishKey)
        .send({})
        .expect(201);
    await request(app.getHttpServer())
      .get(base + '/assignments/' + id)
      .set('Authorization', 'Bearer ' + f.studentActor.token)
      .expect(200);
    expect(
      (
        await admin`SELECT count(*)::int n FROM outbox_events WHERE tenant_id=${f.tenant} AND aggregate_id=${id}`
      )[0].n,
    ).toBe(1);
    await expect(
      admin`UPDATE assignment_recipients SET student_id=${f.student2} WHERE tenant_id=${f.tenant} AND assignment_id=${id}`,
    ).rejects.toThrow(/IMMUTABLE/);
  });
  it('A02 wrong class, duplicate students, invalid priority and stale edits are denied', async () => {
    const f = await fresh(),
      token = f.teacherActor.token;
    await expect(
      assignments.command(token, f.tenant, {
        ...createBody(f),
        classId: f.class2,
      }),
    ).rejects.toThrow(/DENIED/);
    await expect(
      assignments.command(token, f.tenant, {
        ...createBody(f),
        studentIds: [f.student, f.student],
      }),
    ).rejects.toThrow(/DUPLICATE/);
    await expect(
      assignments.command(token, f.tenant, { ...createBody(f), priority: 6 }),
    ).rejects.toThrow();
    const a = (await assignments.command(token, f.tenant, createBody(f))) as {
      id: string;
    };
    await expect(
      assignments.command(token, f.tenant, {
        id: a.id,
        expectedRevision: 2,
        title: 'Stale',
        operation: 'EDIT',
        key: randomUUID(),
      }),
    ).rejects.toThrow(/STALE/);
    expect(
      (
        await admin`SELECT count(*)::int n FROM assignments WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(1);
  });
  it('A03 publication revalidates enrollment; rollback leaves draft and no event', async () => {
    const f = await fresh(),
      a = (await assignments.command(
        f.teacherActor.token,
        f.tenant,
        createBody(f),
      )) as { id: string };
    await admin`UPDATE enrollments SET effective_to=clock_timestamp(),status='WITHDRAWN' WHERE tenant_id=${f.tenant} AND id=${f.enrollment}`;
    await expect(
      assignments.command(f.teacherActor.token, f.tenant, {
        id: a.id,
        expectedRevision: 1,
        operation: 'PUBLISH',
        key: randomUUID(),
      }),
    ).rejects.toThrow(/MEMBERSHIP_CHANGED/);
    expect(
      (await admin`SELECT status FROM assignments WHERE id=${a.id}`)[0].status,
    ).toBe('DRAFT');
    expect(
      (
        await admin`SELECT count(*)::int n FROM outbox_events WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(0);
  });
  it('A04 concurrent publications serialize and create one committed event', async () => {
    const f = await fresh(),
      a = (await assignments.command(
        f.teacherActor.token,
        f.tenant,
        createBody(f),
      )) as { id: string };
    const result = await Promise.allSettled(
      [1, 2].map(() =>
        assignments.command(f.teacherActor.token, f.tenant, {
          id: a.id,
          expectedRevision: 1,
          operation: 'PUBLISH',
          key: randomUUID(),
        }),
      ),
    );
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (
        await admin`SELECT count(*)::int n FROM outbox_events WHERE tenant_id=${f.tenant}`
      )[0].n,
    ).toBe(1);
  });
});
