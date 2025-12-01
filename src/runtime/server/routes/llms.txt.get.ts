import type { LlmsTxtConfig } from '#ai-ready/types'
import { getSiteConfig } from '#site-config/server/composables/getSiteConfig'
import { eventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { normalizeLlmsTxtConfig } from '../../../utils'

export default eventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any
  const siteConfig = getSiteConfig(event)

  // Get merged llms.txt config (already merged in module setup)
  const llmsTxtConfig = runtimeConfig.llmsTxt as LlmsTxtConfig

  // Header with site info
  const parts: string[] = []

  parts.push(`# ${siteConfig.name || siteConfig.url}`)

  if (siteConfig.description) {
    parts.push(`\n> ${siteConfig.description}\n`)
  }

  // Placeholder for pages (generated at build time)
  parts.push('<!-- Pages will be generated at build time -->\n')

  // Normalize structured config to markdown
  const normalizedContent = normalizeLlmsTxtConfig(llmsTxtConfig)
  if (normalizedContent) {
    parts.push(normalizedContent)
  }

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  return parts.join('\n')
})
