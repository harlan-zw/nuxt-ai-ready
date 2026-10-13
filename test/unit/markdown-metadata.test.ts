import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import { convertHtmlToMarkdown } from '../../src/runtime/server/utils'

vi.mock('#nuxtseo/nitro', () => ({ useNitroApp: () => ({ hooks: { callHook: vi.fn() } }) }))

const article = { '@context': 'https://schema.org', '@type': 'Article', 'headline': 'Metadata survives conversion' }

function page(head: string, body = '<main><h1>Metadata</h1><p>Visible page content.</p></main>') {
  return `<html><head><title>Metadata</title>${head}</head><body>${body}</body></html>`
}

async function convert(html: string) {
  return convertHtmlToMarkdown(html, 'https://example.com/guide', { minimal: true, clean: true }, {
    hooks: { route: '/guide', isPrerender: false },
  })
}

function jsonBlocks(markdown: string) {
  return [...markdown.matchAll(/```json\n([\s\S]*?)\n```/g)].map(match => JSON.parse(match[1]!))
}

describe('page metadata in converted Markdown', () => {
  it('preserves JSON-LD in the head and body while excluding executable scripts', async () => {
    const product = { '@type': 'Product', 'name': 'Useful tool' }
    const html = page(`<script type="application/ld+json">${JSON.stringify(article)}</script><script>window.secret = 'executable-script';</script>`, `<main><h1>Metadata</h1></main><script type="application/ld+json">${JSON.stringify(product)}</script>`)

    const result = await convert(html)

    expect(jsonBlocks(result.markdown)).toEqual([article, product])
    expect(result.markdown).not.toContain('executable-script')
    expect(result.markdown).toContain('# Metadata')
  })

  it('keeps Open Graph and Twitter image metadata in frontmatter', async () => {
    const result = await convert(page('<meta property="og:image" content="https://example.com/cover.png"><meta property="og:image:alt" content="A useful guide"><meta name="twitter:image" content="https://example.com/social.png">'))
    const frontmatter = parse(result.markdown.match(/^---\n([\s\S]*?)\n---/)![1]!)

    expect(frontmatter.meta).toMatchObject({
      'og:image': 'https://example.com/cover.png',
      'og:image:alt': 'A useful guide',
      'twitter:image': 'https://example.com/social.png',
    })
  })

  it('skips malformed, scalar, and oversized JSON-LD without losing later valid blocks', async () => {
    const oversized = { '@type': 'Article', 'description': 'x'.repeat(65536) }
    const scripts = ['{invalid', 'null', '42', JSON.stringify(oversized), JSON.stringify(article)]
      .map(json => `<script type="application/ld+json">${json}</script>`)
      .join('')

    const result = await convert(page(scripts))

    expect(jsonBlocks(result.markdown)).toEqual([article])
    expect(result.markdown).toContain('# Metadata')
  })

  it('preserves a JSON-LD graph array and keeps code-fence text inside JSON strings', async () => {
    const graph = [article, { '@type': 'FAQPage', 'description': '```\n<script>unsafe()</script>' }]
    const result = await convert(page(`<script type="application/ld+json">${JSON.stringify(graph).replaceAll('<', '\\u003c')}</script>`))

    expect(jsonBlocks(result.markdown)).toEqual([graph])
    expect(result.markdown).not.toContain('<script>unsafe()')
  })

  it('limits the number of JSON-LD blocks per page', async () => {
    const values = Array.from({ length: 20 }, (_, index) => ({ '@type': 'Article', 'headline': `Article ${index}` }))
    const result = await convert(page(values.map(value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`).join('')))

    expect(jsonBlocks(result.markdown)).toEqual(values.slice(0, 16))
  })

  it('bounds the total UTF-8 output and lets smaller blocks use the remaining space', async () => {
    const large = { '@type': 'Article', 'description': '界'.repeat(10000) }
    const values = [large, large, large, article]
    const result = await convert(page(values.map(value => `<script type="application/ld+json">${JSON.stringify(value)}</script>`).join('')))
    const blocks = jsonBlocks(result.markdown)

    expect(blocks).toEqual([large, large, article])
    expect(new TextEncoder().encode(result.markdown.slice(result.markdown.indexOf('```json'))).byteLength).toBeLessThanOrEqual(65536)
  })

  it('preserves numeric precision and nonbreaking spaces inside JSON-LD strings', async () => {
    const json = '{"@type":"Product","sku":9007199254740993,"name":"Useful\u00A0tool"}'
    const result = await convert(page(`<script type="application/ld+json">${json}</script>`))

    expect(jsonBlocks(result.markdown)[0].name).toBe('Useful\u00A0tool')
    expect(result.markdown).toContain('9007199254740993')
  })

  it('excludes JSON payload and executable scripts even when they have a type', async () => {
    const result = await convert(page('<script type="application/json">{"secret":"private-payload"}</script><script type="module">const secret = "executable-module";</script>'))

    expect(jsonBlocks(result.markdown)).toEqual([])
    expect(result.markdown).not.toContain('private-payload')
    expect(result.markdown).not.toContain('executable-module')
  })
})
