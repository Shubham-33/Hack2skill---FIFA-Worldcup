import path from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Coverage is gated at 100% across the logic layer: the policy engine, the resilience
 * stack, the operational aggregation, and both API routes.
 *
 * Presentation components are excluded deliberately rather than by oversight. Every
 * decision that can produce a wrong answer for a fan lives in `src/lib` or `src/app/api`,
 * and that is where a coverage gate carries real meaning — a threshold met by asserting
 * on rendered class names would inflate the number without protecting anything.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts', 'src/app/api/**/*.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
});
