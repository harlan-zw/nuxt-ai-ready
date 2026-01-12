import { unlink } from 'node:fs/promises'
import { resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  failOnWarn: false,
  hooks: {
    'build:done': async ({ options }) => {
      // UPSTREAM BUG: @nuxtjs/mcp-toolkit generates .d.ts files for MCP definitions
      // that reference internal types not exported from the package. These cause
      // type errors when consumers install the module. Remove until fixed upstream.
      // See: https://github.com/nuxt/mcp-toolkit/issues/XXX
      const dtsFiles = await glob('runtime/server/mcp/**/*.d.ts', { cwd: options.outDir })
      await Promise.all(dtsFiles.map(f => unlink(resolve(options.outDir, f))))
    },
  },
  externals: [
    // Nuxt core
    'nuxt',
    'nuxt/schema',
    '@nuxt/kit',
    '@nuxt/schema',
    'nitropack',
    'nitropack/types',
    'h3',
    // Vue
    'vue',
    'vue-router',
    '@vue/runtime-core',
    // Auto-imports
    '#imports',
    // MCP
    '@modelcontextprotocol/sdk',
    // Build tools (should never be bundled)
    'webpack',
    'webpack-virtual-modules',
    'postcss',
    'rollup',
    'vite',
    'lightningcss',
  ],
})
