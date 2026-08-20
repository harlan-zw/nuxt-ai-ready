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

interface H3CoreLike {
  '~middleware': unknown[]
  '~dispatch'?: unknown
  '~composed'?: unknown
}

type H3Runtime
  = | { _tag: 'h3-v1', app: H3AppLike }
    | { _tag: 'h3-v2', app: H3CoreLike }
    | { _tag: 'unsupported' }

function isH3App(candidate: unknown): candidate is H3AppLike {
  if (!candidate || typeof candidate !== 'object')
    return false
  const app = candidate as Partial<H3AppLike>
  return Array.isArray(app.stack) && typeof app.use === 'function'
}

function isH3Core(candidate: unknown): candidate is H3CoreLike {
  return !!candidate
    && typeof candidate === 'object'
    && Array.isArray((candidate as Partial<H3CoreLike>)['~middleware'])
}

function resolveH3Runtime(candidate: unknown): H3Runtime {
  if (!candidate || typeof candidate !== 'object')
    return { _tag: 'unsupported' }

  const nitro = candidate as { h3App?: unknown, h3?: unknown }
  if (isH3App(nitro.h3App))
    return { _tag: 'h3-v1', app: nitro.h3App }
  if (isH3Core(nitro.h3))
    return { _tag: 'h3-v2', app: nitro.h3 }
  return { _tag: 'unsupported' }
}

const negotiationHandler = defineEventHandler(event => applyNegotiation(event, decideNegotiation(event, 'early')))

/**
 * Run Accept negotiation in front of the Nitro static asset handler.
 *
 * Nitro unshifts that handler ahead of every server middleware when
 * `serveStatic` is on, which is the default for the node-server preset. A
 * prerendered route is then answered before the Markdown middleware runs, so
 * negotiation never happens. See issue #82.
 *
 * H3 1 uses stack position 1, after Nitro's route-rules layer. H3 2 prepends
 * the global middleware list. Its dispatcher adds route-rule middleware first.
 */
export default defineNitroPlugin((nitro) => {
  const runtime = resolveH3Runtime(nitro)
  if (runtime._tag === 'unsupported') {
    logger.debug('[markdown] No h3 stack found. Accept negotiation stays in the middleware.')
    return
  }

  if (runtime._tag === 'h3-v2') {
    // Nitro 3 exposes H3 2's global middleware list after static assets are
    // registered. Route-rule middleware stays ahead through ~getMiddleware.
    runtime.app['~middleware'].unshift(negotiationHandler)
    runtime.app['~dispatch'] = undefined
    runtime.app['~composed'] = undefined
    return
  }

  const app = runtime.app
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
