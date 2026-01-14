import type { Connector } from 'db0'
import type { H3Event } from 'h3'
import adapter from '#ai-ready/adapter'
import { useRuntimeConfig } from 'nitropack/runtime'

export async function createConnector(event?: H3Event): Promise<Connector> {
  const config = useRuntimeConfig(event)['nuxt-ai-ready'] as {
    database: {
      type: 'sqlite' | 'd1' | 'libsql'
      filename?: string
      bindingName?: string
      url?: string
      authToken?: string
    }
  }

  const bindingName = config.database.bindingName || 'DB'

  // Try to get Cloudflare env from event context or globalThis.__env__
  // This follows Nitro's Cloudflare module preset pattern
  let cloudflareEnv: Record<string, unknown> | undefined

  try {
    // @ts-expect-error - useEvent may not be available in all contexts
    const context = event?.context || (useEvent?.() as H3Event | undefined)?.context
    cloudflareEnv = (context as any)?.cloudflare?.env
  }
  catch {
    // Fallback to globalThis.__env__ (Nitro Cloudflare module preset)
    // https://github.com/nitrojs/nitro/blob/v2/src/presets/cloudflare/runtime/_module-handler.ts#L37
    cloudflareEnv = (globalThis as any).__env__
  }

  const binding = cloudflareEnv?.[bindingName]

  if (!binding) {
    // Debug: log what's actually available
    const debug = {
      hasEvent: !!event,
      hasContext: !!event?.context,
      hasCloudflare: !!(event?.context as any)?.cloudflare,
      hasCloudflareEnv: !!(event?.context as any)?.cloudflare?.env,
      hasGlobalEnv: !!(globalThis as any).__env__,
      cloudflareEnvKeys: cloudflareEnv ? Object.keys(cloudflareEnv) : [],
      bindingName,
    }
    console.error(`[D1 Debug] Binding '${bindingName}' not found. Context:`, JSON.stringify(debug, null, 2))
    throw new Error(`D1 binding '${bindingName}' not found in event.context.cloudflare.env or globalThis.__env__`)
  }

  return adapter({ binding })
}
