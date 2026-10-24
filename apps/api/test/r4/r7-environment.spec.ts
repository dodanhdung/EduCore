import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isAbsolute, relative, resolve } from 'node:path';
import { runtimeConfig } from '../../src/identity-access/config.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const target = resolve(directory);
    const within = relative(resolve(tmpdir()), target);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw Error('UNSAFE_TEST_CLEANUP');
    rmSync(target, { recursive: true, force: true });
  }
});
describe('R7 explicit local environment loading', () => {
  it('Node loads a named env file and preserves explicit process overrides', () => {
    const directory = mkdtempSync(join(tmpdir(), 'educore-r7-env-'));
    directories.push(directory);
    const file = join(directory, '.env');
    writeFileSync(file, 'PORT=3210\nR4_JWT_ISSUER=local-file\n');
    const output = execFileSync(process.execPath, [
      `--env-file=${file}`, '-e', 'process.stdout.write(JSON.stringify([process.env.PORT,process.env.R4_JWT_ISSUER]))',
    ], { env: { SystemRoot: process.env.SystemRoot, PORT: '3211' }, encoding: 'utf8' });
    expect(JSON.parse(output)).toEqual(['3211', 'local-file']);
  });
  it('allows local unavailable delivery and requires a separate worker URL when enabled', () => {
    const env = {
      NODE_ENV: 'development', R4_JWT_SECRET: 'k'.repeat(64), R4_OTP_PEPPER: 'p'.repeat(64),
      R4_JWT_ISSUER: 'educore-local', R4_JWT_AUDIENCE: 'web-local',
      R4_WEB_ORIGINS: 'http://localhost:5173', R4_OTP_MODE: 'unavailable',
      R4_RECOVERY_ACTIVE_KEY_ID: 'r8-test',
      R4_RECOVERY_ACTIVE_KEY: Buffer.alloc(32, 9).toString('base64'),
    };
    const config = runtimeConfig(env);
    expect(config.auth.origins).toEqual(['http://localhost:5173']);
    expect(config.auth.production).toBe(false);
    expect(config.workerEnabled).toBe(false);
    expect(runtimeConfig({ ...env, R4_RECOVERY_ACTIVE_KEY_ID: undefined, R4_RECOVERY_ACTIVE_KEY: undefined }).auth.recoveryKey).toBeUndefined();
    expect(() => runtimeConfig({ ...env, R4_WORKER_ENABLED: '1' })).toThrow('R4_WORKER_URL_REQUIRED');
  });
});
