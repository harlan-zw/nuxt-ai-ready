export const RUNTIME_SYNC_SECRET_PURPOSE = 'nuxt-ai-ready:runtime-sync'

/** Nuxt deriveSecret's HKDF, for the CLI and event-bound Worker secrets. */
export async function deriveRuntimeSyncSecret(root: unknown): Promise<string> {
  if (typeof root !== 'string' || root.length < 32)
    throw new Error('Set NUXT_APP_SECRET to a string with at least 32 characters.')

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
