import { defineConfig } from 'vitest/config';

// Unit tests cover pure logic units (survival score, line diff, secret-scan
// partition, persisted-state sanitizer, stack-trace parser). They need no DOM,
// so the lightweight node environment keeps runs fast.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
