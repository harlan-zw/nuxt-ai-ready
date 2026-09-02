import { defineEventHandler, getHeader, setHeader, setResponseStatus } from 'h3'

export default defineEventHandler((event) => {
  if (getHeader(event, 'x-ai-ready-indexing') !== '1')
    return

  setResponseStatus(event, 307)
  setHeader(event, 'location', `${event.path}.md`)
  return ''
})
