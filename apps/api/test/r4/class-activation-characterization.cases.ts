import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import request from 'supertest';
import { expect, it } from 'vitest';
import { put, type Query } from '../schema-integrity/support.js';
import type { ProfileLinkContext } from './profile-link.cases.js';
import { browserAvailable } from './browser-auth.js';
import { withAcademicBrowser } from './browser-academic.js';

// Characterization only: no proposed activation policy, function or controller
// is installed. An initial ACTIVE fixture never proves an activation workflow.
export function registerClassActivationCharacterization(ctx: ProfileLinkContext & { password: () => string }) {
  const evidence: unknown[] = [];
  const record = (value: unknown) => {
    evidence.push(value);
    if (!process.env.R13_B12_EVIDENCE_DIR) return;
    const directory = resolve(process.env.R13_B12_EVIDENCE_DIR);
    if (!directory.startsWith(resolve('../..', '.local') + sep)) throw Error('LOCAL_EVIDENCE_REQUIRED');
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, 'activation-characterization.json'), JSON.stringify(evidence, null, 2));
  };
  const tables = ['classes', 'enrollments', 'class_teacher_assignments', 'class_sessions', 'session_participants',
    'attendance_records', 'attendance_finalizations', 'invoices', 'payments', 'grades', 'audit_logs', 'idempotency_records'] as const;
  const snapshot = async (tenant: string) => {
    const state: Record<string, { rows: number; digest: string }> = {};
    for (const table of tables) {
      // Only constant table names enter SQL; tenant remains a bound parameter.
      const [row] = await ctx.admin().unsafe<{ rows: number; digest: string }[]>(
        `SELECT count(*)::int rows,md5(COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]')) digest FROM public.${table} x WHERE tenant_id=$1`, [tenant]);
      state[table] = row;
    }
    return state;
  };

  it('B12 CA01 exact candidate activation route is absent, including concurrent requests; persisted sources unchanged', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/academic/classes/${f.classId}/activate`;
    const candidate = { expectedStatus: 'PLANNED', reason: 'B12 proposal characterization', confirmed: true };
    const before = await snapshot(f.tenant), key = randomUUID();
    const probes = [
      { label: 'candidate', body: candidate, key },
      { label: 'exact-repeat', body: candidate, key },
      { label: 'changed-intent', body: { ...candidate, reason: 'Different intent' }, key },
      { label: 'already-active-expected', body: { ...candidate, expectedStatus: 'ACTIVE' }, key },
      { label: 'missing-confirmation', body: { reason: candidate.reason, expectedStatus: 'PLANNED' }, key },
      { label: 'missing-reason', body: { confirmed: true, expectedStatus: 'PLANNED' }, key },
      { label: 'missing-key', body: candidate, key: '' },
      { label: 'body-tenant-override', body: { ...candidate, tenantId: randomUUID() }, key },
    ];
    for (const probe of probes) {
      const req = request(ctx.app().getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' });
      if (probe.key) req.set('Idempotency-Key', probe.key);
      await req.send(probe.body).expect(404);
    }
    await request(ctx.app().getHttpServer()).post(path).send(candidate).expect(404);
    await Promise.all([1, 2].map(() => request(ctx.app().getHttpServer()).post(path)
      .auth(manager.accessToken, { type: 'bearer' }).set('Idempotency-Key', randomUUID()).send(candidate).expect(404)));
    expect(await snapshot(f.tenant)).toEqual(before);
    record({ case: 'CA01', contract: 'NOT_IMPLEMENTED', route: path, probes: probes.map(p => p.label),
      concurrentHttpRequests: 2, status: 404, snapshot: before, businessStateUnchanged: true,
      limitation: '404 is absence characterization, not validation, authorization, replay or concurrency implementation proof' });
  });

  it('B12 CA02 existing class metadata update obeys CLASS scope and current grant revocation without status effects', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f);
    const base = `/api/v1/tenants/${f.tenant}`;
    const created = (await request(ctx.app().getHttpServer()).post(base + '/academic/catalog/classes')
      .auth(manager.accessToken, { type: 'bearer' }).send({ code: 'B12-SCOPE', name: 'Lớp dự kiến kiểm tra phạm vi',
        courseId: f.course, capacity: 3, reason: 'B12 existing metadata contract' }).expect(201)).body;
    const staff = await ctx.actor(f, 'ACADEMIC_STAFF', 'CLASS', created.id);
    const patch = (id: string, body: object) => request(ctx.app().getHttpServer()).patch(base + `/academic/catalog/classes/${id}`)
      .auth(staff.accessToken, { type: 'bearer' }).send(body);
    const body = { name: 'Lớp dự kiến đã cập nhật tên', reason: 'B12 scoped metadata update' };
    const before = await snapshot(f.tenant);
    await patch(f.classId, body).expect(403);
    expect(await snapshot(f.tenant)).toEqual(before);
    await patch(created.id, body).expect(200);
    const after = await snapshot(f.tenant);
    expect(after.audit_logs.rows).toBe(before.audit_logs.rows + 1);
    for (const table of tables.filter(t => !['classes', 'audit_logs'].includes(t))) expect(after[table]).toEqual(before[table]);
    expect((await ctx.admin()`SELECT status,name FROM classes WHERE tenant_id=${f.tenant} AND id=${created.id}`)[0])
      .toEqual({ status: 'PLANNED', name: body.name });
    await ctx.admin()`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${staff.assignment}`;
    await patch(created.id, { ...body, name: 'Not authorized after revocation' }).expect(403);
    expect(await snapshot(f.tenant)).toEqual(after);
    record({ case: 'CA02', existingOperation: 'CLASS_UPDATE_NAME_ONLY', exactClassScope: true,
      outOfScope: 403, revokedGrant: 403, auditDelta: 1, classStatus: 'PLANNED', otherSourcesUnchanged: true,
      limitation: 'Existing update authorization evidence only; activation authorization remains proposed' });
  });

  it('B12 CA03 creation guards are implemented, while teacher/enrollment/session requirements for activation remain undecided', async () => {
    const f = await ctx.fresh(), foreign = await ctx.fresh(), manager = await ctx.sessionFor(f);
    const path = `/api/v1/tenants/${f.tenant}/academic/catalog/classes`;
    const body = { code: 'B12-EMPTY', name: 'Lớp dự kiến chưa có học viên', courseId: f.course, capacity: 2,
      startDate: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10), reason: 'B12 existing class creation rules' };
    const create = (value: object) => request(ctx.app().getHttpServer()).post(path).auth(manager.accessToken, { type: 'bearer' }).send(value);
    const before = await snapshot(f.tenant);
    await create({ ...body, capacity: 0 }).expect(400);
    await create({ ...body, courseId: foreign.course }).expect(422);
    await create({ ...body, endDate: new Date().toISOString().slice(0, 10) }).expect(400);
    expect(await snapshot(f.tenant)).toEqual(before);
    const created = (await create(body).expect(201)).body;
    const [state] = await ctx.admin()`SELECT c.status,c.start_date::text,
      (SELECT count(*)::int FROM enrollments WHERE tenant_id=c.tenant_id AND class_id=c.id) enrollments,
      (SELECT count(*)::int FROM class_teacher_assignments WHERE tenant_id=c.tenant_id AND class_id=c.id) assignments,
      (SELECT count(*)::int FROM class_sessions WHERE tenant_id=c.tenant_id AND class_id=c.id) sessions
      FROM classes c WHERE c.tenant_id=${f.tenant} AND c.id=${created.id}`;
    expect(state).toEqual({ status: 'PLANNED', start_date: body.startDate, enrollments: 0, assignments: 0, sessions: 0 });
    record({ case: 'CA03', creationState: state, invalidCapacity: 400, foreignCourse: 422, invertedDates: 400,
      activationTeacherRule: 'OWNER_DECISION', activationEnrollmentRule: 'OWNER_DECISION', activationSessionRule: 'OWNER_DECISION',
      limitation: 'Creation guards and future date storage do not approve activation prerequisites or automatic activation' });
  });

  it.skipIf(!browserAvailable)('B12 CA04 native ACTIVE/PENDING enrollment and linked unassigned Teacher remain truthful in actual browser', async () => {
    const f = await ctx.fresh(), manager = await ctx.sessionFor(f), parent = await ctx.actor(f, 'PARENT', 'STUDENT', f.student2);
    const teacher = await ctx.actor(f, 'TEACHER', 'CLASS', f.class2);
    // Initial native fixtures only; no Class.status UPDATE or historical rewrite.
    await put(ctx.admin() as unknown as Query, 'teacher_profiles', { tenant_id: f.tenant, teacher_code: 'B12-UNASSIGNED',
      full_name: 'Giáo viên chưa phân công B12', status: 'ACTIVE', membership_id: teacher.member });
    await put(ctx.admin() as unknown as Query, 'enrollments', { tenant_id: f.tenant, class_id: f.class2, student_id: f.student2,
      status: 'PENDING', effective_from: new Date().toISOString(), created_by_membership_id: f.member });
    const base = `/api/v1/tenants/${f.tenant}`;
    const post = (suffix: string, body: object) => request(ctx.app().getHttpServer()).post(base + suffix)
      .auth(manager.accessToken, { type: 'bearer' }).send(body).expect(201);
    const link = await post('/parent-student-links', { parentMembershipId: parent.member, studentId: f.student2,
      evidenceReference: 'B12 native fixture only', reason: 'Verify synthetic Parent link' });
    await post(`/parent-student-links/${link.body.id}/verify`, { reason: 'B12 fixture verified' });
    await post('/academic/catalog/classes', { code: 'B12-PLANNED-BROWSER', name: 'Lớp dự kiến B12',
      courseId: f.course, capacity: 3, reason: 'Native browser class-list characterization; no activation' });
    const get = (suffix: string, token: string) => request(ctx.app().getHttpServer()).get(base + suffix).auth(token, { type: 'bearer' });
    expect((await get(`/portal/children/${f.student2}`, parent.accessToken).expect(200)).body.classes).toEqual([]);
    expect((await get('/portal/context', teacher.accessToken).expect(200)).body.teacher).toBeNull();
    await get('/portal/teacher-sessions', teacher.accessToken).expect(403);
    const before = await snapshot(f.tenant);
    await withAcademicBrowser(ctx.app(), async b => {
      await b.login(manager.email, ctx.password(), f.tenant);
      for (const [suffix, screen, text] of [
        ['/classes', 'AC07', 'Lớp dự kiến B12'], [`/classes/${f.class2}`, 'AC08', 'Class Two'],
        ['/overview', 'G01', 'Tổng quan'], ['/my/schedule', 'SC06', 'Lịch cá nhân'],
      ]) {
        await b.route(`/app/${f.tenant}${suffix}`);
        await b.wait(`document.querySelector('main')?.textContent.includes(${JSON.stringify(text)})
          && !document.body.textContent.includes('Đang tải') && !document.body.textContent.includes('Đang kiểm tra')`, 'B12_NATIVE_' + screen);
        await b.capture('B12-NATIVE-FIXTURE-MANAGER-' + screen);
      }
      await b.login(parent.email, ctx.password(), f.tenant); await b.route(`/app/${f.tenant}/parent/children/${f.student2}`);
      await b.wait(`document.body.textContent.includes('Chưa có lớp đang hoạt động trong phạm vi được cấp.')`, 'B12_PENDING_NOT_ACTIVE');
      await b.capture('B12-NATIVE-FIXTURE-PO04-ACTIVE-PENDING');
      await b.route(`/app/${f.tenant}/parent/children/${f.student}`);
      await b.wait(`document.body.textContent.includes('Không thể tải dữ liệu') && !document.body.textContent.includes('Student One')`, 'B12_OTHER_CHILD_DENIED');
      await b.capture('B12-NATIVE-FIXTURE-OTHER-CHILD-DENIED');
      await b.login(teacher.email, ctx.password(), f.tenant); await b.route(`/app/${f.tenant}/teacher`);
      await b.wait(`document.querySelector('.ec-error-card span')?.textContent==='403' && !document.body.textContent.includes('Buổi dạy hôm nay')`, 'B12_UNASSIGNED_TEACHER');
      await b.capture('B12-NATIVE-FIXTURE-PO01-UNASSIGNED-TEACHER');
      if (process.env.R13_B12_EVIDENCE_DIR) writeFileSync(resolve(process.env.R13_B12_EVIDENCE_DIR, 'browser-network.json'), JSON.stringify(b.network, null, 2));
    });
    // Browser login may audit authentication; academic/financial sources may not change.
    const after = await snapshot(f.tenant);
    for (const table of tables.filter(t => t !== 'audit_logs')) expect(after[table]).toEqual(before[table]);
    record({ case: 'CA04', source: 'INITIAL_NATIVE_FIXTURE_REAL_HTTP', classStatus: 'ACTIVE', enrollmentStatus: 'PENDING',
      parentActiveClasses: 0, linkedTeacherAssignments: 0, teacherContext: null, teacherSessions: 403, browser: 'PASS',
      activationWorkflowVerified: false, productionVisualChanges: 'NONE', academicSourcesUnchanged: true });
  }, 120_000);
}
