interface BuildPageDataVirtualOptions {
  buildDbPath: string
  markdownLinkAvailabilityPath: string
  nodeMajor: number
  dev?: boolean
}

const SELECT_PAGE_DATA = 'SELECT route, title, description, markdown, headings, keywords, updated_at, is_error, locale FROM ai_ready_pages'

export function createBuildPageDataVirtual(options: BuildPageDataVirtualOptions): string {
  if (options.dev) {
    return `
export async function readPageDataFromFilesystem() { return { pages: [], errorRoutes: [] } }
export async function readMarkdownLinkAvailabilityFromFilesystem() { return { runtimeMarkdownAvailable: false, paths: [] } }
`
  }

  const readRows = options.nodeMajor >= 22
    ? `const { DatabaseSync } = await import('node' + ':sqlite')
  const db = new DatabaseSync(dbPath, { open: true })
  const rows = db.prepare(${JSON.stringify(SELECT_PAGE_DATA)}).all()
  db.close()`
    : `const Database = (await import('better-sqlite3')).default
  const db = new Database(dbPath, { readonly: true })
  const rows = db.prepare(${JSON.stringify(SELECT_PAGE_DATA)}).all()
  db.close()`

  return `
export async function readMarkdownLinkAvailabilityFromFilesystem() {
  if (!import.meta.prerender) {
    return { runtimeMarkdownAvailable: false, paths: [] }
  }

  const { readFile } = await import('node:fs/promises')
  try {
    const availability = JSON.parse(await readFile(${JSON.stringify(options.markdownLinkAvailabilityPath)}, 'utf8'))
    return {
      runtimeMarkdownAvailable: availability?.runtimeMarkdownAvailable === true,
      paths: Array.isArray(availability?.paths) ? availability.paths.filter(path => typeof path === 'string') : [],
    }
  }
  catch (error) {
    console.warn('[nuxt-ai-ready] Failed to read Markdown link availability; keeping canonical links.', error)
    return { runtimeMarkdownAvailable: false, paths: [] }
  }
}

export async function readPageDataFromFilesystem() {
  if (!import.meta.prerender) {
    return { pages: [], errorRoutes: [] }
  }

  const dbPath = ${JSON.stringify(options.buildDbPath)}
  const { existsSync } = await import('node:fs')
  if (!existsSync(dbPath)) {
    return { pages: [], errorRoutes: [] }
  }

  ${readRows}

  const pages = rows.filter(r => !r.is_error).map(r => ({
    route: r.route,
    title: r.title,
    description: r.description,
    markdown: r.markdown,
    headings: r.headings,
    keywords: JSON.parse(r.keywords || '[]'),
    updatedAt: r.updated_at,
    locale: r.locale || '',
  }))
  const errorRoutes = rows.filter(r => r.is_error).map(r => r.route)

  return { pages, errorRoutes }
}
`
}
