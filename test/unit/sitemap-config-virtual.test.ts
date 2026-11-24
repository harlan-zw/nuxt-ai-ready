import type { NitroConfig } from 'nitropack/types'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installModule } from '@nuxt/kit'
import { loadNuxt } from 'nuxt'
import { describe, expect, it } from 'vitest'
import module from '../../src/module'

async function resolveVirtualModule(entry: unknown) {
  return typeof entry === 'function' ? await entry() : entry
}

describe('#ai-ready-virtual/sitemap-config.mjs', () => {
  it('falls back to an empty default export when @nuxtjs/sitemap is disabled', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ai-ready-sitemap-disabled-'))
    const nuxt = await loadNuxt({
      cwd: rootDir,
      ready: false,
      dev: false,
      overrides: {
        modules: [],
        sitemap: { enabled: false },
      },
    })
    try {
      await installModule(module, { database: false, agentSkills: false }, nuxt)
      const nitroConfig: NitroConfig = { virtual: {} }
      await nuxt.callHook('nitro:config', nitroConfig)

      const content = await resolveVirtualModule(nitroConfig.virtual?.['#ai-ready-virtual/sitemap-config.mjs'])
      expect(content).toBe('export default {}')
    }
    finally {
      await nuxt.close()
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('re-exports #sitemap-virtual/static-config.mjs when registered before or after nitro:config', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ai-ready-sitemap-enabled-'))
    const nuxt = await loadNuxt({
      cwd: rootDir,
      ready: false,
      dev: false,
      overrides: {
        modules: [],
      },
    })
    try {
      await installModule(module, { database: false, agentSkills: false }, nuxt)
      const nitroConfig: NitroConfig = { virtual: {} }
      await nuxt.callHook('nitro:config', nitroConfig)

      // Simulate @nuxtjs/sitemap registering its virtual module after nuxt-ai-ready
      nitroConfig.virtual!['#sitemap-virtual/static-config.mjs'] = 'export default { sitemaps: {} }'

      const content = await resolveVirtualModule(nitroConfig.virtual?.['#ai-ready-virtual/sitemap-config.mjs'])
      expect(content).toBe(`export { default } from '#sitemap-virtual/static-config.mjs'`)
    }
    finally {
      await nuxt.close()
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
