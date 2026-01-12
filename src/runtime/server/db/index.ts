import type { H3Event } from 'h3'
import type { NitroApp } from 'nitropack/types'
import type { DatabaseAdapter } from './shared'
import { mkdir } from 'node:fs/promises'
// @ts-expect-error - resolved at build time via module alias
import adapter from '#ai-ready/adapter'
import { useNitroApp, useRuntimeConfig } from 'nitropack/runtime'
import { dirname } from 'pathe'
import { createAdapter, initSchema } from './shared'

const DB_KEY = '_aiReadyDb'

interface NitroContext {
  [DB_KEY]?: Promise<DatabaseAdapter>
}

/**
 * Get the database adapter instance
 * Cached on nitro context for request lifecycle
 */
export function useDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  const nitro = useNitroApp() as NitroApp & NitroContext
  if (!nitro[DB_KEY]) {
    nitro[DB_KEY] = initDatabase(event)
  }
  return nitro[DB_KEY]
}

async function initDatabase(event?: H3Event): Promise<DatabaseAdapter> {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
    database: {
      type: 'sqlite' | 'd1' | 'libsql'
      filename?: string
      bindingName?: string
      url?: string
      authToken?: string
    }
  }

  let connector
  if (config.database.type === 'd1') {
    const binding = (event?.context?.cloudflare?.env as Record<string, unknown>)?.[config.database.bindingName || 'AI_READY_DB']
    if (!binding) {
      throw new Error(`D1 binding '${config.database.bindingName || 'AI_READY_DB'}' not found in event context`)
    }
    connector = adapter({ binding })
  }
  else if (config.database.type === 'libsql') {
    connector = adapter({
      url: config.database.url,
      authToken: config.database.authToken,
    })
  }
  else {
    const dbPath = config.database.filename || '.data/ai-ready/pages.db'
    await mkdir(dirname(dbPath), { recursive: true })
    connector = adapter({ path: dbPath })
  }

  if (!connector) {
    throw new Error('Failed to initialize database connector')
  }

  const dbAdapter = createAdapter(connector)
  await initSchema(dbAdapter)

  return dbAdapter
}

// Re-export types
export type { DatabaseAdapter } from './shared'
