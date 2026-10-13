import { defineEventHandler, proxyRequest } from '#nuxtseo/h3'

// Mirrors a first-party analytics proxy: the proxy writes the response itself.
// `event.fetch` routes the relative target inside this Nitro app.
export default defineEventHandler(event => proxyRequest(event, '/api/proxy-target', {
  fetch: (target, init) => event.fetch(String(target), init),
}))
