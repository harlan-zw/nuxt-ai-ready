import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { deriveSecret } from 'nuxt/server'
import { logger } from '#ai-ready-virtual/logger.mjs'
import { createError, getHeader, getQuery } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { deriveRuntimeSyncSecret, LEGACY_RUNTIME_SYNC_SECRET_WARNING, RUNTIME_SYNC_SECRET_PURPOSE } from '../../sync-secret'
import { getCfEnv } from './cloudflare'

let warnedLegacy = false

/**
 * Verify the request has a valid Authorization: Bearer token.
 * Throws 401 if the token is missing or invalid.
 * Legacy tokens remain valid when no application secret is configured.
 */
export async function requireAuth(event: H3Event): Promise<void> {
  const bindings = getCfEnv(event)
  const config = useRuntimeConfig(event)
  const root = bindings?.NUXT_APP_SECRET === undefined ? config.appSecret : bindings.NUXT_APP_SECRET
  let secret: string
  // Nuxt 4.6 deriveSecret has no event argument. Nitro 2 cannot read Worker
  // bindings through its shared runtime config, so derive from that binding.
  if (root !== undefined && root !== '') {
    secret = await (bindings?.NUXT_APP_SECRET === undefined
      ? deriveSecret(RUNTIME_SYNC_SECRET_PURPOSE)
      : deriveRuntimeSyncSecret(root)).catch((cause: unknown) => {
      throw createError({ statusCode: 500, message: 'Set NUXT_APP_SECRET to a string with at least 32 characters.', cause })
    })
  }
  else {
    const moduleConfig = config['nuxt-ai-ready'] as ModulePublicRuntimeConfig
    const legacy = bindings?.NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? bindings?.NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? globalThis.process?.env?.NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? globalThis.process?.env?.NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? moduleConfig.runtimeSyncSecret
    if (typeof legacy !== 'string' || !legacy) {
      throw createError({ statusCode: 500, message: 'Set NUXT_APP_SECRET to a string with at least 32 characters.' })
    }
    if (!warnedLegacy) {
      warnedLegacy = true
      logger.warn(LEGACY_RUNTIME_SYNC_SECRET_WARNING)
    }
    secret = legacy
  }
  const authHeader = getHeader(event, 'authorization')
  let token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  if (!token) {
    const query = getQuery(event)
    if (query.secret) {
      token = String(query.secret)
      logger.warn('Using `?secret=` query parameter is deprecated. Use `Authorization: Bearer <token>` header instead. See https://github.com/harlan-zw/nuxt-ai-ready/releases/tag/v1.0.0')
    }
  }
  if (!token || token !== secret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
