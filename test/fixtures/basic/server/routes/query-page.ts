import { defineEventHandler, getQuery, sendRedirect, setHeader } from '#nuxtseo/h3'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  if (query.move === 'all')
    return sendRedirect(event, '/query-page?range=all', 302)
  const range = query.range === 'week' || query.range === 'all' ? query.range : 'month'
  const titles = { week: 'Weekly results', all: 'All-time results', month: 'Monthly results' }
  setHeader(event, 'content-type', 'text/html; charset=utf-8')
  return `<!DOCTYPE html><html><head><title>${titles[range]}</title></head><body><main><h1>${titles[range]}</h1><p>Selected range: ${range}</p></main></body></html>`
})
