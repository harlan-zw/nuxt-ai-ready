import { createError, defineEventHandler, getQuery, setResponseStatus } from '#nuxtseo/h3'
import { setStatusAwareLinkHeader } from '#ai-ready/server/plugins/link-header'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  setStatusAwareLinkHeader(event, '<https://example.com/safe>; rel="canonical"', '<https://example.com/success>; rel="alternate"')
  if (query.throw === 'true' || query.throw === '404')
    throw createError({ statusCode: query.throw === '404' ? 404 : 503, statusMessage: 'Fixture failure' })
  setResponseStatus(event, query.failure === 'true' ? 503 : 200)
  return { ok: query.failure !== 'true' }
})
