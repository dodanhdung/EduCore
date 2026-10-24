import { localWorkerFromEnv } from './recovery-worker.js';

async function main() {
  const worker = localWorkerFromEnv(process.env);
  await worker.assertRuntime();
  let lastSweep = 0;
  try {
    for (;;) {
      if (Date.now() - lastSweep >= 30_000) { await worker.sweep(); lastSweep = Date.now(); }
      const state = await worker.tick();
      if (state === 'IDLE') await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  } finally { await worker.db.$disconnect(); }
}
main().catch(() => { console.error('R8_OTP_WORKER_FAILED'); process.exitCode = 1; });
