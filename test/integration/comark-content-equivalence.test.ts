/**
 * Proves the comark content adapter indexes the same pages as the HTML path.
 *
 * The fixture is built twice from one set of Markdown files: once reading the
 * source from the collection (`contentSource: true`) and once converting each
 * rendered page's HTML (`contentSource: false`). Everything a consumer keys off
 * has to agree between the two runs.
 *
 * The bodies themselves cannot agree byte for byte, and should not. The whole
 * point of reading the collection is that the HTML round trip is lossy, so the
 * body assertions check that the substance survives both ways, and that the
 * adapter reproduces its source file exactly.
 */
import { readFileSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { beforeAll, describe, expect, it } from 'vitest'
import { createPrerenderDatabase } from '../../src/prerender'
import { decompressFromBase64, importDbDump, initSchema } from '../../src/runtime/server/db/shared'

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/comark-content')

/**
 * `queryCollectionManifest` and `renderPageMarkdown` ship from comark 0.1.2.
 * On an older comark the adapter correctly declines and both arms of this test
 * would convert HTML, which proves nothing, so skip instead of passing hollow.
 */
function comarkSupportsContentSource(): boolean {
  try {
    const entry = fileURLToPath(import.meta.resolve('@harlan-zw/comark-content'))
    const pkg = JSON.parse(readFileSync(join(entry, '../../package.json'), 'utf-8')) as { version?: string }
    const [major = 0, minor = 0, patch = 0] = (pkg.version || '').split('.').map(Number)
    return major > 0 || minor > 1 || (minor === 1 && patch >= 2)
  }
  catch {
    return false
  }
}

interface IndexedPage {
  route: string
  title: string
  description: string
}

interface IndexedBuild {
  pages: IndexedPage[]
  markdown: Record<string, string>
  ftsRoutes: (term: string) => Promise<string[]>
}

const ROUTES = ['/docs/getting-started', '/docs/api', '/docs/components']

async function build(contentSource: boolean): Promise<IndexedBuild> {
  await rm(join(fixtureDir, '.output'), { recursive: true, force: true })
  await execa('nuxi', ['generate'], {
    cwd: fixtureDir,
    preferLocal: true,
    env: { ...process.env, AI_READY_CONTENT_SOURCE: contentSource ? 'on' : 'off' },
  })

  const publicDir = join(fixtureDir, '.output/public')
  const { pages } = JSON.parse(await readFile(join(publicDir, '__ai-ready/pages.json'), 'utf-8')) as { pages: IndexedPage[] }
  const markdown: Record<string, string> = {}
  for (const route of ROUTES)
    markdown[route] = await readFile(join(publicDir, `${route}.md`), 'utf-8')

  // The dump is what a serverless deploy restores from, so search it rather
  // than the build database: it is the artefact consumers actually get.
  const dump = await readFile(join(publicDir, '__ai-ready/pages.dump'), 'utf-8')
  const rows = await decompressFromBase64<Parameters<typeof importDbDump>[1]>(dump)
  const db = await createPrerenderDatabase(':memory:')
  await initSchema(db)
  await importDbDump(db, rows)

  const ftsRoutes = async (term: string) => {
    const found = await db.all<{ route: string }>(
      'SELECT route FROM ai_ready_pages_fts WHERE ai_ready_pages_fts MATCH ? ORDER BY route',
      [term],
    )
    return found.map(row => row.route)
  }

  return { pages, markdown, ftsRoutes }
}

describe.skipIf(!comarkSupportsContentSource())('comark content source equivalence', () => {
  let fromCollection: IndexedBuild
  let fromHtml: IndexedBuild

  beforeAll(async () => {
    fromCollection = await build(true)
    fromHtml = await build(false)
  }, 300000)

  it('indexes the same routes', () => {
    const routes = (build: IndexedBuild) => build.pages.map(page => page.route).sort()
    expect(routes(fromCollection)).toEqual(routes(fromHtml))
    expect(routes(fromCollection)).toEqual(expect.arrayContaining(ROUTES))
  })

  it('records the same titles and descriptions', () => {
    const meta = (build: IndexedBuild) => Object.fromEntries(
      build.pages.map(page => [page.route, { title: page.title, description: page.description }]),
    )
    expect(meta(fromCollection)).toEqual(meta(fromHtml))
  })

  it('keeps every heading and the prose under it on both paths', async () => {
    for (const route of ROUTES) {
      const source = await readFile(join(fixtureDir, `content${route}.md`), 'utf-8')
      const headings = [...source.matchAll(/^#{1,6} (.+)$/gm)].map(match => match[1]!)
      expect(headings.length).toBeGreaterThan(1)

      for (const heading of headings) {
        expect(fromCollection.markdown[route], `${route} from collection`).toContain(heading)
        expect(fromHtml.markdown[route], `${route} from HTML`).toContain(heading)
      }
    }

    expect(fromCollection.markdown['/docs/getting-started']).toContain('load-bearing for the equivalence test')
    expect(fromHtml.markdown['/docs/getting-started']).toContain('load-bearing for the equivalence test')
    expect(fromCollection.markdown['/docs/api']).toContain('| `enabled` |')
    expect(fromHtml.markdown['/docs/api']).toContain('| `enabled` |')
  })

  it('returns the same routes from full text search', async () => {
    for (const term of ['enabled', 'restart', 'trailing', 'prose']) {
      expect(await fromCollection.ftsRoutes(term), term).toEqual(await fromHtml.ftsRoutes(term))
    }
  })

  it('reproduces the source file when reading the collection', async () => {
    // comark re-pads table columns to the widest cell, so the round trip is
    // exact everywhere except inside a table's whitespace. Collapse runs of
    // spaces and of dashes before comparing: that tolerates the padding and
    // still catches dropped content, reordering, or a lost MDC block.
    const normalise = (markdown: string) => markdown
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').replace(/-{2,}/g, '--').trim())
      .join('\n')
      .trim()

    for (const route of ROUTES) {
      const source = await readFile(join(fixtureDir, `content${route}.md`), 'utf-8')
      const body = normalise(source.slice(source.indexOf('---', 3) + 4))
      expect(normalise(fromCollection.markdown[route]!).endsWith(body), route).toBe(true)
    }
  })

  it('loses source fidelity that only the collection can keep', () => {
    // Not a wish list. These are the differences the HTML path cannot avoid, so
    // a change that quietly makes the adapter behave like the HTML path fails
    // here rather than passing the assertions above.
    expect(fromCollection.markdown['/docs/components']).toContain('::callout{type="info"}')
    expect(fromHtml.markdown['/docs/components']).not.toContain('::callout')

    expect(fromCollection.markdown['/docs/api']).toContain('```ts [nuxt.config.ts]')
    expect(fromHtml.markdown['/docs/api']).not.toContain('[nuxt.config.ts]')
  })
})
