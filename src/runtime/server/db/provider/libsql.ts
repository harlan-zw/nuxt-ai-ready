import type { H3Event } from 'h3'
import type { Connector } from 'db0'
import { useRuntimeConfig } from 'nitropack/runtime'
// @ts-expect-error - resolved at build time via module alias
import adapter from '#ai-ready/adapter'

export async function createConnector(event?: H3Event): Promise<Connector> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
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
