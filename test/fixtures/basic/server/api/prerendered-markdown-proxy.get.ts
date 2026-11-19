import { defineEventHandler } from 'nuxt/server'

export default defineEventHandler(() => {
  const title = 'Proxied Markdown'
  const markdown = `# ${title}`
  if (import.meta.prerender)
    return { markdown, title, description: '', headings: [] }

  return new Response(markdown, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  })
})
