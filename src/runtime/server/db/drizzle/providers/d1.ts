import type { AiReadyDatabaseEvent } from '../../context'
import { drizzle } from 'drizzle-orm/d1'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(event?: AiReadyDatabaseEvent) {
  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
    database: { bindingName?: string }
  }

  const bindingName = config.database.bindingName || 'DB'
  logger.debug(`[drizzle] Using D1 binding: ${bindingName}`)

  const cloudflare = event?.context.cloudflare as { env?: Record<string, unknown> } | undefined
  const cfEnv = cloudflare?.env
  const globalEnv = (globalThis as unknown as { __env__?: Record<string, unknown> }).__env__
  const d1 = cfEnv?.[bindingName] || globalEnv?.[bindingName]

  if (!d1) {
    throw new Error(`[ai-ready] D1 binding "${bindingName}" not found`)
  }

  const db = drizzle(d1 as any)
  registerDriver(db, 'd1', d1)
  return { dialect: 'sqlite' as const, db }
}
