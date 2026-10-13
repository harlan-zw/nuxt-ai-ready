import { describe, expect, it } from 'vitest'
import { computeContentHash } from '../../src/runtime/server/db/shared'

describe('computeContentHash', () => {
  it('ignores frontmatter, so build and runtime conversions of one page match', async () => {
    const body = '# About\n\nSame content.'
    const build = `---\ntitle: "About"\ncanonical_url: "https://x.com/about"\nlast_updated: "2026-09-23T03:22:00.000Z"\n---\n\n${body}`
    const runtime = `---\ntitle: "About"\n---\n\n${body}`
    expect(await computeContentHash(build)).toBe(await computeContentHash(runtime))
  })

  it('changes when the body changes', async () => {
    expect(await computeContentHash('# A')).not.toBe(await computeContentHash('# B'))
  })

  it.each(['og:image', 'og:image:alt', 'twitter:image'])('changes when only %s metadata changes', async (key) => {
    const page = (value: string) => `---\ntitle: Guide\nmeta:\n  ${key}: ${value}\n---\n\n# Same body`

    expect(await computeContentHash(page('first'))).not.toBe(await computeContentHash(page('second')))
  })

  it('changes when image metadata is added or removed', async () => {
    const body = '# Same body'
    const withImage = `---\nmeta:\n  og:image: https://example.com/cover.png\n---\n\n${body}`

    expect(await computeContentHash(withImage)).not.toBe(await computeContentHash(body))
  })

  it('ignores image key order and unrelated frontmatter changes', async () => {
    const first = '---\ncanonical_url: https://example.com/guide\nlast_updated: 2026-10-14\nmeta:\n  author: First\n  og:image: https://example.com/cover.png\n  og:image:alt: Cover\n---\n\n# Guide'
    const second = '---\ncanonical_url: https://other.example/guide\nlast_updated: 2026-10-15\nmeta:\n  og:image:alt: "Cover"\n  og:image: https://example.com/cover.png\n  author: Second\n---\n\n# Guide'

    expect(await computeContentHash(first)).toBe(await computeContentHash(second))
  })
  it('hashes a body that opens with horizontal rules', async () => {
    const withRules = '---\nIntro between rules.\n---\n\n# Title'
    const without = '# Title'
    expect(await computeContentHash(withRules)).not.toBe(await computeContentHash(without))
  })

  it('hashes a leading block that holds none of the frontmatter keys we write', async () => {
    const block = '---\nnote: authored in the body\n---\n\n# Title'
    expect(await computeContentHash(block)).not.toBe(await computeContentHash('# Title'))
  })
})
