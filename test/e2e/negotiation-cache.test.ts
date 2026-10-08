import { createResolver } from '@nuxt/kit'
import { setup, url } from '@nuxt/test-utils/e2e'
import { describe, it } from 'vitest'
import { verifyNegotiationCache } from '../helpers/negotiation-cache'

const { resolve } = createResolver(import.meta.url)

describe('production Accept-only caching', async () => {
  await setup({ rootDir: resolve('../fixtures/negotiation-cache'), dev: false, server: true })

  it('keeps both representations correct and shares HTML cache entries across UA values', async () => {
    await verifyNegotiationCache(url('/'))
  })
})
