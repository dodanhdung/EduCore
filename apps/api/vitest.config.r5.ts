import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['test/r5/**/*.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    reporters: ['default'],
  },
});
