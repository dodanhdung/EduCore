import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import postgres from 'postgres';
import request from 'supertest';
import { expect, it } from 'vitest';
import { put, waitBlocked, type Query } from '../schema-integrity/support.js';
import type { ProfileLinkContext } from './profile-link.cases.js';
import { until } from './browser-auth.js';

export function registerClassActivationTests(ctx: ProfileLinkContext) {
  const records: unknown[] = [];
  const record = (item: unknown) => {
    records.push(item);
    if (!process.env.R13_B13_EVIDENCE_DIR) return;
    const dir = resolve(process.env.R13_B13_EVIDENCE_DIR);
    if (!dir.startsWith(resolve('../..', '.local') + sep)) throw Error('LOCAL_EVIDENCE_REQUIRED');
    mkdirSync(dir, { recursive: true }); writeFileSync(resolve(dir, 'activation.json'), JSON.stringify(records, null, 2));
  };
  const input = () => ({ expectedStatus: 'PLANNED', confirmed: true, reason: 'B13 isolated activation verification' });
  const state = async (t: string, c: string) => (await ctx.admin()`SELECT
    (SELECT status FROM classes WHERE tenant_id=${t} AND id=${c}) status,
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${t} AND event_type='CLASS_ACTIVATED') audits,
    (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${t} AND operation_type='R13:CLASS_ACTIVATE') receipts,
    (SELECT count(*)::int FROM attendance_finalizations WHERE tenant_id=${t}) finalizations,
    (SELECT count(*)::int FROM invoices WHERE tenant_id=${t}) invoices,
    (SELECT count(*)::int FROM payments WHERE tenant_id=${t}) payments,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM enrollments x WHERE tenant_id=${t}) enrollmentDigest,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM class_teacher_assignments x WHERE tenant_id=${t}) assignmentDigest,
    (SELECT md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) FROM class_sessions x WHERE tenant_id=${t}) sessionDigest`)[0];
  const setup = async (teacher = true, enrollment = true, future = false, capacity = 1) => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f), base = `/api/v1/tenants/${f.tenant}`;
    const post = (suffix: string, body: object, key = randomUUID()) => request(ctx.app().getHttpServer()).post(base + suffix)
      .auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
    const c = (await post('/academic/catalog/classes', { code: randomUUID(), name: 'Lớp kích hoạt B13', courseId: f.course,
      capacity, startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), reason: input().reason }).expect(201)).body.id as string;
    const from = new Date(Date.now() + (future ? 60_000 : 700)).toISOString();
    let assignment: string | undefined, enrolled: string | undefined;
    if (teacher) assignment = (await post('/academic/teacher-assignments', { classId: c, teacherId: f.teacher, validFrom: from,
      validTo: null, confirmed: true, reason: input().reason }).expect(201)).body.id;
    if (enrollment) {
      const [course] = await ctx.admin()`SELECT subject_id,level_id FROM courses WHERE tenant_id=${f.tenant} AND id=${f.course}`;
      enrolled = (await post('/academic/enrollments', { classId: c, studentId: f.student2, effectiveFrom: from, confirmed: true,
        reason: input().reason, placement: { basis: 'STAFF_CONFIRMATION', subjectId: course.subject_id, levelId: course.level_id, reason: input().reason } }).expect(201)).body.id;
    }
    if (!future) await until(() => Promise.resolve(Date.now() >= Date.parse(from)), 'B13_REAL_EFFECTIVE_CLOCK');
    const path = base + `/academic/classes/${c}/activate`;
    const activate = (body: object = input(), key = randomUUID(), token = manager.accessToken) => request(ctx.app().getHttpServer())
      .post(path).auth(token, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
    return { f, c, manager, post, path, activate, assignment, enrolled };
  };
  const connections = () => [postgres(ctx.apiUrl(), { max: 1, onnotice: () => undefined }), postgres(ctx.apiUrl(), { max: 1, onnotice: () => undefined })];
  const sql = (q: postgres.Sql, t: string, c: string, key: string) => q`SELECT educore_r4.class_activate(${t},${c},${JSON.stringify({ ...input(), key })}::text::jsonb) result`;

  it('B13 A01 Manager activates with one current Teacher and enrollment, no sessions, atomic audit/receipt and exact replay', async () => {
    const s = await setup(), before = await state(s.f.tenant, s.c), key = randomUUID(), correlation = randomUUID();
    expect((await ctx.admin()`SELECT count(*)::int n FROM class_sessions WHERE tenant_id=${s.f.tenant} AND class_id=${s.c}`)[0].n).toBe(0);
    const response = await s.activate(input(), key).set('X-Correlation-ID', correlation).expect(201);
    expect(response.body).toMatchObject({ id: s.c, tenantId: s.f.tenant, previousStatus: 'PLANNED', status: 'ACTIVE' });
    expect(Number.isFinite(Date.parse(response.body.activatedAt))).toBe(true);
    const after = await state(s.f.tenant, s.c);
    expect(after).toEqual({ ...before, status: 'ACTIVE', audits: 1, receipts: 1 });
    expect((await s.activate(input(), key).expect(201)).body).toEqual(response.body);
    await s.activate({ ...input(), reason: 'Changed intent' }, key).expect(409);
    await s.activate().expect(409);
    expect(await state(s.f.tenant, s.c)).toEqual(after);
    const [audit] = await ctx.admin()`SELECT actor_membership_id,reason,policy_version_id,correlation_id,after_json FROM audit_logs
      WHERE tenant_id=${s.f.tenant} AND event_type='CLASS_ACTIVATED'`;
    expect(audit).toMatchObject({ actor_membership_id: s.f.member, reason: input().reason, policy_version_id: response.body.policyVersionId,
      correlation_id: response.body.correlationId, after_json: { previousStatus: 'PLANNED', status: 'ACTIVE', classId: s.c } });
    const detail = await request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${s.f.tenant}/academic/classes/${s.c}`)
      .auth(s.manager.accessToken, { type: 'bearer' }).expect(200);
    expect(detail.body.status).toBe('ACTIVE');
    record({ case: 'A01', before, after, response: response.body, noSessionsRequired: true, replay: 'EXACT', audit: 'VERIFIED' });
  });

  it('B13 A02 current CLASS-scoped Academic Staff may activate; missing permission, wrong resource and replay revoke deny', async () => {
    const s = await setup(), staff = await ctx.actor(s.f, 'ACADEMIC_STAFF', 'CLASS', s.c),
      wrong = await ctx.actor(s.f, 'ACADEMIC_STAFF', 'CLASS', s.f.classId), parent = await ctx.actor(s.f, 'PARENT', 'STUDENT', s.f.student2);
    const before = await state(s.f.tenant, s.c);
    await s.activate(input(), randomUUID(), wrong.accessToken).expect(403);
    await s.activate(input(), randomUUID(), parent.accessToken).expect(403);
    expect(await state(s.f.tenant, s.c)).toEqual(before);
    const key = randomUUID(); await s.activate(input(), key, staff.accessToken).expect(201);
    await ctx.admin()`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${staff.assignment}`;
    await s.activate(input(), key, staff.accessToken).expect(403);
    expect(await state(s.f.tenant, s.c)).toEqual({ ...before, status: 'ACTIVE', audits: 1, receipts: 1 });
  });

  for (const [label, teacher, enrollment, future] of [['no Teacher', false, true, false], ['no enrollment', true, false, false],
    ['future-only prerequisites', true, true, true]] as const) it(`B13 A03 rejects ${label} with no success effects`, async () => {
    const s = await setup(teacher, enrollment, future), before = await state(s.f.tenant, s.c);
    await s.activate().expect(422); expect(await state(s.f.tenant, s.c)).toEqual(before);
  });

  it('B13 A04 strict HTTP, nonexistent/cross-tenant target and inactive tenant preserve state', async () => {
    const s = await setup(), foreign = await ctx.fresh(), before = await state(s.f.tenant, s.c);
    await request(ctx.app().getHttpServer()).post(s.path).send(input()).expect(401);
    await request(ctx.app().getHttpServer()).post(s.path).auth(s.manager.accessToken, { type: 'bearer' }).send(input()).expect(400);
    for (const bad of [{ ...input(), confirmed: false }, { ...input(), reason: '' }, { ...input(), reason: 'x'.repeat(2001) },
      { ...input(), expectedStatus: 'ACTIVE' }, { ...input(), actorId: s.f.member }, { ...input(), activatedAt: new Date().toISOString() }]) await s.activate(bad).expect(400);
    for (const c of [randomUUID(), foreign.classId]) await request(ctx.app().getHttpServer()).post(`/api/v1/tenants/${s.f.tenant}/academic/classes/${c}/activate`)
      .auth(s.manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID()).send(input()).expect(404);
    await request(ctx.app().getHttpServer()).post(s.path.replace(s.f.tenant, foreign.tenant)).auth(s.manager.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID()).send(input()).expect(403);
    await ctx.admin()`UPDATE tenants SET status='SUSPENDED' WHERE id=${s.f.tenant}`;
    await s.activate().expect(403);
    expect(await state(s.f.tenant, s.c)).toEqual(before);
  });

  for (const kind of ['teacher-expired', 'teacher-inactive', 'student-inactive', 'withdrawn', 'enrollment-future', 'catalog-inactive', 'level-inactive', 'inverted-dates'] as const)
    it(`B13 A05 rejects ${kind}; class remains PLANNED`, async () => {
      const s = await setup();
      if (kind === 'teacher-expired') await ctx.admin()`UPDATE class_teacher_assignments SET valid_to=clock_timestamp() WHERE id=${s.assignment!}`;
      if (kind === 'teacher-inactive') await ctx.admin()`UPDATE teacher_profiles SET status='INACTIVE' WHERE id=${s.f.teacher}`;
      if (kind === 'student-inactive') await ctx.admin()`UPDATE student_profiles SET status='INACTIVE' WHERE id=${s.f.student2}`;
      if (kind === 'withdrawn') await ctx.admin()`UPDATE enrollments SET status='WITHDRAWN' WHERE id=${s.enrolled!}`;
      if (kind === 'enrollment-future') await ctx.admin()`UPDATE enrollments SET effective_from=clock_timestamp()+interval '1 minute' WHERE id=${s.enrolled!}`;
      if (kind === 'catalog-inactive') await ctx.admin()`UPDATE courses SET status='INACTIVE' WHERE id=${s.f.course}`;
      if (kind === 'level-inactive') await ctx.admin()`UPDATE levels SET active=false WHERE id=(SELECT level_id FROM courses WHERE id=${s.f.course})`;
      if (kind === 'inverted-dates') await ctx.admin()`UPDATE classes SET start_date=CURRENT_DATE+3,end_date=CURRENT_DATE+2 WHERE id=${s.c}`;
      // Deliberately invalid synthetic prerequisites only. Never SQL-update
      // Class.status; these changes do not assert a new production writer API.
      const before = await state(s.f.tenant, s.c); await s.activate().expect(422);
      expect(await state(s.f.tenant, s.c)).toEqual(before);
    });

  it('B13 A06 detects inconsistent capacity inside a deferred synthetic transaction and rolls back all effects', async () => {
    const s = await setup(), before = await state(s.f.tenant, s.c);
    await expect(ctx.admin().begin(async tx => {
      await tx`SELECT educore_r4.bind(${s.manager.accessToken})`;
      await tx`SELECT educore_r3.principal(${s.f.tenant})`;
      await put(tx as unknown as Query, 'enrollments', { tenant_id: s.f.tenant, class_id: s.c, student_id: s.f.student,
        status: 'ACTIVE', effective_from: new Date().toISOString(), created_by_membership_id: s.f.member });
      await tx`SELECT educore_r4.class_activate(${s.f.tenant},${s.c},${JSON.stringify({ ...input(), key: randomUUID() })}::text::jsonb)`;
    })).rejects.toMatchObject({ code: '23514' });
    expect(await state(s.f.tenant, s.c)).toEqual(before);
  });

  it('B13 A07 multiple current ACTIVE enrollments are eligible within capacity', async () => {
    const s = await setup(true, true, false, 2), from = new Date(Date.now() + 700).toISOString();
    const [course] = await ctx.admin()`SELECT subject_id,level_id FROM courses WHERE id=${s.f.course}`;
    await s.post('/academic/enrollments', { classId: s.c, studentId: s.f.student, effectiveFrom: from, confirmed: true, reason: input().reason,
      placement: { basis: 'STAFF_CONFIRMATION', subjectId: course.subject_id, levelId: course.level_id, reason: input().reason } }).expect(201);
    await until(() => Promise.resolve(Date.now() >= Date.parse(from)), 'B13_MULTIPLE_REAL_EFFECTIVE_TIME');
    await s.activate().expect(201);
    expect((await ctx.admin()`SELECT count(*)::int n FROM enrollments WHERE class_id=${s.c} AND status='ACTIVE'`)[0].n).toBe(2);
  });

  for (const sameKey of [false, true]) it(`B13 C01 independent actors serialize competing activation (${sameKey ? 'same' : 'different'} key); one effect`, async () => {
    const s = await setup(), other = await ctx.actor(s.f, 'ACADEMIC_STAFF', 'CLASS', s.c), [a, b] = connections();
    try {
      await a`BEGIN`; await b`BEGIN`; await a`SELECT educore_r4.bind(${s.manager.accessToken})`; await b`SELECT educore_r4.bind(${other.accessToken})`;
      const apid = (await a`SELECT pg_backend_pid() pid`)[0].pid as number, bpid = (await b`SELECT pg_backend_pid() pid`)[0].pid as number;
      const key = randomUUID(), first = (await sql(a, s.f.tenant, s.c, key))[0].result;
      const pending = sql(b, s.f.tenant, s.c, sameKey ? key : randomUUID()).then(rows => ({ code: 'SUCCESS', result: rows[0].result }))
        .catch((e: { code: string }) => ({ code: e.code, result: undefined }));
      await waitBlocked(ctx.admin(), bpid, apid); await a`COMMIT`;
      const second = await pending;
      expect(second.code).toBe(sameKey ? 'SUCCESS' : '40001');
      if (sameKey) { expect(second.result).toEqual(first); await b`COMMIT`; } else await b`ROLLBACK`;
      expect((await s.activate(input(), key).expect(201)).body).toEqual(first);
      expect(await state(s.f.tenant, s.c)).toMatchObject({ status: 'ACTIVE', audits: 1, receipts: 1 });
      record({ case: 'C01', sameKey, independentPids: [apid, bpid], observedWait: true, winner: 'ACTIVE', second: second.code, effects: 1 });
    } finally { await a`ROLLBACK`; await b`ROLLBACK`; await a.end(); await b.end(); }
  });

  for (const source of ['teacher', 'enrollment'] as const) for (const first of ['writer', 'activation'] as const)
    it(`B13 C02 ${source} change vs activation, ${first} commits first`, async () => {
      const s = await setup();
      const change = async (q: postgres.Sql) => {
        // Existing academic writer protocol, no invented revoke transport.
        await q`SELECT educore_r3.principal(${s.f.tenant})`;
        if (source === 'teacher') await q`UPDATE class_teacher_assignments SET valid_to=clock_timestamp() WHERE id=${s.assignment!}`;
        else await q`UPDATE enrollments SET status='WITHDRAWN' WHERE id=${s.enrolled!}`;
      };
      // DML is an isolated native operator writer; API credentials have no raw
      // UPDATE. Use admitted admin for that connection, preserving the protocol.
      const writer = ctx.admin();
      const api = postgres(ctx.apiUrl(), { max: 1, onnotice: () => undefined });
      const before = await state(s.f.tenant, s.c);
      let blockedActivation: Promise<string> | undefined;
      let observedPids: number[] = [];
      try {
        await api`BEGIN`; await api`SELECT educore_r4.bind(${s.manager.accessToken})`;
        await writer.begin(async tx => {
          await tx`SELECT educore_r4.bind(${s.manager.accessToken})`;
          const wpid = (await tx`SELECT pg_backend_pid() pid`)[0].pid as number, pid = (await api`SELECT pg_backend_pid() pid`)[0].pid as number;
          observedPids = [wpid, pid];
          if (first === 'writer') {
            await change(tx as unknown as postgres.Sql);
            blockedActivation = sql(api, s.f.tenant, s.c, randomUUID()).then(() => 'SUCCESS').catch((e: { code: string }) => e.code);
            await waitBlocked(tx as unknown as Query, pid, wpid);
          } else {
            await sql(api, s.f.tenant, s.c, randomUUID());
            const pending = change(tx as unknown as postgres.Sql);
            await waitBlocked(api, wpid, pid); await api`COMMIT`; await pending;
          }
        });
        if (first === 'writer') expect(await blockedActivation).toBe('23514');
      } finally { await api`ROLLBACK`; await api.end(); }
      expect(await state(s.f.tenant, s.c)).toMatchObject({ status: first === 'writer' ? 'PLANNED' : 'ACTIVE', audits: first === 'writer' ? 0 : 1,
        receipts: first === 'writer' ? 0 : 1, invoices: before.invoices, finalizations: before.finalizations });
      record({ case: 'C02', source, first, independentPids: observedPids, observedWait: true, status: first === 'writer' ? 'PLANNED' : 'ACTIVE' });
    });

  it('B13 C04 permission revocation commits before waiting activation; fresh authorization denies it', async () => {
    const s = await setup(), other = await ctx.actor(s.f, 'ACADEMIC_STAFF', 'CLASS', s.c), [a, b] = connections();
    const before = await state(s.f.tenant, s.c);
    try {
      await a`BEGIN`; await b`BEGIN`; await a`SELECT educore_r4.bind(${s.manager.accessToken})`; await b`SELECT educore_r4.bind(${other.accessToken})`;
      const apid = (await a`SELECT pg_backend_pid() pid`)[0].pid as number, bpid = (await b`SELECT pg_backend_pid() pid`)[0].pid as number;
      await a`SELECT educore_r4.iam(${s.f.tenant},${JSON.stringify({ operation: 'ROLE_REVOKE', id: other.member, assignmentId: other.assignment, reason: 'B13 current authority race' })}::text::jsonb)`;
      const pending = sql(b, s.f.tenant, s.c, randomUUID()).then(() => 'SUCCESS').catch((e: { code: string }) => e.code);
      await waitBlocked(ctx.admin(), bpid, apid); await a`COMMIT`; expect(await pending).toBe('42501'); await b`ROLLBACK`;
      expect(await state(s.f.tenant, s.c)).toEqual(before);
      record({ case: 'C04', observedWait: true, independentPids: [apid, bpid], denied: '42501', effects: 0 });
    } finally { await a`ROLLBACK`; await b`ROLLBACK`; await a.end(); await b.end(); }
  });

  it('B13 C03 injected failure after mutation/audit/receipt rolls the entire transaction back', async () => {
    const s = await setup(), before = await state(s.f.tenant, s.c);
    await expect(ctx.repository().transaction(s.manager.accessToken, async tx => {
      await tx.$queryRawUnsafe('SELECT educore_r4.class_activate($1::uuid,$2::uuid,$3::jsonb)', s.f.tenant, s.c, JSON.stringify({ ...input(), key: randomUUID() }));
      throw Error('B13_INJECTED_AFTER_ALL_EFFECTS');
    })).rejects.toThrow('B13_INJECTED_AFTER_ALL_EFFECTS');
    expect(await state(s.f.tenant, s.c)).toEqual(before);
  });

  it('B13 S01 secure function owner/search_path/ACL and restricted API table privileges', async () => {
    const [row] = await ctx.admin()`SELECT p.prosecdef,r.rolname,p.proconfig,
      has_function_privilege('educore_r4_api',p.oid,'EXECUTE') api,
      has_function_privilege('educore_r4_auth',p.oid,'EXECUTE') auth,
      has_function_privilege('educore_r4_worker',p.oid,'EXECUTE') worker,
      EXISTS(SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_execute,
      has_column_privilege('educore_r4_api','public.classes','status','UPDATE') direct_update
      FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='educore_r4.class_activate(uuid,uuid,jsonb)'::regprocedure`;
    expect(row).toMatchObject({ prosecdef: true, rolname: 'educore_r4_owner', api: true, auth: false, worker: false, public_execute: false, direct_update: false });
    expect(row.proconfig).toContain('search_path=pg_catalog, educore_r4, pg_temp'); record({ case: 'S01', acl: row });
  });

  it('B13 S02 direct restricted SQL rejects malformed commands before any effect', async () => {
    const s = await setup(), before = await state(s.f.tenant, s.c), q = postgres(ctx.apiUrl(), { max: 1, onnotice: () => undefined });
    try {
      for (const bad of [{ ...input(), key: randomUUID(), reason: ' '.repeat(2000) + 'x' },
        { ...input(), key: ' '.repeat(200) + 'x' }, { ...input(), key: randomUUID(), confirmed: 'true' },
        { ...input(), key: randomUUID(), permission: 'class.update' }, { ...input(), key: randomUUID(), expectedStatus: 'ACTIVE' }]) {
        await q`BEGIN`; await q`SELECT educore_r4.bind(${s.manager.accessToken})`;
        await expect(q`SELECT educore_r4.class_activate(${s.f.tenant},${s.c},${JSON.stringify(bad)}::text::jsonb)`).rejects.toMatchObject({ code: '22023' });
        await q`ROLLBACK`;
      }
    } finally { await q`ROLLBACK`; await q.end(); }
    expect(await state(s.f.tenant, s.c)).toEqual(before);
  });
}
