import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/schema-integrity/**/*.postgres.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
  },
});
