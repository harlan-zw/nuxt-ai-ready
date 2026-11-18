import type { H3Event } from '#nuxtseo/h3'
import { timingSafeEqual } from 'node:crypto'
import { deriveSecret } from 'nuxt/server'
import { createError, getHeader } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { APPLICATION_SECRET_ERROR, deriveRuntimeSyncSecret, RUNTIME_SYNC_SECRET_PURPOSE } from '../../sync-secret'
import { getCfEnv } from './cloudflare'

type DerivationMode = 'nuxt' | 'binding'
interface DerivedToken {
  root: string
  mode: DerivationMode
  promise: Promise<Uint8Array>
}

// Keep one successful or pending derivation. Rotation replaces the entry.
let derivedToken: DerivedToken | undefined

function resolveToken(root: string, mode: DerivationMode): Promise<Uint8Array> {
  if (derivedToken?.root === root && derivedToken.mode === mode)
    return derivedToken.promise

  // Nuxt reads its root synchronously, before the first crypto await.
  const promise = mode === 'nuxt' ? deriveSecret(RUNTIME_SYNC_SECRET_PURPOSE) : deriveRuntimeSyncSecret(root)
  const entry: DerivedToken = {
    root,
    mode,
    promise: promise.then(secret => new TextEncoder().encode(secret)),
  }
  derivedToken = entry
  entry.promise = entry.promise.catch((cause: unknown) => {
    if (derivedToken === entry)
      derivedToken = undefined
    throw cause
  })
  return entry.promise
}

/**
 * Verify the request has a valid Authorization: Bearer token.
 * Throws 401 if the token is missing or invalid.
 * The token derives from Nuxt's application secret for this module only.
 */
export async function requireAuth(event: H3Event): Promise<void> {
  const bindings = getCfEnv(event)
  const config = useRuntimeConfig()
  const root = bindings?.NUXT_APP_SECRET === undefined ? config.appSecret : bindings.NUXT_APP_SECRET
  if (typeof root !== 'string' || root.length < 32)
    throw createError({ statusCode: 500, message: APPLICATION_SECRET_ERROR })

  // Nuxt 4.6 deriveSecret has no event argument. Nitro 2 cannot read Worker
  // bindings through its shared runtime config, so derive from that binding.
  const secret = await resolveToken(root, bindings?.NUXT_APP_SECRET === undefined ? 'nuxt' : 'binding')
    .catch((cause: unknown) => {
      throw createError({ statusCode: 500, message: APPLICATION_SECRET_ERROR, cause })
    })
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const received = new TextEncoder().encode(token || '')
  if (received.length !== secret.length || !timingSafeEqual(received, secret)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
}
