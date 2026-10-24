import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import nodemailer from 'nodemailer';
import { connect, type Socket } from 'node:net';
import { decryptRecovery, parseRecoveryKey, type RecoveryKey } from './recovery-envelope.js';

export type Claim = {
  otpId: string; purpose: 'PASSWORD_RESET'; recipient: string; keyId: string;
  nonce: string; ciphertext: string; tag: string; fence: string; expiresAt: string;
};
export interface RecoveryDeliveryPort {
  send(email: string, otp: string): Promise<'ACCEPTED' | 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN'>;
}
export const SMTP_WATCHDOG_MS = 45_000;
export class LocalSmtpRecoveryDelivery implements RecoveryDeliveryPort {
  constructor(private readonly options: { host: string; port: number; user: string; password: string; from: string },
    private readonly watchdogMs = SMTP_WATCHDOG_MS) {
    if (!['127.0.0.1', 'localhost', '::1'].includes(options.host) || !Number.isInteger(options.port)
      || options.port < 1 || options.port > 65535 || !options.from.endsWith('.invalid'))
      throw Error('LOCAL_FAKE_SMTP_REQUIRED');
    if (!Number.isInteger(watchdogMs) || watchdogMs < 1 ||
      (watchdogMs !== SMTP_WATCHDOG_MS && process.env.NODE_ENV !== 'test'))
      throw Error('SMTP_WATCHDOG_INVALID');
  }
  async send(email: string, otp: string): Promise<'ACCEPTED' | 'TRANSIENT' | 'PERMANENT' | 'UNKNOWN'> {
    if (!email.endsWith('.invalid') || !/^\d{6}$/.test(otp)) return 'PERMANENT';
    let socket: Socket | undefined;
    const transport = nodemailer.createTransport({
      host: this.options.host, port: this.options.port, secure: false,
      getSocket: (_options, callback) => {
        socket = connect({ host: this.options.host, port: this.options.port });
        let connected = false;
        socket.once('connect', () => { connected = true; callback(null, { connection: socket! }); });
        socket.once('error', (error) => { if (!connected) callback(error); });
      },
      auth: this.options.user ? { user: this.options.user, pass: this.options.password } : undefined,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'UNKNOWN'>((resolve) => {
      timer = setTimeout(() => {
        if (socket && !socket.destroyed) socket.resetAndDestroy();
        transport.close(); resolve('UNKNOWN');
      }, this.watchdogMs);
    });
    try {
      return await Promise.race([
        transport.sendMail({
          from: { address: this.options.from, name: 'EduCore' }, to: email,
          subject: 'EduCore verification code',
          text: `Your password reset code is ${otp}. It expires in 15 minutes.`,
          disableFileAccess: true, disableUrlAccess: true,
        }).then((info) => info.accepted.includes(email) ? 'ACCEPTED' as const : 'PERMANENT' as const)
          .catch((error: unknown) => {
            const code = (error as { responseCode?: number }).responseCode;
            return code && code >= 500 ? 'PERMANENT' as const : code && code >= 400 ? 'TRANSIENT' as const : 'UNKNOWN' as const;
          }),
        timeout,
      ]);
    } finally { if (timer) clearTimeout(timer); socket?.destroy(); transport.close(); }
  }
}

export class RecoveryWorker {
  readonly workerId = randomUUID();
  constructor(readonly db: PrismaClient, readonly keys: Map<string, RecoveryKey>, readonly delivery: RecoveryDeliveryPort) {}
  async assertRuntime() {
    const rows = await this.db.$queryRawUnsafe<{ safe: boolean }[]>(`
      SELECT NOT r.rolsuper AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolbypassrls
       AND pg_has_role(session_user,'educore_r4_otp_delivery','MEMBER')
       AND NOT EXISTS(SELECT FROM unnest(ARRAY['educore_r4_auth','educore_r4_api','educore_r4_worker',
         'educore_r4_operator','educore_r4_owner','educore_r2_owner','educore_r3_owner']) other
         WHERE pg_has_role(session_user,other,'MEMBER'))
       AND NOT has_schema_privilege(session_user,'public','CREATE')
       AND NOT has_database_privilege(session_user,current_database(),'CREATE')
       AND NOT has_table_privilege(session_user,'educore_r4.recovery_otp_deliveries','SELECT')
       AND has_function_privilege(session_user,'educore_r4.claim_recovery_delivery(uuid)','EXECUTE')
       AND has_function_privilege(session_user,'educore_r4.check_recovery_delivery(uuid,uuid,bigint,text)','EXECUTE')
       AND has_function_privilege(session_user,'educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text)','EXECUTE')
       AND has_function_privilege(session_user,'educore_r4.sweep_recovery_deliveries(integer)','EXECUTE')
       AND NOT has_function_privilege(session_user,'educore_r4.request_recovery_otp(text,uuid,text,text,bytea,bytea,bytea)','EXECUTE') safe
      FROM pg_roles r WHERE r.rolname=session_user`);
    if (!rows[0]?.safe) throw Error('UNSAFE_OTP_WORKER_LOGIN');
    const acl = await this.db.$queryRawUnsafe<{ safe: boolean }[]>(`
      SELECT count(*)=4 AND bool_and(p.prosecdef AND p.provolatile='v'
        AND p.proconfig @> ARRAY['search_path=pg_catalog, educore_r4, pg_temp']::text[]
        AND owner.rolname='educore_r4_owner' AND NOT owner.rolcanlogin
        AND NOT EXISTS(SELECT FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
        AND has_function_privilege('educore_r4_otp_delivery',p.oid,'EXECUTE')
        AND NOT has_function_privilege('educore_r4_auth',p.oid,'EXECUTE')
        AND NOT has_function_privilege('educore_r4_api',p.oid,'EXECUTE')
        AND NOT has_function_privilege('educore_r4_worker',p.oid,'EXECUTE')) safe
      FROM pg_proc p JOIN pg_roles owner ON owner.oid=p.proowner
      WHERE p.oid IN (
        to_regprocedure('educore_r4.claim_recovery_delivery(uuid)'),
        to_regprocedure('educore_r4.check_recovery_delivery(uuid,uuid,bigint,text)'),
        to_regprocedure('educore_r4.finish_recovery_delivery(uuid,uuid,bigint,text,text,text)'),
        to_regprocedure('educore_r4.sweep_recovery_deliveries(integer)'))`);
    if (!acl[0]?.safe) throw Error('UNSAFE_OTP_WORKER_ACL');
  }
  private async scalar<T>(query: string, ...args: unknown[]): Promise<T> {
    const rows = await this.db.$queryRawUnsafe<{ result: T }[]>(query, ...args);
    return rows[0]?.result;
  }
  async sweep() { return this.scalar<number>('SELECT educore_r4.sweep_recovery_deliveries($1::integer) result', 100); }
  async tick(): Promise<'IDLE' | 'DONE' | 'STALE'> {
    const claim = await this.scalar<Claim | null>('SELECT educore_r4.claim_recovery_delivery($1::uuid) result', this.workerId);
    if (!claim) return 'IDLE';
    const fence = claim.fence;
    let expected = claim.recipient;
    const finish = (outcome: string, code: string | null) => this.scalar<string>(
      'SELECT educore_r4.finish_recovery_delivery($1::uuid,$2::uuid,$3::bigint,$4::text,$5::text,$6::text) result',
      claim.otpId, this.workerId, fence, expected, outcome, code,
    );
    if (claim.purpose !== 'PASSWORD_RESET') {
      await finish('PERMANENT', 'CONFIG_UNAVAILABLE'); return 'DONE';
    }
    const key = this.keys.get(claim.keyId);
    if (!key) { await finish('PERMANENT', 'KEY_UNAVAILABLE'); return 'DONE'; }
    let payload: { email: string; otp: string };
    try {
      payload = decryptRecovery(claim.otpId, {
        keyId: claim.keyId, nonce: Buffer.from(claim.nonce, 'base64'),
        ciphertext: Buffer.from(claim.ciphertext, 'base64'), tag: Buffer.from(claim.tag, 'base64'),
      }, key);
    } catch { await finish('PERMANENT', 'CONFIG_UNAVAILABLE'); return 'DONE'; }
    expected = payload.email;
    if (payload.email !== claim.recipient) {
      await finish('RECIPIENT_MISMATCH', 'RECIPIENT_CHANGED'); return 'DONE';
    }
    const valid = await this.scalar<boolean>(
      'SELECT educore_r4.check_recovery_delivery($1::uuid,$2::uuid,$3::bigint,$4::text) result',
      claim.otpId, this.workerId, fence, expected,
    );
    if (!valid) return 'STALE';
    const delivery = await this.delivery.send(payload.email, payload.otp);
    const outcome = delivery === 'ACCEPTED' ? 'SMTP_ACCEPTED' : delivery === 'TRANSIENT' ? 'TRANSIENT'
      : delivery === 'PERMANENT' ? 'PERMANENT' : 'UNKNOWN';
    const code = delivery === 'ACCEPTED' ? null : delivery === 'TRANSIENT' ? 'SMTP_TRANSIENT'
      : delivery === 'PERMANENT' ? 'SMTP_PERMANENT' : 'SMTP_TIMEOUT_UNKNOWN';
    const state = await finish(outcome, code);
    return state === 'STALE' ? 'STALE' : 'DONE';
  }
}

export function localWorkerFromEnv(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV === 'production') throw Error('PRODUCTION_OTP_WORKER_NOT_APPROVED');
  if (!env.R4_OTP_WORKER_URL || !env.R4_RECOVERY_KEYS || !env.R4_SMTP_HOST || !env.R4_SMTP_PORT || !env.R4_SMTP_FROM)
    throw Error('OTP_WORKER_CONFIG_REQUIRED');
  const entries = JSON.parse(env.R4_RECOVERY_KEYS) as Record<string, string>;
  const keys = new Map(Object.entries(entries).map(([id, value]) => [id, parseRecoveryKey(id, value)]));
  if (!keys.size) throw Error('OTP_WORKER_CONFIG_REQUIRED');
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.R4_OTP_WORKER_URL }) });
  const delivery = new LocalSmtpRecoveryDelivery({ host: env.R4_SMTP_HOST, port: Number(env.R4_SMTP_PORT),
    user: env.R4_SMTP_USER ?? '', password: env.R4_SMTP_PASSWORD ?? '', from: env.R4_SMTP_FROM });
  return new RecoveryWorker(db, keys, delivery);
}
