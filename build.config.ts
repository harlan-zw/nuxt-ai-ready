import { glob, unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  entries: [
    { input: './src/cli', builder: 'rollup' },
  ],
  failOnWarn: false,
  hooks: {
    'build:done': async ({ options }) => {
      // UPSTREAM BUG: @nuxtjs/mcp-toolkit generates .d.ts files for MCP definitions
      // that reference internal types not exported from the package. These cause
      // type errors when consumers install the module. Remove until fixed upstream.
      // See: https://github.com/nuxt/mcp-toolkit/issues/XXX
      const dtsFiles = await Array.fromAsync(glob('runtime/server/mcp/**/*.d.ts', {
        cwd: options.outDir,
        withFileTypes: true,
      }))
      await Promise.all(dtsFiles.filter(file => file.isFile()).map(file => unlink(resolve(file.parentPath, file.name))))
    },
  },
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
  ],
})
