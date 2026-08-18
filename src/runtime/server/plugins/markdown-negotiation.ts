import { defineEventHandler } from '#nuxtseo/h3'
import { defineNitroPlugin, useRuntimeConfig } from '#nuxtseo/nitro'
import { logger } from '../logger'
import { applyNegotiation, decideNegotiation } from '../utils/negotiation-response'

interface H3Layer {
  route: string
  handler: unknown
}

interface H3AppLike {
  stack: H3Layer[]
  use: (route: string, handler: unknown) => unknown
}

function toH3App(candidate: unknown): H3AppLike | null {
  if (!candidate || typeof candidate !== 'object')
    return null
  const app = candidate as Partial<H3AppLike>
  if (!Array.isArray(app.stack) || typeof app.use !== 'function')
    return null
  return app as H3AppLike
}

const negotiationHandler = defineEventHandler(async (event) => {
  await applyNegotiation(event, decideNegotiation(event, 'early'))
})

/**
 * Run Accept negotiation in front of the Nitro static asset handler.
 *
 * Nitro unshifts that handler ahead of every server middleware when
 * `serveStatic` is on, which is the default for the node-server preset. A
 * prerendered route is then answered before the Markdown middleware runs, so
 * negotiation never happens. See issue #82.
 *
 * The handler is spliced in at stack position 1. Position 0 holds the Nitro
 * route-rules layer, which must stay first. It applies the `headers`, `redirect`
 * and `proxy` rules, and h3 runs it even after the response ended.
 */
export default defineNitroPlugin((nitro) => {
  const app = toH3App((nitro as { h3App?: unknown }).h3App)
  if (!app) {
    // Nitro v3 does not expose an h3 stack. The Markdown middleware still
    // negotiates every route the server renders.
    logger.debug('[markdown] No h3 stack found. Accept negotiation stays in the middleware.')
    return
  }

  const baseURL = useRuntimeConfig().app?.baseURL || '/'
  app.use(`${baseURL}/`.replace(/\/+/g, '/'), negotiationHandler)

  const layer = app.stack.at(-1)
  if (layer?.handler !== negotiationHandler) {
    // The layer is not where h3 puts it. Leave the stack as it is.
    logger.debug('[markdown] Unexpected h3 stack shape. Accept negotiation runs after static assets.')
    return
  }
  app.stack.pop()
  app.stack.splice(1, 0, layer)
})
