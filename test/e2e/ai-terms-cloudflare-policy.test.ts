import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { setup, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { resolveCloudflareStaticHeaders } from '../helpers/cloudflare-headers'

const { resolve } = createResolver(import.meta.url)

describe('publishing AI Terms alongside Cloudflare Content-Signal rules', async () => {
  await setup({ rootDir: resolve('../fixtures/ai-terms-cloudflare-policy'), build: true, server: false })

  it('keeps the private policy and adds one discovery link', async () => {
    const configPath = join(useTestContext().nuxt!.options.buildDir, 'output/server/wrangler.json')
    const config = JSON.parse(await readFile(configPath, 'utf8')) as { assets: { directory: string } }
    const contents = await readFile(join(dirname(configPath), config.assets.directory, '_headers'), 'utf8')
    const privateHeaders = resolveCloudflareStaticHeaders(contents, '/private')
    expect(privateHeaders['content-signal']).toBe('ai-train=no')
    expect(privateHeaders['cache-control']).toBe('private')
    expect(privateHeaders.link).toBe('<https://test.example.com/.well-known/ai-terms>; rel="ai-terms"')
    expect(resolveCloudflareStaticHeaders(contents, '/')['content-signal']).toBe('ai-train=yes')
  })
})
