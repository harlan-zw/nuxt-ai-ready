import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { htmlToMarkdown } from 'mdream'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const files = [
  '1.getting-started/0.introduction.md',
  '1.getting-started/1.installation.md',
  ...['0.content-signals', '1.markdown', '2.llms-txt', '10.api-catalog', '11.agent-skills', '8.i18n', '9.webmcp'].map(name => `2.guides/${name}.md`),
]
const revision = process.argv[2]
function read(file) {
  return revision
    ? execFileSync('git', ['show', `${revision}:docs/content/${file}`], { cwd: root, encoding: 'utf8' })
    : readFileSync(resolve(root, 'docs/content', file), 'utf8')
}
function snippets(file) {
  return [...read(file).matchAll(/^```(\w+)(?: \[([^\]]+)\])?\n([\s\S]*?)^```/gm)]
    .map(([, language, label, code]) => ({ language, label, code }))
}
function execute(code, globals = {}) {
  const exports = {}
  const compiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } })
  vm.runInNewContext(compiled.outputText, { exports, ...globals })
  return exports
}
function loadSource(path) {
  const absolute = resolve(root, path)
  const nativeRequire = createRequire(absolute)
  return execute(readFileSync(absolute, 'utf8'), {
    URL,
    Buffer,
    require: (id) => {
      // Match the module's virtual export when i18n is configured.
      if (id === '#ai-ready-virtual/i18n-runtime.mjs')
        return nativeRequire('nuxtseo-shared/i18n-runtime')
      if (!id.startsWith('.'))
        return nativeRequire(id)
      const source = resolve(dirname(absolute), `${id}.ts`)
      return existsSync(source) ? loadSource(source) : nativeRequire(id)
    },
  })
}
function configs(file, globals = {}) {
  return snippets(file).filter(s => s.language === 'ts' && s.code.includes('defineNuxtConfig(')).map(s => execute(s.code, { defineNuxtConfig: value => value, ...globals }).default)
}
function getHook(file, name, label) {
  let hook
  const source = snippets(file).find(s => s.label === label)
  execute(source.code, {
    defineNitroPlugin: setup => setup({ hooks: { hook: (registered, handler) => {
      if (registered === name)
        hook = handler
    } } }),
  })
  return hook
}
async function main() {
  let parsed = 0
  for (const file of files) {
    for (const snippet of snippets(file)) {
      if (snippet.language === 'json')
        JSON.parse(snippet.code)
      if (!['ts', 'vue'].includes(snippet.language))
        continue
      const code = snippet.language === 'vue' ? snippet.code.match(/<script[^>]*>([\s\S]*?)<\/script>/)?.[1] : snippet.code
      if (!code)
        continue
      const source = ts.createSourceFile(snippet.label || file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
      assert.equal(source.parseDiagnostics.length, 0, `${file}: invalid TypeScript example`)
      parsed++
    }
  }
  for (const [file, label, selector] of [
    ['1.markdown', 'server/plugins/mdream-config.ts', 'author-bio'],
    ['2.llms-txt', 'server/plugins/mdream.ts', 'sidebar'],
  ]) {
    const options = { minimal: true }
    getHook(`2.guides/${file}.md`, 'ai-ready:mdreamConfig', label)(options)
    const output = htmlToMarkdown(`<main><h1>Article</h1><p>Keep this.</p><div class="${selector}">Remove this.</div></main>`, options)
    assert.match(output, /Keep this/)
    assert.doesNotMatch(output, /Remove this/)
  }
  const { resolveApiCatalogConfig } = loadSource('src/utils/api-catalog.ts')
  const catalog = configs('2.guides/10.api-catalog.md')[0]
  const result = resolveApiCatalogConfig(catalog.aiReady.apiCatalog, { siteBaseURL: 'https://example.com/docs/' })
  assert.equal(result._tag, 'Enabled')
  assert.equal(result.config.document.linkset[0].anchor, 'https://example.com/docs/api/v1')
  assert.equal(result.config.document.linkset[0]['service-desc'][0].href, 'https://example.com/docs/openapi.json')
  const { resolveAgentSkillsConfig } = loadSource('src/utils/agent-skills.ts')
  const scratchParent = resolve(homedir(), 'scratch')
  mkdirSync(scratchParent, { recursive: true })
  const scratch = mkdtempSync(`${scratchParent}/fundamentals-example-`)
  try {
    const skill = snippets('2.guides/11.agent-skills.md').find(s => s.label === 'skills/seo-audit/SKILL.md').code
    const skillPath = resolve(scratch, 'skills/seo-audit/SKILL.md')
    mkdirSync(dirname(skillPath), { recursive: true })
    writeFileSync(skillPath, skill)
    const digest = createHash('sha256').update(skill).digest('hex')
    const examples = configs('2.guides/11.agent-skills.md', { process: { env: { SEO_TOOLKIT_SHA256: digest } } })
    const local = examples.find(config => config.aiReady.agentSkills?.skills?.[0]?.source === 'local')
    const skillResult = await resolveAgentSkillsConfig(local.aiReady.agentSkills, scratch)
    assert.equal(skillResult._tag, 'Enabled')
    assert.equal(skillResult.index.skills[0].digest, `sha256:${digest}`)
    assert.equal(skillResult.localArtifacts['/.well-known/agent-skills/seo-audit/SKILL.md'], skill)
    let filter
    const hook = snippets('2.guides/11.agent-skills.md').find(s => s.label === 'modules/skills.ts')
    execute(hook.code, {
      defineNuxtModule: definition => definition.setup({}, {
        hook: (_name, handler) => {
          filter = handler
        },
      }),
    })
    const payload = { skills: [{ name: 'internal-audit' }, { name: 'seo-audit' }] }
    filter(payload)
    assert.deepEqual(payload.skills, [{ name: 'seo-audit' }])
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }
  const webmcp = snippets('2.guides/9.webmcp.md').find(s => s.language === 'vue')
  let tool
  execute(webmcp.code.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1], {
    ref: value => ({ value }),
    useWebMcpTool: (definition) => {
      tool = definition
      return { state: { value: { _tag: 'Registered' } } }
    },
    watchEffect: run => run(),
  })
  assert.equal(tool.execute({ maxPrice: 25 }), 'Showing products under $25.')
  const { buildLinkHeader } = loadSource('src/runtime/server/utils/link-header.ts')
  const header = buildLinkHeader('/fr/about', 'markdown', {
    i18n: {
      defaultLocale: 'en',
      strategy: 'prefix_except_default',
      locales: [{ code: 'en', hreflang: 'en' }, { code: 'fr', hreflang: 'fr-FR' }],
    },
  }, path => `https://acme.example${path}`)
  assert.match(header, /<https:\/\/acme\.example\/about\.md>; rel="alternate"; hreflang="en"/)
  assert.match(header, /<https:\/\/acme\.example\/fr\/about>; rel="canonical"/)
  const proseConfig = configs('2.guides/2.llms-txt.md')[0].aiReady.llmsTxt
  const { normalizeLlmsTxtConfig } = loadSource('src/runtime/llms-txt-format.ts')
  assert.match(normalizeLlmsTxtConfig(proseConfig), /\[REST API\]\(\/docs\/api\): API documentation/)
  console.warn(`PASS: ${parsed} TypeScript examples parsed; Markdown filters, catalog URLs, skill bytes/digest/filter, WebMCP handler, i18n links, llms.txt formatting.`)
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
