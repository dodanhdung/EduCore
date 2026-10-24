import { describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { result, type R4Repository } from '../../src/identity-access/r4-repository.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';
import { put, waitBlocked, type Query, type seed } from '../schema-integrity/support.js';

type Fixture = Awaited<ReturnType<typeof seed>>;
type Actor = { accessToken: string; member: string; assignment: string; userId: string };
type Evidence = { userId: string; sessionId: string; tenantId: string; screenIds: string[]; validUntil: number };
type Context = {
  admin: () => postgres.Sql;
  repository: () => R4Repository;
  auth: () => AuthService;
  apiUrl: () => string;
  fresh: () => Promise<Fixture>;
  actor: (f: Fixture, role: string, scope?: 'TENANT' | 'CLASS' | 'STUDENT', target?: string) => Promise<Actor>;
};
async function denied(operation: Promise<unknown>, expected: string) {
  let code: string | undefined;
  try { await operation; } catch (error) {
    const failure = error as { code?: string; meta?: { code?: string; driverAdapterError?: { cause?: { originalCode?: string } } } };
    code = failure.meta?.code ?? failure.meta?.driverAdapterError?.cause?.originalCode ?? failure.code;
  }
  expect(code).toBe(expected);
}

// Runs against the Phase B migration in the fresh disposable native harness.
export function registerNavigationProposalTests(ctx: Context) {
  describe('R7 migrated navigation SQL — disposable fixtures', () => {
    const admin = () => ctx.admin();
    const read = (token: string, tenant: string | null) => ctx.repository().transaction(token,
      (tx) => result<Evidence>(tx, 'SELECT educore_r4.navigation_access($1::uuid) result', tenant));
    it('N01 denies an unbound restricted API connection', async () => {
      const f = await ctx.fresh();
      await denied(ctx.repository().api.$queryRawUnsafe('SELECT educore_r4.navigation_access($1::uuid)', f.tenant), '28000');
    });
    it('N02 denies a different selected tenant and a null tenant', async () => {
      const f = await ctx.fresh(), other = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      await denied(read(actor.accessToken, other.tenant), '42501');
      await denied(read(actor.accessToken, null), '42501');
    });
    it('N03 excludes a revoked membership', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      await admin()`UPDATE tenant_memberships SET status='DISABLED',left_at=clock_timestamp() WHERE id=${actor.member}`;
      await denied(read(actor.accessToken, f.tenant), '42501');
    });
    it('N04 excludes a revoked role assignment', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      await admin()`UPDATE membership_roles SET revoked_at=clock_timestamp() WHERE id=${actor.assignment}`;
      expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual([]);
    });
    it('N05 grants only the actual TENANT read permission mapping', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual(['OP04', 'OP05']);
    });
    for (const scope of ['CLASS', 'STUDENT'] as const) {
      it(`N06/07 ${scope}-only permission never becomes TENANT access`, async () => {
        const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT', scope, scope === 'CLASS' ? f.classId : f.student);
        expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual([]);
      });
    }
    it('N08 unions multiple active grants in the same tenant only', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      const [role] = await admin()`SELECT id FROM roles WHERE tenant_id=${f.tenant} AND code='ACADEMIC_STAFF'`;
      await admin()`INSERT INTO role_permissions(id,tenant_id,role_id,permission_id)
        SELECT gen_random_uuid(),${f.tenant},${role.id},id FROM permissions WHERE code IN ('member.read','audit.read','job.read') ON CONFLICT DO NOTHING`;
      const assignment = await put(admin() as unknown as Query, 'membership_roles', {
        tenant_id: f.tenant, membership_id: actor.member, role_id: role.id, assigned_by_membership_id: f.member,
      });
      await put(admin() as unknown as Query, 'access_scopes', { tenant_id: f.tenant, membership_role_id: assignment, scope_kind: 'TENANT' });
      expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual(['OP01', 'OP04', 'OP05', 'OP06', 'OP07']);
    });
    it('N09 valid membership without relevant permission returns no grants', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACADEMIC_STAFF');
      expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual([]);
    });
    it('N10 verified Parent linkage does not grant staff navigation', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'PARENT', 'STUDENT', f.student);
      await put(admin() as unknown as Query, 'parent_student_links', { tenant_id: f.tenant, parent_membership_id: actor.member,
        student_id: f.student, relationship: 'PARENT', evidence_reference: 'proposal-test-only', verified_by_membership_id: f.member, verified_at: new Date() });
      expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual([]);
    });
    it('N11 restricted LOGIN retains no raw grant or credential SELECT', async () => {
      for (const table of ['public.credentials', 'public.role_permissions', 'public.access_scopes']) {
        await denied(ctx.repository().api.$queryRawUnsafe(`SELECT * FROM ${table} LIMIT 0`), '42501');
      }
      const [row] = await admin()`SELECT
        has_function_privilege('educore_r4_api','educore_r4.navigation_access(uuid)','EXECUTE') api,
        has_function_privilege('educore_r4_auth','educore_r4.navigation_access(uuid)','EXECUTE') auth,
        has_function_privilege('educore_r4_worker','educore_r4.navigation_access(uuid)','EXECUTE') worker,
        has_function_privilege('educore_r4_operator','educore_r4.navigation_access(uuid)','EXECUTE') operator`;
      expect(row).toMatchObject({ api: true, auth: false, worker: false, operator: false });
    });
    it('N12 response has only bounded identity/navigation fields, no resource IDs or secrets', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      // Compare timestamps from the same PostgreSQL clock, not the Windows
      // Node clock versus the Docker VM clock (which can differ by milliseconds).
      const [before] = await admin()`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint server_now`;
      const data = await read(actor.accessToken, f.tenant);
      const [after] = await admin()`SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint server_now,
        floor(extract(epoch FROM LEAST(access_expires_at,expires_at))*1000)::bigint deadline
        FROM auth_sessions WHERE id=${data.sessionId}`;
      expect(Object.keys(data).sort()).toEqual(['screenIds', 'sessionId', 'tenantId', 'userId', 'validUntil']);
      expect(data.userId).toBe(actor.userId);
      expect(data.tenantId).toBe(f.tenant);
      expect(data.validUntil).toBeGreaterThan(Number(before.server_now));
      expect(data.validUntil).toBeLessThanOrEqual(Number(after.server_now) + 60_000);
      expect(data.validUntil).toBeLessThanOrEqual(Number(after.deadline));
      expect(JSON.stringify(data)).not.toContain(f.student);
      expect(JSON.stringify(data)).not.toContain(f.classId);
    });
    it('N13 denies expired access and revoked sessions', async () => {
      for (const expired of [true, false]) {
        const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT'), sid = ctx.auth().tokens.verify(actor.accessToken).sid;
        if (expired) await admin()`UPDATE auth_sessions SET access_expires_at=clock_timestamp()-interval '1 second' WHERE id=${sid}`;
        else await admin()`UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=${sid}`;
        await denied(read(actor.accessToken, f.tenant), '28000');
      }
    });
    it('N14 denies a globally disabled user', async () => {
      const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      await admin()`UPDATE users SET status='DISABLED' WHERE id=${actor.userId}`;
      await denied(read(actor.accessToken, f.tenant), '28000');
    });
    it('N15 never imports another tenant grant set', async () => {
      const f = await ctx.fresh(), other = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
      // The same user belongs to both tenants: broad grants in the second
      // tenant must never join into the selected tenant's ACCOUNTANT grants.
      const member = await put(admin() as unknown as Query, 'tenant_memberships', {
        tenant_id: other.tenant, user_id: actor.userId, status: 'ACTIVE',
      });
      const [role] = await admin()`SELECT id FROM roles WHERE tenant_id=${other.tenant} AND code='MANAGER'`;
      const assignment = await put(admin() as unknown as Query, 'membership_roles', {
        tenant_id: other.tenant, membership_id: member, role_id: role.id, assigned_by_membership_id: other.member,
      });
      await put(admin() as unknown as Query, 'access_scopes', { tenant_id: other.tenant, membership_role_id: assignment, scope_kind: 'TENANT' });
      expect((await read(actor.accessToken, f.tenant)).screenIds).toEqual(['OP04', 'OP05']);
      await denied(read(actor.accessToken, other.tenant), '42501');
      const selected = await ctx.auth().selectTenant(actor.accessToken, other.tenant);
      expect((await read(selected.accessToken, other.tenant)).screenIds).toEqual(['OP01', 'OP04', 'OP05', 'OP06', 'OP07']);
      await denied(read(selected.accessToken, f.tenant), '42501');
    });
    it('N16 function owner/search_path/PUBLIC ACL preserve SECURITY DEFINER boundary', async () => {
      const [row] = await admin()`SELECT p.prosecdef,p.proconfig,r.rolname,r.rolcanlogin,
        NOT EXISTS(SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public_denied
        FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='educore_r4.navigation_access(uuid)'::regprocedure`;
      expect(row).toMatchObject({ prosecdef: true, rolname: 'educore_r4_owner', rolcanlogin: false, public_denied: true });
      expect(row.proconfig).toContain('search_path=pg_catalog, educore_r4, pg_temp');
    });
    for (const change of ['expiry', 'rotation'] as const) {
      it(`N17 NC-01 maps ${change} during an observed User-lock wait to auth loss`, async () => {
        const f = await ctx.fresh(), actor = await ctx.actor(f, 'ACCOUNTANT');
        const sid = ctx.auth().tokens.verify(actor.accessToken).sid;
        const blocker = postgres(process.env.R4_TEST_URL!, { max: 1, prepare: false, onnotice: () => undefined });
        const waiter = postgres(ctx.apiUrl(), { max: 1, prepare: false, onnotice: () => undefined });
        let blockerOpen = false, waiterOpen = false;
        try {
          await blocker`BEGIN`; blockerOpen = true;
          await blocker`SELECT id FROM users WHERE id=${actor.userId} FOR UPDATE`;
          await waiter`BEGIN`; waiterOpen = true;
          await waiter`SELECT educore_r4.bind(${actor.accessToken})`;
          const apid = (await blocker`SELECT pg_backend_pid() pid`)[0].pid as number;
          const bpid = (await waiter`SELECT pg_backend_pid() pid`)[0].pid as number;
          const pending = waiter`SELECT educore_r4.navigation_access(${f.tenant}::uuid) result`
            .then(() => null, (error) => (error as { code: string }).code);
          await waitBlocked(admin(), bpid, apid);
          if (change === 'expiry')
            await blocker`UPDATE auth_sessions SET access_expires_at=clock_timestamp()-interval '1 second' WHERE id=${sid}`;
          else
            await blocker`UPDATE auth_sessions SET access_token_hash=${'f'.repeat(64)} WHERE id=${sid}`;
          await blocker`COMMIT`; blockerOpen = false;
          expect(await pending).toBe('28000');
          await waiter`ROLLBACK`; waiterOpen = false;
        } finally {
          if (blockerOpen) await blocker`ROLLBACK`;
          if (waiterOpen) await waiter`ROLLBACK`;
          await blocker.end(); await waiter.end();
        }
      });
    }
    it('N17 unexpected SQL cancellation propagates instead of returning empty navigation', async () => {
      const f = await ctx.fresh(), principal = await ctx.actor(f, 'ACCOUNTANT');
      const blocker = postgres(process.env.R4_TEST_URL!, { max: 1, prepare: false, onnotice: () => undefined });
      const waiter = postgres(ctx.apiUrl(), { max: 1, prepare: false, onnotice: () => undefined });
      let blockerOpen = false, waiterOpen = false;
      try {
        await blocker`BEGIN`; blockerOpen = true;
        await blocker`SELECT id FROM users WHERE id=${principal.userId} FOR UPDATE`;
        await waiter`BEGIN`; waiterOpen = true;
        await waiter`SELECT educore_r4.bind(${principal.accessToken})`;
        const apid = (await blocker`SELECT pg_backend_pid() pid`)[0].pid as number;
        const bpid = (await waiter`SELECT pg_backend_pid() pid`)[0].pid as number;
        const pending = waiter`SELECT educore_r4.navigation_access(${f.tenant}::uuid) result`
          .then(() => 'SUCCESS', (error) => (error as { code: string }).code);
        await waitBlocked(admin(), bpid, apid);
        const [cancelled] = await admin()`SELECT pg_cancel_backend(${bpid}) cancelled`;
        expect(cancelled.cancelled).toBe(true);
        expect(await pending).toBe('57014');
        await waiter`ROLLBACK`; waiterOpen = false;
        await blocker`ROLLBACK`; blockerOpen = false;
      } finally {
        if (waiterOpen) await waiter`ROLLBACK`;
        if (blockerOpen) await blocker`ROLLBACK`;
        await blocker.end(); await waiter.end();
      }
    });
  });
}
