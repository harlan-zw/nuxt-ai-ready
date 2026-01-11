import * as p from '@clack/prompts'
import { useNuxt } from '@nuxt/kit'
import { useSiteConfig } from 'nuxt-site-config/kit'
import { $fetch } from 'ofetch'
import { isCI, isTest } from 'std-env'
import { logger } from './logger'

export function hookNuxtSeoProLicense() {
  const nuxt = useNuxt()
  const isBuild = !nuxt.options.dev && !nuxt.options._prepare
  // @ts-expect-error untyped
  if (isBuild && !nuxt._isNuxtSeoProVerifying) {
    const license = nuxt.options.runtimeConfig.seoProKey || process.env.NUXT_SEO_PRO_KEY
    if (isTest) {
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
      const res = await $fetch<{ ok: boolean }>('https://nuxtseo.com/api/pro/verify', {
        method: 'POST',
        body: { apiKey: license, siteUrl, siteName },
      }).catch((err) => {
        // 401 = invalid key, 403 = no active subscription
        if (err?.response?.status === 401) {
          spinner.stop('❌ Invalid API key')
          p.note('Your API key is invalid.\n\nhttps://nuxtseo.com/pro/dashboard', 'License Issue')
          throw new Error('Invalid Nuxt SEO Pro API key.')
        }
        if (err?.response?.status === 403) {
          spinner.stop('❌ No active subscription')
          p.note('Your subscription has expired or is inactive.\n\nhttps://nuxtseo.com/pro/dashboard', 'License Issue')
          throw new Error('No active Nuxt SEO Pro subscription.')
        }
        logger.error(err)
        return null
      })
      if (!res) {
        spinner.stop('⚠️  License verification skipped (network issue)')
        return
      }
      spinner.stop('License verified ✓')
    })
  }
}
