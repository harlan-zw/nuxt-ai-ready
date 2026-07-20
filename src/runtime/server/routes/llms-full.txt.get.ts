import { eventHandler, sendIterable, setHeader, setResponseHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { getSiteConfig } from '#site-config/server/composables'
import { withSiteUrl } from '#site-config/server/composables/utils'
import { toDeployedRoute } from '../../route-path'
import { countPages, streamPages } from '../db/queries'
import { buildLlmsFullTxtHeader, formatPageForLlmsFullTxt } from '../utils/llms-full'

// llms-full.txt is streamed during prerender directly to public dir
// At runtime, this handler streams pages from the database
export default eventHandler(async (event) => {
  // During prerender, return placeholder (static file will be used)
  if (import.meta.prerender) {
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return '# llms-full.txt\n\nThis file is generated during prerender.'
  }

  const runtimeConfig = useRuntimeConfig(event)
  const config = runtimeConfig['nuxt-ai-ready'] as {
    llmsTxt?: { sections?: unknown[], notes?: unknown }
  }
  const siteConfig = getSiteConfig(event)
  const baseURL = runtimeConfig.app.baseURL
  const canonicalSiteUrl = siteConfig.url ? withSiteUrl(event, toDeployedRoute('/', baseURL)) : undefined

  // Build header
  const header = buildLlmsFullTxtHeader(
    {
      name: siteConfig.name,
      url: canonicalSiteUrl,
      description: siteConfig.description,
    },
    config.llmsTxt as Parameters<typeof buildLlmsFullTxtHeader>[1],
  )

  // Check if any pages exist
  let total = 0
  try {
    total = await countPages(event)
  }
  catch (err: any) {
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return `${header}Database error: ${err.message || String(err)}\n\nRuntime indexing may not be configured correctly for this environment.`
  }

  if (total === 0) {
    setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
    return `${header}No pages indexed. Run \`nuxi generate\` or enable runtime indexing.`
  }

  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400')

  // Stream pages from database using async generator
  const siteUrl = siteConfig.url
  async function* generateContent() {
    yield header
    for await (const page of streamPages(event)) {
      yield formatPageForLlmsFullTxt(page.route, page.title, page.description, page.markdown, siteUrl)
    }
  }

  return sendIterable(event, generateContent())
})
