import assert from 'node:assert/strict'

/** Check real cache reuse, not just equivalent content, in either supported Nitro runtime. */
export async function verifyNegotiationCache(origin: string) {
  for (const order of ['html-first', 'markdown-first']) {
    const path = `/cache/${order}`
    const address = new URL(path, origin)
    const html = async (userAgent: string, destination: string) => {
      const response = await fetch(address, {
        headers: { 'Accept': 'text/html', 'User-Agent': userAgent, 'Sec-Fetch-Dest': destination },
        redirect: 'manual',
      })
      const body = await response.text()
      assert.equal(response.status, 200, body)
      assert.match(response.headers.get('content-type') || '', /text\/html/)
      const variation = response.headers.get('vary')?.toLowerCase().split(',').map(value => value.trim()) || []
      assert.ok(variation.includes('accept'))
      assert.ok(!variation.includes('user-agent'))
      assert.ok(!variation.includes('sec-fetch-dest'))
      const token = body.match(/data-render-token="([^"]+)"/)?.[1]
      assert.ok(token, 'The server must render a token before the response can be cached.')
      return token
    }
    const markdown = async () => {
      const response = await fetch(address, {
        headers: { 'Accept': 'text/markdown', 'User-Agent': 'Mozilla/5.0', 'Sec-Fetch-Dest': 'document' },
        redirect: 'manual',
      })
      assert.equal(response.status, 307)
      assert.equal(response.headers.get('location'), `${path}.md`)
      assert.equal(response.headers.get('vary'), 'Accept')
      assert.match(response.headers.get('cache-control') || '', /no-store/)
      const final = await fetch(new URL(response.headers.get('location')!, origin))
      assert.equal(final.status, 200)
      assert.match(final.headers.get('content-type') || '', /text\/markdown/)
      assert.ok(final.headers.get('vary')?.toLowerCase().split(',').map(value => value.trim()).includes('accept'))
      assert.match(await final.text(), /# Cached negotiation/)
    }
    if (order === 'markdown-first')
      await markdown()
    const token = await html('Browser-A', 'document')
    await markdown()
    assert.equal(await html('GPTBot', ''), token, 'User-Agent changes must reuse the same HTML cache entry.')
    assert.equal(await html('Browser-B', 'iframe'), token, 'Fetch destination changes must reuse the same HTML cache entry.')
    await markdown()
  }
}
