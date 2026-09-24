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
