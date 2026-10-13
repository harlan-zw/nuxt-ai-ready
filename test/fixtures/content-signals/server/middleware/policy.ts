import { defineEventHandler } from 'nuxt/server'

export default defineEventHandler((event) => {
  if (event.url.pathname === '/about')
    event.res.headers.set('Content-Signal', 'ai-train=no, search=yes')
})
