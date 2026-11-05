import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import request from 'supertest';
import { expect, it } from 'vitest';
import { put, type Query } from '../schema-integrity/support.js';
import type { ProfileLinkContext } from './profile-link.cases.js';
import { browserAvailable, until } from './browser-auth.js';
import { withAcademicBrowser } from './browser-academic.js';

type Context = ProfileLinkContext & { password: () => string };
export function registerClassLifecycleTests(ctx: Context) {
  const evidence: unknown[] = [];
  const record = (value: unknown) => {
    evidence.push(value);
    if (!process.env.R13_B11_NATIVE_EVIDENCE_DIR) return;
    const directory = resolve(process.env.R13_B11_NATIVE_EVIDENCE_DIR);
    if (!directory.startsWith(resolve('../..', '.local') + sep)) throw Error('LOCAL_EVIDENCE_REQUIRED');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'class-lifecycle.json'), JSON.stringify(evidence, null, 2));
  };
  const snapshot = async (tenant: string) => (await ctx.admin()`SELECT
    (SELECT count(*)::int FROM classes WHERE tenant_id=${tenant}) classes,
    (SELECT count(*)::int FROM enrollments WHERE tenant_id=${tenant}) enrollments,
    (SELECT count(*)::int FROM attendance_finalizations WHERE tenant_id=${tenant}) finalizations,
    (SELECT count(*)::int FROM invoices WHERE tenant_id=${tenant}) invoices,
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${tenant}) audits,
    (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${tenant}) receipts`)[0];
  it('B11 CL01 real commands allow ACTIVE enrollment in PLANNED class; confirm does not activate class', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f), parent = await ctx.actor(f, 'PARENT', 'STUDENT', f.student2);
    const base = `/api/v1/tenants/${f.tenant}`;
    const post = (suffix: string, body: object, key = randomUUID()) => request(ctx.app().getHttpServer()).post(base + suffix)
      .auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', key).send(body);
    const get = (suffix: string, token = manager.accessToken) => request(ctx.app().getHttpServer()).get(base + suffix).auth(token, { type: 'bearer' });
    const reason = 'B11 isolated lifecycle verification';
    const klass = (await post('/academic/catalog/classes', { code: 'B11-CMD', name: 'Lớp chưa khai giảng B11', courseId: f.course,
      capacity: 1, startDate: new Date().toISOString().slice(0, 10), reason }).expect(201)).body;
    const effective = new Date(Date.now() + 2_000).toISOString();
    const [course] = await ctx.admin()`SELECT subject_id,level_id FROM courses WHERE tenant_id=${f.tenant} AND id=${f.course}`;
    const body = { classId: klass.id, studentId: f.student2, effectiveFrom: effective, confirmed: true, reason,
      placement: { basis: 'STAFF_CONFIRMATION', subjectId: course.subject_id, levelId: course.level_id, reason } };
    const key = randomUUID(); const enrolled = (await post('/academic/enrollments', body, key).expect(201)).body;
    const afterEnrollment = await snapshot(f.tenant);
    expect((await post('/academic/enrollments', body, key).expect(201)).body).toEqual(enrolled);
    expect(await snapshot(f.tenant)).toEqual(afterEnrollment);
    await post('/academic/enrollments', { ...body, studentId: f.student }).expect(422);
    expect(await snapshot(f.tenant)).toEqual(afterEnrollment);
    await post('/academic/teacher-assignments', { classId: klass.id, teacherId: f.teacher, validFrom: effective, validTo: null, confirmed: true, reason }).expect(201);
    await until(() => Promise.resolve(Date.now() >= Date.parse(effective)), 'B11_REAL_EFFECTIVE_TIME');
    const link = (await post('/parent-student-links', { parentMembershipId: parent.member, studentId: f.student2, evidenceReference: 'B11 synthetic', reason }).expect(201)).body;
    await get(`/portal/children/${f.student2}`, parent.accessToken).expect(404);
    await post(`/parent-student-links/${link.id}/verify`, { reason }).expect(201);
    const room = (await post('/scheduling/rooms', { code: 'B11-ROOM', name: 'Phòng kiểm thử B11', capacity: 2, reason }).expect(201)).body;
    const startsAt = new Date(Date.now() + 3_600_000).toISOString(), endsAt = new Date(Date.now() + 5_400_000).toISOString();
    const sessionBody = { classId: klass.id, teacherId: f.teacher, roomId: room.id, deliveryMode: 'ONSITE', startsAt, endsAt, reason };
    const draft = (await post('/scheduling/sessions', sessionBody).expect(201)).body;
    const confirmKey = randomUUID(); const confirmed = (await post(`/scheduling/sessions/${draft.id}/confirm`, { reason }, confirmKey).expect(201)).body;
    const persisted = (await ctx.admin()`SELECT c.status class_status,e.status enrollment_status,cs.status session_status
      FROM classes c JOIN enrollments e ON e.tenant_id=c.tenant_id AND e.class_id=c.id JOIN class_sessions cs ON cs.tenant_id=c.tenant_id AND cs.class_id=c.id
      WHERE c.tenant_id=${f.tenant} AND c.id=${klass.id}`)[0];
    expect(persisted).toEqual({ class_status: 'PLANNED', enrollment_status: 'ACTIVE', session_status: 'CONFIRMED' });
    const effects = await snapshot(f.tenant);
    expect((await post(`/scheduling/sessions/${draft.id}/confirm`, { reason }, confirmKey).expect(201)).body).toEqual(confirmed);
    expect(await snapshot(f.tenant)).toEqual(effects);
    const child = (await get(`/portal/children/${f.student2}`, parent.accessToken).expect(200)).body;
    expect(child.classes).toEqual([]); expect(child.sessions.map((s: { id: string }) => s.id)).toContain(draft.id);
    const detail = (await get(`/academic/classes/${klass.id}`).expect(200)).body;
    expect(detail.status).toBe('PLANNED'); expect(detail.enrollments.some((e: { id: string }) => e.id === enrolled.id)).toBe(true);
    const list = (await get('/academic/classes').expect(200)).body;
    expect(list.items.find((c: { id: string }) => c.id === klass.id).enrollmentCount).toBe(1);
    const overview = (await get('/portal/overview').expect(200)).body;
    expect(Number(overview.classes)).toBe(2); // only the two original ACTIVE native fixtures
    const conflict = (await post('/scheduling/sessions', sessionBody).expect(201)).body;
    const beforeConflict = await snapshot(f.tenant);
    await post(`/scheduling/sessions/${conflict.id}/confirm`, { reason }).expect(409);
    expect(await snapshot(f.tenant)).toEqual(beforeConflict);
    expect((await ctx.admin()`SELECT status FROM class_sessions WHERE id=${conflict.id}`)[0].status).toBe('DRAFT');
    await post(`/parent-student-links/${link.id}/revoke`, { reason }).expect(201);
    await get(`/portal/children/${f.student2}`, parent.accessToken).expect(404);
    record({ case: 'CL01', persisted, childClasses: child.classes, classCount: overview.classes, enrollmentCount: 1,
      capacity: '422_NO_SECOND_ENROLLMENT', conflict: '409_DRAFT_RETAINED', effects, replay: 'NO_ADDITIONAL_EFFECTS' });
  });

  it('B11 CL02 initial-state native fixtures distinguish class state, enrollment state, multiple classes and expired intervals', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f), parent = await ctx.actor(f, 'PARENT', 'STUDENT', f.student2);
    const base = `/api/v1/tenants/${f.tenant}`;
    const post = (suffix: string, body: object) => request(ctx.app().getHttpServer()).post(base + suffix).auth(manager.accessToken, { type: 'bearer' }).send(body).expect(201);
    const link = await post('/parent-student-links', { parentMembershipId: parent.member, studentId: f.student2, evidenceReference: 'B11 native fixture', reason: 'B11 fixture' });
    await post(`/parent-student-links/${link.body.id}/verify`, { reason: 'B11 fixture' });
    const expected: string[] = [], matrix: unknown[] = [];
    // Initial INSERT fixtures only. No existing Class.status UPDATE, transition,
    // fake receipt or successful production activation is fabricated here.
    for (const [classStatus, enrollmentStatus] of [['ACTIVE', 'ACTIVE'], ['PLANNED', 'ACTIVE'], ['ACTIVE', 'PENDING'],
      ['ACTIVE', 'SUSPENDED'], ['ACTIVE', 'WITHDRAWN'], ['ACTIVE', 'COMPLETED'], ['ACTIVE', 'TRANSFERRED'],
      ['COMPLETED', 'ACTIVE'], ['ARCHIVED', 'ACTIVE'], ['CANCELLED', 'ACTIVE'], ['ACTIVE', 'ACTIVE']]) {
      const klass = await put(ctx.admin() as unknown as Query, 'classes', { tenant_id: f.tenant, code: randomUUID(),
        name: `B11 fixture ${classStatus} ${enrollmentStatus}`, course_id: f.course, capacity: 5, status: classStatus });
      await put(ctx.admin() as unknown as Query, 'enrollments', { tenant_id: f.tenant, class_id: klass, student_id: f.student2,
        status: enrollmentStatus, effective_from: new Date().toISOString(), created_by_membership_id: f.member });
      if (classStatus === 'ACTIVE' && enrollmentStatus === 'ACTIVE') expected.push(klass);
      matrix.push({ classStatus, enrollmentStatus, expectedActiveClass: classStatus === 'ACTIVE' && enrollmentStatus === 'ACTIVE',
        storageProbeOnly: classStatus === 'CANCELLED' });
    }
    const historical = await put(ctx.admin() as unknown as Query, 'classes', { tenant_id: f.tenant, code: randomUUID(), name: 'B11 interval fixture', course_id: f.course, capacity: 5, status: 'ACTIVE' });
    const end = new Date(Date.now() + 800).toISOString();
    await put(ctx.admin() as unknown as Query, 'enrollments', { tenant_id: f.tenant, class_id: historical, student_id: f.student2,
      status: 'ACTIVE', effective_from: new Date().toISOString(), effective_to: end, created_by_membership_id: f.member });
    await until(() => Promise.resolve(Date.now() > Date.parse(end)), 'B11_REAL_INTERVAL_EXPIRY');
    const before = await snapshot(f.tenant);
    const response = await request(ctx.app().getHttpServer()).get(base + `/portal/children/${f.student2}`).auth(parent.accessToken, { type: 'bearer' }).expect(200);
    expect(response.body.classes.map((c: { id: string }) => c.id).sort()).toEqual(expected.sort());
    expect(await snapshot(f.tenant)).toEqual(before);
    await request(ctx.app().getHttpServer()).get(base + `/portal/children/${f.student}`).auth(parent.accessToken, { type: 'bearer' }).expect(404);
    const foreign = await ctx.fresh();
    await request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${foreign.tenant}/portal/children/${f.student2}`).auth(parent.accessToken, { type: 'bearer' }).expect(403);
    record({ case: 'CL02', fixtureOnly: true, noStateUpdates: true, matrix, activeClasses: expected.length, expiredIntervalExcluded: true, before });
  });

  it('B11 CL03 class status transport and raw runtime mutation stay forbidden; no side effects', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f), parent = await ctx.actor(f, 'PARENT', 'STUDENT', f.student);
    const path = `/api/v1/tenants/${f.tenant}/academic/catalog/classes/${f.classId}`;
    const before = await snapshot(f.tenant);
    for (const token of [manager.accessToken, parent.accessToken]) {
      await request(ctx.app().getHttpServer()).patch(path).auth(token, { type: 'bearer' }).send({ name: 'B11', status: 'ACTIVE', reason: 'B11' }).expect(400);
      await request(ctx.app().getHttpServer()).post(path + '/activate').auth(token, { type: 'bearer' }).send({ confirmed: true, reason: 'B11' }).expect(404);
    }
    const restricted = (await ctx.repository().api.$queryRawUnsafe<{ permitted: boolean }[]>(
      "SELECT has_column_privilege(session_user,'public.classes','status','UPDATE') permitted"))[0];
    expect(restricted.permitted).toBe(false);
    expect(await snapshot(f.tenant)).toEqual(before);
    record({ case: 'CL03', patchExtraStatus: 400, missingActivationTransport: 404, runtimeStatusUpdate: false, sideEffects: 'NONE' });
  });

  it.skipIf(!browserAvailable)('B11 CL04 ACTIVE class read path is visible in real browser using an initial native fixture (not activation proof)', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f), parent = await ctx.actor(f, 'PARENT', 'STUDENT', f.student2);
    const base = `/api/v1/tenants/${f.tenant}`;
    await request(ctx.app().getHttpServer()).patch(base + `/academic/catalog/classes/${f.class2}`).auth(manager.accessToken, { type: 'bearer' })
      .send({ name: 'Lớp kiểm thử đang hoạt động B11', reason: 'Readable native fixture name; status unchanged' }).expect(200);
    const future = new Date(Date.now() + 1_000).toISOString();
    const [course] = await ctx.admin()`SELECT subject_id,level_id FROM courses WHERE tenant_id=${f.tenant} AND id=${f.course}`;
    await request(ctx.app().getHttpServer()).post(base + '/academic/enrollments').auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID())
      .send({ classId: f.class2, studentId: f.student2, effectiveFrom: future, confirmed: true, reason: 'B11 native existing ACTIVE fixture',
        placement: { basis: 'STAFF_CONFIRMATION', subjectId: course.subject_id, levelId: course.level_id, reason: 'B11' } }).expect(201);
    await until(() => Promise.resolve(Date.now() >= Date.parse(future)), 'B11_FIXTURE_EFFECTIVE');
    const created = await request(ctx.app().getHttpServer()).post(base + '/parent-student-links').auth(manager.accessToken, { type: 'bearer' })
      .send({ parentMembershipId: parent.member, studentId: f.student2, evidenceReference: 'Native fixture only', reason: 'B11' }).expect(201);
    await request(ctx.app().getHttpServer()).post(base + `/parent-student-links/${created.body.id}/verify`).auth(manager.accessToken, { type: 'bearer' }).send({ reason: 'B11' }).expect(201);
    await withAcademicBrowser(ctx.app(), async b => {
      await b.login(parent.email, ctx.password(), f.tenant); await b.route(`/app/${f.tenant}/parent/children/${f.student2}`);
      await b.wait(`document.querySelector('.portal-list')?.textContent.includes('Lớp kiểm thử đang hoạt động B11')`, 'B11_ACTIVE_FIXTURE_VISIBLE');
      await b.capture('B11-NATIVE-FIXTURE-PO04-ACTIVE');
    });
    record({ case: 'CL04', source: 'EXISTING_INITIAL_NATIVE_ACTIVE_FIXTURE_REAL_HTTP', activationWorkflowVerified: false, statusUnchanged: 'ACTIVE', browser: 'PASS' });
  }, 120_000);
}
