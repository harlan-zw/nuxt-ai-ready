export const AI_CATALOG_MEDIA_TYPE = 'application/ai-catalog+json'
export const MCP_SERVER_CARD_MEDIA_TYPE = 'application/mcp-server-card+json'

export interface AiCatalog {
  specVersion: '1.0'
  entries: Array<{
    identifier: string
    type: typeof MCP_SERVER_CARD_MEDIA_TYPE
    url: string
  }>
}

export function matchesDiscoveryEtag(requestHeader: string | undefined, etag: string): boolean {
  if (!requestHeader)
    return false

  return requestHeader.split(',').some((candidate) => {
    const normalized = candidate.trim().replace(/^W\//, '')
    return normalized === '*' || normalized === etag
  })
}
