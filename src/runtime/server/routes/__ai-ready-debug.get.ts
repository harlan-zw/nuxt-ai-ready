import type { IndexNowLogEntry, PageEntry } from '../db/queries'
import { createError, eventHandler, setHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { countPages, countPagesNeedingIndexNowSync, getIndexNowLog, getIndexNowStats, getRecentCronRuns, getSitemapSeededAt, queryPages } from '../db/queries'

interface CronRunInfo {
  id: number
  startedAt: string
  finishedAt: string | null
  durationMs: number | null
  status: string
  pagesIndexed: number
  pagesRemaining: number
  indexNowSubmitted: number
  indexNowRemaining: number
  errors: string[]
}

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
  runtimeSync?: {
    total: number
    indexed: number
    pending: number
    sitemapSeededAt: string | null
  }
  indexNow?: {
    pending: number
    totalSubmitted: number
    lastSubmittedAt: string | null
    lastError: string | null
  }
  indexNowLog?: Array<{
    id: number
    submittedAt: string
    urlCount: number
    success: boolean
    error: string | null
  }>
  cronRuns?: CronRunInfo[]
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
  cloudflare?: {
    hasContext: boolean
    hasCloudflare: boolean
    hasCloudflareEnv: boolean
    hasContextEnv: boolean
    contextKeys: string[]
    cloudflareKeys: string[]
    cloudflareEnvKeys: string[]
    databaseConfig: {
      type: string
      bindingName?: string
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

  // Build diagnostics
  const issues: string[] = []
  const suggestions: string[] = []

  // Get page data - separate queries for pages and errors
  let pages: PageEntry[] = []
  let errorRoutes: PageEntry[] = []
  let dbError: string | null = null

  try {
    const [p, e] = await Promise.all([
      queryPages(event) as Promise<PageEntry[]>,
      queryPages(event, { where: { hasError: true } }) as Promise<PageEntry[]>,
    ])
    pages = p
    errorRoutes = e
  }
  catch (err: any) {
    dbError = err.message || String(err)
    issues.push(`Database error: ${dbError}`)
    suggestions.push('Verify your database configuration (D1 binding, SQLite path, etc.)')
  }

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

  // Fetch runtime sync stats (only in production)
  let runtimeSyncInfo: DebugInfo['runtimeSync']
  let indexNowInfo: DebugInfo['indexNow']
  let indexNowLogInfo: DebugInfo['indexNowLog']
  let cronRunsInfo: CronRunInfo[] | undefined

  if (!isDev && !isPrerender && !dbError) {
    try {
      const [total, pending, sitemapSeededAt, cronRuns] = await Promise.all([
        countPages(event),
        countPages(event, { where: { pending: true } }),
        getSitemapSeededAt(event),
        getRecentCronRuns(event, 20),
      ])

      runtimeSyncInfo = {
        total,
        indexed: total - pending,
        pending,
        sitemapSeededAt: sitemapSeededAt ? new Date(sitemapSeededAt).toISOString() : null,
      }

      cronRunsInfo = cronRuns.map(run => ({
        id: run.id,
        startedAt: new Date(run.startedAt).toISOString(),
        finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
        durationMs: run.durationMs,
        status: run.status,
        pagesIndexed: run.pagesIndexed,
        pagesRemaining: run.pagesRemaining,
        indexNowSubmitted: run.indexNowSubmitted,
        indexNowRemaining: run.indexNowRemaining,
        errors: run.errors,
      }))

      // IndexNow stats if configured
      if (runtimeConfig.indexNowKey) {
        const [indexNowPending, indexNowStats, indexNowLogEntries] = await Promise.all([
          countPagesNeedingIndexNowSync(event),
          getIndexNowStats(event),
          getIndexNowLog(event, 20),
        ])
        indexNowInfo = {
          pending: indexNowPending,
          totalSubmitted: indexNowStats.totalSubmitted,
          lastSubmittedAt: indexNowStats.lastSubmittedAt
            ? new Date(indexNowStats.lastSubmittedAt).toISOString()
            : null,
          lastError: indexNowStats.lastError,
        }
        indexNowLogInfo = indexNowLogEntries.map(entry => ({
          id: entry.id,
          submittedAt: new Date(entry.submittedAt).toISOString(),
          urlCount: entry.urlCount,
          success: entry.success,
          error: entry.error,
        }))
      }
    }
    catch (err: any) {
      issues.push(`Runtime stats error: ${err.message || String(err)}`)
    }
  }

  // Cloudflare binding diagnostics
  const cloudflareInfo = {
    hasContext: !!event.context,
    hasCloudflare: !!event.context?.cloudflare,
    hasCloudflareEnv: !!event.context?.cloudflare?.env,
    hasContextEnv: !!(event.context as any)?.env,
    contextKeys: event.context ? Object.keys(event.context) : [],
    cloudflareKeys: event.context?.cloudflare ? Object.keys(event.context.cloudflare) : [],
    cloudflareEnvKeys: event.context?.cloudflare?.env ? Object.keys(event.context.cloudflare.env) : [],
    databaseConfig: {
      type: runtimeConfig.database?.type || 'unknown',
      bindingName: runtimeConfig.database?.bindingName,
    },
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
    runtimeSync: runtimeSyncInfo,
    indexNow: indexNowInfo,
    indexNowLog: indexNowLogInfo,
    cronRuns: cronRunsInfo,
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
    cloudflare: cloudflareInfo,
    diagnostics: {
      issues,
      suggestions,
    },
  }

  setHeader(event, 'Content-Type', 'application/json; charset=utf-8')
  return debugInfo
})
