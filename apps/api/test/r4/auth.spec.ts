import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  AccessTokens,
  passwordHash,
  passwordMatches,
} from '../../src/identity-access/crypto.js';
import { runtimeConfig } from '../../src/identity-access/config.js';
import { SmtpOtpDelivery } from '../../src/identity-access/otp-delivery.js';

describe('R4 authentication crypto and deployment boundaries', () => {
  const key = 'k'.repeat(64),
    tokens = new AccessTokens(key, 'educore', 'web');
  it('Argon2id is salted and verifies only the supplied password', async () => {
    const hash = await passwordHash('Twelve+ password!');
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=1\$/);
    expect(await passwordMatches('Twelve+ password!', hash)).toBe(true);
    expect(await passwordMatches('Incorrect password!', hash)).toBe(false);
    expect(await passwordHash('Twelve+ password!')).not.toBe(hash);
  });
  it('rejects short passwords and unknown stored hash algorithms', async () => {
    await expect(passwordHash('too short')).rejects.toThrow('PASSWORD_POLICY');
    expect(await passwordMatches('anything', '$plain$text')).toBe(false);
  });
  it('enforces 12 Unicode code points and at most 1024 UTF-8 bytes', async () => {
    await expect(passwordHash('😀'.repeat(11))).rejects.toThrow('PASSWORD_POLICY');
    await expect(passwordHash('😀'.repeat(12))).resolves.toMatch(/^\$argon2id\$/);
    await expect(passwordHash('a'.repeat(1024))).resolves.toMatch(/^\$argon2id\$/);
    await expect(passwordHash('a'.repeat(1025))).rejects.toThrow('PASSWORD_POLICY');
    await expect(passwordHash('😀'.repeat(256))).resolves.toMatch(/^\$argon2id\$/);
    await expect(passwordHash('😀'.repeat(257))).rejects.toThrow('PASSWORD_POLICY');
  });
  it('uses a strict JWT algorithm, issuer, audience and 15-minute lifespan', () => {
    const token = tokens.issue('user', 'session', 'tenant'),
      claims = tokens.verify(token);
    expect(claims.exp - claims.iat).toBe(900);
    expect(() => tokens.verify(token.slice(0, -5) + 'xxxxx')).toThrow(
      'AUTH_REQUIRED',
    );
    expect(() => new AccessTokens(key, 'other', 'web').verify(token)).toThrow(
      'AUTH_REQUIRED',
    );
    expect(() =>
      new AccessTokens(key, 'educore', 'other').verify(token),
    ).toThrow('AUTH_REQUIRED');
  });
  it.each(['none', 'HS512'])(
    'rejects %s even with a computed HS256 signature',
    (alg) => {
      const head = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString(
          'base64url',
        ),
        body = tokens.issue('u', 's', null).split('.')[1],
        input = head + '.' + body;
      expect(() =>
        tokens.verify(
          input +
            '.' +
            createHmac('sha256', key).update(input).digest('base64url'),
        ),
      ).toThrow('AUTH_REQUIRED');
    },
  );
  it('rejects signed expired claims and future issue timestamps', () => {
    const token = tokens.issue('u', 's', null),
      head = token.split('.')[0];
    for (const times of [
      { iat: 1, exp: 901 },
      {
        iat: Math.floor(Date.now() / 1000) + 100,
        exp: Math.floor(Date.now() / 1000) + 1000,
      },
    ]) {
      const c = { ...tokens.verify(token), ...times },
        body = Buffer.from(JSON.stringify(c)).toString('base64url'),
        input = head + '.' + body;
      expect(() =>
        tokens.verify(
          input +
            '.' +
            createHmac('sha256', key).update(input).digest('base64url'),
        ),
      ).toThrow('AUTH_REQUIRED');
    }
  });
  it('has no fallback signing key or production capture mode', () => {
    expect(() => new AccessTokens('', 'educore', 'web')).toThrow(
      'AUTH_CONFIG_REQUIRED',
    );
    const env = {
      NODE_ENV: 'production',
      R4_JWT_SECRET: key,
      R4_OTP_PEPPER: key,
      R4_JWT_ISSUER: 'educore',
      R4_JWT_AUDIENCE: 'web',
      R4_WEB_ORIGINS: 'https://web.educore.example',
      R4_OTP_MODE: 'capture',
    };
    expect(() => runtimeConfig(env)).toThrow('INVALID_OTP_MODE');
    expect(() =>
      runtimeConfig({
        ...env,
        R4_OTP_MODE: 'unavailable',
        R4_WORKER_ENABLED: '1',
      }),
    ).toThrow('R4_WORKER_URL_REQUIRED');
  });
  it('SMTP requires explicit authenticated TLS configuration', () => {
    expect(
      () =>
        new SmtpOtpDelivery({
          host: 'smtp.example',
          port: 25,
          user: 'u',
          password: 'p',
          from: 'otp@example.com',
        }),
    ).toThrow('SMTP_CONFIG_REQUIRED');
    expect(
      () =>
        new SmtpOtpDelivery({
          host: 'smtp.example',
          port: 465,
          user: 'u',
          password: 'p',
          from: 'otp@example.com\r\nBcc: attacker@example.com',
        }),
    ).toThrow('SMTP_CONFIG_REQUIRED');
  });
});
