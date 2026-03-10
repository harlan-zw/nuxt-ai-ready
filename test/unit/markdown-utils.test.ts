import { htmlToMarkdown } from 'mdream'
import { describe, expect, it } from 'vitest'

const RE_NBSP = /\u00A0/g

// Test that mdream origin should be just the site origin, not full URL
// This ensures absolute paths like /docs/foo resolve correctly
describe('mdream origin handling', () => {
  const html = '<a href="/docs/getting-started">intro</a>'

  it('resolves absolute paths correctly with origin-only', () => {
    const md = htmlToMarkdown(html, { origin: 'https://example.com' })
    expect(md).toBe('[intro](https://example.com/docs/getting-started)')
  })

  it('incorrectly doubles path when full URL used as origin', () => {
    // This demonstrates the bug we're avoiding
    const md = htmlToMarkdown(html, { origin: 'https://example.com/some/page' })
    expect(md).toBe('[intro](https://example.com/some/page/docs/getting-started)')
  })

  it('extracting origin from full URL fixes the issue', () => {
    const fullUrl = 'https://example.com/some/page'
    const origin = new URL(fullUrl).origin
    const md = htmlToMarkdown(html, { origin })
    expect(md).toBe('[intro](https://example.com/docs/getting-started)')
  })
})

// Test normalizeWhitespace logic
function normalizeWhitespace(text: string): string {
  return text.replace(RE_NBSP, ' ')
}

// Test getMarkdownRenderInfo path logic (without H3 event dependency)
interface RenderInfo { path: string, isExplicit: boolean }

function getMarkdownRenderInfoPath(
  originalPath: string,
  isExplicit: boolean,
  isImplicit: boolean,
  explicitOnly = false,
): RenderInfo | null {
  // Never run on API routes or internal routes
  if (originalPath.startsWith('/api') || originalPath.startsWith('/_') || originalPath.startsWith('/@')) {
    return null
  }

  // For explicitOnly mode (prerender), only handle .md requests
  if (explicitOnly && !isExplicit) {
    return null
  }

  // Extract file extension
  const lastSegment = originalPath.split('/').pop() || ''
  const hasExtension = lastSegment.includes('.')
  const extension = hasExtension ? lastSegment.substring(lastSegment.lastIndexOf('.')) : ''

  // Skip non-.md extensions
  if (hasExtension && extension !== '.md') {
    return null
  }

  if (!isExplicit && !isImplicit) {
    return null
  }

  // Normalize path
  let path = isExplicit ? originalPath.slice(0, -3) : originalPath
  if (path.endsWith('/index')) {
    path = path.slice(0, -5) || '/'
  }

  return { path, isExplicit }
}

describe('normalizeWhitespace', () => {
  it('replaces NBSP with regular spaces', () => {
    const input = 'Hello\u00A0World'
    expect(normalizeWhitespace(input)).toBe('Hello World')
  })

  it('replaces multiple NBSPs', () => {
    const input = 'a\u00A0b\u00A0c\u00A0d'
    expect(normalizeWhitespace(input)).toBe('a b c d')
  })

  it('leaves regular spaces unchanged', () => {
    const input = 'Hello World'
    expect(normalizeWhitespace(input)).toBe('Hello World')
  })

  it('handles empty string', () => {
    expect(normalizeWhitespace('')).toBe('')
  })

  it('handles string with only NBSPs', () => {
    expect(normalizeWhitespace('\u00A0\u00A0\u00A0')).toBe('   ')
  })
})

describe('getMarkdownRenderInfo path logic', () => {
  describe('excluded paths', () => {
    it('returns null for /api routes', () => {
      expect(getMarkdownRenderInfoPath('/api/data', false, true)).toBeNull()
      expect(getMarkdownRenderInfoPath('/api/data.md', true, false)).toBeNull()
    })

    it('returns null for /_internal routes', () => {
      expect(getMarkdownRenderInfoPath('/_nuxt/chunk.js', false, true)).toBeNull()
      expect(getMarkdownRenderInfoPath('/_ai-ready/bulk', false, true)).toBeNull()
    })

    it('returns null for /@routes', () => {
      expect(getMarkdownRenderInfoPath('/@vite/client', false, true)).toBeNull()
    })
  })

  describe('explicit .md requests', () => {
    it('strips .md extension and returns path', () => {
      const result = getMarkdownRenderInfoPath('/about.md', true, false)
      expect(result).toEqual({ path: '/about', isExplicit: true })
    })

    it('handles nested paths', () => {
      const result = getMarkdownRenderInfoPath('/docs/getting-started.md', true, false)
      expect(result).toEqual({ path: '/docs/getting-started', isExplicit: true })
    })

    it('normalizes /index.md to /', () => {
      const result = getMarkdownRenderInfoPath('/index.md', true, false)
      expect(result).toEqual({ path: '/', isExplicit: true })
    })

    it('handles trailing slash pattern', () => {
      const result = getMarkdownRenderInfoPath('/about/index.md', true, false)
      expect(result).toEqual({ path: '/about/', isExplicit: true })
    })

    it('normalizes nested /index.md paths', () => {
      const result = getMarkdownRenderInfoPath('/docs/getting-started/index.md', true, false)
      expect(result).toEqual({ path: '/docs/getting-started/', isExplicit: true })
    })
  })

  describe('implicit markdown (Accept header)', () => {
    it('returns path when implicit is true', () => {
      const result = getMarkdownRenderInfoPath('/about', false, true)
      expect(result).toEqual({ path: '/about', isExplicit: false })
    })

    it('returns null when neither explicit nor implicit', () => {
      const result = getMarkdownRenderInfoPath('/about', false, false)
      expect(result).toBeNull()
    })
  })

  describe('explicitOnly mode (prerender)', () => {
    it('returns null for non-.md path in explicitOnly mode', () => {
      const result = getMarkdownRenderInfoPath('/about', false, true, true)
      expect(result).toBeNull()
    })

    it('handles .md in explicitOnly mode', () => {
      const result = getMarkdownRenderInfoPath('/about.md', true, false, true)
      expect(result).toEqual({ path: '/about', isExplicit: true })
    })
  })

  describe('non-.md extensions', () => {
    it('returns null for .js files', () => {
      expect(getMarkdownRenderInfoPath('/script.js', false, true)).toBeNull()
    })

    it('returns null for .css files', () => {
      expect(getMarkdownRenderInfoPath('/styles.css', false, true)).toBeNull()
    })

    it('returns null for .json files', () => {
      expect(getMarkdownRenderInfoPath('/data.json', false, true)).toBeNull()
    })

    it('returns null for .html files', () => {
      expect(getMarkdownRenderInfoPath('/page.html', false, true)).toBeNull()
    })

    it('returns null for image files', () => {
      expect(getMarkdownRenderInfoPath('/image.png', false, true)).toBeNull()
      expect(getMarkdownRenderInfoPath('/photo.jpg', false, true)).toBeNull()
    })
  })

  describe('paths without extensions', () => {
    it('handles root path with implicit', () => {
      const result = getMarkdownRenderInfoPath('/', false, true)
      expect(result).toEqual({ path: '/', isExplicit: false })
    })

    it('handles deep paths with implicit', () => {
      const result = getMarkdownRenderInfoPath('/docs/api/reference', false, true)
      expect(result).toEqual({ path: '/docs/api/reference', isExplicit: false })
    })
  })
})
