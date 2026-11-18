export const RUNTIME_SYNC_SECRET_PURPOSE = 'nuxt-ai-ready:runtime-sync'
export const APPLICATION_SECRET_ERROR = 'Set NUXT_APP_SECRET to a string with at least 32 characters. Generate one with openssl rand -base64 32.'

/** Nuxt deriveSecret's HKDF, for the CLI and event-bound Worker secrets. */
export async function deriveRuntimeSyncSecret(root: unknown): Promise<string> {
  if (typeof root !== 'string' || root.length < 32)
    throw new Error(APPLICATION_SECRET_ERROR)

  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(root), 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: encoder.encode('nuxt'),
    info: encoder.encode(RUNTIME_SYNC_SECRET_PURPOSE),
  }, key, 256)
  return Array.from(new Uint8Array(bits), byte => byte.toString(16).padStart(2, '0')).join('')
}
