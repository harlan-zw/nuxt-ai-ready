// Run from the repository root: node editorial/indexnow/verify-example.mjs
// Executes the article's code. Fetch and Nitro registration are local boundaries.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const article = readFileSync(new URL('../../docs/content/3.advanced/1.indexnow.md', import.meta.url), 'utf8')
function execute(label, globals) {
  const fence = [...article.matchAll(/```ts \[([^\]]+)\]\n([\s\S]*?)\n```/g)].find(match => match[1] === label)
  if (!fence)
    throw new Error(`Missing executable example: ${label}`)
  const js = ts.transpileModule(fence[2], { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
  const context = { exports: {}, ...globals }
  vm.runInNewContext(js, context)
  return context.exports
}
async function main() {
  const requests = []
  let failure
  const { submitIndexNow } = execute('server/utils/indexnow.ts', {
    URL,
    $fetch: async (url, options) => {
      if (failure)
        throw failure
      requests.push(JSON.parse(JSON.stringify({ url, ...options })))
    },
  })
  const config = { key: 'a'.repeat(32), siteUrl: 'https://example.com' }
  let indexed
  execute('server/plugins/indexnow.ts', {
    defineNitroPlugin: setup => setup({ hooks: { hook: (name, handler) => { indexed = handler } } }),
    useRuntimeConfig: () => ({ indexNowKey: config.key, indexNowSiteUrl: config.siteUrl }),
    submitIndexNow,
  })
  await indexed({ route: '/unchanged', contentChanged: false, isUpdate: true })
  assert.deepEqual(requests, [], 'Unchanged indexed content must not submit')
  for (const isUpdate of [false, true]) {
    requests.length = 0
    await indexed({ route: '/changed', contentChanged: true, isUpdate })
    assert.deepEqual(requests[0].body.urlList, ['https://example.com/changed'])
    assert.equal(requests.length, 1)
  }
  requests.length = 0
  await submitIndexNow([], config)
  assert.deepEqual(requests, [])
  await submitIndexNow(['/changed#part', '/changed', '/deleted'], config)
  assert.deepEqual(requests, [{
    url: 'https://api.indexnow.org/indexnow',
    method: 'POST',
    body: {
      host: 'example.com',
      key: config.key,
      keyLocation: 'https://example.com/indexnow-key.txt',
      urlList: ['https://example.com/changed', 'https://example.com/deleted'],
    },
  }])
  requests.length = 0
  await assert.rejects(submitIndexNow(['https://other.example/page'], config), /must use/)
  await assert.rejects(submitIndexNow(['/page'], { ...config, key: '' }), /not configured/)
  await assert.rejects(submitIndexNow(Array.from({ length: 10_001 }, (_, i) => `/page-${i}`), config), /at most/)
  assert.deepEqual(requests, [])
  failure = new Error('Simulated upstream failure')
  await assert.rejects(indexed({ route: '/changed', contentChanged: true }), error => error === failure)
  let header
  const { default: keyHandler } = execute('server/routes/indexnow-key.txt.get.ts', {
    defineEventHandler: handler => handler,
    useRuntimeConfig: () => ({ indexNowKey: config.key }),
    setResponseHeader: (_event, name, value) => { header = [name, value] },
    createError: details => Object.assign(new Error(details.statusMessage), details),
  })
  assert.equal(keyHandler({}), config.key)
  assert.deepEqual(header, ['Content-Type', 'text/plain; charset=utf-8'])
  console.warn('PASS: unchanged skip; new and updated submit; payload; deduplication; empty input; guards; errors; key route.')
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
