import { defineEventHandler } from 'nuxt/server'

export default defineEventHandler((event) => {
  if (event.url.pathname !== '/mcp')
    return

  return new Response('<h1>Connection guide</h1>', {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'link': '<https://nuxt5.example.com/mcp.md>; rel="alternate"; type="text/markdown"',
    },
  })
})
