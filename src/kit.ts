import * as p from '@clack/prompts'
import { useNuxt } from '@nuxt/kit'
import { useSiteConfig } from 'nuxt-site-config/kit'
import { $fetch } from 'ofetch'
import { isCI, isTest } from 'std-env'
import { logger } from './logger'

export interface ModuleRegistration {
  name: string
  version?: string
  /** Secret for runtime dashboard queries (e.g. stats endpoints) */
  secret?: string
  features?: Record<string, boolean | string | number>
}

/**
 * Register a Nuxt SEO Pro module for license verification.
 * Uses Nuxt hook so modules don't need to import from each other.
 *
 * Call this in your module setup - registrations are collected
 * before the single license verification fetch.
 */
export function registerNuxtSeoProModule(registration: ModuleRegistration) {
  const nuxt = useNuxt()
  // @ts-expect-error untyped
  nuxt._nuxtSeoProModules = nuxt._nuxtSeoProModules || []
  // @ts-expect-error untyped
  nuxt._nuxtSeoProModules.push(registration)
}

/**
 * @deprecated Use registerNuxtSeoProModule instead
 */
export const registerModule = registerNuxtSeoProModule

export function hookNuxtSeoProLicense() {
  const nuxt = useNuxt()
  const isBuild = !nuxt.options.dev && !nuxt.options._prepare
  // @ts-expect-error untyped
  if (isBuild && !nuxt._isNuxtSeoProVerifying) {
    const license = nuxt.options.runtimeConfig.seoProKey || process.env.NUXT_SEO_PRO_KEY
    // std-env isTest + explicit VITEST check for @nuxt/test-utils compatibility
    if (isTest || process.env.VITEST) {
      return
    }
    if (!isCI && !license) {
      p.log.warn('⚠️  Building without license in non-CI environment. A license is required for production builds.')
      return
    }
    if (!license) {
      p.log.error('🔐 Nuxt SEO Pro license required')
      p.note('Set NUXT_SEO_PRO_KEY or configure via module options.\n\nhttps://nuxtseo.com/pro/dashboard', 'Get your license')
      throw new Error('Missing Nuxt SEO Pro license key.')
    }
    // @ts-expect-error untyped
    nuxt._isNuxtSeoProVerifying = true
    nuxt.hooks.hook('build:before', async () => {
      p.intro('Nuxt SEO Pro: License Verification')
      const siteConfig = useSiteConfig()
      const spinner = p.spinner()
      spinner.start('🔑 Verifying Nuxt SEO Pro license...')
      // only pass valid url/name
      const siteUrl = siteConfig.url?.startsWith('http') ? siteConfig.url : undefined
      const siteName = siteConfig.name || undefined
      // Collect registered modules from nuxt instance
      // @ts-expect-error untyped
      const modules: ModuleRegistration[] | undefined = nuxt._nuxtSeoProModules?.length > 0
        // @ts-expect-error untyped
        ? nuxt._nuxtSeoProModules
        : undefined
      const res = await $fetch<{ ok: boolean }>('https://nuxtseo.com/api/pro/verify', {
        method: 'POST',
        body: {
          apiKey: license,
          siteUrl,
          siteName,
          modules,
        },
      }).catch((err) => {
        // 401 = invalid key, 403 = no active subscription
        if (err?.response?.status === 401) {
          spinner.error('Invalid API key')
          p.note('Your API key is invalid.\n\nhttps://nuxtseo.com/pro/dashboard', 'License Issue')
          throw new Error('Invalid Nuxt SEO Pro API key.')
        }
        if (err?.response?.status === 403) {
          spinner.error('No active subscription')
          p.note('Your subscription has expired or is inactive.\n\nhttps://nuxtseo.com/pro/dashboard', 'License Issue')
          throw new Error('No active Nuxt SEO Pro subscription.')
        }
        logger.error(err)
        return null
      })
      if (!res) {
        spinner.cancel('License verification skipped (network issue)')
        return
      }
      spinner.stop('License verified ✓')
    })
  }
}
