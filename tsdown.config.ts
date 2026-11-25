import { glob, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { builder } from '@nuxt/module-builder/tsdown'
import { defineConfig } from 'tsdown'

export default defineConfig({
  hooks: {
    'build:done': async function ({ options }) {
      // MCP Toolkit infers internal types that the package does not export.
      const declarations = await Array.fromAsync(glob('runtime/server/mcp/**/*.d.ts', {
        cwd: options.outDir,
        withFileTypes: true,
      }))
      await Promise.all(declarations.filter(file => file.isFile()).map(file => unlink(resolve(file.parentPath, file.name))))
    },
  },
  plugins: [
    builder({
      entries: [
        './src/cli',
      ],
      externals: [
        'node:sqlite',
        '@modelcontextprotocol/sdk',
        'webpack',
        'webpack-virtual-modules',
        'postcss',
        'rollup',
        'vite',
        'lightningcss',
        'nitropack/types',
        'nuxt/server',
      ],
    }),
  ],
})
