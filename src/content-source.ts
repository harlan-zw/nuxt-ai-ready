import { hasNuxtModule, useNuxt } from '@nuxt/kit'
import { resolveNuxtContentVersion } from 'nuxtseo-shared/kit'
import { readPackageJSON } from 'pkg-types'

/**
 * The content module that backs a route's Markdown, if any.
 *
 * A content source lets the prerender indexer read a page's source Markdown
 * straight from the collection. Without one it has to render the page and
 * convert the HTML, which costs a full SSR render per route and loses whatever
 * the HTML round trip drops.
 */
export type ContentSource
  = | { _tag: 'None' }
    | { _tag: 'NuxtContentV3' }
    | { _tag: 'ComarkContent' }

const COMARK_MODULE = '@harlan-zw/comark-content'

/**
 * `queryCollectionManifest` and `renderPageMarkdown` ship from this version.
 * An older comark has no way to enumerate collections or to turn a parsed body
 * back into Markdown, so those builds fall through to the HTML path.
 */
const COMARK_MINIMUM = [0, 1, 2] as const

/**
 * Read the installed version from the package rather than from the module's
 * Nuxt meta. comark declares no `version` in its meta, so
 * `hasNuxtModuleCompatibility` reports false for every release of it.
 */
async function comarkSatisfiesMinimum(): Promise<boolean> {
  const url = useNuxt().options.rootDir
  const pkg = await readPackageJSON(COMARK_MODULE, { url }).catch(() => {
    // Declared as a module but not resolvable from the app. Treat it as absent
    // rather than failing the build; the HTML path still indexes every route.
    return null
  })

  const parts = pkg?.version?.split('.').map(part => Number.parseInt(part, 10))
  if (!parts || parts.length < 3 || parts.some(part => !Number.isFinite(part)))
    return false

  for (const [index, minimum] of COMARK_MINIMUM.entries()) {
    if (parts[index]! !== minimum)
      return parts[index]! > minimum
  }
  return true
}

export async function resolveContentSource(enabled: boolean): Promise<ContentSource> {
  if (!enabled)
    return { _tag: 'None' }

  const contentVersion = await resolveNuxtContentVersion()
  if (contentVersion && contentVersion.version === 3)
    return { _tag: 'NuxtContentV3' }

  if (hasNuxtModule(COMARK_MODULE) && await comarkSatisfiesMinimum())
    return { _tag: 'ComarkContent' }

  return { _tag: 'None' }
}

const NUXT_CONTENT_V3_LOOKUP = `
import { queryCollection } from '@nuxt/content/server'
import manifest from '#content/manifest'
import { stringify } from 'minimark/stringify'

const pageCollections = Object.entries(manifest)
  .filter(([, info]) => info.type === 'page')
  .map(([name]) => name)

export async function lookupContentPage(event, path) {
  if (!pageCollections.length) return null
  const candidates = path === '/' ? ['/'] : [path, path.replace(/\\/$/, '')]
  for (const collection of pageCollections) {
    for (const candidate of candidates) {
      const page = await queryCollection(event, collection).path(candidate).first().catch(() => null)
      if (!page) continue
      const markdown = stringify({ ...page.body, type: 'minimark' }, { format: 'markdown/html' })
      return {
        markdown,
        title: page.title,
        description: page.description,
        updatedAt: page.seo?.articleModifiedTime || page.updatedAt,
      }
    }
  }
  return null
}
`

// comark reads its collections from nitro server assets in process, so this
// runs inside the prerender handler with no HTTP hop and no SSR render.
//
// Differences from the @nuxt/content branch above:
// - `.path()` already tolerates a trailing slash on both sides, so there is no
//   second candidate to try.
// - the body is a comark document, not minimark, so `renderPageMarkdown` is the
//   stringifier rather than `stringify`. It omits frontmatter by default, which
//   is what the caller wants: it prepends its own.
// - the manifest is fetched, not imported, so it is memoised as a promise. The
//   crawl runs routes concurrently and would otherwise load it once per route.
// - a miss returns null rather than throwing, so nothing is caught here. A real
//   failure propagates to the middleware, which logs it and renders the page.
const COMARK_LOOKUP = `
import { queryCollection, queryCollectionManifest, renderPageMarkdown } from '@harlan-zw/comark-content/server'

let manifestPromise

export async function lookupContentPage(event, path) {
  manifestPromise ??= queryCollectionManifest(event)
  const manifest = await manifestPromise
  for (const { name } of manifest) {
    const page = await queryCollection(event, name).path(path).first()
    if (!page) continue
    return {
      markdown: await renderPageMarkdown(page.body),
      title: page.title,
      description: page.description,
      updatedAt: page.seo?.articleModifiedTime || page.updatedAt,
    }
  }
  return null
}
`

const NO_CONTENT_LOOKUP = `export async function lookupContentPage() { return null }`

/**
 * Source of `#ai-ready-virtual/content-lookup.mjs`.
 *
 * Always a real module so the markdown middleware can import it
 * unconditionally. With no content source it exports a stub that reports a
 * miss, and the middleware renders the page instead.
 */
export function contentLookupModule(source: ContentSource): string {
  switch (source._tag) {
    case 'NuxtContentV3':
      return NUXT_CONTENT_V3_LOOKUP
    case 'ComarkContent':
      return COMARK_LOOKUP
    case 'None':
      return NO_CONTENT_LOOKUP
  }
}
