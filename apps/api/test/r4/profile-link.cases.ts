import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import type { R4Repository } from '../../src/identity-access/r4-repository.js';
import { put, waitBlocked, type Query, type seed } from '../schema-integrity/support.js';

type Fixture = Awaited<ReturnType<typeof seed>>;
type Actor = { accessToken: string; member: string; assignment: string; userId: string; email: string };
export type ProfileLinkContext = {
  admin: () => postgres.Sql; repository: () => R4Repository; app: () => INestApplication;
  apiUrl: () => string; fresh: () => Promise<Fixture>;
  sessionFor: (f: Fixture) => Promise<{ accessToken: string; email: string }>;
  actor: (f: Fixture, role: string, scope?: 'TENANT' | 'CLASS' | 'STUDENT', target?: string) => Promise<Actor>;
};
export function registerProfileLinkTests(ctx: ProfileLinkContext) {
  const db = () => ctx.admin();
  const body = (membershipId: string) => ({ membershipId, expectedMembershipId: null,
    reason: 'R13 synthetic profile association', confirmed: true });
  const path = (f: Fixture, kind: string, id: string) => `/api/v1/tenants/${f.tenant}/academic/profiles/${kind}/${id}/membership-link`;
  const send = (f: Fixture, token: string, kind: string, id: string, input: unknown, key = randomUUID()) =>
    request(ctx.app().getHttpServer()).post(path(f, kind, id)).auth(token, { type: 'bearer' })
      .set('Idempotency-Key', key).send(input);
  const target = async (f: Fixture, kind = 'STUDENT', scope?: 'TENANT' | 'CLASS' | 'STUDENT', id?: string) => {
    const who = await ctx.actor(f, kind, scope ?? (kind === 'STUDENT' ? 'STUDENT' : 'CLASS'), id ?? (kind === 'STUDENT' ? f.student : f.classId));
    await db()`UPDATE users SET activated_at=clock_timestamp() WHERE id=${who.userId}`;
    return who;
  };
  const state = async (f: Fixture) => (await db()`SELECT
    (SELECT count(*)::int FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='PROFILE_MEMBERSHIP_LINKED') audits,
    (SELECT count(*)::int FROM idempotency_records WHERE tenant_id=${f.tenant} AND operation_type LIKE 'R13:PROFILE_LINK:%') receipts,
    (SELECT membership_id FROM student_profiles WHERE id=${f.student}) student_owner,
    (SELECT membership_id FROM teacher_profiles WHERE id=${f.teacher}) teacher_owner`)[0];

  describe('R13 profile membership link candidate', () => {
    for (const kind of ['TEACHER','STUDENT']) it(`PL01 ${kind} success, receipt audit and exact authorized replay`, async () => {
      const f = await ctx.fresh(), manager = await ctx.sessionFor(f), who = await target(f, kind);
      const id = kind === 'TEACHER' ? f.teacher : f.student, resource = kind === 'TEACHER' ? 'teachers' : 'students';
      const key = randomUUID(), input = body(who.member), correlation = randomUUID();
      const response = await send(f, manager.accessToken, resource, id, input, key).set('X-Request-Id', correlation).expect(200);
      expect(response.body).toEqual({ profileId:id, profileKind:kind, membershipId:who.member, tenantId:f.tenant,
        operation:'PROFILE_MEMBERSHIP_LINKED',correlationId:correlation });
      expect((await send(f, manager.accessToken, resource, id, input, key).expect(200)).body).toEqual(response.body);
      expect(await state(f)).toMatchObject({audits:1,receipts:1});
      const [audit] = await db()`SELECT actor_user_id,actor_membership_id,reason,policy_version_id,correlation_id,after_json
        FROM audit_logs WHERE tenant_id=${f.tenant} AND event_type='PROFILE_MEMBERSHIP_LINKED'`;
      expect(audit).toMatchObject({actor_user_id:f.user,actor_membership_id:f.member,reason:input.reason,correlation_id:correlation});
      expect(audit.policy_version_id).toBeTruthy();
      expect(audit.after_json).toMatchObject({previousMembershipId:null,membershipId:who.member,profileId:id,profileKind:kind});
      const [receipt] = await db()`SELECT status,result_snapshot,request_hash FROM idempotency_records WHERE tenant_id=${f.tenant} AND idempotency_key=${key}`;
      expect(receipt.status).toBe('COMPLETED'); expect(receipt.result_snapshot).toEqual(response.body);
      expect(receipt.request_hash).toMatch(/^[a-f0-9]{64}$/);
      const output=JSON.stringify({response:response.body,audit,receipt});
      expect(output).not.toMatch(/password_hash|argon2|accessToken|refreshToken|otp|@r4\.invalid/i);
    });

    it('PL02 requires all three current TENANT permissions; no role-label fallback', async () => {
      for (const permission of ['member.update','role.assign','student.update']) {
        const f=await ctx.fresh(), manager=await ctx.actor(f,'ACCOUNTANT'), who=await target(f);
        // Test-owned permission composition; never remove the last Manager's
        // role.assign mapping just to construct a denial fixture.
        const role=await put(db() as unknown as Query,'roles',{tenant_id:f.tenant,code:`PL_TEST_${randomUUID()}`,name:'Synthetic operator'});
        for(const granted of ['member.update','role.assign','student.update'].filter(p=>p!==permission)) {
          const [p]=await db()`SELECT id FROM permissions WHERE code=${granted}`;
          await put(db() as unknown as Query,'role_permissions',{tenant_id:f.tenant,role_id:role,permission_id:p.id});
        }
        await db()`UPDATE membership_roles SET role_id=${role} WHERE id=${manager.assignment}`;
        expect((await db()`SELECT educore_r4.has_permission(${f.tenant},${manager.member},${permission}) allowed`)[0].allowed,permission).toBe(false);
        const before=await state(f);
        await send(f,manager.accessToken,'students',f.student,body(who.member)).expect(403);
        expect(await state(f)).toEqual(before);
      }
      const f=await ctx.fresh(), staff=await ctx.actor(f,'ACADEMIC_STAFF'), who=await target(f);
      await send(f,staff.accessToken,'students',f.student,body(who.member)).expect(403);
    });
    it('PL03 CLASS-only actor grants never satisfy combined TENANT authority', async () => {
      const f=await ctx.fresh(), scoped=await ctx.actor(f,'MANAGER','CLASS',f.classId), who=await target(f);
      await send(f,scoped.accessToken,'students',f.student,body(who.member)).expect(403);
      expect(await state(f)).toMatchObject({audits:0,receipts:0,student_owner:null});
    });
    it('PL04 conceals foreign membership/profile and denies foreign tenant', async () => {
      const f=await ctx.fresh(), other=await ctx.fresh(), manager=await ctx.sessionFor(f), who=await target(f), foreign=await target(other);
      for (const [id,member] of [[f.student,foreign.member],[other.student,who.member]]) {
        const response=await send(f,manager.accessToken,'students',id,body(member)).expect(404);
        expect(JSON.stringify(response.body)).not.toContain(other.tenant);
        expect(JSON.stringify(response.body)).not.toContain(foreign.email);
      }
      await send(other,manager.accessToken,'students',other.student,body(foreign.member)).expect(403);
      expect(await state(f)).toMatchObject({audits:0,receipts:0,student_owner:null});
    });
    it('PL05 rejects inactive, pending, unactivated, credential-absent and malformed-credential targets', async () => {
      for (const scenario of ['pending-user','disabled-user','pending-member','left-member','unactivated','no-credential','invalid-credential']) {
        const f=await ctx.fresh(), manager=await ctx.sessionFor(f), who=await target(f);
        if(scenario==='pending-user')await db()`UPDATE users SET status='PENDING_ACTIVATION' WHERE id=${who.userId}`;
        if(scenario==='disabled-user')await db()`UPDATE users SET status='DISABLED' WHERE id=${who.userId}`;
        if(scenario==='pending-member')await db()`UPDATE tenant_memberships SET status='PENDING_ACTIVATION' WHERE id=${who.member}`;
        if(scenario==='left-member')await db()`UPDATE tenant_memberships SET left_at=clock_timestamp() WHERE id=${who.member}`;
        if(scenario==='unactivated')await db()`UPDATE users SET activated_at=NULL WHERE id=${who.userId}`;
        if(scenario==='no-credential')await db()`DELETE FROM credentials WHERE user_id=${who.userId}`;
        if(scenario==='invalid-credential')await db()`UPDATE credentials SET password_hash='unsupported-test-fixture' WHERE user_id=${who.userId}`;
        await send(f,manager.accessToken,'students',f.student,body(who.member)).expect(409);
        expect(await state(f)).toMatchObject({audits:0,receipts:0,student_owner:null});
      }
    });
    it('PL06 rejects wrong/revoked role, wrong Student and unrelated Teacher class scopes', async () => {
      for(const scenario of ['wrong-role','revoked-role','wrong-student','student-tenant','wrong-teacher-class']) {
        const f=await ctx.fresh(),manager=await ctx.sessionFor(f);
        const teacher=scenario==='wrong-teacher-class';
        const who=await target(f,scenario==='wrong-role'?'ACCOUNTANT':teacher?'TEACHER':'STUDENT',
          scenario==='student-tenant'?'TENANT':teacher?'CLASS':'STUDENT',teacher?f.class2:scenario==='wrong-student'?f.student2:f.student);
        if(scenario==='revoked-role')await db()`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${who.assignment}`;
        if(teacher)await put(db() as unknown as Query,'class_teacher_assignments',{tenant_id:f.tenant,class_id:f.classId,teacher_id:f.teacher,
          role_kind:'PRIMARY',valid_from:'2020-01-01',assigned_by_membership_id:f.member});
        await send(f,manager.accessToken,teacher?'teachers':'students',teacher?f.teacher:f.student,body(who.member)).expect(409);
        expect(await state(f)).toMatchObject({audits:0,receipts:0});
      }
    });
    it('PL07 forbids self-link and inactive profile or tenant', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),who=await target(f);
      await send(f,manager.accessToken,'students',f.student,body(f.member)).expect(403);
      await db()`UPDATE student_profiles SET status='INACTIVE' WHERE id=${f.student}`;
      await send(f,manager.accessToken,'students',f.student,body(who.member)).expect(409);
      await db()`UPDATE tenants SET status='INACTIVE' WHERE id=${f.tenant}`;
      await send(f,manager.accessToken,'students',f.student,body(who.member)).expect(403);
    });
    it('PL08 never rebinds imported ownership and enforces membership per-kind uniqueness', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),one=await target(f),two=await target(f);
      await db()`UPDATE student_profiles SET membership_id=${one.member} WHERE id=${f.student}`;
      await send(f,manager.accessToken,'students',f.student,body(two.member)).expect(409);
      await db()`INSERT INTO access_scopes(id,tenant_id,membership_role_id,scope_kind,student_id,updated_at)
        VALUES(gen_random_uuid(),${f.tenant},${one.assignment},'STUDENT',${f.student2},clock_timestamp())`;
      await send(f,manager.accessToken,'students',f.student2,body(one.member)).expect(409);
      expect(await state(f)).toMatchObject({audits:0,receipts:0,student_owner:one.member});
    });
    it('PL09 changed intent conflicts and fresh revoked authority denies receipt replay', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),who=await target(f),key=randomUUID(),input=body(who.member);
      await send(f,manager.accessToken,'students',f.student,input,key).expect(200);
      await send(f,manager.accessToken,'students',f.student,{...input,reason:'Changed intent'},key).expect(409);
      await db()`DELETE FROM role_permissions WHERE tenant_id=${f.tenant}
        AND role_id=(SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='MANAGER')
        AND permission_id=(SELECT id FROM permissions WHERE code='member.update')`;
      await send(f,manager.accessToken,'students',f.student,input,key).expect(403);
      expect(await state(f)).toMatchObject({audits:1,receipts:1,student_owner:who.member});
    });
    it('PL10 rolls back CAS, receipt and audit on a transaction failure after command', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),who=await target(f),before=await state(f);
      await expect(ctx.repository().transaction(manager.accessToken,async tx=>{
        await tx.$queryRawUnsafe('SELECT educore_r4.profile_membership_link($1::uuid,$2::text,$3::uuid,$4::jsonb)',
          f.tenant,'STUDENT',f.student,JSON.stringify({...body(who.member),key:randomUUID()}));
        throw Error('LOCAL_INJECTED_FAILURE');
      })).rejects.toThrow('LOCAL_INJECTED_FAILURE');
      expect(await state(f)).toEqual(before);
    });
    it('PL11 independent connections serialize competing claims; exactly one owner/audit/receipt', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),operator=await ctx.actor(f,'MANAGER'),one=await target(f),two=await target(f);
      const a=postgres(ctx.apiUrl(),{max:1,onnotice:()=>undefined}),b=postgres(ctx.apiUrl(),{max:1,onnotice:()=>undefined});
      try {
        await a`BEGIN`;await b`BEGIN`;
        await a`SELECT educore_r4.bind(${manager.accessToken})`;await b`SELECT educore_r4.bind(${operator.accessToken})`;
        const apid=(await a`SELECT pg_backend_pid() pid`)[0].pid as number,bpid=(await b`SELECT pg_backend_pid() pid`)[0].pid as number;
        await a`SELECT educore_r4.profile_membership_link(${f.tenant},'STUDENT',${f.student},${JSON.stringify({...body(one.member),key:randomUUID()})}::text::jsonb)`;
        const pending=b`SELECT educore_r4.profile_membership_link(${f.tenant},'STUDENT',${f.student},${JSON.stringify({...body(two.member),key:randomUUID()})}::text::jsonb)`
          .then(()=>({code:'SUCCESS'})).catch((e:{code:string})=>({code:e.code}));
        await waitBlocked(db(),bpid,apid);await a`COMMIT`;
        expect((await pending).code).toBe('23505');await b`ROLLBACK`;
        expect(await state(f)).toMatchObject({audits:1,receipts:1,student_owner:one.member});
      } finally {await a`ROLLBACK`;await b`ROLLBACK`;await a.end();await b.end();}
    });
    it('PL12 validates strict HTTP shape and never offers unlink/rebind or unauthenticated writes', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),who=await target(f),input=body(who.member);
      await request(ctx.app().getHttpServer()).post(path(f,'students',f.student)).send(input).expect(401);
      await request(ctx.app().getHttpServer()).post(path(f,'students',f.student)).auth(manager.accessToken,{type:'bearer'}).send(input).expect(400);
      for(const invalid of [{...input,confirmed:false},{...input,expectedMembershipId:who.member},{...input,reason:''},
        {...input,extra:'rebind'}, {...input,membershipId:'bad'}, {membershipId:who.member,reason:input.reason,confirmed:true}]) {
        await send(f,manager.accessToken,'students',f.student,invalid).expect(400);
      }
      await send(f,manager.accessToken,'parents',f.student,input).expect(400);
      await request(ctx.app().getHttpServer()).delete(path(f,'students',f.student)).auth(manager.accessToken,{type:'bearer'}).expect(404);
      expect(await state(f)).toMatchObject({audits:0,receipts:0,student_owner:null});
    });
    it('PL15 two connections cannot give one Teacher membership two profiles',async()=>{
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),who=await target(f,'TEACHER');
      const other=await put(db() as unknown as Query,'teacher_profiles',{tenant_id:f.tenant,teacher_code:randomUUID(),full_name:'Second synthetic teacher',status:'ACTIVE'});
      const a=postgres(ctx.apiUrl(),{max:1,onnotice:()=>undefined}),b=postgres(ctx.apiUrl(),{max:1,onnotice:()=>undefined});
      try{
        await a`BEGIN`;await b`BEGIN`;await a`SELECT educore_r4.bind(${manager.accessToken})`;await b`SELECT educore_r4.bind(${manager.accessToken})`;
        const apid=(await a`SELECT pg_backend_pid() pid`)[0].pid as number,bpid=(await b`SELECT pg_backend_pid() pid`)[0].pid as number;
        await a`SELECT educore_r4.profile_membership_link(${f.tenant},'TEACHER',${f.teacher},${JSON.stringify({...body(who.member),key:randomUUID()})}::text::jsonb)`;
        const pending=b`SELECT educore_r4.profile_membership_link(${f.tenant},'TEACHER',${other},${JSON.stringify({...body(who.member),key:randomUUID()})}::text::jsonb)`
          .then(()=>({code:'SUCCESS'})).catch((e:{code:string})=>({code:e.code}));
        await waitBlocked(db(),bpid,apid);await a`COMMIT`;expect((await pending).code).toBe('23505');await b`ROLLBACK`;
        expect((await db()`SELECT count(*)::int n FROM teacher_profiles WHERE tenant_id=${f.tenant} AND membership_id=${who.member}`)[0].n).toBe(1);
        expect(await state(f)).toMatchObject({audits:1,receipts:1,teacher_owner:who.member});
      }finally{await a`ROLLBACK`;await b`ROLLBACK`;await a.end();await b.end();}
    });
    it('PL16 permission revoke commits while competing link waits, then fresh authorization denies it',async()=>{
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),operator=await ctx.actor(f,'MANAGER'),who=await target(f);
      const a=postgres(ctx.apiUrl(),{max:1,onnotice:()=>undefined}),b=postgres(ctx.apiUrl(),{max:1,onnotice:()=>undefined});
      try{
        await a`BEGIN`;await b`BEGIN`;await a`SELECT educore_r4.bind(${manager.accessToken})`;await b`SELECT educore_r4.bind(${operator.accessToken})`;
        const apid=(await a`SELECT pg_backend_pid() pid`)[0].pid as number,bpid=(await b`SELECT pg_backend_pid() pid`)[0].pid as number;
        await a`SELECT educore_r4.iam(${f.tenant},${JSON.stringify({operation:'ROLE_REVOKE',id:operator.member,assignmentId:operator.assignment,reason:'Local permission race'})}::text::jsonb)`;
        const pending=b`SELECT educore_r4.profile_membership_link(${f.tenant},'STUDENT',${f.student},${JSON.stringify({...body(who.member),key:randomUUID()})}::text::jsonb)`
          .then(()=>({code:'SUCCESS'})).catch((e:{code:string})=>({code:e.code}));
        await waitBlocked(db(),bpid,apid);await a`COMMIT`;expect((await pending).code).toBe('42501');await b`ROLLBACK`;
        expect(await state(f)).toMatchObject({audits:0,receipts:0,student_owner:null});
      }finally{await a`ROLLBACK`;await b`ROLLBACK`;await a.end();await b.end();}
    });
    it('PL13 command ACL denies PUBLIC/auth/worker and raw runtime profile DML', async () => {
      const [row]=await db()`SELECT p.prosecdef,p.provolatile,r.rolname,p.proconfig,
        has_function_privilege('educore_r4_api',p.oid,'EXECUTE') api,
        has_function_privilege('educore_r4_auth',p.oid,'EXECUTE') auth,
        has_function_privilege('educore_r4_worker',p.oid,'EXECUTE') worker,
        EXISTS(SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public,
        has_table_privilege('educore_r4_api','public.student_profiles','UPDATE') raw_dml
        FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='educore_r4.profile_membership_link(uuid,text,uuid,jsonb)'::regprocedure`;
      expect(row).toMatchObject({prosecdef:true,provolatile:'v',rolname:'educore_r4_owner',api:true,auth:false,worker:false,public:false,raw_dml:false});
      expect(row.proconfig).toContain('search_path=pg_catalog, educore_r4, pg_temp');
    });
    it('PL14 Student portal changes from unlinked to legitimate own profile only; Parent unchanged', async () => {
      const f=await ctx.fresh(),manager=await ctx.sessionFor(f),who=await target(f);
      const get=(suffix:string)=>request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/${suffix}`).auth(who.accessToken,{type:'bearer'});
      const before=await get('context').expect(200);expect(before.body.student).toBeNull();
      await send(f,manager.accessToken,'students',f.student,body(who.member)).expect(200);
      expect((await get('context').expect(200)).body.student.id).toBe(f.student);
      await get(`children/${f.student2}`).expect(404);
      const parent=await target(f,'PARENT','STUDENT',f.student);
      await request(ctx.app().getHttpServer()).get(`/api/v1/tenants/${f.tenant}/portal/children/${f.student}`).auth(parent.accessToken,{type:'bearer'}).expect(404);
      expect((await db()`SELECT count(*)::int n FROM parent_student_links WHERE tenant_id=${f.tenant}`)[0].n).toBe(0);
    });
  });
}
