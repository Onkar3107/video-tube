import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',              // Entry point
        'src/workers/index.ts',      // Worker entry point
        'src/config/database.ts',    // DB singleton
        'src/**/*.dto.ts',           // Zod schemas — tested via validator tests
        'src/websocket/**',          // WebSocket — manual/integration testing
        'src/queues/index.ts',       // Queue definitions
        'src/config/swagger.ts',     // Swagger config
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
    },
  },
});
