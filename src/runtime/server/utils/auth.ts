import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { deriveSecret } from 'nuxt/server'
import { logger } from '#ai-ready-virtual/logger.mjs'
import { createError, getHeader, getQuery } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { APPLICATION_SECRET_ERROR, deriveRuntimeSyncSecret, LEGACY_RUNTIME_SYNC_SECRET_WARNING, RUNTIME_SYNC_SECRET_PURPOSE } from '../../sync-secret'
import { getCfEnv } from './cloudflare'

type DerivationMode = 'nuxt' | 'binding'
interface DerivedToken {
  root: string
  mode: DerivationMode
  promise: Promise<Uint8Array>
}

// Keep one successful or pending derivation. Rotation replaces the entry.
let derivedToken: DerivedToken | undefined
let warnedLegacy = false

function encodeToken(token: string): Uint8Array {
  // UTF-8 replaces unpaired surrogates and can collapse distinct legacy tokens.
  return Buffer.from(token, 'utf16le')
}

function resolveToken(root: string, mode: DerivationMode): Promise<Uint8Array> {
  if (derivedToken?.root === root && derivedToken.mode === mode)
    return derivedToken.promise

  // Nuxt reads its root synchronously, before the first crypto await.
  const promise = mode === 'nuxt' ? deriveSecret(RUNTIME_SYNC_SECRET_PURPOSE) : deriveRuntimeSyncSecret(root)
  const entry: DerivedToken = {
    root,
    mode,
    promise: promise.then(encodeToken),
  }
  derivedToken = entry
  entry.promise = entry.promise.catch((cause: unknown) => {
    if (derivedToken === entry)
      derivedToken = undefined
    throw cause
  })
  return entry.promise
}

async function resolveExpectedToken(event: H3Event): Promise<Uint8Array> {
  const bindings = getCfEnv(event)
  const bindingRoot = bindings?.NUXT_APP_SECRET
  const configuredRoot = bindingRoot === undefined ? useRuntimeConfig(event).appSecret : bindingRoot
  if (configuredRoot === undefined || configuredRoot === '') {
    const moduleConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as ModulePublicRuntimeConfig | undefined
    const legacy = bindings?.NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? bindings?.NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? globalThis.process?.env?.NUXT_NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? globalThis.process?.env?.NUXT_AI_READY_RUNTIME_SYNC_SECRET
      ?? moduleConfig?.runtimeSyncSecret
    if (typeof legacy !== 'string' || !legacy)
      throw createError({ statusCode: 500, message: APPLICATION_SECRET_ERROR })
    if (!warnedLegacy) {
      warnedLegacy = true
      logger.warn(LEGACY_RUNTIME_SYNC_SECRET_WARNING)
    }
    return encodeToken(legacy)
  }

  // Nuxt derives with no event argument. Nitro 2 bindings require direct derivation.
  const mode = bindingRoot === undefined ? 'nuxt' : 'binding'
  const root = mode === 'nuxt' ? useRuntimeConfig().appSecret : bindingRoot
  if (typeof root !== 'string' || root.length < 32)
    throw createError({ statusCode: 500, message: APPLICATION_SECRET_ERROR })

  return resolveToken(root, mode).catch((cause: unknown) => {
    throw createError({ statusCode: 500, message: APPLICATION_SECRET_ERROR, cause })
  })
}

/**
 * Verify the runtime sync token. Throws 401 if the token is missing or invalid.
 */
export async function requireAuth(event: H3Event): Promise<void> {
  const secret = await resolveExpectedToken(event)
  const authHeader = getHeader(event, 'authorization')
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined
  const querySecret = bearer ? undefined : getQuery(event).secret
  const received = encodeToken(bearer || (querySecret ? String(querySecret) : ''))
  if (received.length !== secret.length || !timingSafeEqual(received, secret)) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (querySecret) {
    logger.warn('Using `?secret=` is deprecated. Use the Authorization header with a bearer token.')
  }
}
