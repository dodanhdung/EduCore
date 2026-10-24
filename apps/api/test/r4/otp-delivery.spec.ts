import { describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { decryptRecovery, encryptRecovery, parseRecoveryKey, recoveryAad } from '../../src/identity-access/recovery-envelope.js';
import { LocalSmtpRecoveryDelivery, SMTP_WATCHDOG_MS } from '../../src/identity-access/recovery-worker.js';
import { createServer } from 'node:net';

describe('R8 recovery envelope', () => {
  const key = parseRecoveryKey('r8-test', randomBytes(32).toString('base64'));
  it('uses the approved binary AAD and round trips a six digit code and normalized recipient', () => {
    const id = randomUUID();
    const aad = recoveryAad(id, key.id);
    expect(aad.subarray(0, 27).toString('utf8')).toBe('EduCore/R4/recovery-otp/v1\0');
    expect(aad.subarray(27, 43)).toEqual(Buffer.from(id.replaceAll('-', ''), 'hex'));
    expect(aad.subarray(43).toString('ascii')).toBe('\x01PASSWORD_RESET\0r8-test');
    const envelope = encryptRecovery(id, 'person@r4.invalid', '000123', key);
    expect(envelope.nonce).toHaveLength(12);
    expect(envelope.tag).toHaveLength(16);
    expect(envelope.ciphertext.toString('utf8')).not.toContain('000123');
    expect(decryptRecovery(id, envelope, key)).toEqual({ email: 'person@r4.invalid', otp: '000123' });
  });
  it('rejects wrong id, key id, tag, malformed recipients and noncanonical key encoding', () => {
    const id = randomUUID();
    const envelope = encryptRecovery(id, 'person@r4.invalid', '123456', key);
    expect(() => decryptRecovery(randomUUID(), envelope, key)).toThrow('RECOVERY_ENVELOPE_INVALID');
    expect(() => decryptRecovery(id, { ...envelope, tag: Buffer.alloc(16) }, key)).toThrow('RECOVERY_ENVELOPE_INVALID');
    expect(() => decryptRecovery(id, { ...envelope, keyId: 'other' }, key)).toThrow('RECOVERY_ENVELOPE_INVALID');
    expect(() => encryptRecovery(id, 'UPPER@r4.invalid', '123456', key)).toThrow('RECOVERY_ENVELOPE_INVALID');
    expect(() => encryptRecovery(id, 'person@r4.invalid', '12', key)).toThrow('RECOVERY_ENVELOPE_INVALID');
    expect(() => parseRecoveryKey('bad space', Buffer.alloc(32).toString('base64'))).toThrow();
    expect(() => parseRecoveryKey('id', 'AAAA')).toThrow();
  });
});

describe('R8 loopback fake SMTP', () => {
  it('uses a 45-second production bound and closes a stalled local transport on watchdog', async () => {
    expect(SMTP_WATCHDOG_MS).toBe(45_000);
    let closed = false;
    let connected = 0;
    const sockets = new Set<import('node:net').Socket>();
    const server = createServer((socket) => {
      sockets.add(socket);
      connected++;
      socket.write('220 fake-smtp.local ESMTP\r\n');
      socket.on('error', () => undefined);
      socket.on('close', () => { closed = true; sockets.delete(socket); });
      // Intentionally never answer EHLO.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('FAKE_SMTP_BIND_FAILED');
    try {
      const delivery = new LocalSmtpRecoveryDelivery({ host: '127.0.0.1', port: address.port,
        user: '', password: '', from: 'otp@r4.invalid' }, 80);
      expect(await delivery.send('person@r4.invalid', '123456')).toBe('UNKNOWN');
      expect(connected).toBe(1);
      for (let i = 0; i < 50 && !closed; i++) await new Promise((resolve) => setTimeout(resolve, 10));
      expect(closed).toBe(true);
    } finally { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
  it.each([
    { recipientCode: 250, expected: 'ACCEPTED' },
    { recipientCode: 450, expected: 'TRANSIENT' },
    { recipientCode: 550, expected: 'PERMANENT' },
  ] as const)('classifies server $recipientCode without claiming inbox delivery', async ({ recipientCode, expected }) => {
    let acceptedMessages = 0;
    const server = createServer((socket) => {
      socket.write('220 fake-smtp.local ESMTP\r\n');
      let pending = '', data = false;
      socket.on('data', (chunk) => {
        pending += chunk.toString('utf8');
        while (pending.includes('\r\n')) {
          const index = pending.indexOf('\r\n');
          const line = pending.slice(0, index); pending = pending.slice(index + 2);
          if (data) {
            if (line === '.') { data = false; acceptedMessages++; socket.write('250 queued locally\r\n'); }
          } else if (/^EHLO |^HELO /i.test(line)) socket.write('250 fake-smtp.local\r\n');
          else if (/^MAIL FROM:/i.test(line)) socket.write('250 sender ok\r\n');
          else if (/^RCPT TO:/i.test(line)) socket.write(`${recipientCode} recipient ${recipientCode === 250 ? 'ok' : 'rejected'}\r\n`);
          else if (/^DATA$/i.test(line)) { data = true; socket.write('354 continue\r\n'); }
          else if (/^QUIT$/i.test(line)) { socket.write('221 closing\r\n'); socket.end(); }
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('FAKE_SMTP_BIND_FAILED');
    try {
      const delivery = new LocalSmtpRecoveryDelivery({ host: '127.0.0.1', port: address.port,
        user: '', password: '', from: 'otp@r4.invalid' });
      expect(await delivery.send('person@r4.invalid', '123456')).toBe(expected);
      expect(acceptedMessages).toBe(recipientCode === 250 ? 1 : 0);
    } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  });
});
