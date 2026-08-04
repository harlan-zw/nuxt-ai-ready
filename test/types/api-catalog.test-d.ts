import type { ApiCatalogConfig, ApiCatalogEntry, ApiCatalogLinkTarget } from 'nuxt-ai-ready'
import { expectTypeOf } from 'vitest'

const target = {
  href: '/openapi.json',
  type: 'application/vnd.oai.openapi+json',
} satisfies ApiCatalogLinkTarget

const entry = {
  anchor: '/api',
  serviceDesc: target,
  serviceDoc: [{ href: '/docs/api' }],
} satisfies ApiCatalogEntry

const config = { entries: [entry] } satisfies ApiCatalogConfig

expectTypeOf(config).toMatchTypeOf<ApiCatalogConfig>()
