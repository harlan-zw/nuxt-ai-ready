import type { H3Event } from '#nuxtseo/h3'
import { deriveSecret } from 'nuxt/server'
import { createError, getHeader } from '#nuxtseo/h3'
import { deriveRuntimeSyncSecret, RUNTIME_SYNC_SECRET_PURPOSE } from '../../sync-secret'
import { getCfEnv } from './cloudflare'

/**
 * Verify the request has a valid Authorization: Bearer token.
 * Throws 401 if the token is missing or invalid.
 * Missing or invalid application secrets fail closed with 500.
 */
export async function requireAuth(event: H3Event): Promise<void> {
  const root = getCfEnv(event)?.NUXT_APP_SECRET
  // Nuxt 4.6 deriveSecret has no event argument. Nitro 2 cannot read Worker
  // bindings through its shared runtime config, so derive from that binding.
  const secret = await (root === undefined
    ? deriveSecret(RUNTIME_SYNC_SECRET_PURPOSE)
    : deriveRuntimeSyncSecret(root)).catch((cause: unknown) => {
    throw createError({ statusCode: 500, message: 'Set NUXT_APP_SECRET to a string with at least 32 characters.', cause })
  })
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  if (!token || token !== secret) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
