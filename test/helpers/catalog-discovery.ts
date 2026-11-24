import assert from 'node:assert/strict'

export async function verifyCatalogDiscovery(origin: string) {
  const response = await fetch(`${origin}/mcp`, {
    headers: { accept: 'text/html' },
  })

  assert.equal(response.status, 200)
  assert.match(await response.text(), /<h1>Connection guide<\/h1>/)
  const link = response.headers.get('link') ?? ''
  assert.match(link, /<https:\/\/nuxt5\.example\.com\/mcp\.md>; rel="alternate"; type="text\/markdown"/)
  assert.match(link, /<https:\/\/nuxt5\.example\.com\/llms\.txt>; rel="describedby"/)
  assert.match(link, /<https:\/\/nuxt5\.example\.com\/\.well-known\/api-catalog>; rel="api-catalog"/)
}
