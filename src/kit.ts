import type { Nuxt } from '@nuxt/schema'
import type { NitroConfig } from 'nitropack/types'
import { tryUseNuxt, useNuxt } from '@nuxt/kit'
import { env, provider } from 'std-env'

export function isStaticPreset(nuxt: Nuxt = useNuxt()) {
  return nuxt.options.nitro?.static || (nuxt.options as any)._generate /* TODO: remove in future */ || [
    'static',
    'github-pages',
  ].includes(resolveNitroPreset())
}

const autodetectableProviders = {
  azure_static: 'azure',
  cloudflare_pages: 'cloudflare-pages',
  netlify: 'netlify',
  stormkit: 'stormkit',
  vercel: 'vercel',
  cleavr: 'cleavr',
  stackblitz: 'stackblitz',
}

const autodetectableStaticProviders = {
  netlify: 'netlify-static',
  vercel: 'vercel-static',
}

export function detectTarget(options: { static?: boolean } = {}) {
  // @ts-expect-error untyped
  return options?.static ? autodetectableStaticProviders[provider] : autodetectableProviders[provider]
}

export function resolveNitroPreset(nitroConfig?: NitroConfig): string {
  nitroConfig = nitroConfig || tryUseNuxt()?.options?.nitro
  if (provider === 'stackblitz')
    return 'stackblitz'
  let preset
  if (nitroConfig && nitroConfig?.preset)
    preset = nitroConfig.preset
  if (!preset)
    preset = env.NITRO_PRESET || env.SERVER_PRESET || detectTarget() || 'node-server'
  return preset.replace('_', '-') // sometimes they are different
}
