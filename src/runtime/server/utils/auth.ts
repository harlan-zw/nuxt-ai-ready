import type { H3Event } from '#nuxtseo/h3'
import type { ModulePublicRuntimeConfig } from '../../../module'
import { deriveSecret } from 'nuxt/server'
import { logger } from '#ai-ready-virtual/logger.mjs'
import { createError, getHeader, getQuery } from '#nuxtseo/h3'
import { useRuntimeConfig } from '#nuxtseo/nitro'
import { APPLICATION_SECRET_ERROR, deriveRuntimeSyncSecret, LEGACY_RUNTIME_SYNC_SECRET_WARNING, RUNTIME_SYNC_SECRET_PURPOSE } from '../../sync-secret'
import { getCfEnv } from './cloudflare'

type TokenMode = 'nuxt' | 'binding' | 'legacy'
interface TokenVerifier {
  length: number
  key: CryptoKey
  signature: ArrayBuffer
}
interface TokenCacheEntry {
  source: string
  mode: TokenMode
  promise: Promise<TokenVerifier>
}

const HMAC: HmacKeyGenParams = { name: 'HMAC', hash: 'SHA-256' }
// Keep one successful or pending verifier. Rotation replaces the entry.
let tokenVerifier: TokenCacheEntry | undefined
let warnedLegacy = false

function encodeToken(token: string): Uint16Array<ArrayBuffer> {
  // UTF-8 replaces unpaired surrogates and can collapse distinct legacy tokens.
  return Uint16Array.from({ length: token.length }, (_, index) => token.charCodeAt(index))
}

async function createTokenVerifier(token: string): Promise<TokenVerifier> {
  const { subtle } = globalThis.crypto
  const key = await subtle.generateKey(HMAC, false, ['sign', 'verify'])
  const signature = await subtle.sign(HMAC, key, encodeToken(token))
  return { length: token.length, key, signature }
}

function resolveToken(source: string, mode: TokenMode): Promise<TokenVerifier> {
  if (tokenVerifier?.source === source && tokenVerifier.mode === mode)
    return tokenVerifier.promise

  // Nuxt reads its root synchronously, before the first crypto await.
  const token = mode === 'nuxt'
    ? deriveSecret(RUNTIME_SYNC_SECRET_PURPOSE)
    : mode === 'binding'
      ? deriveRuntimeSyncSecret(source)
      : Promise.resolve(source)
  const entry: TokenCacheEntry = {
    source,
    mode,
    promise: token.then(createTokenVerifier),
  }
  tokenVerifier = entry
  entry.promise = entry.promise.catch((cause: unknown) => {
    if (tokenVerifier === entry)
      tokenVerifier = undefined
    throw cause
  })
  return entry.promise
}

async function resolveExpectedToken(event: H3Event): Promise<TokenVerifier> {
  const bindings = getCfEnv(event)
  const bindingRoot = bindings?.NUXT_APP_SECRET
  const configuredRoot = bindingRoot === undefined
    ? useRuntimeConfig(event).appSecret
    : bindingRoot
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
    return resolveToken(legacy, 'legacy')
  }

  // Nuxt derives with no event argument. Nitro 2 bindings require direct derivation.
  const mode = bindingRoot === undefined
    ? 'nuxt'
    : 'binding'
  const root = mode === 'nuxt'
    ? useRuntimeConfig().appSecret
    : bindingRoot
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
  const bearer = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined
  const querySecret = bearer
    ? undefined
    : getQuery(event).secret
  const received = bearer || (querySecret
    ? String(querySecret)
    : '')
  if (received.length !== secret.length || !await globalThis.crypto.subtle.verify(HMAC, secret.key, secret.signature, encodeToken(received))) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }
  if (querySecret) {
    logger.warn('Using `?secret=` is deprecated. Use the Authorization header with a bearer token.')
  }
}
