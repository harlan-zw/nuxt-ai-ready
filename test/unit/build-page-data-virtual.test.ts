import { describe, expect, it } from 'vitest'
import { createBuildPageDataVirtual } from '../../src/build-page-data-virtual'

describe('build page data virtual module', () => {
  it('emits only node:sqlite on Node 22+', () => {
    const source = createBuildPageDataVirtual({
      buildDbPath: '/tmp/index.sqlite',
      markdownLinkAvailabilityPath: '/tmp/markdown-links.json',
      nodeMajor: 24,
    })

    expect(source).toContain(`import('node' + ':sqlite')`)
    expect(source).not.toContain('better-sqlite3')
  })

  it('emits the optional fallback only on older Node versions', () => {
    const source = createBuildPageDataVirtual({
      buildDbPath: '/tmp/index.sqlite',
      markdownLinkAvailabilityPath: '/tmp/markdown-links.json',
      nodeMajor: 20,
    })

    expect(source).toContain(`import('better-sqlite3')`)
    expect(source).not.toContain(`import('node' + ':sqlite')`)
  })
})
