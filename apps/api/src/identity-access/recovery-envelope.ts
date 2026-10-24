import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const RECOVERY_PURPOSE = 'PASSWORD_RESET';
const prefix = Buffer.from('EduCore/R4/recovery-otp/v1\0', 'utf8');
const purpose = Buffer.from('\x01PASSWORD_RESET\0', 'ascii');
const keyIdPattern = /^[A-Za-z0-9._-]{1,64}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RecoveryKey = { id: string; key: Buffer };
export type RecoveryEnvelope = {
  keyId: string;
  nonce: Buffer;
  ciphertext: Buffer;
  tag: Buffer;
};

export function parseRecoveryKey(id: string, encoded: string): RecoveryKey {
  if (!keyIdPattern.test(id) || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw Error('RECOVERY_KEY_CONFIG_INVALID');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded)
    throw Error('RECOVERY_KEY_CONFIG_INVALID');
  return { id, key };
}

export function recoveryAad(otpId: string, keyId: string): Buffer {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(otpId)
    || !keyIdPattern.test(keyId)) throw Error('RECOVERY_ENVELOPE_INVALID');
  return Buffer.concat([prefix, Buffer.from(otpId.replaceAll('-', ''), 'hex'), purpose, Buffer.from(keyId, 'ascii')]);
}

export function validRecoveryEmail(email: string): boolean {
  return email === email.normalize('NFC').trim().toLowerCase()
    && Buffer.byteLength(email, 'utf8') >= 1
    && Buffer.byteLength(email, 'utf8') <= 1024
    && email.length <= 254 && emailPattern.test(email);
}

export function encryptRecovery(otpId: string, email: string, otp: string, key: RecoveryKey): RecoveryEnvelope {
  if (!validRecoveryEmail(email) || !/^\d{6}$/.test(otp) || key.key.length !== 32)
    throw Error('RECOVERY_ENVELOPE_INVALID');
  const recipient = Buffer.from(email, 'utf8');
  const plaintext = Buffer.alloc(9 + recipient.length);
  plaintext[0] = 1;
  plaintext.writeUInt16BE(recipient.length, 1);
  recipient.copy(plaintext, 3);
  plaintext.write(otp, 3 + recipient.length, 6, 'ascii');
  const nonce = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key.key, nonce);
    cipher.setAAD(recoveryAad(otpId, key.id));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { keyId: key.id, nonce, ciphertext, tag: cipher.getAuthTag() };
  } finally { plaintext.fill(0); recipient.fill(0); }
}

export function decryptRecovery(otpId: string, envelope: RecoveryEnvelope, key: RecoveryKey): { email: string; otp: string } {
  if (key.id !== envelope.keyId || key.key.length !== 32 || envelope.nonce.length !== 12
    || envelope.tag.length !== 16 || envelope.ciphertext.length < 10 || envelope.ciphertext.length > 1033)
    throw Error('RECOVERY_ENVELOPE_INVALID');
  let plaintext: Buffer | undefined;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key.key, envelope.nonce);
    decipher.setAAD(recoveryAad(otpId, envelope.keyId));
    decipher.setAuthTag(envelope.tag);
    plaintext = Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
    if (plaintext.length < 10 || plaintext[0] !== 1) throw Error('RECOVERY_ENVELOPE_INVALID');
    const length = plaintext.readUInt16BE(1);
    if (length < 1 || length > 1024 || plaintext.length !== 9 + length)
      throw Error('RECOVERY_ENVELOPE_INVALID');
    const email = plaintext.subarray(3, 3 + length).toString('utf8');
    const otp = plaintext.subarray(3 + length).toString('ascii');
    if (!validRecoveryEmail(email) || Buffer.byteLength(email, 'utf8') !== length || !/^\d{6}$/.test(otp))
      throw Error('RECOVERY_ENVELOPE_INVALID');
    return { email, otp };
  } catch { throw Error('RECOVERY_ENVELOPE_INVALID'); }
  finally { plaintext?.fill(0); }
}
