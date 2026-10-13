import { describe, expect, it } from 'vitest'
import { auditSite, parseAuditOptions } from '../../src/readiness-audit'

const origin = 'https://example.com'
const html = '<!doctype html><html><head><title>About</title></head><body><h1>About</h1></body></html>'

function fixture(overrides: Record<string, Response> = {}, base = '/') {
  const requests: { url: string, accept: string | null, authorization: string | null }[] = []
  const page = `${origin}${base}about`
  const responses: Record<string, () => Response> = {
    [`${page}|text/html`]: () => new Response(html, { headers: { 'content-type': 'text/html', 'link': `<${base}about.md>; rel="alternate"; type="text/markdown"`, 'content-signal': 'search=yes, ai-input=yes' } }),
    [`${page}|text/markdown`]: () => new Response('# About\n\nPage content.', { headers: { 'content-type': 'text/markdown', 'vary': 'Accept', 'content-signal': 'ai-input=yes, search=yes' } }),
    [`${page}.md|text/markdown`]: () => new Response('# About\n\nPage content.', { headers: { 'content-type': 'text/markdown', 'content-signal': 'search=yes, ai-input=yes' } }),
    [`${origin}/robots.txt|text/plain`]: () => new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}${base}sitemap.xml`, { headers: { 'content-type': 'text/plain' } }),
    [`${origin}${base}sitemap.xml|application/xml, text/xml`]: () => new Response(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${page}</loc></url></urlset>`, { headers: { 'content-type': 'application/xml' } }),
  }
  const request: typeof fetch = async (input, init) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    const accept = headers.get('accept')
    requests.push({ url, accept, authorization: headers.get('authorization') })
    const key = `${url}|${accept}`
    return overrides[key]?.clone() ?? responses[key]?.() ?? new Response('Not found', { status: 404 })
  }
  return { request, requests, page }
}

async function run(overrides: Record<string, Response> = {}, capabilities = '', base = '/') {
  const site = fixture(overrides, base)
  const options = parseAuditOptions({ url: site.page, base, capabilities })
  if (options._tag === 'Err')
    throw new Error(options.message)
  return { report: await auditSite(options.value, { fetch: site.request }), requests: site.requests }
}

describe('deployed readiness audit', () => {
  it('uses public requests and skips capabilities the site has not declared', async () => {
    const { report, requests } = await run()
    expect(report.checks.filter(check => check.status === 'fail')).toEqual([])
    expect(report.checks.find(check => check.id === 'markdown-negotiation')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'content-signal')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'mcp')?.status).toBe('skip')
    expect(requests.every(request => request.authorization === null)).toBe(true)
    expect(requests.some(request => request.url.endsWith('/mcp'))).toBe(false)
  })

  it('checks direct Markdown and discovery under the supplied application base', async () => {
    const { report, requests } = await run({}, '', '/docs/')
    expect(report.checks.find(check => check.id === 'markdown-url')?.status).toBe('pass')
    expect(requests.some(request => request.url === `${origin}/docs/about.md`)).toBe(true)
    expect(requests.some(request => request.url === `${origin}/docs/sitemap.xml`)).toBe(true)
    expect(requests.some(request => request.url === `${origin}/robots.txt`)).toBe(true)
  })

  it('rejects an HTML fallback returned for a Markdown request', async () => {
    const { report } = await run({ [`${origin}/about|text/markdown`]: new Response(html, { headers: { 'content-type': 'text/html' } }) })
    expect(report.checks.find(check => check.id === 'markdown-negotiation')?.status).toBe('fail')
  })

  it('reports edge challenges without treating their body as page content', async () => {
    const { report } = await run({ [`${origin}/about|text/html`]: new Response(html, { status: 403, headers: { 'cf-mitigated': 'challenge', 'content-type': 'text/html' } }) })
    expect(report.checks.find(check => check.id === 'html')).toMatchObject({ status: 'fail', detail: expect.stringContaining('challenge') })
  })

  it('reports HTTP failures and catch-all routes', async () => {
    const { report } = await run({
      [`${origin}/about.md|text/markdown`]: new Response('Failed', { status: 500 }),
      [`${origin}/.well-known/nuxt-ai-ready-audit-missing|text/markdown`]: new Response('# About', { headers: { 'content-type': 'text/markdown' } }),
    })
    expect(report.checks.find(check => check.id === 'markdown-url')).toMatchObject({ status: 'fail', detail: expect.stringContaining('500') })
    expect(report.checks.find(check => check.id === 'unknown-route')?.status).toBe('fail')
  })

  it('requires declared discovery endpoints to contain the expected document', async () => {
    const { report } = await run({
      [`${origin}/llms.txt|text/plain`]: new Response('# Example\n\n## Docs\n- [About](/about.md)', { headers: { 'content-type': 'text/plain' } }),
      [`${origin}/.well-known/api-catalog|application/json`]: new Response(html, { headers: { 'content-type': 'text/html' } }),
      [`${origin}/.well-known/mcp/server-card.json|application/json`]: Response.json({}),
    }, 'llms,api-catalog,mcp')
    expect(report.checks.find(check => check.id === 'llms')?.status).toBe('pass')
    expect(report.checks.find(check => check.id === 'api-catalog')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'mcp')?.status).toBe('fail')
  })

  it('reports contradictory HTTP policies and lost source permissions', async () => {
    const { report } = await run({ [`${origin}/about|text/markdown`]: new Response('# About', { headers: { 'content-type': 'text/markdown', 'vary': 'Accept', 'content-signal': 'search=no, ai-input=yes' } }) })
    expect(report.checks.find(check => check.id === 'content-signal')?.status).toBe('fail')
  })

  it('checks static Markdown policies and rejects invented training permission', async () => {
    const { report } = await run({
      [`${origin}/about.md|text/markdown`]: new Response('# About', { headers: { 'content-type': 'text/markdown' } }),
      [`${origin}/about|text/markdown`]: new Response('# About', { headers: { 'content-type': 'text/markdown', 'vary': 'Accept', 'content-signal': 'search=yes, ai-input=yes, ai-train=yes' } }),
    })
    expect(report.checks.find(check => check.id === 'content-signal-markdown-url')?.status).toBe('fail')
    expect(report.checks.find(check => check.id === 'content-signal')?.status).toBe('fail')
  })

  it('accepts the module discovery documents and follows advertised API catalog links', async () => {
    const { report } = await run({
      [`${origin}/about|text/html`]: new Response(html, { headers: { 'content-type': 'text/html', 'link': '</custom/catalog>; rel="api-catalog"' } }),
      [`${origin}/custom/catalog|application/json`]: Response.json({ linkset: [{ 'anchor': `${origin}/mcp`, 'service-desc': [{ href: `${origin}/openapi.json` }] }] }),
      [`${origin}/.well-known/ai-catalog.json|application/json`]: Response.json({ specVersion: '1.0', entries: [{ identifier: 'urn:air:example.com:mcp:mcp', url: `${origin}/mcp/server-card` }] }),
      [`${origin}/.well-known/agent-skills/index.json|application/json`]: Response.json({ $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json', skills: [] }),
      [`${origin}/.well-known/mcp/server-card.json|application/json`]: Response.json({ name: 'com.example/mcp', version: '1.0.0', remotes: [{ type: 'streamable-http', url: `${origin}/mcp` }] }),
    }, 'ai-catalog,skills,mcp')
    for (const id of ['api-catalog', 'ai-catalog', 'skills', 'mcp'])
      expect(report.checks.find(check => check.id === id)?.status).toBe('pass')
  })

  it('follows redirects and reports redirect loops', async () => {
    const redirected = await run({
      [`${origin}/about|text/html`]: new Response(null, { status: 302, headers: { location: '/docs/about' } }),
      [`${origin}/docs/about|text/html`]: new Response(html, { headers: { 'content-type': 'text/html' } }),
      [`${origin}/docs/about.md|text/markdown`]: new Response('# About', { headers: { 'content-type': 'text/markdown' } }),
    })
    expect(redirected.report.checks.find(check => check.id === 'markdown-url')).toMatchObject({ status: 'pass', url: `${origin}/docs/about.md` })
    const loop = await run({ [`${origin}/about|text/html`]: new Response(null, { status: 302, headers: { location: '/about' } }) })
    expect(loop.report.checks.find(check => check.id === 'html')).toMatchObject({ status: 'fail', detail: expect.stringContaining('redirect limit') })
  })

  it('bounds response bodies and reports network errors', async () => {
    const site = fixture()
    const parsed = parseAuditOptions({ url: site.page })
    if (parsed._tag === 'Err')
      throw new Error(parsed.message)
    const large = await auditSite(parsed.value, { fetch: site.request, maxBytes: 8 })
    expect(large.checks.find(check => check.id === 'html')).toMatchObject({ status: 'fail', detail: expect.stringContaining('limit') })
    const offline = await auditSite(parsed.value, { fetch: async () => {
      throw new Error('offline')
    } })
    expect(offline.checks.find(check => check.id === 'html')).toMatchObject({ status: 'fail', detail: expect.stringContaining('offline') })
  })

  it.each(['file:///etc/passwd', 'https://user:secret@example.com', 'ftp://example.com', 'not a URL'])('rejects invalid input %s', (url) => {
    expect(parseAuditOptions({ url })._tag).toBe('Err')
  })

  it('rejects unknown capabilities and invalid base paths', () => {
    expect(parseAuditOptions({ url: origin, capabilities: 'unknown' })._tag).toBe('Err')
    expect(parseAuditOptions({ url: origin, base: 'https://other.test/' })._tag).toBe('Err')
  })
})
