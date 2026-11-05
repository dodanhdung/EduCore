import { defineConfig } from 'vitest/config';
export default defineConfig({ test: {
  include: ['test/r4/b11-reuse.postgres.test.ts'], fileParallelism: false,
  testTimeout: 240_000, hookTimeout: 90_000, reporters: ['default'],
} });
