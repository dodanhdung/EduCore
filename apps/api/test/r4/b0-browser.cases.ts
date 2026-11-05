import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import request from 'supertest';
import type { ProfileLinkContext } from './profile-link.cases.js';
import { put, type Query } from '../schema-integrity/support.js';
import { browserAvailable, until } from './browser-auth.js';
import { withAcademicBrowser } from './browser-academic.js';

type Context=ProfileLinkContext & {password:()=>string;activationCode:(email:string)=>string|undefined};
export function registerB0BrowserTests(ctx:Context) {
  const db=()=>ctx.admin();
  const target=async(f:Awaited<ReturnType<Context['fresh']>>,role:string,scope:'CLASS'|'STUDENT',id:string)=>{
    const who=await ctx.actor(f,role,scope,id);await db()`UPDATE users SET activated_at=clock_timestamp() WHERE id=${who.userId}`;return who;
  };
  const link=async(f:Awaited<ReturnType<Context['fresh']>>,token:string,kind:string,profile:string,member:string)=>
    request(ctx.app().getHttpServer()).post(`/api/v1/tenants/${f.tenant}/academic/profiles/${kind}/${profile}/membership-link`)
      .auth(token,{type:'bearer'}).set('Idempotency-Key',randomUUID())
      .send({membershipId:member,expectedMembershipId:null,reason:'R13 browser synthetic profile link',confirmed:true}).expect(200);

  it.skipIf(!browserAvailable)('R13 B0 browser OP01 OP02 and local AU06 activation',async()=>{
    const f=await ctx.fresh(),manager=await ctx.sessionFor(f),teacher=await target(f,'TEACHER','CLASS',f.classId);
    const address=randomUUID()+'@b0.invalid',base=`/api/v1/tenants/${f.tenant}`;
    const created=await request(ctx.app().getHttpServer()).post(base+'/members').auth(manager.accessToken,{type:'bearer'})
      .send({email:address,displayName:'Tài khoản demo chờ kích hoạt',reason:'R13 local onboarding'}).expect(201);
    expect(created.body.status).toBe('PENDING_ACTIVATION');
    await withAcademicBrowser(ctx.app(),async b=>{
      await b.login(manager.email,ctx.password(),f.tenant);
      await b.route(`/app/${f.tenant}/settings/members`);
      await b.wait(`document.querySelector('[data-screen-id="OP01"]')?.textContent.includes('Tài khoản demo chờ kích hoạt')`,'B0_MEMBERS');
      await b.capture('B0-OP01-members');
      await b.route(`/app/${f.tenant}/settings/members/${teacher.member}`);
      await b.wait(`document.querySelector('[data-screen-id="OP02"]')?.textContent.includes('TEACHER')
        && document.querySelector('[data-screen-id="OP02"]')?.textContent.includes(${JSON.stringify(f.classId)})`,'B0_ROLE_SCOPE');
      await b.capture('B0-OP02-role-scope');
      await b.evaluate(`document.querySelector('[data-screen-id="OP02"] .mo-inset')?.scrollIntoView({block:'center'})`);
      await b.capture('B0-OP02-role-scope-detail');
      await b.evaluate('scrollTo(0,0)');
      await b.route(`/app/${f.tenant}/settings/members/${created.body.id}`);
      await b.wait(`document.querySelector('[data-screen-id="OP02"]')?.textContent.includes('Chờ kích hoạt')`,'B0_PENDING');
      await b.capture('B0-OP02-pending');
      await b.navigate('/activate-account');
      await b.wait('!!document.querySelector("#activate-email")','B0_ACTIVATION_FORM');
      await b.capture('B0-AU06-empty');
      await b.click('form button[type="submit"]');
      await b.wait('document.querySelector("#activate-email")?.getAttribute("aria-invalid")==="true"','B0_ACTIVATION_VALIDATION');
      await b.capture('B0-AU06-validation');
      await b.fill('#activate-email',address);await b.click('button.ec-inline-action');
      await until(()=>Promise.resolve(!!ctx.activationCode(address)),'B0_LOCAL_ACTIVATION_ADAPTER');
      const otp=ctx.activationCode(address);if(!otp||!/^\d{6}$/.test(otp))throw Error('LOCAL_ACTIVATION_CODE_UNAVAILABLE');
      await b.fill('#activate-otp',otp);await b.fill('#activate-password',ctx.password());await b.fill('#activate-confirm',ctx.password());
      await b.click('form button[type="submit"]');
      await b.wait('location.pathname==="/login" && !!document.querySelector("#login-email")','B0_ACTIVATED_REDIRECT');
      await b.capture('B0-AU06-success-login');
      const [stored]=await db()`SELECT u.status,u.activated_at IS NOT NULL activated,tm.status membership_status,
        EXISTS(SELECT FROM credentials c WHERE c.user_id=u.id) credential_present
        FROM users u JOIN tenant_memberships tm ON tm.user_id=u.id WHERE tm.id=${created.body.id}`;
      expect(stored).toEqual({status:'ACTIVE',activated:true,membership_status:'ACTIVE',credential_present:true});
      await b.login(address,ctx.password(),f.tenant);
      expect(await b.evaluate<boolean>('!!document.querySelector(".app-shell")')).toBe(true);
    });
  },120_000);

  it.skipIf(!browserAvailable)('R13 B0 browser legitimate Teacher Student linking and revoked isolation',async()=>{
    const f=await ctx.fresh(),other=await ctx.fresh(),manager=await ctx.sessionFor(f);
    const teacher=await target(f,'TEACHER','CLASS',f.classId),student=await target(f,'STUDENT','STUDENT',f.student);
    await put(db() as unknown as Query,'class_teacher_assignments',{tenant_id:f.tenant,class_id:f.classId,teacher_id:f.teacher,
      role_kind:'PRIMARY',valid_from:'2020-01-01',assigned_by_membership_id:f.member});
    await withAcademicBrowser(ctx.app(),async b=>{
      await b.login(teacher.email,ctx.password(),f.tenant);
      await b.route(`/app/${f.tenant}/teacher`);
      await b.wait(`document.querySelector('.ec-error-card span')?.textContent==='403'`,'B0_UNLINKED_TEACHER_DENIED');
      await b.capture('B0-PO01-unlinked-denied');
      await link(f,manager.accessToken,'teachers',f.teacher,teacher.member);
      await b.login(teacher.email,ctx.password(),f.tenant);await b.route(`/app/${f.tenant}/teacher`);
      await b.wait(`document.body.textContent.includes('Teacher') && !!document.querySelector('main h1')
        && !document.querySelector('.ec-error-card')`,'B0_LINKED_TEACHER');
      await b.wait(`!!document.querySelector('main a') && !document.body.textContent.includes('Đang kiểm tra quyền và tải')`,'B0_TEACHER_DATA');
      await b.capture('B0-PO01-linked');
      const own=await request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/context`).auth(teacher.accessToken,{type:'bearer'}).expect(200);
      expect(own.body.teacher.id).toBe(f.teacher);
      await db()`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${teacher.assignment}`;
      await b.route(`/app/${f.tenant}/me`);await b.route(`/app/${f.tenant}/teacher`);
      await b.wait(`!document.body.textContent.includes('Class One') && (document.body.textContent.includes('Đang chờ dữ liệu giảng dạy')
        || document.body.textContent.includes('Không có quyền') || document.querySelector('.ec-error-card span')?.textContent==='403')`,'B0_REVOKED_TEACHER');
      await b.capture('B0-PO01-revoked');
      await request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/teacher-sessions`).auth(teacher.accessToken,{type:'bearer'}).expect(403);
      await link(f,manager.accessToken,'students',f.student,student.member);
      await b.login(student.email,ctx.password(),f.tenant);
      const paused=await b.deferResponse(`/api/v1/tenants/${f.tenant}/portal/context`);
      await b.route(`/app/${f.tenant}/student`);await paused.waitPaused();
      await b.wait(`document.body.textContent.includes('Đang tải dữ liệu')`,'B0_STUDENT_LOADING');
      await b.capture('B0-PO02-loading');await paused.release();
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes('Student One')`,'B0_LINKED_STUDENT');
      await b.capture('B0-PO02-linked');
      expect((await request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/context`).auth(student.accessToken,{type:'bearer'}).expect(200)).body.student.id).toBe(f.student);
      await b.route(`/app/${other.tenant}/student`);
      await b.wait(`document.querySelector('.ec-error-card span')?.textContent==='403' && !document.body.textContent.includes('Student One')`,'B0_CROSS_TENANT');
      await b.capture('B0-cross-tenant-denied');
    });
  },120_000);

  it.skipIf(!browserAvailable)('R13 B0 browser OP03 verified Parent PO03 PO04 PO05 and revoked child',async()=>{
    const f=await ctx.fresh(),manager=await ctx.sessionFor(f),parent=await target(f,'PARENT','STUDENT',f.student);
    const base=`/api/v1/tenants/${f.tenant}`;
    const created=await request(ctx.app().getHttpServer()).post(base+'/parent-student-links').auth(manager.accessToken,{type:'bearer'})
      .send({parentMembershipId:parent.member,studentId:f.student,evidenceReference:'R13 local synthetic guardian',reason:'Local fixture relationship'}).expect(201);
    await request(ctx.app().getHttpServer()).get(base+`/portal/children/${f.student}`).auth(parent.accessToken,{type:'bearer'}).expect(404);
    await request(ctx.app().getHttpServer()).post(base+`/parent-student-links/${created.body.id}/verify`).auth(manager.accessToken,{type:'bearer'})
      .send({reason:'Reviewed synthetic guardian evidence'}).expect(201);
    await withAcademicBrowser(ctx.app(),async b=>{
      await b.login(manager.email,ctx.password(),f.tenant);await b.route(`/app/${f.tenant}/relationships`);
      await b.wait(`document.querySelector('[data-screen-id="OP03"]')?.textContent.includes('R13 local synthetic guardian')`,'B0_VERIFIED_RELATIONSHIP');
      await b.capture('B0-OP03-verified');
      await b.evaluate(`Array.from(document.querySelectorAll('[data-screen-id="OP03"] tbody tr'))
        .find(row=>row.textContent.includes('R13 local synthetic guardian'))?.scrollIntoView({block:'center'})`);
      await b.capture('B0-OP03-verified-detail');
      await b.evaluate('scrollTo(0,0)');
      await b.login(parent.email,ctx.password(),f.tenant);await b.route(`/app/${f.tenant}/parent`);
      await b.wait(`document.querySelector('#portal-parent-child')?.options.length===1 && document.body.textContent.includes('Student One')`,'B0_PARENT_PORTAL');
      await b.capture('B0-PO03-parent');
      await b.route(`/app/${f.tenant}/parent/children/${f.student}`);
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes('Student One')`,'B0_CHILD_DETAILS');
      await b.capture('B0-PO04-child');
      await b.route(`/app/${f.tenant}/my/billing`);
      await b.wait(`document.querySelector('.portal-page')?.textContent.includes('Student One') && !document.body.textContent.includes('Đang tải dữ liệu')`,'B0_CHILD_BILLING');
      await b.capture('B0-PO05-billing');
      await request(ctx.app().getHttpServer()).get(base+`/portal/billing/${f.student2}`).auth(parent.accessToken,{type:'bearer'}).expect(404);
      await request(ctx.app().getHttpServer()).post(base+`/parent-student-links/${created.body.id}/revoke`).auth(manager.accessToken,{type:'bearer'})
        .send({reason:'Local revoke verification'}).expect(201);
      await b.route(`/app/${f.tenant}/parent/children/${f.student}`);
      await b.wait(`!document.body.textContent.includes('Student One') && (document.body.textContent.includes('Không thể tải dữ liệu')
        || document.querySelector('.ec-error-card span')?.textContent==='403')`,'B0_REVOKED_CHILD_CLEAR');
      await b.capture('B0-PO04-revoked');
    });
  },120_000);
}
