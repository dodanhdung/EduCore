import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/r6/**/*.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 120000,
    hookTimeout: 120000,
    reporters: ['default'],
  },
});
