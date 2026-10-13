export type AuditCapability = 'llms' | 'api-catalog' | 'ai-catalog' | 'mcp' | 'skills'

export interface AuditOptions {
  url: string
  base: string
  capabilities: AuditCapability[]
}

export interface AuditCheck {
  id: string
  status: 'pass' | 'warn' | 'fail' | 'skip'
  detail: string
  url?: string
}

export interface AuditReport {
  schemaVersion: 1
  url: string
  checks: AuditCheck[]
}

interface AuditDependencies {
  fetch: typeof fetch
  timeoutMs?: number
  maxBytes?: number
}

type Result<T> = { _tag: 'Ok', value: T } | { _tag: 'Err', message: string }
interface Document {
  url: string
  status: number
  headers: Headers
  body: string
}

const capabilities: AuditCapability[] = ['llms', 'api-catalog', 'ai-catalog', 'mcp', 'skills']

function publicUrl(input: string, base?: string): Result<URL> {
  if (!URL.canParse(input, base))
    return { _tag: 'Err', message: 'Use an absolute HTTP or HTTPS URL.' }
  const url = new URL(input, base)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    return { _tag: 'Err', message: 'Use an HTTP or HTTPS URL without credentials.' }
  url.hash = ''
  return { _tag: 'Ok', value: url }
}

export function parseAuditOptions(input: { url: string, base?: string, capabilities?: string }): Result<AuditOptions> {
  const url = publicUrl(input.url)
  if (url._tag === 'Err')
    return url
  const base = input.base || '/'
  if (!base.startsWith('/') || base.startsWith('//') || /[?#\\]/.test(base))
    return { _tag: 'Err', message: 'Use an application base path such as /docs/.' }
  const selected = [...new Set((input.capabilities || '').split(',').map(value => value.trim()).filter(Boolean))]
  const unknown = selected.filter(value => !capabilities.includes(value as AuditCapability))
  if (unknown.length)
    return { _tag: 'Err', message: `Unknown capabilities: ${unknown.join(', ')}. Use ${capabilities.join(', ')}.` }
  return { _tag: 'Ok', value: { url: url.value.href, base: `${new URL(base, url.value).pathname.replace(/\/+$/, '')}/`, capabilities: selected as AuditCapability[] } }
}

async function readDocument(url: string, accept: string, dependencies: AuditDependencies): Promise<Result<Document>> {
  const maxBytes = dependencies.maxBytes ?? 2 * 1024 * 1024
  const signal = AbortSignal.timeout(dependencies.timeoutMs ?? 10000)
  return Promise.resolve().then(async (): Promise<Result<Document>> => {
    let current = url
    for (let redirects = 0; redirects <= 5; redirects++) {
      const response = await dependencies.fetch(current, { headers: { accept }, redirect: 'manual', signal })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        await response.body?.cancel()
        const location = response.headers.get('location')
        const next = location ? publicUrl(location, current) : { _tag: 'Err' as const, message: 'Redirect has no Location header.' }
        if (next._tag === 'Err')
          return next
        current = next.value.href
        continue
      }
      if (Number(response.headers.get('content-length')) > maxBytes) {
        await response.body?.cancel()
        return { _tag: 'Err', message: `Response exceeds the ${maxBytes} byte limit.` }
      }
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let body = ''
      let bytes = 0
      if (reader) {
        while (true) {
          const chunk = await reader.read()
          if (chunk.done)
            break
          bytes += chunk.value.byteLength
          if (bytes > maxBytes) {
            await reader.cancel()
            return { _tag: 'Err', message: `Response exceeds the ${maxBytes} byte limit.` }
          }
          body += decoder.decode(chunk.value, { stream: true })
        }
        body += decoder.decode()
      }
      return { _tag: 'Ok', value: { url: current, status: response.status, headers: response.headers, body } }
    }
    return { _tag: 'Err', message: 'Response exceeds the five redirect limit.' }
  }).catch((error: unknown) => ({ _tag: 'Err', message: `Request failed: ${error instanceof Error ? error.message : String(error)}` }))
}

function responseFailure(document: Result<Document>): string | undefined {
  if (document._tag === 'Err')
    return document.message
  if (document.value.headers.get('cf-mitigated') === 'challenge')
    return 'Cloudflare returned a challenge. Check crawler access rules.'
  if (document.value.status < 200 || document.value.status >= 300)
    return `HTTP ${document.value.status}. Check this public URL.`
}

function isHtml(body: string): boolean {
  return /^\s*(?:<!doctype html|<html|<head|<body)/i.test(body)
}

function contentCheck(id: string, url: string, document: Result<Document>, accepts: (document: Document) => boolean, success: string, failure: string): AuditCheck {
  const error = responseFailure(document)
  if (error)
    return { id, url, status: 'fail', detail: error }
  return document._tag === 'Ok' && accepts(document.value)
    ? { id, url: document.value.url, status: 'pass', detail: success }
    : { id, url, status: 'fail', detail: failure }
}

function markdown(document: Document): boolean {
  return /^text\/markdown(?:;|$)/i.test(document.headers.get('content-type') || '')
    && !!document.body.trim() && !isHtml(document.body)
}

function links(header: string | null): { href: string, rel: string[], type: string }[] {
  const source = header || ''
  const entries: string[] = []
  let quoted = false
  let target = false
  let start = 0
  for (let i = 0; i < source.length; i++) {
    const character = source[i]
    if (character === '"' && source[i - 1] !== '\\')
      quoted = !quoted
    if (!quoted) {
      if (character === '<')
        target = true
      if (character === '>')
        target = false
      if (character === ',' && !target) {
        entries.push(source.slice(start, i))
        start = i + 1
      }
    }
  }
  entries.push(source.slice(start))
  return entries.flatMap((entry) => {
    const match = entry.match(/^\s*<([^>]+)>([\s\S]*)$/)
    if (!match)
      return []
    const parameter = (name: string) => match[2]?.match(new RegExp(`;\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i'))
    const rel = parameter('rel')
    const type = parameter('type')
    return [{ href: match[1]!, rel: (rel?.[1] || rel?.[2] || '').split(/\s+/), type: type?.[1] || type?.[2] || '' }]
  })
}

function policy(header: string): Result<Record<string, string>> {
  const signals: Record<string, string> = {}
  for (const part of header.split(',')) {
    const match = part.trim().match(/^(search|ai-input|ai-train)\s*=\s*(yes|no)$/)
    if (!match)
      return { _tag: 'Err', message: 'Content-Signal has an invalid name or value.' }
    const name = match[1]!
    const value = match[2]!
    if (signals[name] && signals[name] !== value)
      return { _tag: 'Err', message: `Content-Signal contains conflicting ${name} values.` }
    signals[name] = value
  }
  return { _tag: 'Ok', value: signals }
}

function policyCheck(html: Result<Document>, md: Result<Document>, id = 'content-signal'): AuditCheck {
  if (html._tag === 'Err' || md._tag === 'Err' || responseFailure(html) || responseFailure(md))
    return { id, status: 'skip', detail: 'Policy comparison requires both public page responses.' }
  const source = html.value.headers.get('content-signal')
  const converted = md.value.headers.get('content-signal')
  if (!source && !converted)
    return { id, status: 'warn', detail: 'No HTTP Content-Signal. Check whether this matches your content policy.' }
  const parsedSource = source ? policy(source) : undefined
  const parsedConverted = converted ? policy(converted) : undefined
  for (const parsed of [parsedSource, parsedConverted]) {
    if (parsed?._tag === 'Err')
      return { id, status: 'fail', detail: parsed.message }
  }
  if (parsedSource?._tag === 'Ok' && (!parsedConverted || parsedConverted._tag !== 'Ok'
    || Object.keys(parsedSource.value).length !== Object.keys(parsedConverted.value).length
    || Object.entries(parsedSource.value).some(([key, value]) => parsedConverted.value[key] !== value))) {
    return { id, status: 'fail', detail: 'Markdown does not preserve the HTML Content-Signal policy.' }
  }
  return { id, status: 'pass', detail: `HTTP policy: ${converted || source}` }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseJson(body: string): Result<unknown> {
  try {
    return { _tag: 'Ok', value: JSON.parse(body) }
  }
  catch {
    return { _tag: 'Err', message: 'Discovery response contains invalid JSON.' }
  }
}

function discoveryDocument(capability: AuditCapability, document: Document): boolean {
  if (capability === 'llms')
    return !isHtml(document.body) && /^#\s+\S/m.test(document.body)
  if (!/^application\/(?:[\w.+-]+\+)?json(?:;|$)/i.test(document.headers.get('content-type') || ''))
    return false
  // A malformed JSON response is a failed discovery check, rather than an audit crash.
  const parsed = parseJson(document.body)
  if (parsed._tag === 'Err')
    return false
  const value = parsed.value
  if (!isRecord(value))
    return false
  switch (capability) {
    case 'api-catalog':
      return Array.isArray(value.linkset) && value.linkset.length > 0 && value.linkset.every(entry => isRecord(entry) && typeof entry.anchor === 'string')
    case 'skills':
      return Array.isArray(value.skills)
    case 'ai-catalog':
      return value.specVersion === '1.0' && Array.isArray(value.entries)
        && value.entries.length > 0 && value.entries.every(entry => isRecord(entry) && typeof entry.url === 'string')
    case 'mcp':
      return typeof value.name === 'string' && typeof value.version === 'string'
        && Array.isArray(value.remotes) && value.remotes.some(remote => isRecord(remote) && remote.type === 'streamable-http' && typeof remote.url === 'string')
  }
}

/** Inspect one public page and its discovery documents. No sync endpoint or credential is used. */
export async function auditSite(options: AuditOptions, dependencies: AuditDependencies): Promise<AuditReport> {
  const [html, negotiated] = await Promise.all([
    readDocument(options.url, 'text/html', dependencies),
    readDocument(options.url, 'text/markdown', dependencies),
  ])
  const pageUrl = html._tag === 'Ok' && !responseFailure(html) ? html.value.url : options.url
  const page = new URL(pageUrl)
  const site = new URL(options.base, page)
  const advertised = html._tag === 'Ok' ? links(html.value.headers.get('link')) : []
  const alternate = advertised.find(link => link.rel.includes('alternate') && link.type.toLowerCase() === 'text/markdown')
  const linkedUrl = alternate ? publicUrl(alternate.href, pageUrl) : undefined
  const direct = new URL(pageUrl)
  direct.pathname = `${direct.pathname.replace(/\/$/, '') || '/index'}.md`
  const robotsUrl = new URL('/robots.txt', page).href
  const [directMd, robots] = await Promise.all([
    readDocument(direct.href, 'text/markdown', dependencies),
    readDocument(robotsUrl, 'text/plain', dependencies),
  ])
  const robotsSitemap = robots._tag === 'Ok' ? robots.value.body.match(/^sitemap:\s*(\S+)/im)?.[1] : undefined
  const sitemapUrl = robotsSitemap ? publicUrl(robotsSitemap, robotsUrl) : publicUrl('sitemap.xml', site.href)
  const sitemap = sitemapUrl._tag === 'Ok' ? await readDocument(sitemapUrl.value.href, 'application/xml, text/xml', dependencies) : sitemapUrl
  const missingUrl = new URL('.well-known/nuxt-ai-ready-audit-missing', site).href
  const missing = await readDocument(missingUrl, 'text/markdown', dependencies)
  const checks: AuditCheck[] = [
    contentCheck('html', options.url, html, doc => /^text\/html(?:;|$)/i.test(doc.headers.get('content-type') || '') && !!doc.body.trim(), 'Public HTML is available.', 'Expected a non-empty HTML page.'),
    contentCheck('markdown-negotiation', options.url, negotiated, markdown, 'Accept: text/markdown returns Markdown.', 'Expected a non-empty text/markdown response.'),
    contentCheck('markdown-url', direct.href, directMd, markdown, 'The direct Markdown URL is available.', 'Expected a non-empty text/markdown response.'),
    { id: 'markdown-link', status: linkedUrl?._tag === 'Ok' && linkedUrl.value.href === direct.href ? 'pass' : 'warn', detail: linkedUrl?._tag === 'Ok' && linkedUrl.value.href === direct.href ? 'The Link header advertises the direct Markdown URL.' : alternate ? 'Inspect the alternate Markdown Link target.' : 'No alternate Markdown Link header.' },
    contentCheck('robots', robotsUrl, robots, doc => !isHtml(doc.body) && /^user-agent:\s*\S/im.test(doc.body), 'robots.txt is available. Inspect its crawler-specific rules.', 'Expected robots.txt with a User-agent group.'),
    contentCheck('sitemap', sitemapUrl._tag === 'Ok' ? sitemapUrl.value.href : site.href, sitemap, doc => /<(?:urlset|sitemapindex)(?:\s|>)/i.test(doc.body) && /<loc>\s*https?:\/\/[^<]+<\/loc>/i.test(doc.body), 'A sitemap document is available.', 'Expected a sitemap with absolute URL entries.'),
    policyCheck(html, negotiated),
    policyCheck(html, directMd, 'content-signal-markdown-url'),
    { id: 'unknown-route', url: missingUrl, status: missing._tag === 'Ok' && [404, 410].includes(missing.value.status) ? 'pass' : 'fail', detail: missing._tag === 'Err' ? missing.message : [404, 410].includes(missing.value.status) ? 'Unknown routes return 404 or 410.' : `Unknown route returned HTTP ${missing.value.status}. Check fallback routing.` },
  ]
  if (negotiated._tag === 'Ok' && !responseFailure(negotiated)) {
    const vary = (negotiated.value.headers.get('vary') || '').toLowerCase().split(',').map(value => value.trim())
    checks.push({ id: 'vary-accept', status: vary.includes('accept') || vary.includes('*') ? 'pass' : 'fail', detail: vary.includes('accept') || vary.includes('*') ? 'Vary separates HTML and Markdown cache entries.' : 'Set Vary: Accept on negotiated responses.' })
  }
  const paths: Record<AuditCapability, string> = { 'llms': 'llms.txt', 'api-catalog': '.well-known/api-catalog', 'ai-catalog': '.well-known/ai-catalog.json', 'mcp': '.well-known/mcp/server-card.json', 'skills': '.well-known/agent-skills/index.json' }
  const discovery = await Promise.all(capabilities.map(async (capability): Promise<AuditCheck> => {
    const declaredLink = capability === 'api-catalog' ? advertised.find(link => link.rel.includes('api-catalog')) : undefined
    if (!options.capabilities.includes(capability) && !declaredLink)
      return { id: capability, status: 'skip', detail: 'Not declared. Use --capabilities to check this feature.' }
    const url = publicUrl(declaredLink?.href || paths[capability], declaredLink ? pageUrl : site.href)
    if (url._tag === 'Err')
      return { id: capability, status: 'fail', detail: url.message }
    const document = await readDocument(url.value.href, capability === 'llms' ? 'text/plain' : 'application/json', dependencies)
    return contentCheck(capability, url.value.href, document, doc => discoveryDocument(capability, doc), 'The discovery document is available.', 'The discovery document has an unexpected format.')
  }))
  return { schemaVersion: 1, url: options.url, checks: [...checks, ...discovery] }
}
