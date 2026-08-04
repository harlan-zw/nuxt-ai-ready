import type { AiCatalog } from '../runtime/server/utils/discovery-response'
import { createHash } from 'node:crypto'
import {
  matchesDiscoveryEtag,
  MCP_SERVER_CARD_MEDIA_TYPE,
} from '../runtime/server/utils/discovery-response'

export const AI_CATALOG_PATH = '/.well-known/ai-catalog.json'
export { AI_CATALOG_MEDIA_TYPE } from '../runtime/server/utils/discovery-response'
export type { AiCatalog }

export function resolveAiCatalog(input: {
  siteUrl: string
  serverCardName: string
  serverCardUrl: string
}): AiCatalog {
  const hostname = new URL(input.siteUrl).hostname
  const serverName = input.serverCardName.split('/').at(-1)!

  return {
    specVersion: '1.0',
    entries: [{
      identifier: `urn:air:${hostname}:mcp:${serverName}`,
      type: MCP_SERVER_CARD_MEDIA_TYPE,
      url: input.serverCardUrl,
    }],
  }
}

export function createAiCatalogEtag(catalog: AiCatalog): string {
  return `"${createHash('sha256').update(JSON.stringify(catalog)).digest('hex')}"`
}

export function matchesAiCatalogEtag(requestHeader: string | undefined, etag: string): boolean {
  return matchesDiscoveryEtag(requestHeader, etag)
}
