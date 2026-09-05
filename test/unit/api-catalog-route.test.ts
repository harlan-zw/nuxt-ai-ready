import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createApp, toWebHandler } from 'h3'
import ts from 'typescript'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const config: {
  apiCatalog?: { href: string, mediaType: string, document: { linkset: Array<Record<string, unknown>> } }
} = {}

vi.mock('#nuxtseo/nitro', () => ({
  useRuntimeConfig: () => ({ 'nuxt-ai-ready': config }),
}))

const { default: apiCatalogHandler } = await import('../../src/runtime/server/routes/api-catalog')

const app = createApp()
app.use(apiCatalogHandler)
const request = toWebHandler(app)

function catalogConfig() {
  return {
    href: 'https://example.com/.well-known/api-catalog',
    mediaType: 'application/linkset+json',
    document: { linkset: [{ anchor: 'https://example.com/' }] },
  }
}

async function call(method: string) {
  const response = await request(new Request('http://localhost/.well-known/api-catalog', { method }))
  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
  }
}

describe('gET /.well-known/api-catalog route', () => {
  beforeEach(() => {
    config.apiCatalog = catalogConfig()
  })

  it('answers OPTIONS with 204 and CORS headers', async () => {
    const { status, body, headers } = await call('OPTIONS')

    expect(status).toBe(204)
    expect(body).toBe('')
    expect(headers.get('access-control-allow-origin')).toBe('*')
    expect(headers.get('access-control-allow-methods')).toBe('GET, HEAD')
    expect(headers.get('access-control-allow-headers')).toBe('Content-Type, If-None-Match')
  })

  it('serves the catalog document with its media type and link header', async () => {
    const { status, body, headers } = await call('GET')

    expect(status).toBe(200)
    expect(JSON.parse(body)).toEqual(catalogConfig().document)
    expect(headers.get('content-type')).toBe(catalogConfig().mediaType)
    expect(headers.get('link')).toBe(`<${catalogConfig().href}>; rel="api-catalog"`)
  })

  it('answers 404 when the runtime config is missing', async () => {
    config.apiCatalog = undefined

    const { status } = await call('GET')

    expect(status).toBe(404)
  })

  it('answers OPTIONS with CORS headers even when the runtime config is missing', async () => {
    config.apiCatalog = undefined

    const { status, headers } = await call('OPTIONS')

    expect(status).toBe(204)
    expect(headers.get('access-control-allow-origin')).toBe('*')
  })

  it('rejects unsupported methods with 405', async () => {
    const { status } = await call('POST')

    expect(status).toBe(405)
  })
})

describe('api-catalog registration gate', () => {
  function moduleSourceFile() {
    const filename = resolve(import.meta.dirname, '../../src/module.ts')
    const source = readFileSync(filename, 'utf8')
    return ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  }

  it('registers the handler only through the config-gated registerApiCatalog', () => {
    const sourceFile = moduleSourceFile()

    let registration: ts.CallExpression | undefined
    const registerCalls: ts.CallExpression[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        if (node.expression.text === 'addServerHandler'
          && node.arguments.length > 0
          && node.arguments[0]!.getText(sourceFile).includes('API_CATALOG_PATH')) {
          registration = node
        }
        if (node.expression.text === 'registerApiCatalog')
          registerCalls.push(node)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    expect(registration, 'api-catalog handler registration').toBeDefined()
    expect(registerCalls.length).toBeGreaterThanOrEqual(2)

    let parent = registration!.parent
    let insideRegisterApiCatalog = false
    while (parent) {
      if (ts.isFunctionDeclaration(parent) || ts.isVariableDeclaration(parent)) {
        const name = parent.name?.getText(sourceFile)
        if (name === 'registerApiCatalog')
          insideRegisterApiCatalog = true
      }
      parent = parent.parent
    }
    expect(insideRegisterApiCatalog, 'registration must sit inside registerApiCatalog').toBe(true)

    for (const call of registerCalls) {
      let node: ts.Node | undefined = call.parent
      let condition: string | undefined
      while (node) {
        if (ts.isIfStatement(node)) {
          condition = node.expression.getText(sourceFile)
          break
        }
        node = node.parent
      }
      expect(condition, 'registerApiCatalog call must sit inside a config guard').toBeDefined()
      expect(
        condition!.includes('apiCatalogConfig') || (condition!.includes('generatedApiCatalog') && condition!.includes('\'Enabled\'')),
        `guard must check the catalog config, got: ${condition}`,
      ).toBe(true)
    }
  })
})
