// Disposable R4 native runner only. Never prints or persists recipients, OTPs or keys.
import { createHash } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { R4Module, configureR4Http } from '../../dist/identity-access/r4.module.js';
import { R4Repository } from '../../dist/identity-access/r4-repository.js';
import { parseRecoveryKey } from '../../dist/identity-access/recovery-envelope.js';
import { localWorkerFromEnv } from '../../dist/identity-access/recovery-worker.js';

const hold = () => new Promise(() => { setInterval(() => {}, 1_000); });
const signal = (phase, detail) => process.send?.({ phase, ...detail });

async function main() {
  if (process.env.R4_TEST_DISPOSABLE !== 'I_OWN_THIS_DISPOSABLE_CLUSTER') throw Error('DISPOSABLE_REQUIRED');
  if (process.env.R4_CRASH_MODE === 'issue-http') {
    const repository = new R4Repository(process.env.R4_AUTH_URL, process.env.R4_API_URL);
    await repository.assertRuntime();
    const key = parseRecoveryKey('r8-test', process.env.R4_CRASH_KEY);
    const config = {
      jwtSecret: process.env.R4_CRASH_JWT, otpPepper: process.env.R4_CRASH_PEPPER,
      issuer: 'educore-test', audience: 'educore-web', origins: ['http://localhost:5173'],
      production: false, recoveryKey: key,
    };
    const app = await NestFactory.create(R4Module.register(repository, config, { deliver: async () => {} }), { logger: false });
    configureR4Http(app, config);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw Error('API_LISTEN_FAILED');
    signal('HTTP_READY', { port: address.port });
    await hold();
  }
  const worker = localWorkerFromEnv(process.env);
  await worker.assertRuntime();
  signal('WORKER_READY', { workerId: worker.workerId });
  const transport = worker.delivery;
  worker.delivery = {
    send: async (email, otp) => {
      if (process.env.R4_CRASH_MODE === 'complete') {
        signal('RESENT', { otpDigest: createHash('sha256').update(otp).digest('hex') });
        return 'ACCEPTED';
      }
      if (process.env.R4_CRASH_MODE === 'before-send') {
        signal('BEFORE_SEND', { workerId: worker.workerId });
        return hold();
      }
      const result = await transport.send(email, otp);
      signal('AFTER_SMTP', { workerId: worker.workerId, result, otpDigest: createHash('sha256').update(otp).digest('hex') });
      return hold();
    },
  };
  const state = await worker.tick();
  if (process.env.R4_CRASH_MODE === 'complete') {
    signal('COMPLETED', { state });
    await worker.db.$disconnect();
    return;
  }
  throw Error('UNEXPECTED_WORKER_COMPLETION');
}
main().catch(() => { signal('ERROR'); process.exitCode = 1; });
