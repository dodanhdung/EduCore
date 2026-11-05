import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import postgres from 'postgres';
import request from 'supertest';
import { expect, it } from 'vitest';
import { browserAvailable, until } from './browser-auth.js';
import { withAcademicBrowser, type BrowserDriver } from './browser-academic.js';

type Context = { admin: () => postgres.Sql; app: () => INestApplication;
  operatorUrl: () => string; activationCode: (email: string) => string | undefined };
type Actor = { alias: string; email: string; name: string; role: string; scope: string;
  member: string; grant: string; token: string; profile?: string; classId?: string; navigation: string[] };

/** Opt-in real local rehearsal. Never uses fresh()/actor() password-hash fixtures.
 * Bootstrap is the existing restricted operator command; every cohort write is HTTP.
 * Passwords/codes/tokens remain process-local. Evidence is an explicit allowlist. */
export function registerB1Rehearsal(ctx: Context) {
  it.skipIf(process.env.R13_B1_LOCAL_REHEARSAL !== 'LOCAL_CAPTURE_ONLY')(
    'R13 B1 actual eight-account lifecycle and multi-role local browser rehearsal', async () => {
      if (process.env.R4_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER') throw Error('DISPOSABLE_REQUIRED');
      const target = new URL(process.env.R4_TEST_URL ?? '');
      if (target.hostname !== '127.0.0.1' || !/^\/educore_r4_native_[a-f0-9]{32}$/.test(target.pathname)
        || target.search || target.hash) throw Error('UNSAFE_B1_TARGET');
      if (!browserAvailable) throw Error('B1_BROWSER_REQUIRED');
      const root = resolve('../..', '.local');
      const directory = resolve(process.env.R13_B1_EVIDENCE_DIR ?? '');
      if (!directory.startsWith(root + sep)) throw Error('LOCAL_EVIDENCE_PATH_REQUIRED');
      mkdirSync(directory, { recursive: true });
      const run = randomUUID(), reason = 'R13 B1 synthetic local rehearsal';
      const password = 'Aa1!' + randomBytes(24).toString('base64url');
      const ledger: { method: string; path: string; status: number; expected: number; key?: string }[] = [];
      const checkpoints: string[] = [], blockers: string[] = [];
      const accounts: Actor[] = [];
      const save = (phase: string) => writeFileSync(resolve(directory, 'execution.json'), JSON.stringify({
        source: 'ISOLATED_PG16_REAL_NEST_HTTP_LOCAL_CAPTURE_REAL_BROWSER', run, phase,
        checkpoints, blockers, accounts: accounts.map(({ alias, name, role, scope, member, grant, profile, classId, navigation }) =>
          ({ alias, name, role, scope, member, grant, profile, classId, navigation })), ledger,
      }, null, 2));
      const call = async (method: 'get' | 'post', path: string, token = '', body?: unknown, expected = 200, key?: string, match?: number) => {
        let req = request(ctx.app().getHttpServer())[method](path);
        if (token) req = req.auth(token, { type: 'bearer' });
        if (key) req = req.set('Idempotency-Key', key);
        if (match !== undefined) req = req.set('If-Match', String(match));
        if (path === '/api/v1/auth/login') req = req.set('Origin', 'http://localhost:5173');
        if (body !== undefined) req = req.send(body);
        const response = await req;
        ledger.push({ method: method.toUpperCase(), path, status: response.status, expected, ...(key ? { key } : {}) });
        save('RUNNING');
        // Never interpolate response/request bodies into failures (login returns secrets).
        if (response.status !== expected) throw Error(`B1_HTTP_${method.toUpperCase()}_${path}_${response.status}_EXPECTED_${expected}`);
        return response.body;
      };
      const activate = async (email: string) => {
        await call('post', '/api/v1/auth/activation/otp/request', '', { email }, 202);
        const otp = ctx.activationCode(email);
        if (!otp || !/^\d{6}$/.test(otp)) throw Error('LOCAL_CAPTURE_CODE_MISSING');
        await call('post', '/api/v1/auth/activation/complete', '', { email, otp, newPassword: password }, 204);
      };
      const login = async (email: string, tenant: string) => {
        const auth = await call('post', '/api/v1/auth/login', '', { email, password });
        expect(auth.requiresTenantSelection).toBe(true);
        await call('get', '/api/v1/auth/me', auth.accessToken);
        const selected = await call('post', '/api/v1/auth/select-tenant', auth.accessToken, { tenantId: tenant });
        return selected.accessToken as string;
      };
      const operator = postgres(ctx.operatorUrl(), { max: 1, prepare: false, onnotice: () => undefined });
      try {
        const bootstrap = async (suffix: string) => {
          const address = `${suffix}-${run}@b1.invalid`;
          const [row] = await operator`SELECT educore_r4.bootstrap(${`B1-${suffix}-${run}`},${`EduCore B1 ${suffix}`},'Asia/Ho_Chi_Minh',${address},${`Quản lý ${suffix}`}) result`;
          const tenant = row.result.tenantId as string;
          await activate(address);
          return { tenant, email: address, token: await login(address, tenant) };
        };
        const manager = await bootstrap('demo');
        const tenant = manager.tenant, base = `/api/v1/tenants/${tenant}`;
        const post = (path: string, body: unknown, key?: string, token = manager.token, status = 201) =>
          call('post', base + path, token, body, status, key);
        const get = (path: string, token = manager.token, status = 200) => call('get', base + path, token, undefined, status);
        const subject = await post('/academic/catalog/subjects', { code: 'B1-TOAN', name: 'Toán tư duy', reason });
        const level = await post('/academic/catalog/levels', { code: 'B1-L6', name: 'Lớp 6', sortOrder: 6, reason });
        const course = await post('/academic/catalog/courses', { code: 'B1-TOAN6', name: 'Toán tư duy lớp 6', subjectId: subject.id, levelId: level.id, reason });
        const classes: string[] = [], teachers: string[] = [], students: string[] = [];
        for (const index of [1, 2]) {
          const klass = await post('/academic/catalog/classes', { code: `B1-C${index}`, name: `Toán 6 – Nhóm ${index}`, courseId: course.id,
            capacity: 12, startDate: new Date().toISOString().slice(0, 10), endDate: null, reason });
          classes.push(klass.id);
          teachers.push((await post('/academic/profiles/teachers', { code: `B1-T${index}`, name: `Giáo viên ${index === 1 ? 'Nguyễn Minh Anh' : 'Trần Thanh Bình'}`, contact: null, reason })).id);
          students.push((await post('/academic/profiles/students', { code: `B1-S${index}`, name: `Học sinh ${index === 1 ? 'Lê Khánh An' : 'Phạm Hải Đăng'}`, dateOfBirth: null, reason })).id);
        }
        const room = await post('/scheduling/rooms', { code: 'B1-P101', name: 'Phòng học 101', capacity: 24, reason }, `B1:${run}:room`);
        const roles = await ctx.admin()`SELECT id,code FROM roles WHERE tenant_id=${tenant} AND is_system_seeded`;
        const roleId = (code: string) => roles.find(row => row.code === code)!.id as string;
        const specs = [
          { alias: 'AS1', role: 'ACADEMIC_STAFF', scope: 'CLASS', classId: classes[0], name: 'Học vụ Nguyễn Thu Hà' },
          { alias: 'ACC1', role: 'ACCOUNTANT', scope: 'TENANT', name: 'Kế toán Vũ Ngọc Mai' },
          ...[0, 1].map(i => ({ alias: `T${i + 1}`, role: 'TEACHER', scope: 'CLASS', classId: classes[i], profile: teachers[i], name: `Giáo viên ${i + 1 === 1 ? 'Nguyễn Minh Anh' : 'Trần Thanh Bình'}` })),
          ...[0, 1].map(i => ({ alias: `S${i + 1}`, role: 'STUDENT', scope: 'STUDENT', profile: students[i], name: `Học sinh ${i === 0 ? 'Lê Khánh An' : 'Phạm Hải Đăng'}` })),
          ...[0, 1].map(i => ({ alias: `P${i + 1}`, role: 'PARENT', scope: 'STUDENT', profile: students[i], name: `Phụ huynh ${i === 0 ? 'Lê Minh Châu' : 'Phạm Thu Hương'}` })),
        ];
        const assign = async (a: Actor) => post(`/members/${a.member}/role-assignments`, { roleId: roleId(a.role), scopeKind: a.scope,
          ...(a.scope === 'CLASS' ? { classId: a.classId } : {}), ...(a.scope === 'STUDENT' ? { studentId: a.profile } : {}), reason });
        for (const spec of specs) {
          const email = `${spec.alias.toLowerCase()}-${run}@b1.invalid`;
          const member = await post('/members', { email, displayName: spec.name, reason });
          expect(member.status).toBe('PENDING_ACTIVATION');
          const a: Actor = { ...spec, email, member: member.id, grant: '', token: '', navigation: [] };
          a.grant = (await assign(a)).id;
          accounts.push(a);
          // P2 is activated through the browser AU06 below; all other accounts
          // traverse the same production HTTP request/complete endpoints here.
          if (a.alias !== 'P2') { await activate(email); a.token = await login(email, tenant); }
        }
        checkpoints.push('OP01_EIGHT_PENDING_MEMBERS_AND_EXACT_SEEDED_SCOPES');
        const validFrom = new Date(Date.now() + 15_000).toISOString();
        for (const i of [0, 1]) {
          await post('/academic/teacher-assignments', { classId: classes[i], teacherId: teachers[i], validFrom, validTo: null, confirmed: true, reason }, `B1:${run}:teacher:${i}`);
          await post('/academic/enrollments', { classId: classes[i], studentId: students[i], effectiveFrom: validFrom, confirmed: true, reason,
            placement: { basis: 'STAFF_CONFIRMATION', subjectId: subject.id, levelId: level.id, reason } }, `B1:${run}:enroll:${i}`);
          for (const [kind, profile, alias] of [['teachers', teachers[i], `T${i + 1}`], ['students', students[i], `S${i + 1}`]]) {
            const a = accounts.find(x => x.alias === alias)!;
            const key = `B1:${run}:link:${alias}`, body = { membershipId: a.member, expectedMembershipId: null, confirmed: true, reason };
            const linked = await post(`/academic/profiles/${kind}/${profile}/membership-link`, body, key, manager.token, 200);
            expect(await post(`/academic/profiles/${kind}/${profile}/membership-link`, body, key, manager.token, 200)).toEqual(linked);
          }
        }
        // Wait for actual time to reach the valid future-effective commands;
        // never backdate data or change the server clock/rules.
        await until(() => Promise.resolve(Date.now() >= Date.parse(validFrom)), 'B1_FUTURE_EFFECTIVE_COMMANDS_CURRENT');
        const sessions: string[] = [];
        for (const i of [0, 1]) {
          const startsAt = new Date(Date.now() + (i + 1) * 3_600_000).toISOString();
          const endsAt = new Date(Date.parse(startsAt) + 45 * 60_000).toISOString();
          const draft = await post('/scheduling/sessions', { classId: classes[i], teacherId: teachers[i], roomId: room.id,
            deliveryMode: 'ONSITE', startsAt, endsAt, reason }, `B1:${run}:session:${i}`);
          const preview = await get(`/scheduling/drafts/${draft.id}/preview`);
          writeFileSync(resolve(directory, `schedule-preview-${i}.json`), JSON.stringify(preview, null, 2));
          await post(`/scheduling/sessions/${draft.id}/confirm`, { reason }, `B1:${run}:confirm:${i}`);
          sessions.push(draft.id);
        }
        const assignments: string[] = [];
        for (const i of [0, 1]) {
          const teacher = accounts.find(a => a.alias === `T${i + 1}`)!;
          const draft = await post('/assignments', { classId: classes[i], title: `Bài luyện tập Toán 6 – Nhóm ${i + 1}`,
            description: 'Dữ liệu synthetic local: ôn tập phép tính và trình bày lời giải.', priority: 3,
            deadlineAt: new Date(Date.now() + 86_400_000).toISOString() }, `B1:${run}:assignment:${i}`, teacher.token);
          const id = draft.id;
          // Publishing an assignment (not a grade) uses the normal reviewed command.
          await call('post', base + `/assignments/${id}/publish`, teacher.token, {}, 201, `B1:${run}:publish:${i}`, draft.revision);
          assignments.push(id);
        }
        checkpoints.push('REAL_ACADEMIC_COMMANDS_TWO_CLASSES_TWO_ENROLLMENTS_TWO_CONFIRMED_SESSIONS_TWO_ASSIGNMENTS');
        const foreign = await bootstrap('isolation');
        const foreignStudent = await call('post', `/api/v1/tenants/${foreign.tenant}/academic/profiles/students`, foreign.token,
          { code: 'B1-FOREIGN', name: 'Học sinh tenant cách ly', reason }, 201);
        const by = (alias: string) => accounts.find(a => a.alias === alias)!;
        const links: string[] = [];
        const createRelationship = async (alias: string, studentId: string) => post('/parent-student-links', {
          parentMembershipId: by(alias).member, studentId, evidenceReference: `B1-${alias}-synthetic-consent`, reason });
        await withAcademicBrowser(ctx.app(), async b => {
          await b.navigate('/login'); await b.wait('!!document.querySelector("#login-email")', 'B1_AU01'); await b.capture('B1-AU01-login');
          await b.navigate('/activate-account'); await b.wait('!!document.querySelector("#activate-email")', 'B1_AU06');
          await b.capture('B1-AU06-empty');
          await b.fill('#activate-email', by('P2').email); await b.click('button.ec-inline-action');
          await until(() => Promise.resolve(!!ctx.activationCode(by('P2').email)), 'B1_CAPTURE_ACTIVATION');
          await b.fill('#activate-otp', ctx.activationCode(by('P2').email)!); await b.fill('#activate-password', password); await b.fill('#activate-confirm', password);
          await b.click('form button[type="submit"]');
          await b.wait('location.pathname==="/login" && !!document.querySelector("#login-email")', 'B1_AU06_SUCCESS');
          await b.capture('B1-AU06-success');
          by('P2').token = await login(by('P2').email, tenant);
          for (const i of [0, 1]) {
            const relation = await createRelationship(`P${i + 1}`, students[i]);
            await get(`/portal/children/${students[i]}`, by(`P${i + 1}`).token, 404);
            await post(`/parent-student-links/${relation.id}/verify`, { reason }); links.push(relation.id);
          }
          // P1 is STUDENT-scoped to S1, so a pending extra link to S2 must
          // remain inaccessible even before verification and after revocation.
          const pending = await createRelationship('P1', students[1]);
          await get(`/portal/children/${students[1]}`, by('P1').token, 404);
          await b.login(manager.email, password, tenant);
          await capturePage(b, tenant, '/settings/members', '[data-screen-id="OP01"]', 'B1-OP01-members');
          await b.evaluate(`document.querySelector('[data-screen-id="OP01"] tbody tr')?.scrollIntoView({block:'center'})`);
          await b.capture('B1-OP01-member-detail'); await b.evaluate('scrollTo(0,0)');
          await capturePage(b, tenant, `/settings/members/${by('T1').member}`, '[data-screen-id="OP02"]', 'B1-OP02-teacher-scope');
          await b.evaluate(`document.querySelector('[data-screen-id="OP02"] .mo-inset')?.scrollIntoView({block:'center'})`);
          await b.capture('B1-OP02-scope-detail'); await b.evaluate('scrollTo(0,0)');
          await capturePage(b, tenant, '/relationships', '[data-screen-id="OP03"]', 'B1-OP03-relationships');
          await b.wait(`document.querySelectorAll('[data-screen-id="OP03"] tbody tr').length===3`, 'B1_OP03_THREE_RELATIONSHIPS');
          await b.evaluate(`document.querySelector('[data-screen-id="OP03"] tbody tr')?.scrollIntoView({block:'center'})`);
          await b.capture('B1-OP03-relationship-detail'); await b.evaluate('scrollTo(0,0)');
          for (const a of accounts) {
            const nav = await get('/access/navigation', a.token); a.navigation = nav.screenIds;
            const me = await call('get', '/api/v1/auth/me', a.token);
            expect(JSON.stringify(me)).toContain(tenant);
            // All eight users must be unable to create an unrelated member.
            await call('post', base + '/members', a.token, { email: `denied-${run}@b1.invalid`, displayName: 'Denied', reason }, 403);
            await call('get', `/api/v1/tenants/${foreign.tenant}/portal/context`, a.token, undefined, 403);
          }
          for (const [alias, suffix, selector, label] of [
            ['T1', '/teacher', 'main h1', 'B1-PO01-teacher1'], ['T2', '/teacher', 'main h1', 'B1-PO01-teacher2'],
            ['S1', '/student', '.portal-page', 'B1-PO02-student1'], ['S2', '/student', '.portal-page', 'B1-PO02-student2'],
            ['P1', '/parent', '#portal-parent-child', 'B1-PO03-parent1'], ['P2', '/parent', '#portal-parent-child', 'B1-PO03-parent2'],
            ['AS1', '/notifications', '[data-screen-id="GL01"]', 'B1-academic-staff-landing'],
            ['ACC1', '/finance/receivables', '[data-screen-id="BL09"]', 'B1-accountant-finance'],
          ]) {
            await b.login(by(alias).email, password, tenant);
            await capturePage(b, tenant, suffix, selector, label);
            if (alias === 'T1' || alias === 'S1') await capturePage(b, tenant, '/my/schedule', 'main h1', `B1-SC06-${alias}`);
            if (alias === 'S1') {
              await capturePage(b, tenant, '/my/assignments', 'main h1', 'B1-AS06-assignments');
              await capturePage(b, tenant, `/my/assignments/${assignments[0]}`, 'main h1', 'B1-AS07-assignment');
            }
            if (alias === 'P1') {
              await capturePage(b, tenant, `/parent/children/${students[0]}`, '.portal-page', 'B1-PO04-child');
              await b.evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(x=>x.textContent==='Lịch học')?.click()`);
              await b.wait(`document.querySelector('.portal-list')?.textContent.includes('Toán 6 – Nhóm 1')`, 'B1_CHILD_SCHEDULE');
              await b.capture('B1-PO04-child-schedule');
              await b.evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(x=>x.textContent==='Bài tập & điểm')?.click()`);
              await b.wait(`document.querySelector('.portal-list')?.textContent.includes('Bài luyện tập')`, 'B1_CHILD_ASSIGNMENTS');
              await b.capture('B1-PO04-child-assignments');
              await capturePage(b, tenant, '/my/billing', '.portal-page', 'B1-PO05-billing');
              await capturePage(b, tenant, `/parent/children/${students[1]}`, 'main', 'B1-pending-relationship-denied');
            }
          }
          for (const i of [0, 1]) {
            const teacher = by(`T${i + 1}`), student = by(`S${i + 1}`);
            expect((await get('/portal/context', teacher.token)).teacher.id).toBe(teachers[i]);
            expect((await get('/portal/context', student.token)).student.id).toBe(students[i]);
            const own = JSON.stringify(await get('/my/assignments', student.token));
            expect(own).toContain(assignments[i]); expect(own).not.toContain(assignments[1 - i]);
            // SESSION reader intentionally conceals inaccessible IDs as 404.
            await get(`/scheduling/sessions/${sessions[1 - i]}`, teacher.token, 404);
            await get(`/portal/children/${students[1 - i]}`, student.token, 404);
            await get(`/portal/children/${foreignStudent.id}`, by(`P${i + 1}`).token, 404);
          }
          await b.login(by('S1').email, password, tenant);
          const paused = await b.deferResponse(base + '/portal/context');
          await b.route(`/app/${tenant}/student`); await paused.waitPaused(); await b.capture('B1-PO02-loading'); await paused.release();
          await b.wait(`document.querySelector('.portal-page')?.textContent.includes('Lê Khánh An')`, 'B1_LOADING_RESOLVED');
          await b.route(`/app/${foreign.tenant}/student`);
          await b.wait(`document.querySelector('.ec-error-card span')?.textContent==='403' && !document.body.textContent.includes('Lê Khánh An')`, 'B1_WRONG_TENANT_CLEARED');
          await b.capture('B1-cross-tenant-denied');
          await b.login(by('T2').email, password, tenant);
          await capturePage(b, tenant, '/teacher', 'main h1', 'B1-teacher-before-revoke');
          await post(`/members/${by('T2').member}/role-assignments/${by('T2').grant}/revoke`, { reason });
          await get('/portal/teacher-sessions', by('T2').token, 403);
          await b.route(`/app/${tenant}/me`); await b.route(`/app/${tenant}/teacher`);
          await b.wait(`!document.body.textContent.includes('Toán 6 – Nhóm 2') && document.body.textContent.includes('Không có quyền xem')`, 'B1_REVOKED_TEACHER_CLEAR');
          await b.capture('B1-teacher-revoked');
          by('T2').grant = (await assign(by('T2'))).id;
          await get('/portal/context', by('T2').token);
          await post(`/parent-student-links/${pending.id}/verify`, { reason });
          await get(`/portal/children/${students[1]}`, by('P1').token, 404); // exact scope still denies verified unrelated child
          await post(`/parent-student-links/${pending.id}/revoke`, { reason });
          await b.login(by('P1').email, password, tenant);
          await capturePage(b, tenant, `/parent/children/${students[1]}`, 'main', 'B1-parent-scope-denied');
          await get(`/portal/children/${students[1]}`, by('P1').token, 404);
          await get(`/portal/children/${students[0]}`, by('P1').token);
          // Unlike the unrelated-scope check above, P2 first has valid access.
          // Revoke a genuinely visible child, prove removal, then establish a
          // new reviewed relationship through OP03, preserving old history.
          await b.login(by('P2').email, password, tenant);
          await capturePage(b, tenant, `/parent/children/${students[1]}`, '.portal-page', 'B1-parent-before-revoke');
          await post(`/parent-student-links/${links[1]}/revoke`, { reason });
          await get(`/portal/children/${students[1]}`, by('P2').token, 404);
          await b.route(`/app/${tenant}/me`); await b.route(`/app/${tenant}/parent/children/${students[1]}`);
          await b.wait(`document.body.textContent.includes('Không thể tải dữ liệu') && !document.body.textContent.includes('Phạm Hải Đăng')`, 'B1_PARENT_REVOKED_CLEAR');
          await b.capture('B1-parent-revoked-child');
          const restored = await createRelationship('P2', students[1]);
          await post(`/parent-student-links/${restored.id}/verify`, { reason }); links[1] = restored.id;
          await get(`/portal/children/${students[1]}`, by('P2').token);
          // Capture AU02 without credentials in the DOM or URL.
          await b.navigate('/login'); await b.wait('!!document.querySelector("#login-email")', 'B1_AU02_LOGIN');
          await b.fill('#login-email', by('ACC1').email); await b.fill('#login-password', password); await b.click('form button[type="submit"]');
          await b.wait('location.pathname==="/select-tenant" && !!document.querySelector(".ec-tenant-choice")', 'B1_AU02');
          await b.capture('B1-AU02-tenant-selection');
          writeFileSync(resolve(directory, 'browser-network.json'), JSON.stringify(b.network, null, 2));
        });
        checkpoints.push('EIGHT_ACTIVATED_LOGIN_TENANT_SELECTED_NAVIGATION_VERIFIED', 'FOUR_LINKS_REPLAY_VERIFIED',
          'PARENT_PENDING_VERIFIED_REVOKED_FOREIGN_DENIALS', 'TEACHER_REVOKE_DENIED_AND_SAME_SCOPE_RESTORED',
          'REAL_BROWSER_DESKTOP_MOBILE_COMPLETE');
        for (const a of accounts) {
          const grants = await ctx.admin()`SELECT r.code,sc.scope_kind,sc.class_id,sc.student_id
            FROM membership_roles mr JOIN roles r ON r.tenant_id=mr.tenant_id AND r.id=mr.role_id
            JOIN access_scopes sc ON sc.tenant_id=mr.tenant_id AND sc.membership_role_id=mr.id
            WHERE mr.tenant_id=${tenant} AND mr.membership_id=${a.member} AND mr.revoked_at IS NULL`;
          expect(grants).toHaveLength(1);
          expect(grants[0]).toEqual({ code: a.role, scope_kind: a.scope,
            class_id: a.scope === 'CLASS' ? a.classId : null, student_id: a.scope === 'STUDENT' ? a.profile : null });
        }
        const child = await get(`/portal/children/${students[0]}`, by('P1').token);
        expect(JSON.stringify(child)).toContain(assignments[0]);
        expect(JSON.stringify(child)).toContain(sessions[0]);
        if (!child.classes?.length) blockers.push('PO04_ACTIVE_CLASS_LIST: catalog creates PLANNED; no supported status transition API found. Do not update status by SQL.');
        const inventory = await ctx.admin()`SELECT
          (SELECT count(*)::int FROM tenant_memberships WHERE tenant_id=${tenant}) memberships,
          (SELECT count(*)::int FROM tenant_memberships m JOIN users u ON u.id=m.user_id JOIN credentials c ON c.user_id=u.id WHERE m.tenant_id=${tenant} AND m.status='ACTIVE' AND u.activated_at IS NOT NULL) activated_credentials,
          (SELECT count(*)::int FROM classes WHERE tenant_id=${tenant}) classes,
          (SELECT count(*)::int FROM enrollments WHERE tenant_id=${tenant}) enrollments,
          (SELECT count(*)::int FROM class_sessions WHERE tenant_id=${tenant} AND status='CONFIRMED') confirmed_sessions,
          (SELECT count(*)::int FROM parent_student_links WHERE tenant_id=${tenant} AND verified_at IS NOT NULL AND revoked_at IS NULL) verified_links,
          (SELECT count(*)::int FROM assignments WHERE tenant_id=${tenant} AND status='PUBLISHED') published_assignments,
          (SELECT count(*)::int FROM invoices WHERE tenant_id=${tenant}) invoices,
          (SELECT count(*)::int FROM attendance_finalizations WHERE tenant_id=${tenant}) finalizations,
          (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${tenant}) audit_rows`;
        expect(inventory[0]).toMatchObject({ memberships: 9, activated_credentials: 9, classes: 2, enrollments: 2,
          confirmed_sessions: 2, verified_links: 2, published_assignments: 2, invoices: 0, finalizations: 0 });
        writeFileSync(resolve(directory, 'inventory.json'), JSON.stringify({ tenant, foreignTenant: foreign.tenant, course: course.id,
          subject: subject.id, level: level.id, room: room.id, classIds: classes, teachers, students, sessions, assignments, links, validFrom, ...inventory[0] }, null, 2));
        save('PASS');
      } catch (error) { save('FAIL'); throw error; }
      finally { await operator.end(); }
    }, 480_000);
}

async function capturePage(b: BrowserDriver, tenant: string, suffix: string, selector: string, label: string) {
  await b.route(`/app/${tenant}${suffix}`);
  await b.wait(`!!document.querySelector(${JSON.stringify(selector)}) && !document.body.textContent.includes('Đang kiểm tra')
    && !document.body.textContent.includes('Đang tải') && !document.body.textContent.includes('Đang đọc')`, label);
  if (label.includes('denied')) await b.wait(`document.body.textContent.includes('Không thể tải dữ liệu')`, label + '-error');
  await b.capture(label);
}
