/* eslint-disable harlanzw/no-test-file-reads -- The static vs dynamic import split is a source graph property no exported API can observe. */
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { installModule } from '@nuxt/kit'
import { loadNuxt } from 'nuxt'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import module from '../../src/module.ts'

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
    const firstArgument = ts.isCallExpression(node)
      ? node.arguments[0]
      : undefined
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

vi.mock('../../src/prerender.ts', () => {
  throw new Error('Prerender code loaded without any prerendered routes.')
})
vi.mock('../../src/utils/agent-skills.ts', () => {
  throw new Error('Agent Skills code loaded with Agent Skills disabled.')
})
vi.mock('nuxtseo-shared/devtools', () => {
  throw new Error('DevTools code loaded for a production build.')
})

describe('lazy imports', () => {
  it('installs with optional build features disabled without loading their dependencies', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'ai-ready-lazy-imports-'))
    const nuxt = await loadNuxt({
      cwd: rootDir,
      ready: false,
      dev: false,
      overrides: { modules: [] },
    })
    const agentSkills = vi.fn()
    nuxt.hook('ai-ready:agent-skills', agentSkills)
    try {
      await installModule(module, { database: false, agentSkills: false }, nuxt)
      expect(agentSkills).not.toHaveBeenCalled()
    }
    finally {
      await nuxt.close()
      await rm(rootDir, { recursive: true, force: true })
    }
  })

  it('loads database cleanup code only after a database was used', () => {
    const imports = importSpecifiers('../../src/runtime/server/plugins/db-lifecycle.ts')

    expect(imports.static).not.toContain('../db')
    expect(imports.dynamic).toContain('../db')
  })
})
