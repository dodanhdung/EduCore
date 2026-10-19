import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/r4/**/*.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
    reporters: ['default'],
  },
});
