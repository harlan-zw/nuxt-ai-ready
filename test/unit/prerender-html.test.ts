import { describe, expect, it } from 'vitest'
import { consumePrerenderedHtml, storePrerenderedHtml } from '../../src/runtime/server/utils/prerender-html'

describe('prerender html cache', () => {
  it('stores and consumes by page path', () => {
    storePrerenderedHtml('/about', '<html>about</html>')
    expect(consumePrerenderedHtml('/about')).toBe('<html>about</html>')
  })

  it('deletes entries on consume', () => {
    storePrerenderedHtml('/once', '<html>once</html>')
    consumePrerenderedHtml('/once')
    expect(consumePrerenderedHtml('/once')).toBeUndefined()
  })

  it('normalizes trailing slashes in both directions', () => {
    storePrerenderedHtml('/docs/', '<html>docs</html>')
    expect(consumePrerenderedHtml('/docs')).toBe('<html>docs</html>')
    storePrerenderedHtml('/guide', '<html>guide</html>')
    expect(consumePrerenderedHtml('/guide/')).toBe('<html>guide</html>')
  })

  it('handles the root path', () => {
    storePrerenderedHtml('/', '<html>root</html>')
    expect(consumePrerenderedHtml('/')).toBe('<html>root</html>')
  })

  it('returns undefined for pages that were never rendered', () => {
    expect(consumePrerenderedHtml('/nope')).toBeUndefined()
  })
})
