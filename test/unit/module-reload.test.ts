import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installModule } from '@nuxt/kit'
import { loadNuxt } from 'nuxt'
import { describe, expect, it, vi } from 'vitest'
import { logger } from '../../src/logger'
import module from '../../src/module'

describe('configuration warnings on Nitro reload', () => {
  it.each([
    { major: 2, preparing: false },
    { major: 3, preparing: false },
    { major: 2, preparing: true },
    { major: 3, preparing: true },
  ] as const)('keeps warnings working with Nitro $major, prepare: $preparing', async ({ major, preparing }) => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ai-ready-reload-'))
    const nuxt = await loadNuxt({
      cwd: rootDir,
      ready: false,
      dev: false,
      overrides: { modules: [], _nitroMajor: major, _prepare: preparing },
    })
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    try {
      await installModule(module, { database: false, agentSkills: false }, nuxt)
      const reload = major === 3 ? 'build:reload' : 'rollup:reload'
      const callbacks = new Map<string, () => void>()
      const deprecated = vi.fn()
      const nitro = {
        options: { static: false, routeRules: {} },
        hooks: {
          afterEach: vi.fn(),
          hook(name: string, callback: () => void) {
            if (major === 3 && name === 'rollup:reload')
              deprecated('rollup:reload hook has been deprecated, please use build:reload')
            callbacks.set(name, callback)
          },
        },
      }
      await nuxt.callHook('nitro:init', nitro as never)
      expect(deprecated).not.toHaveBeenCalled()
      if (preparing)
        expect(warn).not.toHaveBeenCalled()
      else
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('Set site.url'))
      warn.mockClear()
      Object.assign(nitro.options.routeRules, { '/docs/**': { cache: { maxAge: 3600 } } })
      callbacks.get(reload)?.()
      if (preparing)
        expect(warn).not.toHaveBeenCalled()
      else
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('response caching disables automatic Markdown negotiation'))
      warn.mockClear()
      callbacks.get(reload)?.()
      expect(warn).not.toHaveBeenCalled()
      Object.assign(nitro.options.routeRules, { '/isr/**': { isr: true } })
      await nuxt.callHook('nitro:build:before', nitro as never)
      if (preparing)
        expect(warn).not.toHaveBeenCalled()
      else
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('ISR disables automatic Markdown negotiation'))
    }
    finally {
      warn.mockRestore()
      await nuxt.close()
      await rm(rootDir, { recursive: true, force: true })
    }
  })
})
