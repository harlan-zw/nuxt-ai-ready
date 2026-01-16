import { defineConfig, defineProject } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    reporters: 'dot',
    projects: [
      defineProject({
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
