import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { resolveCloudflareStaticHeaders } from '../helpers/cloudflare-headers'

const { resolve } = createResolver(import.meta.url)

describe('publishing AI Terms in Cloudflare static assets', async () => {
  await setup({
    rootDir: resolve('../fixtures/ai-terms'),
    build: true,
    server: false,
    nuxtConfig: {
      nitro: {
        preset: 'cloudflare-module',
        compatibilityDate: '2026-10-08',
        cloudflare: {
          deployConfig: true,
          wrangler: { name: 'ai-terms-test' },
        },
      },
    },
  })

  async function assets() {
    const configPath = join(useTestContext().nuxt!.options.buildDir, 'output/server/wrangler.json')
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { assets: { directory: string } }
    return join(dirname(configPath), config.assets.directory)
  }

  it.each([
    '/',
    '/index.md',
    '/.well-known/api-catalog',
    '/.well-known/ai-terms',
  ])('keeps one policy discovery link on %s', async (route) => {
    const contents = await readFile(join(await assets(), '_headers'), 'utf8')
    const headers = resolveCloudflareStaticHeaders(contents, route)
    expect(headers.link?.match(/rel="ai-terms"/g)).toHaveLength(1)
    expect(headers.link).toContain('<https://test.example.com/.well-known/ai-terms>; rel="ai-terms"')
  })

  it('ships the policy as a JSON asset with JSON response headers', async () => {
    const root = await assets()
    const document = JSON.parse(await readFile(join(root, '.well-known/ai-terms'), 'utf8'))
    const headers = resolveCloudflareStaticHeaders(await readFile(join(root, '_headers'), 'utf8'), '/.well-known/ai-terms')
    expect(document).toMatchObject({ ai_terms: '0.1', site: 'https://test.example.com', default: 'deny' })
    expect(headers['content-type']).toBe('application/json; charset=utf-8')
    expect(headers['access-control-allow-origin']).toBe('*')
  })
})
