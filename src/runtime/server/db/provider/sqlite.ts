import type { H3Event } from 'h3'
import type { Connector } from 'db0'
import { dirname } from 'pathe'
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

  // Ensure Node environment
  const isNode = typeof process !== 'undefined' && process.versions?.node
  const isBun = typeof process !== 'undefined' && process.versions?.bun
  if (!isNode && !isBun) {
    throw new Error('SQLite database is only supported in Node.js or Bun environments. Use D1 for Cloudflare Workers.')
  }

  const dbPath = config.database.filename || '.data/ai-ready/pages.db'
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dirname(dbPath), { recursive: true })
  
  return adapter({ path: dbPath })
}
