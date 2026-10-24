import { randomInt, randomUUID, createHmac } from 'node:crypto';
import {
  AccessTokens,
  digest,
  passwordHash,
  passwordMatches,
  secret,
} from './crypto.js';
import { R4Repository, result } from './r4-repository.js';
import type { OtpDeliveryPort } from './otp-delivery.js';
import { encryptRecovery, type RecoveryKey } from './recovery-envelope.js';

export interface AuthConfig {
  jwtSecret: string;
  issuer: string;
  audience: string;
  otpPepper: string;
  origins: string[];
  production: boolean;
  recoveryKey?: RecoveryKey;
}
export class AuthService {
  readonly tokens: AccessTokens;
  private readonly dummy: Promise<string>;
  constructor(
    readonly repository: R4Repository,
    private readonly delivery: OtpDeliveryPort,
    readonly config: AuthConfig,
  ) {
    this.tokens = new AccessTokens(
      config.jwtSecret,
      config.issuer,
      config.audience,
    );
    if (Buffer.byteLength(config.otpPepper) < 32 || !config.origins.length)
      throw Error('AUTH_CONFIG_REQUIRED');
    for (const origin of config.origins) {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        (config.production && url.protocol !== 'https:')
      )
        throw Error('INVALID_AUTH_ORIGIN');
    }
    this.dummy = passwordHash(secret());
  }
  private otpHash(email: string, purpose: string, otp: string) {
    return createHmac('sha256', this.config.otpPepper)
      .update(JSON.stringify([email, purpose, otp]))
      .digest('hex');
  }
  async throttle(ip: string, operation: string, maximum: number) {
    const key = createHmac('sha256', this.config.otpPepper)
      .update(JSON.stringify([ip, operation]))
      .digest('hex');
    return result<boolean>(
      this.repository.auth,
      'SELECT educore_r4.throttle($1::text,$2::int) result',
      key,
      maximum,
    );
  }
  async login(email: string, password: string) {
    const row = await result<{ userId: string; passwordHash: string } | null>(
      this.repository.auth,
      'SELECT educore_r4.auth_lookup($1::text) result',
      email,
    );
    const verified = await passwordMatches(
      password,
      row?.passwordHash ?? (await this.dummy),
    );
    const sid = randomUUID(),
      refreshToken = secret(),
      csrfToken = secret();
    const accessToken = this.tokens.issue(
      row?.userId ?? randomUUID(),
      sid,
      null,
    );
    const data = await result<{
      user: { id: string; displayName: string };
      allowedTenants: { id: string; name: string }[];
    } | null>(
      this.repository.auth,
      'SELECT educore_r4.login($1::text,$2::text,$3::boolean,$4::uuid,$5::text,$6::text,$7::text) result',
      email,
      row?.passwordHash ?? '',
      verified,
      sid,
      digest(refreshToken),
      digest(accessToken),
      digest(csrfToken),
    );
    if (!data) throw Error('INVALID_CREDENTIALS');
    return {
      ...data,
      requiresTenantSelection: true,
      accessToken,
      expiresInSeconds: 900,
      refreshToken,
      csrfToken,
    };
  }
  async refresh(refreshToken: string, csrf: string) {
    const hash = digest(refreshToken);
    const row = await result<{
      sessionId: string;
      userId: string;
      tenantId: string | null;
    } | null>(
      this.repository.auth,
      'SELECT educore_r4.refresh_identity($1::text) result',
      hash,
    );
    const nextRefresh = secret(),
      csrfToken = secret();
    const accessToken = this.tokens.issue(
      row?.userId ?? randomUUID(),
      row?.sessionId ?? randomUUID(),
      row?.tenantId ?? null,
    );
    const data = await result<Record<string, unknown> | null>(
      this.repository.auth,
      'SELECT educore_r4.refresh($1::text,$2::text,$3::text,$4::text,$5::text) result',
      hash,
      digest(csrf),
      digest(nextRefresh),
      digest(accessToken),
      digest(csrfToken),
    );
    if (!data) throw Error('AUTH_REQUIRED');
    return {
      accessToken,
      expiresInSeconds: 900,
      refreshToken: nextRefresh,
      csrfToken,
    };
  }
  me(token: string) {
    this.tokens.verify(token);
    return this.repository.transaction(token, (tx) =>
      result<Record<string, unknown>>(tx, 'SELECT educore_r4.me() result'),
    );
  }
  async selectTenant(token: string, tenant: string) {
    const claims = this.tokens.verify(token),
      accessToken = this.tokens.issue(claims.sub, claims.sid, tenant);
    await this.repository.transaction(token, (tx) =>
      result(
        tx,
        'SELECT educore_r4.select_tenant($1::uuid,$2::text)::text result',
        tenant,
        digest(accessToken),
      ),
    );
    return {
      accessToken,
      expiresInSeconds: 900,
      principal: await this.me(accessToken),
    };
  }
  async logout(token: string) {
    this.tokens.verify(token);
    await this.repository.transaction(token, (tx) =>
      result(tx, 'SELECT educore_r4.logout()::text result'),
    );
  }
  async requestOtp(email: string, purpose: 'ACTIVATION' | 'PASSWORD_RESET') {
    if (purpose === 'PASSWORD_RESET') {
      const key = this.config.recoveryKey;
      if (!key) throw Error('RECOVERY_GLOBAL_UNAVAILABLE');
      const otpId = randomUUID();
      const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
      const envelope = encryptRecovery(otpId, email, otp, key);
      await result<boolean>(
        this.repository.auth,
        'SELECT educore_r4.request_recovery_otp($1::text,$2::uuid,$3::text,$4::text,$5::bytea,$6::bytea,$7::bytea) result',
        email, otpId, this.otpHash(email, purpose, otp), envelope.keyId,
        envelope.nonce, envelope.ciphertext, envelope.tag,
      );
      return;
    }
    const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const accepted = await result<boolean>(
      this.repository.auth,
      'SELECT educore_r4.request_otp($1::text,$2::"OtpPurpose",$3::text) result',
      email,
      purpose,
      this.otpHash(email, purpose, otp),
    );
    // Delivery starts after commit and never delays the generic HTTP response.
    // Provider latency/failure must not reveal whether an email was eligible.
    // OTP delivery is best effort: a restart may require an explicit resend.
    if (accepted) {
      void this.delivery.deliver(email, otp, purpose).catch(() => {
        console.warn('R4_OTP_DELIVERY_FAILED');
      });
    }
  }
  async recoveryReady() {
    if (!this.config.recoveryKey) throw Error('RECOVERY_GLOBAL_UNAVAILABLE');
    await result<number>(this.repository.auth, 'SELECT 1::int result');
  }
  async reset(
    email: string,
    otp: string,
    password: string,
    purpose: 'ACTIVATION' | 'PASSWORD_RESET',
  ) {
    const hash = await passwordHash(password);
    const ok = await result<boolean>(
      this.repository.auth,
      'SELECT educore_r4.reset_password($1::text,$2::"OtpPurpose",$3::text,$4::text) result',
      email,
      purpose,
      this.otpHash(email, purpose, otp),
      hash,
    );
    if (!ok) throw Error('INVALID_OTP');
  }
  async changePassword(
    token: string,
    oldPassword: string,
    newPassword: string,
  ) {
    this.tokens.verify(token);
    const oldHash = await this.repository.transaction(token, (tx) =>
      result<string>(tx, 'SELECT educore_r4.credential_hash() result'),
    );
    if (!(await passwordMatches(oldPassword, oldHash)))
      throw Error('INVALID_CREDENTIALS');
    const newHash = await passwordHash(newPassword);
    const ok = await this.repository.transaction(token, (tx) =>
      result<boolean>(
        tx,
        'SELECT educore_r4.change_password($1::text,$2::text) result',
        oldHash,
        newHash,
      ),
    );
    if (!ok) throw Error('AUTH_REQUIRED');
  }
}
