import type { H3Event } from 'h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { logger } from '#ai-ready-virtual/logger.mjs'
import { createError, getHeader, getQuery } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Verify the request has a valid Authorization: Bearer token.
 * Throws 401 if the token is missing or invalid.
 * No-op if runtimeSyncSecret is not configured.
 *
 * Also accepts the deprecated `?secret=` query param with a warning.
 */
export function requireAuth(event: H3Event): void {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig
  if (!config.runtimeSyncSecret)
    return

  const authHeader = getHeader(event, 'authorization')
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined

  // Backward compat: accept ?secret= query param (deprecated in v1)
  if (!token) {
    const query = getQuery(event)
    if (query.secret) {
      token = String(query.secret)
      logger.warn('Using `?secret=` query parameter is deprecated. Use `Authorization: Bearer <token>` header instead. See https://github.com/harlan-zw/nuxt-ai-ready/releases/tag/v1.0.0')
    }
  }

  if (!token || token !== config.runtimeSyncSecret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
