import type { PageEntry } from '../db/queries'
import { createError, eventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { queryPages } from '../db/queries'

interface DebugInfo {
  version: string
  environment: {
    isDev: boolean
    isPrerender: boolean
    mode: 'development' | 'prerender' | 'production'
  }
  config: {
    debug: boolean
    cacheMaxAgeSeconds: number
    mdreamOptions: unknown
  }
  pageData: {
    source: string
    pageCount: number
    pages: Array<{ route: string, title: string, hasDescription: boolean, hasHeadings: boolean }>
    errorRoutes: string[]
  }
  jsonFile: {
    available: boolean
    pageCount: number
    source: string
  }
  virtualModules: {
    pageDataModule: {
      available: boolean
      pagesCount: number
      errorRoutesCount: number
    }
    readPageDataModule: {
      available: boolean
      note: string
    }
  }
  diagnostics: {
    issues: string[]
    suggestions: string[]
  }
}

export default eventHandler(async (event) => {
  const runtimeConfig = useRuntimeConfig(event)['nuxt-ai-ready'] as any

  // Only allow access when debug is enabled
  if (!runtimeConfig.debug) {
    throw createError({
      statusCode: 404,
      message: 'Not Found',
    })
  }

  const isDev = import.meta.dev
  const isPrerender = import.meta.prerender ?? false

  // Determine mode
  let mode: 'development' | 'prerender' | 'production'
  if (isDev) {
    mode = 'development'
  }
  else if (isPrerender) {
    mode = 'prerender'
  }
  else {
    mode = 'production'
  }

  // Get page data
  const pages = await queryPages(event) as PageEntry[]
  const errorRoutes = await queryPages(event, { where: { hasError: true } }) as PageEntry[]

  // Determine data source
  let source: string
  if (isDev) {
    source = 'empty (dev mode returns empty array)'
  }
  else if (isPrerender) {
    source = '#ai-ready-virtual/read-page-data.mjs (reads from filesystem)'
  }
  else {
    source = 'database (db0 adapter)'
  }

  // Check virtual module states
  let pageDataModuleInfo = { available: false, pagesCount: 0, errorRoutesCount: 0 }
  let readPageDataModuleInfo = { available: false, note: '' }

  try {
    const m = await import('#ai-ready-virtual/page-data.mjs') as { pages?: unknown[], errorRoutes?: unknown[] }
    pageDataModuleInfo = {
      available: true,
      pagesCount: Array.isArray(m.pages) ? m.pages.length : 0,
      errorRoutesCount: Array.isArray(m.errorRoutes) ? m.errorRoutes.length : 0,
    }
  }
  catch {
    pageDataModuleInfo.available = false
  }

  try {
    const m = await import('#ai-ready-virtual/read-page-data.mjs') as { readPageDataFromFilesystem?: () => Promise<unknown> }
    readPageDataModuleInfo = {
      available: typeof m.readPageDataFromFilesystem === 'function',
      note: isPrerender ? 'Active - reading from filesystem' : 'Available but only works during prerender',
    }
  }
  catch {
    readPageDataModuleInfo = { available: false, note: 'Module not available' }
  }

  // Check if page data is accessible via public directory
  let publicData: { pages?: unknown[] } | null = null
  let jsonFileSource = 'fetch(\'/__ai-ready/pages.json\')'

  // Try Cloudflare ASSETS binding first
  const cfEnv = event.context?.cloudflare?.env as { ASSETS?: { fetch: (req: Request | string) => Promise<Response> } } | undefined
  if (cfEnv?.ASSETS?.fetch) {
    try {
      const response = await cfEnv.ASSETS.fetch(new Request('https://assets.local/__ai-ready/pages.json'))
      if (response.ok) {
        publicData = await response.json()
        jsonFileSource = 'env.ASSETS.fetch(\'/__ai-ready/pages.json\')'
      }
    }
    catch {
      // Fall through to regular fetch
    }
  }

  // Fall back to regular fetch
  if (!publicData) {
    publicData = await globalThis.$fetch('/__ai-ready/pages.json', {
      baseURL: '/',
    }).catch(() => null) as { pages?: unknown[] } | null
  }

  const jsonFileStatus = {
    available: !!publicData,
    pageCount: publicData?.pages?.length ?? 0,
    source: jsonFileSource,
  }

  // Build diagnostics
  const issues: string[] = []
  const suggestions: string[] = []

  if (mode === 'development') {
    issues.push('Development mode: page data is intentionally empty')
    suggestions.push('Run `nuxi generate` or `nuxi build --prerender` to generate page data')
  }
  else if (mode === 'production' && pages.length === 0) {
    if (!jsonFileStatus.available) {
      issues.push('Production mode with no page data - database may be empty')
      suggestions.push('Run `nuxi generate` or `nuxi build --prerender` to generate the page data')
    }
    else {
      issues.push('Database exists but returned empty page data')
      suggestions.push('Check if pages were prerendered correctly')
    }
  }
  else if (mode === 'prerender' && pages.length === 0) {
    issues.push('Prerender mode but no pages found')
    suggestions.push('Check if pages.db exists in .data/ai-ready/')
  }

  const debugInfo: DebugInfo = {
    version: runtimeConfig.version || 'unknown',
    environment: {
      isDev,
      isPrerender,
      mode,
    },
    config: {
      debug: runtimeConfig.debug,
      cacheMaxAgeSeconds: runtimeConfig.cacheMaxAgeSeconds,
      mdreamOptions: runtimeConfig.mdreamOptions,
    },
    pageData: {
      source,
      pageCount: pages.length,
      pages: pages.map(p => ({
        route: p.route,
        title: p.title,
        hasDescription: !!p.description,
        hasHeadings: !!p.headings,
      })),
      errorRoutes: errorRoutes.map(e => e.route),
    },
    jsonFile: jsonFileStatus,
    virtualModules: {
      pageDataModule: pageDataModuleInfo,
      readPageDataModule: readPageDataModuleInfo,
    },
    diagnostics: {
      issues,
      suggestions,
    },
  }

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  return debugInfo
})
