import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { htmlToMarkdown } from 'mdream'
import ts from 'typescript'
import { joinURL } from 'ufo'

const root = fileURLToPath(new URL('../..', import.meta.url))
const parent = '3a01b0fcac5944641cfd2a0ac3e5688d9d820078'
const files = [
  '2.guides/3.mcp.md',
  '2.guides/4.runtime-indexing.md',
  '2.guides/5.cloudflare.md',
  '2.guides/7.cli.md',
  '3.advanced/0.rag-example.md',
  '3.api/1.nuxt-hooks.md',
  '3.api/5.config.md',
  '3.nitro-api/1.composables.md',
  '3.nitro-api/2.nitro-hooks.md',
  '4.releases/1.v1.md',
]
const read = path => readFileSync(`${root}/${path}`, 'utf8')
const blocks = markdown => [...markdown.matchAll(/^```(\w+)(?:[ \t][^\n]*)?\n([\s\S]*?)^```/gm)]
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor
function compile(code) {
  const source = code.trim().startsWith('aiReady:') ? `export default defineNuxtConfig({ ${code} })` : code
  const result = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    reportDiagnostics: true,
  })
  const errors = result.diagnostics.filter(item => item.category === ts.DiagnosticCategory.Error)
  assert.equal(errors.length, 0, errors.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n')).join('\n'))
  const runnable = result.outputText.replace(/^import[\s\S]*?from ['"][^'"]+['"];?\n/gm, '')
    .replace(/^export default /gm, '')
    .replace(/^export /gm, '')
  return { runnable, run: new AsyncFunction(runnable) }
}
let count = 0
for (const file of files) {
  for (const [, language, code] of blocks(read(`docs/content/${file}`))) {
    if (language === 'json')
      JSON.parse(code)
    if (language !== 'ts' && language !== 'js')
      continue
    compile(code)
    count++
  }
}

const oldHooks = execFileSync('git', ['show', `${parent}:docs/content/3.nitro-api/2.nitro-hooks.md`], { cwd: root, encoding: 'utf8' })
const oldManual = blocks(oldHooks).find(([, , code]) => code.includes('fetchHtmlSomehow'))[2]
assert.throws(() => compile(oldManual), SyntaxError)

const rag = read('docs/content/3.advanced/0.rag-example.md')
const parserSource = blocks(rag).find(([, , code]) => code.includes('export function parseLlmsFullTxt'))[2]
const parserOnly = parserSource.slice(0, parserSource.indexOf('\nconst llmsFullUrl ='))
const parse = runInNewContext(`${compile(parserOnly).runnable}; parseLlmsFullTxt`, { URL })
const formatterSource = read('src/runtime/server/utils/llms-full.ts')
const formatterOnly = formatterSource.slice(formatterSource.indexOf('const RE_FRONTMATTER'), formatterSource.indexOf('export interface SiteInfo'))
const format = runInNewContext(`${compile(formatterOnly).runnable}; formatPageForLlmsFullTxt`, { joinURL })
const origin = 'https://example.com'
const exportUrl = `${origin}/llms-full.txt`
const fixture = `# Example\n\n${
  format('/about', 'About', '', '---\ntitle: About\n---\n\n# About\n\n## Team\n\nPeople.', origin)
}${format('/help', 'Help', 'Support', '# Help\n\nContact us.', origin)}`
const parsed = parse(fixture, exportUrl)
assert.equal(parsed.length, 2)
assert.equal(parsed[0].source, `${origin}/about`)
assert.equal(parsed[0].description, '')
assert.equal(parsed[0].markdown, '# About\n\n## Team\n\nPeople.')
assert.deepEqual(parse(fixture.replace(/\n/g, '\r\n'), exportUrl), parsed)
assert.throws(() => parse('# Example\n\n---\n\n- **Page:** About\n\n# About', exportUrl), /Source metadata/)
assert.throws(() => parse('# Example\n\n---\n\n- **Page:** About\n- **Source:** javascript:alert(1)\n\n# About', exportUrl), /HTTP/)
assert.equal(parse('# Example\n\n', exportUrl).length, 0)

const oldRag = execFileSync('git', ['show', `${parent}:docs/content/3.advanced/0.rag-example.md`], { cwd: root, encoding: 'utf8' })
let oldParser = blocks(oldRag)[0][2]
oldParser = oldParser.replace(/const llmsFullUrl =[\s\S]*?const content = await response.text\(\)/, '')
const oldParse = runInNewContext(`(content, llmsFullUrl) => { ${compile(oldParser).runnable}; return pages }`, { URL })
const malformed = '# Example\n\n---\n\n- **Page:** About\n\n# About'
assert.equal(oldParse(malformed, exportUrl)[0].source, `${origin}/undefined`)

const hooks = blocks(read('docs/content/3.nitro-api/2.nitro-hooks.md'))
const indexed = hooks.find(([, , code]) => code.includes('hook(\'ai-ready:page:indexed\''))[2]
const registrations = new Map()
const messages = []
const plugin = runInNewContext(compile(indexed).runnable, {
  defineNitroPlugin: value => value,
  console: { info: message => messages.push(message) },
})
plugin({ hooks: { hook: (name, callback) => registrations.set(name, callback) } })
const callback = registrations.get('ai-ready:page:indexed')
callback({ route: '/unchanged', contentChanged: false })
callback({ route: '/changed', contentChanged: true })
assert.deepEqual(messages, ['Changed page: /changed'])
process.stdout.write(`${count} JavaScript/TypeScript fences compile; JSON fences parse.\n`)
process.stdout.write('Base duplicate declaration fails; revised snippets compile.\n')
process.stdout.write('Base missing-source parser invents /undefined; revised parser rejects it.\n')
process.stdout.write('Current formatter replay and changed-content hook checks pass. No external API calls.\n')

const conversionExample = hooks.find(([, , code]) => code.includes('hook(\'ai-ready:mdreamConfig\''))[2]
const conversionHooks = new Map()
const conversionPlugin = runInNewContext(compile(conversionExample).runnable, { defineNitroPlugin: value => value })
conversionPlugin({ hooks: { hook: (name, callback) => conversionHooks.set(name, callback) } })
const configureConversion = conversionHooks.get('ai-ready:mdreamConfig')
const html = '<main><h1>Article</h1><p>Keep this paragraph.</p><div class="author-bio">Biography</div><div class="existing-exclude">Existing exclusion</div></main>'
for (const initialOptions of [{}, { filter: { exclude: ['.existing-exclude'] } }]) {
  const options = structuredClone(initialOptions)
  configureConversion(options)
  const markdown = htmlToMarkdown(html, options)
  assert.match(markdown, /Keep this paragraph/)
  assert.doesNotMatch(markdown, /Biography/)
  if (initialOptions.filter)
    assert.doesNotMatch(markdown, /Existing exclusion/)
}
process.stdout.write('Extracted mdream hook filters real HTML and preserves existing exclusions.\n')
