import { resolve } from 'pathe'
import { defineConfig, defineProject } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    reporters: 'dot',
    projects: [
      defineProject({
        resolve: {
          alias: {
            // Virtual module aliases for unit tests - defaults to sqlite
            '#ai-ready-virtual/db-provider.mjs': resolve('./src/runtime/server/db/drizzle/providers/sqlite.ts'),
            '#ai-ready-virtual/db-schema.mjs': resolve('./src/runtime/server/db/schema/sqlite.ts'),
            '#ai-ready-virtual/logger.mjs': resolve('./src/runtime/server/logger.ts'),
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            './test/unit/**/*.test.ts',
            './src/**/*.test.ts',
          ],
          exclude: [
            '**/node_modules/**',
          ],
        },
      }),
      defineProject({
        test: {
          name: 'e2e',
          include: ['./test/e2e/**/*.test.ts'],
          environment: 'node',
        },
      }),
      defineProject({
        test: {
          name: 'integration',
          include: ['./test/integration/**/*.test.ts'],
          environment: 'node',
          testTimeout: 300000, // 5 minutes for integration tests
        },
      }),
    ],
  },
})
