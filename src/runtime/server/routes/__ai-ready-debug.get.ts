import { createError, eventHandler, setHeader } from 'h3'
import { useRuntimeConfig, useStorage } from 'nitropack/runtime'
import { getErrorRoutes, getPages, getPagesList } from '../utils/pageData'

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
  const pages = await getPages()
  const pagesList = await getPagesList()
  const errorRoutes = await getErrorRoutes()

  // Determine data source
  let source: string
  if (isDev) {
    source = 'empty (dev mode returns empty Map)'
  }
  else if (isPrerender) {
    source = '#ai-ready-virtual/read-page-data.mjs (reads from filesystem)'
  }
  else {
    source = 'useStorage(\'assets:ai-ready-data\') (server assets)'
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

  // Check if page data is accessible via server assets storage
  const storage = useStorage('assets:ai-ready-data')
  const storageData = await storage.getItem('pages.json') as { pages?: unknown[] } | null
  const jsonFileStatus = {
    available: !!storageData,
    pageCount: storageData?.pages?.length ?? 0,
    source: 'useStorage(\'assets:ai-ready-data\')',
  }

  // Build diagnostics
  const issues: string[] = []
  const suggestions: string[] = []

  if (mode === 'development') {
    issues.push('Development mode: page data is intentionally empty')
    suggestions.push('Run `nuxi generate` or `nuxi build --prerender` to generate page data')
  }
  else if (mode === 'production' && pages.size === 0) {
    if (!jsonFileStatus.available) {
      issues.push('Production mode with no page data - server assets not found')
      suggestions.push('Run `nuxi generate` or `nuxi build --prerender` to generate the page data')
    }
    else {
      issues.push('Server assets exist but returned empty page data')
      suggestions.push('Check if pages were prerendered correctly')
    }
  }
  else if (mode === 'prerender' && pages.size === 0) {
    issues.push('Prerender mode but no pages found')
    suggestions.push('Check if page-data.jsonl exists in .nuxt/.data/ai-ready/')
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
      pageCount: pages.size,
      pages: pagesList.map(p => ({
        route: p.route,
        title: p.title,
        hasDescription: !!p.description,
        hasHeadings: !!p.headings,
      })),
      errorRoutes: Array.from(errorRoutes),
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
