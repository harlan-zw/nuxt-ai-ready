import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { createError, getHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Verify the request has a valid Authorization: Bearer token.
 * Throws 401 if the token is missing or invalid.
 * No-op if runtimeSyncSecret is not configured.
 */
export function requireAuth(event: H3Event): void {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  if (!config.runtimeSyncSecret)
    return

  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

  if (!token || token !== config.runtimeSyncSecret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
