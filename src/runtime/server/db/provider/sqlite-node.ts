import type { Connector } from 'db0'
import type { H3Event } from 'h3'
import { mkdir } from 'node:fs/promises'
import adapter from '#ai-ready/adapter'
import { useRuntimeConfig } from 'nitropack/runtime'
import { dirname } from 'pathe'
import { logger } from '../../logger'

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
  logger.debug(`[sqlite-node] Creating directory: ${dirname(dbPath)}`)
  await mkdir(dirname(dbPath), { recursive: true })
  logger.debug(`[sqlite-node] Opening database: ${dbPath}`)

  return adapter({ path: dbPath })
}
