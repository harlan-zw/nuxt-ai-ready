import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readPrerenderedHtml } from '../../src/runtime/server/utils/prerendered-html'

describe('readPrerenderedHtml', () => {
  let outputDir: string

  beforeAll(async () => {
    outputDir = await mkdtemp(join(tmpdir(), 'ai-ready-prerender-'))
    await writeFile(join(outputDir, 'index.html'), '<html>root</html>')
    await mkdir(join(outputDir, 'about'), { recursive: true })
    await writeFile(join(outputDir, 'about', 'index.html'), '<html>about</html>')
    await writeFile(join(outputDir, 'flat.html'), '<html>flat</html>')
    await mkdir(join(outputDir, 'blog', 'santé-pelvien'), { recursive: true })
    await writeFile(join(outputDir, 'blog', 'santé-pelvien', 'index.html'), '<html>decoded</html>')
    // sibling dir sharing the output dir's name as a prefix (traversal guard)
    await mkdir(`${outputDir}-evil`, { recursive: true })
    await writeFile(join(`${outputDir}-evil`, 'index.html'), '<html>evil</html>')
    await writeFile(join(`${outputDir}-evil`, 'secret.html'), 'secret')
  })

  afterAll(async () => {
    await rm(outputDir, { recursive: true, force: true })
    await rm(`${outputDir}-evil`, { recursive: true, force: true })
  })

  it('returns undefined without an output dir', async () => {
    expect(await readPrerenderedHtml(undefined, '/about/')).toBeUndefined()
  })

  it('reads the root page', async () => {
    expect(await readPrerenderedHtml(outputDir, '/')).toBe('<html>root</html>')
  })

  it('reads subfolder index files with and without trailing slash', async () => {
    expect(await readPrerenderedHtml(outputDir, '/about/')).toBe('<html>about</html>')
    expect(await readPrerenderedHtml(outputDir, '/about')).toBe('<html>about</html>')
  })

  it('falls back to the flat .html file mapping', async () => {
    expect(await readPrerenderedHtml(outputDir, '/flat')).toBe('<html>flat</html>')
  })

  it('resolves url-encoded paths to their decoded file names', async () => {
    expect(await readPrerenderedHtml(outputDir, '/blog/sant%C3%A9-pelvien/')).toBe('<html>decoded</html>')
  })

  it('returns undefined for missing pages', async () => {
    expect(await readPrerenderedHtml(outputDir, '/nope/')).toBeUndefined()
  })

  it('does not escape the output dir via ../ segments', async () => {
    const evilName = `${outputDir.split('/').pop()}-evil`
    expect(await readPrerenderedHtml(outputDir, `/../${evilName}/`)).toBeUndefined()
    expect(await readPrerenderedHtml(outputDir, `/../${evilName}/secret`)).toBeUndefined()
    expect(await readPrerenderedHtml(outputDir, `/%2E%2E/${evilName}/secret`)).toBeUndefined()
  })

  it('tolerates malformed escape sequences', async () => {
    expect(await readPrerenderedHtml(outputDir, '/%E0%A4%A/')).toBeUndefined()
  })
})
