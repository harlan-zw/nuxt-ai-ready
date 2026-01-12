import { useSiteConfig } from '#imports'
import { eventHandler, sendIterable, setHeader, setResponseHeader } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
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

  const config = useRuntimeConfig()['nuxt-ai-ready'] as {
    llmsTxt?: { sections?: unknown[], notes?: unknown }
  }
  const siteConfig = useSiteConfig()

  // Build header
  const header = buildLlmsFullTxtHeader(
    {
      name: siteConfig.name,
      url: siteConfig.url,
      description: siteConfig.description,
    },
    config.llmsTxt as Parameters<typeof buildLlmsFullTxtHeader>[1],
  )

  // Check if any pages exist
  const total = await countPages(event)
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
