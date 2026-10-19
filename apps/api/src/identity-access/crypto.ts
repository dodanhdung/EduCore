import {
  argon2,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    argon2(
      'argon2id',
      {
        message: password,
        nonce: salt,
        parallelism: 1,
        tagLength: 32,
        memory: 65536,
        passes: 3,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
export async function passwordHash(password: string) {
  // Q-01 counts Unicode code points, without applying normalization to secrets.
  if (Array.from(password).length < 12 || Buffer.byteLength(password) > 1024)
    throw Error('PASSWORD_POLICY');
  const salt = randomBytes(16),
    key = await derive(password, salt);
  return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function passwordMatches(password: string, encoded: string) {
  const parts = encoded.split('$');
  if (
    parts.length !== 6 ||
    parts[1] !== 'argon2id' ||
    parts[2] !== 'v=19' ||
    parts[3] !== 'm=65536,t=3,p=1'
  )
    return false;
  const salt = Buffer.from(parts[4], 'base64');
  if (salt.length !== 16) return false;
  return equal((await derive(password, salt)).toString('base64'), parts[5]);
}
export interface Claims {
  sub: string;
  sid: string;
  tid: string | null;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
  jti: string;
}
export class AccessTokens {
  constructor(
    private readonly key: string,
    private readonly issuer: string,
    private readonly audience: string,
  ) {
    if (Buffer.byteLength(key) < 32 || !issuer || !audience)
      throw Error('AUTH_CONFIG_REQUIRED');
  }
  issue(user: string, session: string, tenant: string | null) {
    const now = Math.floor(Date.now() / 1000);
    const claims: Claims = {
      sub: user,
      sid: session,
      tid: tenant,
      iat: now,
      exp: now + 900,
      iss: this.issuer,
      aud: this.audience,
      jti: secret(),
    };
    const prefix =
      Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url') +
      '.' +
      Buffer.from(JSON.stringify(claims)).toString('base64url');
    return (
      prefix +
      '.' +
      createHmac('sha256', this.key).update(prefix).digest('base64url')
    );
  }
  verify(token: string): Claims {
    try {
      if (token.length > 2048) throw Error();
      const [head, body, sig, extra] = token.split('.');
      const header = JSON.parse(Buffer.from(head, 'base64url').toString()) as {
        alg?: string;
        typ?: string;
      };
      if (
        extra ||
        header.alg !== 'HS256' ||
        header.typ !== 'JWT' ||
        !equal(
          sig,
          createHmac('sha256', this.key)
            .update(head + '.' + body)
            .digest('base64url'),
        )
      )
        throw Error();
      const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as Claims;
      const now = Math.floor(Date.now() / 1000);
      if (
        c.iss !== this.issuer ||
        c.aud !== this.audience ||
        !Number.isInteger(c.exp) ||
        c.exp <= now ||
        c.exp - c.iat !== 900 ||
        c.iat > now + 5 ||
        !c.sub ||
        !c.sid ||
        !c.jti
      )
        throw Error();
      return c;
    } catch {
      throw Error('AUTH_REQUIRED');
    }
  }
}
