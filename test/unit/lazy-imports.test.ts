import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function importSpecifiers(path: string): { dynamic: string[], static: string[] } {
  const filename = resolve(import.meta.dirname, path)
  const sourceFile = ts.createSourceFile(
    filename,
    readFileSync(filename, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const dynamic: string[] = []
  const staticImports: string[] = []

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)
      && !node.importClause?.isTypeOnly
      && ts.isStringLiteral(node.moduleSpecifier)) {
      staticImports.push(node.moduleSpecifier.text)
    }
    const firstArgument = ts.isCallExpression(node) ? node.arguments[0] : undefined
    if (ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && firstArgument
      && ts.isStringLiteral(firstArgument)) {
      dynamic.push(firstArgument.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)

  return { dynamic, static: staticImports }
}

describe('lazy imports', () => {
  it('loads optional build features only when enabled', () => {
    const imports = importSpecifiers('../../src/module.ts')

    expect(imports.static).not.toContain('./prerender')
    expect(imports.static).not.toContain('./utils/agent-skills')
    expect(imports.static).not.toContain('nuxtseo-shared/devtools')
    expect(imports.dynamic).toEqual(expect.arrayContaining([
      './prerender',
      './utils/agent-skills',
      'nuxtseo-shared/devtools',
    ]))
  })

  it('keeps conversion and database code off the ordinary request path', () => {
    const imports = importSpecifiers('../../src/runtime/server/middleware/markdown.ts')

    expect(imports.static).not.toContain('../utils')
    expect(imports.static).not.toContain('../db/queries')
    expect(imports.static).not.toContain('../utils/content')
    expect(imports.static).not.toContain('../utils/fetch')
    expect(imports.dynamic).toEqual(expect.arrayContaining([
      '../utils',
      '../db/queries',
      '../utils/content',
      '../utils/fetch',
    ]))
  })

  it('loads database cleanup code only after a database was used', () => {
    const imports = importSpecifiers('../../src/runtime/server/plugins/db-lifecycle.ts')

    expect(imports.static).not.toContain('../db')
    expect(imports.dynamic).toContain('../db')
  })
})
