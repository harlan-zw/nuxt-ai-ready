import type { Connector } from 'db0'
import type { H3Event } from 'h3'
import adapter from '#ai-ready/adapter'
import { useRuntimeConfig } from 'nitropack/runtime'

export async function createConnector(event?: H3Event): Promise<Connector> {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: {
      type: 'sqlite' | 'd1' | 'libsql'
      filename?: string
      bindingName?: string
      url?: string
      authToken?: string
    }
  }

  const bindingName = config.database.bindingName || 'DB'

  // Pass bindingName to db0 adapter - it handles lazy resolution from globalThis.__env__
  // This avoids race conditions where binding is resolved before cloudflare context is ready
  return adapter({ bindingName })
}
