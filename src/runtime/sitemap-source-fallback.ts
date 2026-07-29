import type { SitemapSourceInput, SitemapUrlInput } from '@nuxtjs/sitemap'

interface SitemapConfigSources {
  urls?: unknown
  sources?: unknown
}

type CloneResult<T>
  = | { _tag: 'Ok', value: T }
    | { _tag: 'Error', message: string }

export interface CollectedSitemapFallbackSources {
  sources: SitemapSourceInput[]
  warnings: string[]
}

function cloneSerializable<T>(value: T): CloneResult<T> {
  try {
    return { _tag: 'Ok', value: JSON.parse(JSON.stringify(value)) as T }
  }
  catch (error) {
    return {
      _tag: 'Error',
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Capture declarative sitemap sources for the runtime bundle. Function-valued
 * URLs remain owned by @nuxtjs/sitemap so they are not evaluated twice.
 */
export function collectSitemapFallbackSources(config: SitemapConfigSources | undefined): CollectedSitemapFallbackSources {
  if (!config)
    return { sources: [], warnings: [] }

  const warnings: string[] = []
  const sources: SitemapSourceInput[] = []

  if (Array.isArray(config.sources)) {
    for (const [index, source] of config.sources.entries()) {
      const cloned = cloneSerializable(source)
      if (cloned._tag === 'Ok')
        sources.push(cloned.value as SitemapSourceInput)
      else
        warnings.push(`Could not preserve sitemap.sources[${index}] as a prerender fallback: ${cloned.message}`)
    }
  }

  if (Array.isArray(config.urls)) {
    const urls = cloneSerializable(config.urls)
    if (urls._tag === 'Ok') {
      sources.push({
        context: {
          name: 'nuxt-ai-ready:sitemap-urls',
          description: 'Fallback for URLs configured through sitemap.urls.',
        },
        sourceType: 'user',
        urls: urls.value as SitemapUrlInput[],
      })
    }
    else {
      warnings.push(`Could not preserve sitemap.urls as a prerender fallback: ${urls.message}`)
    }
  }

  return { sources, warnings }
}

function getUrlKey(url: SitemapUrlInput): string | null {
  if (typeof url === 'string')
    return url
  return url.loc || url.url || null
}

function getFetchKey(source: SitemapSourceInput): string | null {
  if (typeof source === 'string')
    return source
  if (Array.isArray(source))
    return source[0]
  if (!source.fetch)
    return null
  return typeof source.fetch === 'string'
    ? source.fetch
    : source.fetch[0]
}

/**
 * Restore only missing configured sources. This keeps the normal Sitemap
 * module path authoritative while surviving an empty prerender source handoff.
 */
export function mergeSitemapFallbackSources(
  sources: SitemapSourceInput[],
  fallbacks: SitemapSourceInput[],
): SitemapSourceInput[] {
  const merged = [...sources]
  const urlKeys = new Set<string>()
  const fetchKeys = new Set<string>()

  for (const source of sources) {
    const fetchKey = getFetchKey(source)
    if (fetchKey)
      fetchKeys.add(fetchKey)
    if (typeof source === 'object' && !Array.isArray(source)) {
      for (const url of source.urls || []) {
        const key = getUrlKey(url)
        if (key)
          urlKeys.add(key)
      }
    }
  }

  for (const fallback of fallbacks) {
    const fetchKey = getFetchKey(fallback)
    if (fetchKey) {
      if (!fetchKeys.has(fetchKey)) {
        merged.push(fallback)
        fetchKeys.add(fetchKey)
      }
      continue
    }

    if (typeof fallback !== 'object' || Array.isArray(fallback) || !fallback.urls)
      continue

    const urls = fallback.urls.filter((url) => {
      const key = getUrlKey(url)
      if (!key || urlKeys.has(key))
        return false
      urlKeys.add(key)
      return true
    })
    if (urls.length)
      merged.push({ ...fallback, urls })
  }

  return merged
}
