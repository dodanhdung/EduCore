import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/r4/r4.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 180_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
});
