import type { ModulePublicRuntimeConfig } from '../../../module'
import { defineNitroPlugin, useRuntimeConfig } from '#nuxtseo/nitro'

export default defineNitroPlugin((nitro) => {
  nitro.hooks.hook('robots:robots-txt', (context) => {
    const href = (useRuntimeConfig()['nuxt-ai-ready'] as ModulePublicRuntimeConfig).aiTerms?.href
    if (href)
      context.robotsTxt = `${context.robotsTxt.trimEnd()}\n\nAI-Terms: ${href}\n`
  })
})
