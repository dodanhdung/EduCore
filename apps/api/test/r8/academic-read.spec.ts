import { describe, expect, it, vi } from 'vitest';
import { AcademicReadController } from '../../src/academic/academic-read.controller.js';
import type { AuthService } from '../../src/identity-access/auth.service.js';

const tenant = '11111111-1111-4111-8111-111111111111';
const record = '22222222-2222-4222-8222-222222222222';

function controller() {
  const query = vi.fn().mockResolvedValue([{ result: { items: [], page: 1 } }]);
  const transaction = vi.fn(async (_token: string, action: (tx: unknown) => Promise<unknown>) =>
    action({ $queryRawUnsafe: query }));
  const auth = { repository: { transaction } } as unknown as AuthService;
  return { read: new AcademicReadController(auth), query, transaction };
}

describe('academic read HTTP boundary', () => {
  it('uses the bound R4 transaction and a fixed, scoped projection', async () => {
    const { read, query, transaction } = controller();
    await read.list(tenant, 'students', { page: '2', q: 'Lan' }, 'Bearer access', { body: undefined } as never);
    expect(transaction).toHaveBeenCalledWith('access', expect.any(Function));
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('educore_r4.academic_read'), tenant, 'STUDENTS', 'Lan', 2, 20);
    await read.detail(tenant, 'classes', record, 'Bearer access', { query: {}, body: undefined } as never);
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('educore_r4.academic_read'), tenant, 'CLASS', record);
  });

  it('rejects unknown resources, malformed paging and extra query keys', () => {
    const { read, transaction } = controller();
    expect(() => read.list(tenant, 'audit_logs', {}, 'Bearer access', { body: undefined } as never)).toThrow();
    expect(() => read.list(tenant, 'constructor', {}, 'Bearer access', { body: undefined } as never)).toThrow();
    expect(() => read.detail(tenant, 'toString', record, 'Bearer access', { query: {}, body: undefined } as never)).toThrow();
    expect(() => read.list(tenant, 'students', { page: '-1' }, 'Bearer access', { body: undefined } as never)).toThrow();
    expect(() => read.list(tenant, 'students', { scope: 'all' }, 'Bearer access', { body: undefined } as never)).toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
