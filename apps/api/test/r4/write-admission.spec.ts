import { describe, expect, it } from 'vitest';
import { WriteAdmission, admissionFromEnv, AdmissionClosed } from '../../src/operations/write-admission.js';

describe('R13 process admission', () => {
  it('retains open default and rejects ambiguous operator configuration', () => {
    expect(admissionFromEnv({}).snapshot().mode).toBe('open');
    expect(admissionFromEnv({ R13_ADMISSION_MODE: 'closed' }).snapshot().mode).toBe('closed');
    expect(() => admissionFromEnv({ NODE_ENV: 'production' })).toThrow('ADMISSION_MODE_REQUIRED_IN_PRODUCTION');
    expect(admissionFromEnv({ NODE_ENV: 'production', R13_ADMISSION_MODE: 'closed' }).snapshot().mode).toBe('closed');
    for (const value of ['', 'CLOSED', '0', 'false', ' closed '])
      expect(() => admissionFromEnv({ R13_ADMISSION_MODE: value })).toThrow('INVALID_ADMISSION_MODE');
  });
  it('closed admission never enters a new operation', async () => {
    const gate = new WriteAdmission('closed'); let effects = 0;
    await expect(gate.run(async () => { effects++; })).rejects.toBeInstanceOf(AdmissionClosed);
    expect(effects).toBe(0); expect(gate.snapshot().active).toBe(0);
  });
  it('finishes existing nested work and drains only its actual promise', async () => {
    const gate = new WriteAdmission(); let release!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    let effects = 0, drained = false;
    const operation = gate.run(async () => { await barrier; await gate.run(async () => { effects++; }); });
    const draining = gate.closeAndDrain(2000).then(() => { drained = true; });
    await expect(gate.run(async () => { effects += 100; })).rejects.toBeInstanceOf(AdmissionClosed);
    await new Promise(resolve => setImmediate(resolve)); expect(drained).toBe(false);
    release(); await operation; await draining;
    expect(effects).toBe(1); expect(gate.snapshot()).toEqual({ mode: 'closed', active: 0, drained: true });
  });
  it('timeout never opens admission or reports a false drain', async () => {
    const gate = new WriteAdmission(); let release!: () => void;
    const operation = gate.run(() => new Promise<void>(resolve => { release = resolve; }));
    await expect(gate.closeAndDrain(5)).rejects.toThrow('MAINTENANCE_DRAIN_TIMEOUT');
    expect(gate.snapshot()).toEqual({ mode: 'closed', active: 1, drained: false });
    await expect(gate.run(async () => undefined)).rejects.toBeInstanceOf(AdmissionClosed);
    release(); await operation; await gate.closeAndDrain(1000); expect(gate.snapshot().drained).toBe(true);
  });
  it('does not admit late detached work using stale AsyncLocalStorage after drain', async () => {
    const gate = new WriteAdmission(); let release!: () => void, late!: Promise<void>;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    await gate.run(async () => {
      late = (async () => { await barrier; await gate.run(async () => undefined); })();
    });
    await gate.closeAndDrain(1000);
    release(); await expect(late).rejects.toBeInstanceOf(AdmissionClosed);
  });
  it('releases a failed operation without losing its original error', async () => {
    const gate = new WriteAdmission(); const failure = Error('NATIVE_WORK_FAILED');
    await expect(gate.run(async () => { throw failure; })).rejects.toBe(failure);
    await gate.closeAndDrain(1000); expect(gate.snapshot().active).toBe(0);
  });
});
