import type { ConsolaReporter } from 'consola'
import { createResolver, loadNuxt } from '@nuxt/kit'
import { consola } from 'consola'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('configuration warnings', () => {
  it.each([true, false])('reports normalized caches once with dev=%s', async (dev) => {
    const warnings: string[] = []
    const reporter: ConsolaReporter = {
      log(log) {
        if (log.type === 'warn' && log.tag === 'nuxt-ai-ready')
          warnings.push(log.args.join(' '))
      },
    }
    consola.addReporter(reporter)
    const nuxt = await loadNuxt({
      cwd: resolve('../fixtures/content-negotiation-disabled'),
      dev,
      ready: false,
      overrides: { routeRules: { '/news/**': { swr: 600 }, '/': { isr: 600 } } },
    })
    nuxt.hook('modules:done', () => {
      nuxt.hook('nitro:init', async (nitro) => {
      // Exercise the real build hook on the initialized, normalized Nitro config.
      // Repeated lifecycle calls must not duplicate the same warning.
        await nuxt.callHook('nitro:build:before', nitro)
        await nuxt.callHook('nitro:build:before', nitro)
        if (dev) {
          await nitro.updateConfig({
            routeRules: { ...nitro.options.routeRules, '/changed': { swr: 600 } },
          })
        }
      })
    })
    await nuxt.ready().finally(async () => {
      consola.removeReporter(reporter)
      await nuxt.close()
    })
    const negotiationWarnings = warnings.filter(warning => warning.includes('disables automatic Markdown negotiation'))
    expect(negotiationWarnings).toEqual([
      expect.stringContaining('"/": ISR'),
      expect.stringContaining('"/docs/**": response caching'),
      expect.stringContaining('"/news/**": response caching'),
      ...dev ? [expect.stringContaining('"/changed": response caching')] : [],
    ])
  }, 60000)
})
