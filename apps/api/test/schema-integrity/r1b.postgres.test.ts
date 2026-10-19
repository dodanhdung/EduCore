import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type Prisma,
} from '../../src/generated/prisma/client.js';
import {
  type Db,
  type Tx,
  type Query,
  type Fixture,
  safeTarget,
  connect,
  initialize,
  seed,
  preserveFixtureManager,
  line,
  id,
  put,
  rejected,
  sqlstate,
  enter,
  authorized,
  audit,
  evidence,
  saveEvidence,
  waitBlocked,
  fixtureCommand,
} from './support.js';

let target = '';
let observer: Db;
const clients: Db[] = [];
function client() {
  const q = connect(target);
  clients.push(q);
  return q;
}
const rollback = Symbol('rollback-test');
for (let n = 1; n <= 42; n++)
  (evidence.cases as Record<string, unknown>)[
    `R1B-T${String(n).padStart(2, '0')}`
  ] = 'NOT RUN';
(evidence.cases as Record<string, unknown>)['R1B-T37'] =
  'BLOCKED: reviewed per-target legacy adoption not supplied';
(evidence.cases as Record<string, unknown>)['R1B-T41'] = 'DEFERRED TO RUNTIME';
afterEach((context) => {
  context.onTestFinished(() => {
    const key = context.task.name.match(/R1B-T\d\d/)?.[0];
    const state = context.task.result?.state;
    if (key && (state === 'pass' || state === 'fail'))
      (evidence.cases as Record<string, unknown>)[key] =
        state === 'pass' ? 'PASS' : 'FAIL';
  });
});

async function isolated(action: (q: Tx) => Promise<void>) {
  const q = client();
  try {
    await q.begin(async (tx) => {
      await action(tx);
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
}
function testCase(n: number, title: string, action: (q: Tx) => Promise<void>) {
  const key = `R1B-T${String(n).padStart(2, '0')}`;
  it(`${key}: ${title}`, async () => {
    try {
      await isolated(action);
      (evidence.cases as Record<string, unknown>)[key] = 'PASS';
    } catch (e) {
      (evidence.cases as Record<string, unknown>)[key] = 'FAIL';
      throw e;
    }
  });
}
async function attendance(q: Query, f: Fixture, finalization = true) {
  const finalizationId = finalization
    ? await put(q, 'attendance_finalizations', {
        tenant_id: f.tenant,
        session_id: f.session,
        confirmed_by_membership_id: f.member,
        confirmed_at: '2099-10-01T00:00:00Z',
        revision: 1,
      })
    : null;
  const record = await put(q, 'attendance_records', {
    tenant_id: f.tenant,
    session_id: f.session,
    participant_id: f.participant,
    finalization_id: finalizationId,
    attendance_status: 'ATTENDED',
    recorded_by_membership_id: f.member,
    recorded_at: '2099-10-01T00:00:00Z',
    revision: 1,
  });
  return { record, finalizationId };
}
async function issued(q: Query, f: Fixture, lineId: string) {
  await q.unsafe(
    "UPDATE public.invoices SET status='ISSUED',issued_at=clock_timestamp(),invoice_number=$2 WHERE id=$1",
    [f.invoice, id()],
  );
  return put(q, 'invoiced_participation_claims', {
    tenant_id: f.tenant,
    participant_id: f.participant,
    invoice_line_id: lineId,
    claimed_at: '2099-10-01T00:00:00Z',
  });
}
async function changePeriod(
  q: Query,
  f: Fixture,
  start: string,
  end: string,
): Promise<Fixture> {
  const period = await put(q, 'billing_periods', {
    tenant_id: f.tenant,
    month_start: start,
    month_end: end,
    status: 'OPEN',
  });
  const run = await put(q, 'billing_runs', {
    tenant_id: f.tenant,
    student_id: f.student,
    period_id: period,
    operation_key: id(),
    state: 'DRAFT',
    policy_version_id: f.policy,
    input_snapshot_hash: 'synthetic-independent-test-period',
  });
  const invoice = await put(q, 'invoices', {
    tenant_id: f.tenant,
    student_id: f.student,
    period_id: period,
    billing_run_id: run,
    status: 'DRAFT',
    gross_vnd: '0',
    discount_vnd: '0',
    total_vnd: '0',
    policy_version_id: f.policy,
    snapshot_json: '{}',
  });
  return { ...f, period, run, invoice };
}
async function managerCount(q: Query, tenant: string): Promise<number> {
  const rows = await q.unsafe(
    `SELECT count(DISTINCT u.id)::int AS n FROM public.users u
    JOIN public.tenant_memberships m ON m.user_id=u.id AND m.status='ACTIVE' AND m.left_at IS NULL
    JOIN public.membership_roles mr ON mr.tenant_id=m.tenant_id AND mr.membership_id=m.id AND mr.revoked_at IS NULL
    JOIN public.roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id AND r.code='MANAGER'
    WHERE m.tenant_id=$1 AND u.status='ACTIVE'`,
    [tenant],
  );
  return rows[0].n as number;
}
async function managerPair(q: Query): Promise<[Fixture, Fixture]> {
  const f = await seed(q);
  await q.unsafe("UPDATE public.roles SET code='MANAGER' WHERE id=$1", [
    f.role,
  ]);
  const user = await put(q, 'users', {
    email_normalized: id() + '@r1b.invalid',
    display_name: 'Second Manager',
    status: 'ACTIVE',
  });
  const member = await put(q, 'tenant_memberships', {
    tenant_id: f.tenant,
    user_id: user,
    status: 'ACTIVE',
  });
  const authSession = await put(q, 'auth_sessions', {
    user_id: user,
    active_tenant_id: f.tenant,
    refresh_token_hash: 'SYNTHETIC',
    expires_at: '2200-01-01',
  });
  const membershipRole = await put(q, 'membership_roles', {
    tenant_id: f.tenant,
    membership_id: member,
    role_id: f.role,
    assigned_by_membership_id: f.member,
  });
  const scope = await put(q, 'access_scopes', {
    tenant_id: f.tenant,
    membership_role_id: membershipRole,
    scope_kind: 'TENANT',
  });
  return [f, { ...f, user, member, authSession, membershipRole, scope }];
}

beforeAll(async () => {
  // This throws BEFORE any socket opens when the environment is unauthorized.
  target = safeTarget(process.env);
  await initialize(target);
  observer = client();
});
afterAll(async () => {
  await Promise.all(clients.map((q) => q.end({ timeout: 2 })));
  saveEvidence();
});

describe('R1b integrity on actual disposable PostgreSQL', () => {
  testCase(1, 'valid line keeps exact ownership and DB evidence', async (q) => {
    const f = await seed(q);
    const l = await line(q, f);
    const rows = await q.unsafe(
      'SELECT student_id,session_id,source_snapshot_json FROM public.invoice_lines WHERE id=$1',
      [l],
    );
    expect(rows[0].student_id).toBe(f.student);
    expect(rows[0].session_id).toBe(f.session);
    expect(rows[0].source_snapshot_json.r1bAttribution).toMatchObject({
      localSessionDate: '2099-09-30',
      timezone: 'Asia/Ho_Chi_Minh',
      courseId: f.course,
      enrollmentId: f.enrollment,
    });
  });
  testCase(
    2,
    'wrong invoice/source student rejected by mapped R1a FK',
    async (q) => {
      const f = await seed(q);
      const p = await put(q, 'session_participants', {
        tenant_id: f.tenant,
        session_id: f.session,
        student_id: f.student2,
        participant_kind: 'REGULAR',
      });
      await sqlstate(
        () =>
          q.savepoint((tx) =>
            line(tx, f, { student_id: f.student2, participant_id: p }),
          ),
        '23503',
        'il_invoice_student_fk',
      );
      await sqlstate(
        () => q.savepoint((tx) => line(tx, f, { participant_id: p })),
        '23503',
        'il_participant_student_fk',
      );
      expect(
        (
          await q.unsafe(
            'SELECT count(*)::int AS n FROM public.invoice_lines WHERE tenant_id=$1',
            [f.tenant],
          )
        )[0].n,
      ).toBe(0);
    },
  );
  testCase(
    3,
    'forged JSON cannot place October source in September',
    async (q) => {
      const f = await seed(q, { start: '2099-09-30T17:00:00Z' });
      await sqlstate(
        () =>
          q.savepoint((tx) =>
            line(tx, f, {
              source_snapshot_json:
                '{"r1bAttribution":{"localSessionDate":"2099-09-30"}}',
            }),
          ),
        '23514',
        'r1b_line_period',
      );
    },
  );
  testCase(
    4,
    'microsecond month boundary is exclusive at next month',
    async (q) => {
      const sep = await seed(q, { start: '2099-09-30T16:59:59.999999Z' });
      const l = await line(q, sep);
      expect(
        (
          await q.unsafe(
            'SELECT source_snapshot_json FROM public.invoice_lines WHERE id=$1',
            [l],
          )
        )[0].source_snapshot_json.r1bAttribution.startsAtUtc,
      ).toBe('2099-09-30T16:59:59.999999Z');
      const oct = await seed(q, { start: '2099-09-30T17:00:00Z' });
      await sqlstate(
        () => q.savepoint((tx) => line(tx, oct)),
        '23514',
        'r1b_line_period',
      );
      await line(q, await changePeriod(q, oct, '2099-10-01', '2099-11-01'));
    },
  );
  testCase(
    5,
    'overnight session belongs only to local start month',
    async (q) => {
      const f = await seed(q);
      await line(q, f);
      const oct = await changePeriod(q, f, '2099-10-01', '2099-11-01');
      await sqlstate(
        () => q.savepoint((tx) => line(tx, oct)),
        '23514',
        'r1b_line_period',
      );
    },
  );
  testCase(
    6,
    'UTC month and SQL TimeZone do not override tenant month',
    async (q) => {
      const f = await seed(q, { start: '2099-09-30T18:00:00Z' });
      const oct = await changePeriod(q, f, '2099-10-01', '2099-11-01');
      await q.unsafe("SET LOCAL TIME ZONE 'America/New_York'");
      await sqlstate(
        () => q.savepoint((tx) => line(tx, f)),
        '23514',
        'r1b_line_period',
      );
      const l = await line(q, oct);
      expect(
        (
          await q.unsafe(
            'SELECT source_snapshot_json FROM public.invoice_lines WHERE id=$1',
            [l],
          )
        )[0].source_snapshot_json.r1bAttribution.localSessionDate,
      ).toBe('2099-10-01');
    },
  );
  testCase(
    7,
    'cancelled zero line needs no fabricated attendance',
    async (q) => {
      const f = await seed(q);
      await q.unsafe(
        "UPDATE public.class_sessions SET status='CANCELLED' WHERE id=$1",
        [f.session],
      );
      const l = await line(q, f, {
        charge_units: 0,
        base_amount_vnd: '0',
        source_status: 'CANCELLED',
      });
      const row = (
        await q.unsafe(
          'SELECT attendance_id,source_snapshot_json FROM public.invoice_lines WHERE id=$1',
          [l],
        )
      )[0];
      expect(row.attendance_id).toBeNull();
      expect(row.source_snapshot_json.r1bAttribution.isCancelled).toBe(true);
    },
  );
  it('R1B-T08: R1a optional finalization and actual Prisma nested writes', async () => {
    const f = await observer.begin((tx) => seed(tx));
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: target }),
    });
    const prismaCommand = <T>(
      effect: (tx: Prisma.TransactionClient) => Promise<T>,
    ) =>
      prisma.$transaction(
        async (tx) => {
          await tx.$queryRawUnsafe(
            'SELECT id FROM public.users WHERE id=$1::uuid FOR SHARE',
            f.user,
          );
          await tx.$queryRawUnsafe(
            'SELECT id FROM public.tenants WHERE id=$1::uuid FOR NO KEY UPDATE',
            f.tenant,
          );
          await authorized(
            {
              unsafe: (text: string, params: unknown[] = []) =>
                tx.$queryRawUnsafe(text, ...params),
            } as unknown as Query,
            f,
          );
          return effect(tx);
        },
        { isolationLevel: 'ReadCommitted', timeout: 10_000 },
      );
    const session2 = await put(observer, 'class_sessions', {
      tenant_id: f.tenant,
      class_id: f.classId,
      teacher_id: f.teacher,
      policy_version_id: f.policy,
      delivery_mode: 'ONLINE',
      starts_at: '2099-09-29',
      ends_at: '2099-09-30',
      status: 'DRAFT',
      revision: 1,
    });
    const wrongSessionFinalization = await put(
      observer,
      'attendance_finalizations',
      {
        tenant_id: f.tenant,
        session_id: session2,
        confirmed_by_membership_id: f.member,
        confirmed_at: '2099-10-01',
        revision: 1,
      },
    );
    const own = await put(observer, 'attendance_finalizations', {
      tenant_id: f.tenant,
      session_id: f.session,
      confirmed_by_membership_id: f.member,
      confirmed_at: '2099-10-01',
      revision: 1,
    });
    try {
      const record = await prismaCommand((tx) =>
        tx.attendanceRecord.create({
          data: {
            attendanceStatus: 'ATTENDED',
            recordedAt: '2099-10-01T00:00:00Z',
            revision: 1,
            tenant: { connect: { id: f.tenant } },
            participant: {
              connect: {
                tenantId_sessionId_id: {
                  tenantId: f.tenant,
                  sessionId: f.session,
                  id: f.participant,
                },
              },
            },
            recordedBy: {
              connect: { tenantId_id: { tenantId: f.tenant, id: f.member } },
            },
          },
        }),
      );
      expect(record.finalizationId).toBeNull();
      expect(record.sessionId).toBe(f.session);
      await sqlstate(
        () =>
          observer.unsafe(
            'UPDATE attendance_records SET finalization_id=$2 WHERE id=$1',
            [record.id, wrongSessionFinalization],
          ),
        '23503',
        'ar_finalization_session_fk',
      );
      await expect(
        prismaCommand((tx) =>
          tx.attendanceRecord.update({
            where: { id: record.id },
            data: {
              finalization: {
                connect: {
                  tenantId_sessionId_id: {
                    tenantId: f.tenant,
                    sessionId: session2,
                    id: wrongSessionFinalization,
                  },
                },
              },
            },
          }),
        ),
      ).rejects.toMatchObject({ code: 'P2003' });
      await prismaCommand((tx) =>
        tx.attendanceRecord.update({
          where: { id: record.id },
          data: {
            finalization: {
              connect: {
                tenantId_sessionId_id: {
                  tenantId: f.tenant,
                  sessionId: f.session,
                  id: own,
                },
              },
            },
          },
        }),
      );
      // R1a explicitly left this shared-required-column query-engine behavior
      // unproven. Prisma 7.10.1 nulls tenant_id too: the existing guard must
      // reject it. Never relax identities to make this convenience API work.
      await expect(
        prismaCommand((tx) =>
          tx.attendanceRecord.update({
            where: { id: record.id },
            data: { finalization: { disconnect: true } },
          }),
        ),
      ).rejects.toThrow(/23514[\s\S]*Attendance identity is immutable/);
      const retained = await prisma.attendanceRecord.findUniqueOrThrow({
        where: { id: record.id },
      });
      expect(retained.finalizationId).toBe(own);
      expect(retained.tenantId).toBe(f.tenant);
      expect(retained.sessionId).toBe(f.session);
      // Trusted command clears only the nullable FK scalar, inside the same
      // current-auth/lock transaction. This is not exposed as an HTTP DTO.
      const disconnected = await prismaCommand((tx) =>
        tx.attendanceRecord.update({
          where: { id: record.id },
          data: { finalizationId: null },
        }),
      );
      expect(disconnected.finalizationId).toBeNull();
      expect(disconnected.sessionId).toBe(f.session);
      expect(disconnected.tenantId).toBe(f.tenant);
      evidence.prismaDisconnect = {
        nestedDisconnect: 'REJECTED 23514; required identity retained',
        scalarUnlink: 'PASS; only finalizationId cleared under command locks',
        runtimeRestriction: 'Do not expose nested disconnect for this relation',
      };
      await observer.unsafe(
        "UPDATE class_sessions SET status='CANCELLED' WHERE id=$1",
        [f.session],
      );
      const nested = await prismaCommand((tx) =>
        tx.invoiceLine.create({
          data: {
            sourceStatus: 'CANCELLED',
            chargeUnits: 0,
            unitPriceVnd: 100000n,
            baseAmountVnd: 0n,
            reasonCode: 'FIXTURE',
            sourceSnapshotJson: {},
            tenant: { connect: { id: f.tenant } },
            invoice: {
              connect: {
                tenantId_id_studentId: {
                  tenantId: f.tenant,
                  id: f.invoice,
                  studentId: f.student,
                },
              },
            },
            participant: {
              connect: {
                tenantId_sessionId_studentId_id: {
                  tenantId: f.tenant,
                  sessionId: f.session,
                  studentId: f.student,
                  id: f.participant,
                },
              },
            },
            session: {
              connect: { tenantId_id: { tenantId: f.tenant, id: f.session } },
            },
          },
        }),
      );
      expect(nested.studentId).toBe(f.student);
      expect(nested.attendanceId).toBeNull();
    } finally {
      await prisma.$disconnect();
    }
  });
  testCase(
    9,
    'coherent line reconnect/source overwrite rejected',
    async (q) => {
      const f = await seed(q);
      const l = await line(q, f);
      const f2 = await seed(q);
      for (const [field, value] of [
        ['invoice_id', f2.invoice],
        ['participant_id', f2.participant],
        ['session_id', f2.session],
        ['student_id', f2.student],
      ]) {
        await rejected(
          q,
          `UPDATE public.invoice_lines SET ${field}=$2 WHERE id=$1`,
          [l, value],
        );
      }
      await rejected(
        q,
        "UPDATE public.invoice_lines SET source_snapshot_json='{}' WHERE id=$1",
        [l],
      );
      const protectedRow = () =>
        q.unsafe(
          "SELECT to_jsonb(l)-ARRAY['updated_at','reason_code'] AS evidence FROM public.invoice_lines l WHERE id=$1",
          [l],
        );
      const before = await protectedRow();
      await q.unsafe(
        "UPDATE public.invoice_lines SET reason_code='METADATA',updated_at=clock_timestamp() WHERE id=$1",
        [l],
      );
      expect(await protectedRow()).toEqual(before);
    },
  );
  testCase(
    10,
    'same-month and cross-month billed reschedule rejected',
    async (q) => {
      const f = await seed(q);
      await line(q, f);
      for (const start of ['2099-09-29T16:30Z', '2099-10-01T16:30Z'])
        await rejected(
          q,
          'UPDATE public.class_sessions SET starts_at=$2 WHERE id=$1',
          [f.session, start],
        );
      await q.unsafe(
        "UPDATE public.class_sessions SET status='COMPLETED',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1",
        [f.session],
      );
    },
  );
  testCase(
    11,
    'unused future scheduling allowed; ordinary past edits rejected',
    async (q) => {
      const f = await seed(q);
      await q.unsafe(
        "UPDATE public.class_sessions SET starts_at='2099-09-29T16:30Z' WHERE id=$1",
        [f.session],
      );
      const past = await seed(q, { start: '2020-09-30T16:30Z' });
      await rejected(
        q,
        "UPDATE public.class_sessions SET starts_at='2020-09-29T16:30Z' WHERE id=$1",
        [past.session],
      );
    },
  );
  testCase(
    12,
    'invoice/run monthly identity and used input immutable',
    async (q) => {
      const f = await seed(q);
      for (const table of ['invoices', 'billing_runs']) {
        await rejected(
          q,
          `UPDATE public.${table} SET student_id=$2 WHERE id=$1`,
          [table === 'invoices' ? f.invoice : f.run, f.student2],
        );
        await rejected(
          q,
          `UPDATE public.${table} SET period_id=$2 WHERE id=$1`,
          [table === 'invoices' ? f.invoice : f.run, id()],
        );
      }
      await rejected(
        q,
        "UPDATE public.billing_runs SET operation_key='DIFFERENT' WHERE id=$1",
        [f.run],
      );
      await rejected(
        q,
        "UPDATE public.billing_runs SET input_snapshot_hash='DIFFERENT' WHERE id=$1",
        [f.run],
      );
    },
  );
  testCase(13, 'monthly CHECK and inverse bounds guard', async (q) => {
    const f = await seed(q);
    for (const [start, end] of [
      ['2100-01-31', '2100-02-01'],
      ['2100-01-01', '2100-03-01'],
      ['infinity', 'infinity'],
    ]) {
      await sqlstate(
        () =>
          q.savepoint((tx) =>
            put(tx, 'billing_periods', {
              tenant_id: f.tenant,
              month_start: start,
              month_end: end,
              status: 'OPEN',
            }),
          ),
        '23514',
        'bp_month_shape_ck',
      );
    }
    await rejected(
      q,
      "UPDATE public.billing_periods SET month_start='2099-08-01' WHERE id=$1",
      [f.period],
    );
  });
  testCase(
    14,
    'used participant identity/enrollment/removal freeze',
    async (q) => {
      const f = await seed(q);
      await line(q, f);
      await rejected(
        q,
        'UPDATE public.session_participants SET enrollment_id=NULL WHERE id=$1',
        [f.participant],
      );
      await rejected(
        q,
        'UPDATE public.session_participants SET removed_at=clock_timestamp() WHERE id=$1',
        [f.participant],
      );
      await rejected(q, 'DELETE FROM public.session_participants WHERE id=$1', [
        f.participant,
      ]);
      await rejected(
        q,
        'UPDATE public.session_participants SET student_id=$2 WHERE id=$1',
        [f.participant, f.student2],
      );
    },
  );
  testCase(15, 'enrollment class child and parent inverse guard', async (q) => {
    const f = await seed(q);
    const e = await put(q, 'enrollments', {
      tenant_id: f.tenant,
      student_id: f.student,
      class_id: f.class2,
      status: 'ACTIVE',
      effective_from: '2099-01-01',
      created_by_membership_id: f.member,
    });
    await rejected(
      q,
      'UPDATE public.session_participants SET enrollment_id=$2 WHERE id=$1',
      [f.participant, e],
      '23514',
      'r1b_participant_enrollment_class',
    );
    await rejected(q, 'UPDATE public.enrollments SET class_id=$2 WHERE id=$1', [
      f.enrollment,
      f.class2,
    ]);
    await q.unsafe(
      "UPDATE public.enrollments SET effective_to='2100-01-01',status='COMPLETED' WHERE id=$1",
      [f.enrollment],
    );
  });
  testCase(
    16,
    'class/course re-key and parent cascade cannot rewrite source',
    async (q) => {
      const f = await seed(q);
      await rejected(q, 'UPDATE public.classes SET course_id=$2 WHERE id=$1', [
        f.classId,
        id(),
      ]);
      await rejected(q, 'UPDATE public.courses SET id=$2 WHERE id=$1', [
        f.course,
        id(),
      ]);
      await rejected(
        q,
        'DELETE FROM public.courses WHERE id=$1',
        [f.course],
        '23503',
      );
    },
  );
  testCase(
    17,
    'issued header/line/claim cannot reset or disappear',
    async (q) => {
      const f = await seed(q);
      const l = await line(q, f);
      const claim = await issued(q, f, l);
      await rejected(
        q,
        "UPDATE public.invoices SET status='CANCELLED' WHERE id=$1",
        [f.invoice],
      );
      await rejected(
        q,
        "UPDATE public.invoice_lines SET reason_code='AFTER_ISSUE' WHERE id=$1",
        [l],
      );
      await rejected(
        q,
        "UPDATE public.invoices SET status='DRAFT',issued_at=NULL,invoice_number=NULL WHERE id=$1",
        [f.invoice],
      );
      await rejected(
        q,
        'UPDATE public.invoice_lines SET base_amount_vnd=0 WHERE id=$1',
        [l],
      );
      await rejected(q, 'DELETE FROM public.invoice_lines WHERE id=$1', [l]);
      await rejected(
        q,
        'DELETE FROM public.invoiced_participation_claims WHERE id=$1',
        [claim],
      );
      await rejected(
        q,
        'UPDATE public.invoiced_participation_claims SET claimed_at=clock_timestamp() WHERE id=$1',
        [claim],
      );
      expect(
        (
          await q.unsafe(
            'SELECT total_vnd::text AS total FROM public.invoices WHERE id=$1',
            [f.invoice],
          )
        )[0].total,
      ).toBe('100000');
    },
  );
  testCase(18, 'four first-source boundaries and rollback', async (q) => {
    const base = await seed(q);
    for (const kind of ['series', 'session', 'period', 'run']) {
      await q.savepoint(async (tx) => {
        const f = {
          ...base,
          tenant: await put(tx, 'tenants', {
            code: id(),
            name: 'Empty',
            status: 'ACTIVE',
          }),
        };
        expect(
          (
            await tx.unsafe(
              'SELECT timezone_frozen_at FROM public.tenants WHERE id=$1',
              [f.tenant],
            )
          )[0].timezone_frozen_at,
        ).toBeNull();
        if (kind === 'period')
          await put(tx, 'billing_periods', {
            tenant_id: f.tenant,
            month_start: '2099-09-01',
            month_end: '2099-10-01',
            status: 'OPEN',
          });
        else {
          // FK intentionally fails after freeze; verify atomic rollback below.
          const values =
            kind === 'series'
              ? {
                  class_id: id(),
                  weekday: 1,
                  local_start_time: '10:00',
                  duration_minutes: 60,
                  valid_from: '2099-01-01',
                  valid_to: '2099-02-01',
                  timezone: 'Asia/Ho_Chi_Minh',
                  status: 'DRAFT',
                }
              : kind === 'session'
                ? {
                    class_id: id(),
                    teacher_id: id(),
                    policy_version_id: id(),
                    delivery_mode: 'ONLINE',
                    starts_at: '2099-09-01',
                    ends_at: '2099-09-02',
                    status: 'DRAFT',
                    revision: 1,
                  }
                : {
                    student_id: id(),
                    period_id: id(),
                    policy_version_id: id(),
                    operation_key: id(),
                    state: 'DRAFT',
                    input_snapshot_hash: 'KNOWN-INVALID-FK',
                  };
          await sqlstate(
            () =>
              tx.savepoint((sp) =>
                put(
                  sp,
                  kind === 'series'
                    ? 'schedule_series'
                    : kind === 'session'
                      ? 'class_sessions'
                      : 'billing_runs',
                  { tenant_id: f.tenant, ...values },
                ),
              ),
            '23503',
          );
          expect(
            (
              await tx.unsafe(
                'SELECT timezone_frozen_at FROM public.tenants WHERE id=$1',
                [f.tenant],
              )
            )[0].timezone_frozen_at,
          ).toBeNull();
        }
        if (kind === 'period')
          expect(
            (
              await tx.unsafe(
                'SELECT timezone_frozen_at FROM public.tenants WHERE id=$1',
                [f.tenant],
              )
            )[0].timezone_frozen_at,
          ).not.toBeNull();
      });
    }
    for (const firstSource of ['series', 'session', 'period'] as const) {
      const f = await seed(q, { firstSource });
      const before = (
        await q.unsafe(
          'SELECT timezone_frozen_at::text AS marker FROM public.tenants WHERE id=$1',
          [f.tenant],
        )
      )[0].marker;
      expect(before).not.toBeNull();
      await changePeriod(q, f, '2099-10-01', '2099-11-01');
      expect(
        (
          await q.unsafe(
            'SELECT timezone_frozen_at::text AS marker FROM public.tenants WHERE id=$1',
            [f.tenant],
          )
        )[0].marker,
      ).toBe(before);
    }
    // A valid Run needs an existing Period, so Run cannot be the first valid
    // source in a fresh guarded catalog. Its INSERT must still call the helper.
  });
  testCase(
    19,
    'invalid zone, mismatched Series zone, manual marker rejected',
    async (q) => {
      await sqlstate(
        () =>
          q.savepoint((tx) =>
            put(tx, 'tenants', {
              code: id(),
              name: 'Bad',
              status: 'ACTIVE',
              timezone: 'INVALID/ZONE',
            }),
          ),
        '23514',
      );
      const f = await seed(q);
      await sqlstate(
        () =>
          q.savepoint((tx) =>
            put(tx, 'schedule_series', {
              tenant_id: f.tenant,
              class_id: f.classId,
              weekday: 1,
              local_start_time: '10:00',
              duration_minutes: 60,
              valid_from: '2099-01-01',
              valid_to: '2099-02-01',
              timezone: 'UTC',
              status: 'DRAFT',
            }),
          ),
        '23514',
      );
      const empty = await put(q, 'tenants', {
        code: id(),
        name: 'Empty',
        status: 'ACTIVE',
      });
      await rejected(
        q,
        'UPDATE public.tenants SET timezone_frozen_at=clock_timestamp() WHERE id=$1',
        [empty],
        '42501',
      );
    },
  );
  testCase(
    20,
    'sticky marker survives deleting last source and Ops has no bypass',
    async (q) => {
      const t = await put(q, 'tenants', {
        code: id(),
        name: 'Empty',
        status: 'ACTIVE',
      });
      const period = await put(q, 'billing_periods', {
        tenant_id: t,
        month_start: '2099-09-01',
        month_end: '2099-10-01',
        status: 'OPEN',
      });
      const before = (
        await q.unsafe(
          'SELECT timezone_frozen_at::text AS marker FROM public.tenants WHERE id=$1',
          [t],
        )
      )[0].marker;
      await q.unsafe('DELETE FROM public.billing_periods WHERE id=$1', [
        period,
      ]);
      for (const stmt of [
        "UPDATE public.tenants SET timezone='UTC' WHERE id=$1",
        'UPDATE public.tenants SET timezone_frozen_at=NULL WHERE id=$1',
        'DELETE FROM public.tenants WHERE id=$1',
      ])
        await rejected(q, stmt, [t]);
      expect(
        (
          await q.unsafe(
            'SELECT timezone_frozen_at::text AS marker FROM public.tenants WHERE id=$1',
            [t],
          )
        )[0].marker,
      ).toBe(before);
    },
  );
  testCase(
    21,
    'billed attendance/confirmation frozen; metadata remains editable',
    async (q) => {
      const f = await seed(q);
      const a = await attendance(q, f);
      await line(q, f, { attendance_id: a.record });
      await rejected(
        q,
        'UPDATE public.attendance_records SET finalization_id=NULL WHERE id=$1',
        [a.record],
      );
      await rejected(
        q,
        "UPDATE public.attendance_records SET attendance_status='EXCUSED' WHERE id=$1",
        [a.record],
      );
      await rejected(
        q,
        'UPDATE public.attendance_finalizations SET confirmed_at=clock_timestamp() WHERE id=$1',
        [a.finalizationId],
      );
      await q.unsafe(
        'UPDATE public.attendance_finalizations SET locked_at=clock_timestamp(),revision=revision+1 WHERE id=$1',
        [a.finalizationId],
      );
      await rejected(
        q,
        'UPDATE public.attendance_finalizations SET locked_at=NULL WHERE id=$1',
        [a.finalizationId],
      );
      await q.unsafe(
        'UPDATE public.attendance_records SET revision=revision+1,updated_at=clock_timestamp() WHERE id=$1',
        [a.record],
      );
    },
  );
});

type Outcome = { code: string | null };
type Action = (q: Db) => Promise<unknown>;
async function attempt(q: Db, action: Action): Promise<Outcome> {
  await q.unsafe('SAVEPOINT fixture_action');
  try {
    await action(q);
    return { code: null };
  } catch (e) {
    await q.unsafe('ROLLBACK TO SAVEPOINT fixture_action');
    return { code: (e as { code: string }).code };
  }
}

/** A owns its lock before B starts; observer must see the real wait edge. */
async function race(
  f: Fixture,
  actionA: Action,
  actionB: Action,
  commitA: boolean,
  modeA: 'SHARE' | 'UPDATE' = 'SHARE',
  modeB: 'SHARE' | 'UPDATE' = 'SHARE',
) {
  const a = client(),
    b = client();
  await a.unsafe('BEGIN ISOLATION LEVEL READ COMMITTED');
  await b.unsafe('BEGIN ISOLATION LEVEL READ COMMITTED');
  const apid = (await a.unsafe('SELECT pg_backend_pid() AS pid'))[0]
    .pid as number;
  const bpid = (await b.unsafe('SELECT pg_backend_pid() AS pid'))[0]
    .pid as number;
  try {
    await enter(a, f, modeA); // explicit acquired-gate barrier
    const waiting = (async () => {
      await enter(b, f, modeB);
      const result = await attempt(b, actionB);
      await b.unsafe('COMMIT');
      return result;
    })();
    const guardedWaiting = waiting.then(
      (result) => ({ result }),
      (error) => ({ error }),
    );
    await waitBlocked(observer, bpid, apid);
    const first = await attempt(a, actionA);
    await a.unsafe(commitA ? 'COMMIT' : 'ROLLBACK');
    const second = await guardedWaiting;
    if ('error' in second) throw second.error;
    (evidence.races as unknown[]).push({
      apid,
      bpid,
      observedWait: true,
      commitA,
      first,
      second: second.result,
    });
    return { first, second: second.result };
  } finally {
    await a.unsafe('ROLLBACK');
    await b.unsafe('ROLLBACK');
  }
}

describe('R1b independent-connection protocols', () => {
  it('R1B-T22: Line vs reschedule, both winners and COMMIT/ROLLBACK', async () => {
    for (const firstLine of [true, false])
      for (const commit of [true, false]) {
        const f = await observer.begin((tx) => seed(tx));
        const insert: Action = async (q) => {
          await authorized(q, f);
          await line(q, f);
        };
        const move: Action = (q) =>
          q.unsafe(
            "UPDATE public.class_sessions SET starts_at='2099-10-01T16:30Z',ends_at='2099-10-01T17:30Z' WHERE id=$1",
            [f.session],
          );
        const result = await race(
          f,
          firstLine ? insert : move,
          firstLine ? move : insert,
          commit,
        );
        expect(result.first.code).toBeNull();
        expect(result.second.code).toBe(commit ? '23514' : null);
        const invalid = await observer.unsafe(
          `SELECT l.id FROM public.invoice_lines l JOIN public.class_sessions s ON s.tenant_id=l.tenant_id AND s.id=l.session_id
        JOIN public.invoices i ON i.tenant_id=l.tenant_id AND i.id=l.invoice_id JOIN public.billing_periods p ON p.tenant_id=i.tenant_id AND p.id=i.period_id
        JOIN public.tenants t ON t.id=l.tenant_id WHERE l.tenant_id=$1 AND NOT(p.month_start <= (s.starts_at AT TIME ZONE t.timezone)::date AND (s.starts_at AT TIME ZONE t.timezone)::date < p.month_end)`,
          [f.tenant],
        );
        expect(invalid).toHaveLength(0);
      }
  });
  it('R1B-T23: child vs parent student mutation, both orders/rollback', async () => {
    for (const childFirst of [true, false])
      for (const commit of [true, false]) {
        const f = await observer.begin((tx) => seed(tx));
        const insert: Action = (q) => line(q, f);
        const parent: Action = (q) =>
          q.unsafe('UPDATE public.invoices SET student_id=$2 WHERE id=$1', [
            f.invoice,
            f.student2,
          ]);
        const r = await race(
          f,
          childFirst ? insert : parent,
          childFirst ? parent : insert,
          commit,
        );
        expect(childFirst ? r.second.code : r.first.code).toBe('23514');
        expect(childFirst ? r.first.code : r.second.code).toBeNull();
      }
  });
  it('R1B-T24: first source vs zone, both winners/rollback', async () => {
    for (const sourceFirst of [true, false])
      for (const commit of [true, false]) {
        const f = await observer.begin(async (tx) => {
          const base = await seed(tx);
          return {
            ...base,
            tenant: await put(tx, 'tenants', {
              code: id(),
              name: 'Race empty',
              status: 'CREATED',
            }),
          };
        });
        const source: Action = (q) =>
          put(q, 'billing_periods', {
            tenant_id: f.tenant,
            month_start: '2099-09-01',
            month_end: '2099-10-01',
            status: 'OPEN',
          });
        const zone: Action = (q) =>
          q.unsafe("UPDATE public.tenants SET timezone='UTC' WHERE id=$1", [
            f.tenant,
          ]);
        const r = await race(
          f,
          sourceFirst ? source : zone,
          sourceFirst ? zone : source,
          commit,
        );
        expect(r.first.code).toBeNull();
        expect(r.second.code).toBe(sourceFirst && commit ? '23514' : null);
        const t = (
          await observer.unsafe(
            'SELECT timezone,timezone_frozen_at FROM public.tenants WHERE id=$1',
            [f.tenant],
          )
        )[0];
        expect(t.timezone).toBe(
          sourceFirst && commit
            ? 'Asia/Ho_Chi_Minh'
            : sourceFirst || commit
              ? 'UTC'
              : 'Asia/Ho_Chi_Minh',
        );
        expect(t.timezone_frozen_at === null).toBe(sourceFirst && !commit);
      }
  });
  it('R1B-T25: current permission/scope revoke vs authorized audited operation', async () => {
    for (const scopeRevoke of [true, false])
      for (const opFirst of [true, false])
        for (const commit of [true, false]) {
          const f = await observer.begin((tx) => seed(tx));
          await preserveFixtureManager(observer,f);
          const operation: Action = async (q) => {
            await authorized(q, f);
            await audit(q, f, f.tenant);
          };
          const revoke: Action = (q) =>
            scopeRevoke
              ? q.unsafe('DELETE FROM public.access_scopes WHERE id=$1', [
                  f.scope,
                ])
              : q.unsafe(
                  'DELETE FROM public.role_permissions WHERE tenant_id=$1 AND role_id=$2 AND permission_id=$3',
                  [f.tenant, f.role, f.permission],
                );
          const r = await race(
            f,
            opFirst ? operation : revoke,
            opFirst ? revoke : operation,
            commit,
          );
          expect(r.first.code).toBeNull();
          expect(r.second.code).toBe(!opFirst && commit ? '42501' : null);
          const audits = await observer.unsafe(
            'SELECT count(*)::int AS n FROM public.audit_logs WHERE tenant_id=$1',
            [f.tenant],
          );
          expect(audits[0].n).toBe(opFirst ? Number(commit) : Number(!commit));
        }
  });
  it('R1B-T26: global disable locks User before tenant; last-Manager fresh check', async () => {
    for (const disableFirst of [true, false])
      for (const commit of [true, false]) {
        const f = await observer.begin((tx) => seed(tx));
        await preserveFixtureManager(observer,f);
        const operation: Action = async (q) => {
          await authorized(q, f);
          await audit(q, f, f.tenant);
        };
        const disable: Action = (q) =>
          q.unsafe("UPDATE public.users SET status='DISABLED' WHERE id=$1", [
            f.user,
          ]);
        const r = await race(
          f,
          disableFirst ? disable : operation,
          disableFirst ? operation : disable,
          commit,
          disableFirst ? 'UPDATE' : 'SHARE',
          disableFirst ? 'SHARE' : 'UPDATE',
        );
        expect(r.second.code).toBe(disableFirst && commit ? '42501' : null);
      }
    // Membership attach must anchor the target User before the tenant gate;
    // disable discovers the complete membership set while holding User UPDATE.
    for (const attachFirst of [true, false])
      for (const commit of [true, false]) {
        const f = await observer.begin((tx) => seed(tx)),
          g = await observer.begin((tx) => seed(tx));
        await preserveFixtureManager(observer,f);
        const a = client(),
          b = client();
        await a.unsafe('BEGIN');
        await b.unsafe('BEGIN');
        const enterAttach = async (db: Db) => {
          for (const user of [f.user, g.user].sort())
            await db.unsafe(
              'SELECT id FROM public.users WHERE id=$1 FOR SHARE',
              [user],
            );
          await db.unsafe(
            'SELECT id FROM public.tenants WHERE id=$1 FOR NO KEY UPDATE',
            [g.tenant],
          );
          await authorized(db, g);
        };
        const enterDisable = async (db: Db) => {
          await db.unsafe(
            'SELECT id FROM public.users WHERE id=$1 FOR UPDATE',
            [f.user],
          );
          const tenants = await db.unsafe(
            'SELECT tenant_id FROM public.tenant_memberships WHERE user_id=$1 ORDER BY tenant_id',
            [f.user],
          );
          for (const row of tenants)
            await db.unsafe(
              'SELECT id FROM public.tenants WHERE id=$1 FOR NO KEY UPDATE',
              [row.tenant_id],
            );
          await authorized(db, f);
          return tenants.map((row) => row.tenant_id as string);
        };
        const attach: Action = async (db) => {
          const targetUser = (
            await db.unsafe('SELECT status FROM public.users WHERE id=$1', [
              f.user,
            ])
          )[0];
          if (targetUser.status !== 'ACTIVE')
            throw Object.assign(new Error('Inactive target'), {
              code: '42501',
            });
          await put(db, 'tenant_memberships', {
            tenant_id: g.tenant,
            user_id: f.user,
            status: 'ACTIVE',
          });
        };
        const disable: Action = (db) =>
          db.unsafe("UPDATE public.users SET status='DISABLED' WHERE id=$1", [
            f.user,
          ]);
        try {
          const apid = (await a.unsafe('SELECT pg_backend_pid() AS pid'))[0]
            .pid as number;
          const bpid = (await b.unsafe('SELECT pg_backend_pid() AS pid'))[0]
            .pid as number;
          await (attachFirst ? enterAttach(a) : enterDisable(a));
          let discovered: string[] = [];
          const waiting = (async () => {
            if (attachFirst) discovered = await enterDisable(b);
            else await enterAttach(b);
            const result = await attempt(b, attachFirst ? disable : attach);
            await b.unsafe('COMMIT');
            return result;
          })().then(
            (result) => ({ result }),
            (error) => ({ error }),
          );
          await waitBlocked(observer, bpid, apid);
          expect(
            (await attempt(a, attachFirst ? attach : disable)).code,
          ).toBeNull();
          await a.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
          const second = await waiting;
          if ('error' in second) throw second.error;
          expect(second.result.code).toBe(
            !attachFirst && commit ? '42501' : null,
          );
          if (attachFirst) expect(discovered.includes(g.tenant)).toBe(commit);
          (evidence.races as unknown[]).push({
            scenario: 'membership-attach',
            apid,
            bpid,
            observedWait: true,
            attachFirst,
            commit,
            discoveredTenantCount: discovered.length,
          });
        } finally {
          await a.unsafe('ROLLBACK');
          await b.unsafe('ROLLBACK');
        }
      }
    // Last-Manager command predicate is checked against fresh stored users
    // after the shared tenant gate, with distinct target User anchors.
    for (const swapped of [true, false])
      for (const commit of [true, false]) {
        const pair = await observer.begin((tx) => managerPair(tx));
        const [first, second] = swapped ? pair : [pair[1], pair[0]];
        const a = client(),
          b = client();
        await a.unsafe('BEGIN');
        await b.unsafe('BEGIN');
        try {
          const apid = (await a.unsafe('SELECT pg_backend_pid() AS pid'))[0]
            .pid as number;
          const bpid = (await b.unsafe('SELECT pg_backend_pid() AS pid'))[0]
            .pid as number;
          await enter(a, first, 'UPDATE');
          await authorized(a, first);
          const wait = (async () => {
            try {
              await enter(b, second, 'UPDATE');
              await authorized(b, second);
              if ((await managerCount(b, second.tenant)) <= 1)
                throw Object.assign(new Error('Last Manager'), {
                  code: '23514',
                });
              await b.unsafe(
                "UPDATE public.users SET status='DISABLED' WHERE id=$1",
                [second.user],
              );
              await b.unsafe('COMMIT');
              return null;
            } catch (e) {
              await b.unsafe('ROLLBACK');
              return (e as { code: string }).code;
            }
          })();
          await waitBlocked(observer, bpid, apid);
          expect(await managerCount(a, first.tenant)).toBe(2);
          await a.unsafe(
            "UPDATE public.users SET status='DISABLED' WHERE id=$1",
            [first.user],
          );
          await a.unsafe(commit ? 'COMMIT' : 'ROLLBACK');
          expect(await wait).toBe(commit ? '23514' : null);
          expect(await managerCount(observer, first.tenant)).toBe(1);
          (evidence.races as unknown[]).push({
            scenario: 'last-manager',
            apid,
            bpid,
            observedWait: true,
            swapped,
            commit,
          });
        } finally {
          await a.unsafe('ROLLBACK');
          await b.unsafe('ROLLBACK');
        }
      }
  });
  it('R1B-T27: independent tenants proceed without shared gate', async () => {
    const f = await observer.begin((tx) => seed(tx)),
      g = await observer.begin((tx) => seed(tx));
    const a = client(),
      b = client();
    await a.unsafe('BEGIN');
    await b.unsafe('BEGIN');
    try {
      await enter(a, f);
      await b.unsafe("SET LOCAL lock_timeout='500ms'");
      await enter(b, g);
      await authorized(b, g);
      await line(b, g);
      await b.unsafe('COMMIT');
    } finally {
      await a.unsafe('ROLLBACK');
      await b.unsafe('ROLLBACK');
    }
  });
  it('R1B-T28: real timeout/deadlock rollback and unsupported isolation', async () => {
    const f = await observer.begin((tx) => seed(tx));
    const a = client(),
      b = client();
    await a.unsafe('BEGIN');
    await b.unsafe('BEGIN');
    try {
      await enter(a, f);
      await b.unsafe("SET LOCAL lock_timeout='100ms'");
      await sqlstate(() => enter(b, f), '55P03');
    } finally {
      await a.unsafe('ROLLBACK');
      await b.unsafe('ROLLBACK');
    }
    const g = await observer.begin((tx) => seed(tx));
    await a.unsafe('BEGIN');
    await b.unsafe('BEGIN');
    try {
      await a.unsafe("SET LOCAL deadlock_timeout='100ms'");
      await b.unsafe("SET LOCAL deadlock_timeout='100ms'");
      await a.unsafe('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [
        f.user,
      ]);
      await b.unsafe('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [
        g.user,
      ]);
      const result = async (q: Db, user: string) => {
        try {
          await q.unsafe('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [
            user,
          ]);
          await q.unsafe('COMMIT');
          return null;
        } catch (e) {
          await q.unsafe('ROLLBACK');
          return (e as { code: string }).code;
        }
      };
      const apid = (await a.unsafe('SELECT pg_backend_pid() AS pid'))[0]
        .pid as number;
      const bpid = (await b.unsafe('SELECT pg_backend_pid() AS pid'))[0]
        .pid as number;
      const one = result(a, g.user);
      await waitBlocked(observer, apid, bpid);
      const two = result(b, f.user);
      const codes = await Promise.all([one, two]);
      expect(codes.filter((c) => c === '40P01')).toHaveLength(1);
    } finally {
      await a.unsafe('ROLLBACK');
      await b.unsafe('ROLLBACK');
    }
    for (const isolation of ['REPEATABLE READ', 'SERIALIZABLE']) {
      await a.unsafe('BEGIN ISOLATION LEVEL ' + isolation);
      try {
        await sqlstate(
          () =>
            a.unsafe('SELECT educore_private.r1b_lock_tenant($1)', [f.tenant]),
          '25000',
        );
      } finally {
        await a.unsafe('ROLLBACK');
      }
    }
    await a.unsafe('BEGIN');
    await enter(a, f);
    try {
      const attempts = await fixtureCommand(
        target,
        f,
        async (q) => {
          await line(q, f);
        },
        async () => {
          await a.unsafe('ROLLBACK');
        },
      );
      expect(attempts).toBe(1);
      expect(
        (
          await observer.unsafe(
            'SELECT count(*)::int AS n FROM public.invoice_lines WHERE tenant_id=$1',
            [f.tenant],
          )
        )[0].n,
      ).toBe(1);
    } finally {
      await a.unsafe('ROLLBACK');
    }
  });
});

describe('R1b grants, recovery and catalogs', () => {
  testCase(
    29,
    'actual permission/session/scope data, no boolean auth mock',
    async (q) => {
      const f = await seed(q);
      await enter(q, f);
      await authorized(q, f);
      await audit(q, f, f.tenant);
      await q.unsafe(
        'UPDATE public.auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1',
        [f.authSession],
      );
      await sqlstate(() => authorized(q, f), '42501');
    },
  );
  testCase(
    30,
    'cross-tenant commands and composite source refs rejected',
    async (q) => {
      const f = await seed(q),
        g = await seed(q);
      await enter(q, f);
      await sqlstate(() => authorized(q, f, g.tenant), '42501');
      await sqlstate(
        () =>
          q.savepoint((tx) => line(tx, f, { participant_id: g.participant })),
        '23503',
      );
    },
  );
  testCase(
    31,
    'ordinary API/worker roles cannot raw-write/DDL/SET ROLE',
    async (q) => {
      const f = await seed(q);
      for (const role of ['educore_r1b_api', 'educore_r1b_worker']) {
        for (const statement of [
          `UPDATE public.tenants SET timezone_frozen_at=NULL WHERE id='${f.tenant}'`,
          `DELETE FROM public.invoice_lines WHERE tenant_id='${f.tenant}'`,
          'TRUNCATE public.tenants CASCADE',
          'ALTER TABLE public.tenants DISABLE TRIGGER ALL',
          `SELECT educore_private.r1b_freeze_tenant('${f.tenant}')`,
          'SET ROLE educore_r1b_guard_owner',
        ]) {
          // SESSION AUTHORIZATION models a real ordinary login. SET ROLE from a
          // superuser session would retain permission to switch to other roles.
          await q.unsafe('SAVEPOINT runtime_privilege');
          try {
            await q.unsafe(`SET SESSION AUTHORIZATION ${role}`);
            await sqlstate(() => q.unsafe(statement), '42501');
          } finally {
            await q.unsafe('ROLLBACK TO SAVEPOINT runtime_privilege');
            await q.unsafe('RESET SESSION AUTHORIZATION');
          }
        }
      }
    },
  );
  testCase(
    32,
    'definer/search_path/PUBLIC ACL and guard-owner privilege audit',
    async (q) => {
      const functions =
        await q.unsafe(`SELECT p.proname,p.prosecdef,p.provolatile,p.proconfig,r.rolname,
      EXISTS (SELECT FROM pg_catalog.aclexplode(COALESCE(p.proacl,pg_catalog.acldefault('f',p.proowner))) acl WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE') AS public_execute
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_catalog.pg_roles r ON r.oid=p.proowner WHERE n.nspname='educore_private'`);
      expect(functions).toHaveLength(8);
      for (const fn of functions) {
        expect(fn.prosecdef).toBe(fn.proname !== 'r1b_tenant_guard');
        expect(fn.provolatile).toBe('v');
        expect(fn.rolname).toBe('educore_r1b_guard_owner');
        expect(fn.public_execute).toBe(false);
        expect(fn.proconfig).toContain(
          'search_path=pg_catalog, educore_private, pg_temp',
        );
      }
      const owner = (
        await q.unsafe(
          "SELECT rolsuper,rolcanlogin,rolcreaterole,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname='educore_r1b_guard_owner'",
        )
      )[0];
      expect(Object.values(owner).every((x) => x === false)).toBe(true);
      expect(
        (
          await q.unsafe(
            "SELECT has_table_privilege('educore_r1b_guard_owner','public.invoice_lines','UPDATE') AS allowed",
          )
        )[0].allowed,
      ).toBe(false);
      await q.unsafe('CREATE TEMP TABLE tenants (id uuid,timezone text)');
      const f = await seed(q);
      const l = await line(q, f);
      expect(
        (
          await q.unsafe(
            'SELECT source_snapshot_json FROM public.invoice_lines WHERE id=$1',
            [l],
          )
        )[0].source_snapshot_json.r1bAttribution.tenantId,
      ).toBe(f.tenant);
    },
  );
  testCase(
    33,
    'DB namespace replaces forgery, JSON arrays rejected',
    async (q) => {
      const f = await seed(q);
      const l = await line(q, f, {
        source_snapshot_json:
          '{"keep":"test","r1bAttribution":{"studentId":"FAKE"}}',
      });
      const snapshot = (
        await q.unsafe(
          'SELECT source_snapshot_json FROM public.invoice_lines WHERE id=$1',
          [l],
        )
      )[0].source_snapshot_json;
      expect(snapshot.keep).toBe('test');
      expect(snapshot.r1bAttribution.studentId).toBe(f.student);
      await rejected(
        q,
        "UPDATE public.invoice_lines SET source_snapshot_json='{}' WHERE id=$1",
        [l],
      );
      const g = await seed(q);
      await sqlstate(
        () => q.savepoint((tx) => line(tx, g, { source_snapshot_json: '[]' })),
        '23514',
      );
    },
  );
  testCase(
    34,
    'source/effect/audit failure rollback leaves no half state',
    async (q) => {
      const f = await seed(q);
      await sqlstate(
        () =>
          q.savepoint(async (tx) => {
            await enter(tx, f);
            await authorized(tx, f);
            await line(tx, f);
            await audit(tx, f, f.tenant);
            await tx.unsafe('SELECT 1/0');
          }),
        '22012',
      );
      expect(
        (
          await q.unsafe(
            'SELECT count(*)::int AS n FROM public.invoice_lines WHERE tenant_id=$1',
            [f.tenant],
          )
        )[0].n,
      ).toBe(0);
      expect(
        (
          await q.unsafe(
            'SELECT count(*)::int AS n FROM public.audit_logs WHERE tenant_id=$1',
            [f.tenant],
          )
        )[0].n,
      ).toBe(0);
    },
  );
  it('R1B-T35: adapter withholds COMMIT result; receipt lookup/replay stays single', async () => {
    const f = await observer.begin((tx) => seed(tx));
    const operationKey = id(),
      hash = 'fixed-accepted-test-intent';
    const a = client();
    await a.unsafe('BEGIN');
    await enter(a, f);
    await authorized(a, f);
    const l = await line(a, f);
    await put(a, 'idempotency_records', {
      tenant_id: f.tenant,
      operation_type: 'R1B_FIXTURE_LINE',
      idempotency_key: operationKey,
      request_hash: hash,
      status: 'COMPLETED',
      result_ref_type: 'InvoiceLine',
      result_ref_id: l,
    });
    await audit(a, f, l);
    await a.unsafe('COMMIT');
    // The adapter discards the known server reply, then disconnects. This tests
    // reconciliation after reply loss, not a claim to simulate every TCP window.
    await a.end({ timeout: 1 });
    await observer.begin(async (tx) => {
      await enter(tx, f);
      await authorized(tx, f);
      const receipt = (
        await tx.unsafe(
          'SELECT request_hash,result_ref_id FROM public.idempotency_records WHERE tenant_id=$1 AND idempotency_key=$2',
          [f.tenant, operationKey],
        )
      )[0];
      expect(receipt.request_hash).toBe(hash);
      expect(receipt.result_ref_id).toBe(l);
      expect(
        (
          await tx.unsafe(
            'SELECT count(*)::int AS n FROM public.invoice_lines WHERE tenant_id=$1',
            [f.tenant],
          )
        )[0].n,
      ).toBe(1);
      expect(
        (
          await tx.unsafe(
            'SELECT count(*)::int AS n FROM public.audit_logs WHERE tenant_id=$1',
            [f.tenant],
          )
        )[0].n,
      ).toBe(1);
    });
  });
  testCase(
    36,
    'fresh database has two completed Prisma migrations and marker',
    async (q) => {
      const rows = await q.unsafe(
        'SELECT migration_name,finished_at,rolled_back_at FROM public._prisma_migrations ORDER BY migration_name',
      );
      expect(rows.map((r) => r.migration_name)).toEqual(
        readdirSync(resolve('prisma/migrations'))
          .filter((n) => /^\d{12}_/.test(n))
          .sort(),
      );
      expect(rows.every((r) => r.finished_at && !r.rolled_back_at)).toBe(true);
      const tables = await q.unsafe(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
      );
      const modelCount = (
        readFileSync(resolve('prisma/schema.prisma'), 'utf8').match(
          /^model /gm,
        ) ?? []
      ).length;
      expect(tables).toHaveLength(modelCount + 1); // domain tables + Prisma history
    },
  );
  it.skip('R1B-T37: populated legacy timezone adoption requires reviewed per-target evidence/migration', () => {});
  testCase(
    38,
    'legacy adoption preflight is fail-closed and data is not repaired',
    async (q) => {
      expect(evidence.legacyUpgradeRefused).toBe(true);
      const f = await seed(q);
      const l = await line(q, f);
      await issued(q, f, l);
      const before = (
        await q.unsafe(
          'SELECT source_snapshot_json FROM public.invoice_lines WHERE id=$1',
          [l],
        )
      )[0].source_snapshot_json;
      // Run the exact read-only blocker predicate used before any marker adoption.
      expect(
        (
          await q.unsafe(
            'SELECT EXISTS(SELECT FROM public.class_sessions) AS legacy',
          )
        )[0].legacy,
      ).toBe(true);
      const precheck = readFileSync(
        resolve('prisma/security/r1b-precheck.sql'),
        'utf8',
      );
      await q.unsafe(precheck).simple();
      expect(
        (
          await q.unsafe(
            'SELECT source_snapshot_json FROM public.invoice_lines WHERE id=$1',
            [l],
          )
        )[0].source_snapshot_json,
      ).toEqual(before);
    },
  );
  testCase(
    39,
    'actual injected migration failure rolled back then deploy succeeded',
    async (q) => {
      expect(evidence.faultRollback).toBe(true);
      expect(
        (
          await q.unsafe(
            'SELECT count(*)::int AS n FROM public._prisma_migrations WHERE finished_at IS NOT NULL',
          )
        )[0].n,
      ).toBe(
        readdirSync(resolve('prisma/migrations')).filter((n) =>
          /^\d{12}_/.test(n),
        ).length,
      );
    },
  );
  testCase(
    40,
    'catalog preserves R1a maps/actions and exactly 13 enabled guards',
    async (q) => {
      const triggers = await q.unsafe(
        "SELECT tgname,tgenabled FROM pg_catalog.pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'r1b_%'",
      );
      expect(triggers).toHaveLength(13);
      expect(triggers.every((t) => t.tgenabled === 'O')).toBe(true);
      const keys = await q.unsafe(
        "SELECT conname,confupdtype,confdeltype,confmatchtype FROM pg_catalog.pg_constraint WHERE conname IN ('il_invoice_student_fk','il_participant_student_fk','ar_participant_session_fk','ar_finalization_session_fk')",
      );
      expect(keys).toHaveLength(4);
      for (const k of keys) {
        expect(k.confupdtype).toBe('r');
        expect(k.confdeltype).toBe('r');
        expect(k.confmatchtype).toBe('s');
      }
      const check = await q.unsafe(
        "SELECT pg_get_constraintdef(oid) AS definition FROM pg_catalog.pg_constraint WHERE conname='bp_month_shape_ck'",
      );
      expect(check).toHaveLength(1);
      expect(check[0].definition).toContain('month_end');
      for (const name of [
        'inv_tenant_id_student_uq',
        'sp_tenant_session_student_id_uq',
        'af_tenant_session_id_uq',
        'ar_tenant_session_participant_uq',
        'ar_tenant_session_finalization_idx',
      ]) {
        expect(
          (
            await q.unsafe('SELECT to_regclass($1) AS object', [
              'public.' + name,
            ])
          )[0].object,
        ).not.toBeNull();
      }
    },
  );
  it.skip('R1B-T41: DEFERRED TO RUNTIME: real NestJS authenticated command paths', () => {});
  it.skip('R1B-T42: NOT RUN: independent backup/restore and tzdata-upgrade evidence needs tooling', () => {});
});
