import type { H3Event } from '#nuxtseo/h3'
import { drizzle } from 'drizzle-orm/d1'
import * as schema from '#ai-ready-virtual/db-schema.mjs'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../../../logger'
import { registerDriver } from '../raw'

export async function createClient(event?: H3Event) {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: { bindingName?: string }
  }

  const bindingName = config.database.bindingName || 'DB'
  logger.debug(`[drizzle] Using D1 binding: ${bindingName}`)

  const cfEnv = event?.context?.cloudflare?.env as Record<string, unknown> | undefined
  const globalEnv = (globalThis as unknown as { __env__?: Record<string, unknown> }).__env__
  const d1 = cfEnv?.[bindingName] || globalEnv?.[bindingName]

  if (!d1) {
    throw new Error(`[ai-ready] D1 binding "${bindingName}" not found`)
  }

  const db = drizzle(d1 as any, { schema })
  registerDriver(db, 'd1', d1)
  return { dialect: 'sqlite' as const, db }
}
