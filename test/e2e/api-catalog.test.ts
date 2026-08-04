import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'
import { API_CATALOG_PROFILE } from '../../src/utils/api-catalog'

const { resolve } = createResolver(import.meta.url)

describe('api catalog, RFC 9727', async () => {
  await setup({
    rootDir: resolve('../fixtures/api-catalog'),
    build: true,
    server: true,
  })

  it('serves the resolved Linkset on GET', async () => {
    const response = await fetch(url('/.well-known/api-catalog'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe(
      `application/linkset+json; profile="${API_CATALOG_PROFILE}"`,
    )
    expect(response.headers.get('link')).toBe(
      '<https://test.example.com/.well-known/api-catalog>; rel="api-catalog"',
    )
    expect(body).toEqual({
      linkset: [{
        'anchor': 'https://test.example.com/api',
        'service-desc': [{
          href: 'https://test.example.com/openapi.json',
          type: 'application/vnd.oai.openapi+json;version=3.1',
        }],
        'service-doc': [{ href: 'https://test.example.com/docs/api', type: 'text/html' }],
        'status': [{ href: 'https://test.example.com/api/health', type: 'application/json' }],
      }],
    })
  })

  it('serves headers without a body on HEAD', async () => {
    const response = await fetch(url('/.well-known/api-catalog'), { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/linkset+json')
    expect(response.headers.get('link')).toContain('rel="api-catalog"')
    expect(await response.text()).toBe('')
  })

  it('advertises the catalog from page responses', async () => {
    const response = await fetch(url('/'), { headers: { accept: 'text/html' } })

    expect(response.headers.get('link')).toContain(
      '<https://test.example.com/.well-known/api-catalog>; rel="api-catalog"',
    )
  })

  it('prerenders the catalog for static deployments', () => {
    const buildDir = useTestContext().nuxt?.options.buildDir
    if (!buildDir)
      throw new Error('nuxt.options.buildDir not available in test context')

    expect(existsSync(join(buildDir, 'output/public/.well-known/api-catalog'))).toBe(true)
  })
})
