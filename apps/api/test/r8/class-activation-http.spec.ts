import { describe, expect, it, vi } from 'vitest';
import { AcademicCommandController } from '../../src/academic/academic-command.controller.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';

const tenant = '11111111-1111-4111-8111-111111111111', klass = '22222222-2222-4222-8222-222222222222';
const input = { expectedStatus: 'PLANNED', confirmed: true, reason: 'Approved manual activation' };
function controller() {
  const query = vi.fn().mockResolvedValue([{ result: { id: klass, status: 'ACTIVE' } }]);
  const transaction = vi.fn(async (_token: string, action: (tx: unknown) => Promise<unknown>) => action({ $queryRawUnsafe: query }));
  return { controller: new AcademicCommandController({ repository: { transaction } } as unknown as AuthService), query, transaction };
}
describe('B13 activation transport boundary; authorization and writes use native PostgreSQL tests', () => {
  it('passes only fixed SQL, validated route IDs and strict command through token-bound transaction', async () => {
    const c = controller();
    await c.controller.activateClass(tenant, klass, input, 'Bearer opaque', 'review-key', { query: {} } as never);
    expect(c.transaction).toHaveBeenCalledWith('opaque', expect.any(Function));
    expect(c.query).toHaveBeenCalledWith(expect.stringContaining('educore_r4.class_activate'), tenant, klass, JSON.stringify({ ...input, key: 'review-key' }));
  });
  it('rejects impersonation, time overrides, unconfirmed/invalid intent and missing/bounded operation keys before dispatch', () => {
    const c = controller();
    for (const bad of [{ ...input, confirmed: false }, { ...input, expectedStatus: 'ACTIVE' }, { ...input, reason: '  ' },
      { ...input, reason: 'x'.repeat(2001) }, { ...input, actorId: klass }, { ...input, tenantId: tenant },
      { ...input, permission: 'class.update' }, { ...input, activatedAt: new Date().toISOString() }, { expectedStatus: 'PLANNED', reason: 'Missing confirmation' }])
      expect(() => c.controller.activateClass(tenant, klass, bad, 'Bearer opaque', 'key', { query: {} } as never)).toThrow();
    for (const key of [undefined, '', '   ', 'x'.repeat(201)])
      expect(() => c.controller.activateClass(tenant, klass, input, 'Bearer opaque', key, { query: {} } as never)).toThrow();
    expect(() => c.controller.activateClass(tenant, klass, input, undefined, 'key', { query: {} } as never)).toThrow();
    expect(c.transaction).not.toHaveBeenCalled();
  });
  it('rejects malformed resource IDs and query overrides without issuing SQL', async () => {
    const c = controller();
    await expect(c.controller.activateClass(tenant, 'bad', input, 'Bearer opaque', 'key', { query: {} } as never)).rejects.toThrow();
    await expect(c.controller.activateClass('bad', klass, input, 'Bearer opaque', 'key', { query: {} } as never)).rejects.toThrow();
    expect(() => c.controller.activateClass(tenant, klass, input, 'Bearer opaque', 'key', { query: { tenantId: tenant } } as never)).toThrow();
    expect(c.query).not.toHaveBeenCalled();
  });
});
