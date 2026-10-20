import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  BillingCalculator,
  MAX_VND,
  vnd,
} from '../../src/billing/billing-calculator.js';
import {
  GenerationService,
  InvoiceLifecycleService,
  WalletService,
} from '../../src/billing/billing-services.js';
import { R2Repository } from '../../src/billing/r2-repository.js';
import { SchedulingService } from '../../src/scheduling/scheduling.service.js';
import type { R3Repository } from '../../src/academic/r3-repository.js';

afterEach(() => vi.restoreAllMocks());
const intent = { key: 'same-request', reason: 'Independent unit verification' };
const repository = () =>
  new R2Repository('postgresql://synthetic:unused@127.0.0.1:1/never_connect');

describe('R6 financial unit boundaries', () => {
  it('rejects noncanonical, zero-forbidden, overflow and invalid charge units', () => {
    for (const amount of ['0', (MAX_VND + 1n).toString()])
      expect(() => vnd(amount, false)).toThrow('VND_OUT_OF_RANGE');
    expect(() =>
      new BillingCalculator().calculate(
        [{ units: 2 as 1, unitPriceVnd: '1' }],
        false,
      ),
    ).toThrow('INVALID_UNITS');
    expect(new BillingCalculator().calculate([], false).totalVnd).toBe('0');
  });
  it('rejects invalid intent/receipt before funding or issuing any command', async () => {
    const repo = repository(),
      command = vi.spyOn(repo, 'command').mockResolvedValue({});
    const wallet = new WalletService(repo),
      invoices = new InvoiceLifecycleService(repo);
    for (const bad of [
      { key: '', reason: 'r' },
      { key: ' '.repeat(2), reason: 'r' },
      { key: 'x'.repeat(201), reason: 'r' },
      { key: 'k', reason: '' },
    ]) {
      expect(() => invoices.issue('t', 'i', bad)).toThrow(
        'OPERATION_KEY_AND_REASON_REQUIRED',
      );
    }
    expect(() =>
      wallet.topUp('t', 's', '1', 'CASH', ' ', 'proof', intent),
    ).toThrow('VERIFIED_RECEIPT_REQUIRED');
    expect(() =>
      wallet.topUp('t', 's', '1', 'CASH', 'ref', ' ', intent),
    ).toThrow('VERIFIED_RECEIPT_REQUIRED');
    expect(() => wallet.pay('t', 'i', '0', intent)).toThrow();
    expect(() => invoices.requestAdjustment('t', 'i', '-0', intent)).toThrow();
    expect(command).not.toHaveBeenCalled();
    await repo.onModuleDestroy();
  });
  it('compares all database totals inside the command transaction for G1 and G2', async () => {
    const repo = repository(),
      generation = new GenerationService(repo);
    const valid = {
      source: { lines: [{ units: 1, unitPriceVnd: '15' }], sibling: true },
      grossVnd: '15',
      discountVnd: '1',
      totalVnd: '14',
    };
    const command = vi
      .spyOn(repo, 'command')
      .mockImplementation(async (_tenant, _command, validate) => {
        validate?.(valid);
        return valid;
      });
    expect(await generation.initial('t', 's', 'p', intent)).toEqual(valid);
    expect(
      await generation.recompute('t', 's', 'p', 'g1', null, intent),
    ).toEqual(valid);
    for (const key of ['grossVnd', 'discountVnd', 'totalVnd']) {
      command.mockImplementation(async (_tenant, _command, validate) => {
        const bad = { ...valid, [key]: '999' };
        validate?.(bad);
        return bad;
      });
      await expect(generation.initial('t', 's', 'p', intent)).rejects.toThrow(
        'DATABASE_CALCULATION_MISMATCH',
      );
    }
    await repo.onModuleDestroy();
  });
  it('preserves sign and requires a nonzero canonical adjustment', async () => {
    const repo = repository(),
      command = vi.spyOn(repo, 'command').mockResolvedValue({ id: 'request' }),
      invoices = new InvoiceLifecycleService(repo);
    for (const amount of ['-5', '5'])
      await invoices.requestAdjustment('t', 'i', amount, intent);
    expect(command.mock.calls.map((c) => c[1].deltaVnd)).toEqual(['-5', '5']);
    for (const amount of ['-01', '+1', '0', '1.1'])
      expect(() =>
        invoices.requestAdjustment('t', 'i', amount, intent),
      ).toThrow();
    await repo.onModuleDestroy();
  });
  it('normalizes receipt identity without changing exact monetary transport', async () => {
    const repo = repository(),
      command = vi.spyOn(repo, 'command').mockResolvedValue({ id: 'topup' });
    await new WalletService(repo).topUp(
      't',
      's',
      MAX_VND.toString(),
      'BANK_TRANSFER',
      '  e\u0301  ',
      'verified',
      intent,
    );
    expect(command.mock.calls[0][1]).toMatchObject({
      amountVnd: MAX_VND.toString(),
      receiptReference: 'é',
      operation: 'TOP_UP',
    });
    await repo.onModuleDestroy();
  });
});

describe('R6 outcome recovery unit boundaries', () => {
  const fakeTx = (value: unknown) => ({
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ result: value }]),
  });
  it('does not force constraints or return success after a validation failure', async () => {
    const repo = repository(),
      tx = fakeTx({ totalVnd: 'wrong' });
    vi.spyOn(repo.prisma, '$transaction').mockImplementation(
      async (callback: unknown) =>
        (callback as (tx: unknown) => Promise<unknown>)(tx),
    );
    await expect(
      repo.command('t', { operation: 'GENERATE' }, () => {
        throw Error('mismatch');
      }),
    ).rejects.toThrow('mismatch');
    expect(tx.$executeRawUnsafe.mock.calls.flat()).not.toContain(
      'SET CONSTRAINTS ALL IMMEDIATE',
    );
    await repo.onModuleDestroy();
  });
  it('forces deferred constraints before reporting a successful command', async () => {
    const repo = repository(),
      tx = fakeTx({ id: 'effect' });
    vi.spyOn(repo.prisma, '$transaction').mockImplementation(
      async (callback: unknown) =>
        (callback as (tx: unknown) => Promise<unknown>)(tx),
    );
    expect(await repo.command('t', { operation: 'ISSUE' })).toEqual({
      id: 'effect',
    });
    expect(tx.$executeRawUnsafe.mock.calls.at(-1)).toEqual([
      'SET CONSTRAINTS ALL IMMEDIATE',
    ]);
    await repo.onModuleDestroy();
  });
  it.each(['committed', 'no-effect', 'lookup-denied'])(
    'unknown approval outcome: %s',
    async (outcome) => {
      const repo = repository(),
        original = Error('lost response'),
        tx = fakeTx(outcome === 'committed' ? { id: 'durable-root' } : null);
      const transaction = vi
        .spyOn(repo.prisma, '$transaction')
        .mockRejectedValueOnce(original);
      if (outcome === 'lookup-denied')
        transaction.mockRejectedValueOnce(Error('revoked'));
      else
        transaction.mockImplementationOnce(async (callback: unknown) =>
          (callback as (tx: unknown) => Promise<unknown>)(tx),
        );
      const result = repo.command('t', {
        operation: 'EXECUTE_APPROVAL',
        approvalId: 'a',
        key: 'same-key',
      });
      if (outcome === 'committed')
        await expect(result).resolves.toEqual({ id: 'durable-root' });
      else await expect(result).rejects.toBe(original);
      expect(transaction).toHaveBeenCalledTimes(2);
      await repo.onModuleDestroy();
    },
  );
  it('does not reconcile an ordinary failed mutation as an approval', async () => {
    const repo = repository(),
      failure = Error('business conflict');
    const transaction = vi
      .spyOn(repo.prisma, '$transaction')
      .mockRejectedValue(failure);
    await expect(repo.command('t', { operation: 'PAY' })).rejects.toBe(failure);
    expect(transaction).toHaveBeenCalledTimes(1);
    await repo.onModuleDestroy();
  });
});

describe('R6 scheduling unit boundaries', () => {
  it('invalid intent cannot reserve a slot or create a recurrence', () => {
    const command = vi.fn(),
      service = new SchedulingService({ command } as unknown as R3Repository);
    expect(() => service.confirm('t', 's', { key: '', reason: 'r' })).toThrow(
      'OPERATION_KEY_AND_REASON_REQUIRED',
    );
    expect(() =>
      service.createSeries(
        't',
        {
          classId: 'c',
          teacherId: 'teacher',
          deliveryMode: 'ONLINE',
          weekday: 1,
          localStartTime: '09:00',
          durationMinutes: 60,
          validFrom: '2099-01-01',
          validTo: '2099-06-30',
        },
        { key: 'k', reason: ' ' },
      ),
    ).toThrow();
    expect(command).not.toHaveBeenCalled();
  });
  it('cancelling a busy interval cannot accidentally execute its confirmation command', async () => {
    const command = vi.fn(),
      service = new SchedulingService({ command } as unknown as R3Repository);
    await service.decideUnavailability('t', 'busy', false, intent);
    await service.decideUnavailability('t', 'busy', true, intent);
    expect(command.mock.calls.map((call) => call[2].operation)).toEqual([
      'BUSY_CANCEL',
      'BUSY_CONFIRM',
    ]);
    expect(
      command.mock.calls.every((call) => call[2].unavailabilityId === 'busy'),
    ).toBe(true);
  });
});
