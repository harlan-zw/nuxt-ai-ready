import type { Connector } from 'db0'
import type { H3Event } from 'h3'
import { mkdir } from 'node:fs/promises'
import adapter from '#ai-ready/adapter'
import { useRuntimeConfig } from 'nitropack/runtime'
import { dirname } from 'pathe'

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

  const dbPath = config.database.filename || '.data/ai-ready/pages.db'
  await mkdir(dirname(dbPath), { recursive: true })

  return adapter({ path: dbPath })
}
