import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function findDevtoolsRegistration(sourceFile: ts.SourceFile): ts.CallExpression | undefined {
  let found: ts.CallExpression | undefined
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === 'addServerHandler'
      && node.arguments.length > 0
      && node.arguments[0]!.getText(sourceFile).includes('\'/__ai-ready__/debug.json\'')) {
      found = node
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function enclosingIfCondition(node: ts.Node): string | undefined {
  let parent = node.parent
  while (parent) {
    if (ts.isIfStatement(parent))
      return parent.expression.getText()
    parent = parent.parent
  }
  return undefined
}

describe('devtools endpoint guard', () => {
  it('registers the devtools debug endpoint only in dev or debug mode', () => {
    const filename = resolve(import.meta.dirname, '../../src/module.ts')
    const source = readFileSync(filename, 'utf8')
    const sourceFile = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

    const registration = findDevtoolsRegistration(sourceFile)
    expect(registration, 'devtools handler registration').toBeDefined()

    const condition = enclosingIfCondition(registration!)
    expect(condition, 'registration must sit inside a dev-or-debug guard').toBeDefined()
    expect(condition!).toContain('nuxt.options.dev')
    expect(condition!).toContain('config.debug')
  })
})
