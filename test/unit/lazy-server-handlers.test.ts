import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function property(object: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
  return object.properties.find((candidate): candidate is ts.PropertyAssignment =>
    ts.isPropertyAssignment(candidate)
    && ((ts.isIdentifier(candidate.name) && candidate.name.text === name)
      || (ts.isStringLiteral(candidate.name) && candidate.name.text === name)),
  )
}

function isWithinPrerenderGuard(node: ts.Node): boolean {
  let parent = node.parent
  while (parent) {
    if (ts.isIfStatement(parent) && parent.expression.getText() === 'prerenderEnabled')
      return true
    parent = parent.parent
  }
  return false
}

describe('server handler registration', () => {
  it('lazies route handlers while preserving eager middleware registration', () => {
    const filename = resolve(import.meta.dirname, '../../src/module.ts')
    const source = readFileSync(filename, 'utf8')
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const routeCalls: ts.ObjectLiteralExpression[] = []
    const middlewareCalls: ts.ObjectLiteralExpression[] = []

    const visit = (node: ts.Node): void => {
      const firstArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === 'addServerHandler'
        && firstArgument
        && ts.isObjectLiteralExpression(firstArgument)) {
        const handler = firstArgument
        if (property(handler, 'route'))
          routeCalls.push(handler)
        if (property(handler, 'middleware'))
          middlewareCalls.push(handler)
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    expect(routeCalls.length).toBeGreaterThan(0)
    expect(middlewareCalls).toHaveLength(2)
    for (const handler of routeCalls)
      expect(property(handler, 'lazy')?.initializer.kind).toBe(ts.SyntaxKind.TrueKeyword)
    for (const handler of middlewareCalls)
      expect(property(handler, 'lazy')).toBeUndefined()
  })

  it('only contributes prerender entries when prerendering is enabled', () => {
    const filename = resolve(import.meta.dirname, '../../src/module.ts')
    const source = readFileSync(filename, 'utf8')
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const entryPaths = [
      './runtime/server/plugins/html-capture.prerender',
      './runtime/server/middleware/markdown.prerender',
      './runtime/app/plugins/md-hints.prerender',
    ]

    for (const entryPath of entryPaths) {
      const nodes: ts.Node[] = []
      const collect = (node: ts.Node): void => {
        nodes.push(node)
        ts.forEachChild(node, collect)
      }
      collect(sourceFile)
      const registration = nodes
        .find(node => ts.isCallExpression(node)
          && ts.isIdentifier(node.expression)
          && ['addPlugin', 'addServerHandler', 'addServerPlugin'].includes(node.expression.text)
          && node.getText(sourceFile).includes(entryPath))

      expect(registration, entryPath).toBeDefined()
      expect(isWithinPrerenderGuard(registration!), entryPath).toBe(true)
    }
  })

  it('treats link crawling as prerendering', () => {
    const filename = resolve(import.meta.dirname, '../../src/module.ts')
    const source = readFileSync(filename, 'utf8')
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    let initializer: ts.Expression | undefined

    const visit = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node)
        && ts.isIdentifier(node.name)
        && node.name.text === 'hasPrerenderedRoutes') {
        initializer = node.initializer
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)

    expect(initializer?.getText(sourceFile)).toContain('nuxt.options.nitro.prerender?.crawlLinks')
  })

  it('auto-imports public server composables without a global Nitro scan directory', () => {
    const filename = resolve(import.meta.dirname, '../../src/module.ts')
    const source = readFileSync(filename, 'utf8')

    expect(source).not.toContain('.scanDirs')
    expect(source).toContain('addServerImports([')
    for (const name of [
      'countPages',
      'indexPage',
      'indexPageByRoute',
      'queryPages',
      'searchPages',
      'streamPages',
    ]) {
      expect(source).toContain(`'${name}'`)
    }
  })
})
