import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['hooks/__tests__/**/*.test.js'],
    exclude: [
      'hooks/__tests__/hooks.test.js',
      'hooks/__tests__/security.test.js',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['hooks/**/*.js'],
      exclude: [
        'hooks/__tests__/**',
        'hooks/validate-plugin.js',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
    globals: false,
    environment: 'node',
    testTimeout: 10000,
  },
});
