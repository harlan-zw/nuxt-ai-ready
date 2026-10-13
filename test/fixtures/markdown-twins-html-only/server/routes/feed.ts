import { defineEventHandler, setHeader } from '#nuxtseo/h3'

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'application/rss+xml; charset=utf-8')
  return '<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title></channel></rss>'
})
