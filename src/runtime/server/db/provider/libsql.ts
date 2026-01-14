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

  return adapter({
    url: config.database.url,
    authToken: config.database.authToken,
  })
}
