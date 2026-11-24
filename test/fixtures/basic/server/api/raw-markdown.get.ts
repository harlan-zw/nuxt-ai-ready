import { defineEventHandler } from 'nuxt/server'

export default defineEventHandler(() => new Response('---\r\ntitle: Preserved\r\n---\r\n\r\n# Preserved\r\n', {
  headers: { 'content-type': 'text/markdown; charset=utf-8' },
}))
