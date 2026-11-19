import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createResolver } from '@nuxt/kit'
import { fetch, setup, url, useTestContext } from '@nuxt/test-utils/e2e'
import { describe, expect, it } from 'vitest'

const { resolve } = createResolver(import.meta.url)

describe('publishing AI Terms on opt-in', async () => {
  await setup({ rootDir: resolve('../fixtures/ai-terms'), build: true, server: true })

  it('serves the policy as JSON without a database', async () => {
    const response = await fetch(url('/.well-known/ai-terms'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await response.json()).toMatchObject({
      ai_terms: '0.1',
      site: 'https://test.example.com',
      updated: '2026-11-18',
      default: 'deny',
      purpose_header: 'AI-Purpose',
      uses: { training: { access: 'deny' }, search: { access: 'allow', attribution: 'required' } },
      paths: [{ match: '/members/*', uses: { agent: { access: 'deny' } } }],
    })
  })

  it('supports HEAD and cross-origin discovery', async () => {
    const head = await fetch(url('/.well-known/ai-terms'), { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
    const options = await fetch(url('/.well-known/ai-terms'), { method: 'OPTIONS' })
    expect(options.status).toBe(204)
    expect(options.headers.get('access-control-allow-methods')).toContain('GET')
    expect(options.headers.get('access-control-allow-headers')).toContain('AI-Purpose')
    const post = await fetch(url('/.well-known/ai-terms'), { method: 'POST' })
    expect(post.status).toBe(405)
  })

  it.each(['/', '/about.md', '/.well-known/api-catalog'])('advertises the policy with the API catalog at %s', async (route) => {
    const response = await fetch(url(route))
    expect(response.headers.get('link')).toContain('<https://test.example.com/.well-known/ai-terms>; rel="ai-terms"')
    expect(response.headers.get('link')).toContain('rel="api-catalog"')
  })

  it('adds robots discovery without changing existing content signals', async () => {
    const response = await fetch(url('/robots.txt'))
    const robots = await response.text()
    expect(robots.match(/^AI-Terms: https:\/\/test.example.com\/\.well-known\/ai-terms$/gm)).toHaveLength(1)
    expect(robots).toContain('Content-Signal: search=yes, ai-input=yes')
  })

  it('writes the same policy for static deployments', async () => {
    const buildDir = useTestContext().nuxt!.options.buildDir
    const document = JSON.parse(await readFile(join(buildDir, 'output/public/.well-known/ai-terms'), 'utf8'))
    expect(document).toEqual(await (await fetch(url('/.well-known/ai-terms'))).json())
  })

  it('advertises the policy on a file-backed Markdown response', async () => {
    const publicDir = join(useTestContext().nuxt!.options.buildDir, 'output/public')
    expect(await readFile(join(publicDir, 'index.md'), 'utf8')).toBeTruthy()
    const response = await fetch(url('/index.md'))
    expect(response.status).toBe(200)
    expect(response.headers.get('link')).toContain('<https://test.example.com/.well-known/ai-terms>; rel="ai-terms"')
  })
})
