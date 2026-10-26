import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/r4/r8-scheduling-attendance.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
});
