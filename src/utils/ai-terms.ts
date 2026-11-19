import type { AiTermsConfig, ResolvedAiTermsConfig } from '../runtime/ai-terms'
import { AI_TERMS_PATH } from '../runtime/ai-terms'

type AiTermsResult
  = | { _tag: 'Disabled' }
    | { _tag: 'Invalid', errors: string[] }
    | { _tag: 'Enabled', config: ResolvedAiTermsConfig }

const purposes = ['search', 'answer', 'training', 'agent'] as const
const accesses = ['allow', 'paid', 'deny']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function checkPayment(value: unknown, field: string, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${field}: configure an x402 payment endpoint.`)
    return
  }
  if (value.protocol !== 'x402')
    errors.push(`${field}.protocol: use x402.`)
  const endpoint = value.endpoint
  if (typeof endpoint !== 'string' || !/^https:\/\/[^/?#\\\s][^?#\\\s]*$/.test(endpoint) || !URL.canParse(endpoint))
    errors.push(`${field}.endpoint must be an absolute HTTPS URL without a query or fragment.`)
  if (value.version !== undefined && !Number.isInteger(value.version))
    errors.push(`${field}.version: use an integer.`)
  for (const key of ['network', 'asset']) {
    if (value[key] !== undefined && typeof value[key] !== 'string')
      errors.push(`${field}.${key}: use a string.`)
  }
}

function checkUses(value: unknown, field: string, payment: unknown, partial: boolean, errors: string[]): void {
  if (!isRecord(value)) {
    errors.push(`${field}: set the AI use rules.`)
    return
  }
  if (partial && !purposes.some(purpose => value[purpose] !== undefined))
    errors.push(`${field}: set at least one AI use rule.`)
  for (const purpose of purposes) {
    const rule = value[purpose]
    const path = `${field}.${purpose}`
    if (rule === undefined && partial)
      continue
    if (!isRecord(rule)) {
      errors.push(`${path}: set an access rule.`)
      continue
    }
    if (!accesses.includes(rule.access as string))
      errors.push(`${path}.access: use allow, paid, or deny.`)
    if (rule.attribution !== undefined && !['required', 'requested', 'none'].includes(rule.attribution as string))
      errors.push(`${path}.attribution: use required, requested, or none.`)
    if (rule.access === 'paid') {
      if (!isRecord(rule.price)) {
        errors.push(`${path}.price: set the paid use price.`)
      }
      else {
        if (typeof rule.price.amount !== 'string' || !/^\d+(?:\.\d+)?$/.test(rule.price.amount))
          errors.push(`${path}.price.amount: use a decimal string.`)
        if (rule.price.currency !== 'USD')
          errors.push(`${path}.price.currency: use USD.`)
        if (!['page', 'request'].includes(rule.price.per as string))
          errors.push(`${path}.price.per: use page or request.`)
      }
      if (!payment)
        errors.push(`${field === 'uses' ? 'payment' : field.replace(/\.uses$/, '.payment')}: paid uses need a payment endpoint.`)
    }
    else if (rule.price !== undefined) {
      errors.push(`${path}.price: only paid uses have a price.`)
    }
    if (rule.free !== undefined) {
      if (!isRecord(rule.free) || !Number.isInteger(rule.free.requests) || Number(rule.free.requests) < 1 || Number(rule.free.requests) > 1_000_000_000 || !['hour', 'day'].includes(rule.free.per as string))
        errors.push(`${path}.free: set 1 to 1000000000 requests per hour or day.`)
      if (rule.access === 'allow')
        errors.push(`${path}.free: only paid or denied uses have a free allowance.`)
    }
  }
}

/** Parse once during Nuxt setup. Never infer permissions or the policy date. */
export function resolveAiTermsConfig(input: unknown, siteBaseURL?: string): AiTermsResult {
  if (input === undefined || input === false)
    return { _tag: 'Disabled' }
  if (!isRecord(input))
    return { _tag: 'Invalid', errors: ['aiTerms: configure an explicit AI Terms policy, or use false.'] }

  const errors: string[] = []
  const site = siteBaseURL && URL.canParse(siteBaseURL) ? new URL(siteBaseURL) : undefined
  if (!site || !['https:', 'http:'].includes(site.protocol) || site.username || site.password)
    errors.push('site.url: set an absolute HTTP or HTTPS URL to publish AI Terms.')

  if (typeof input.updated !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.updated) || !Number.isFinite(Date.parse(input.updated)) || new Date(input.updated).toISOString().slice(0, 10) !== input.updated)
    errors.push('updated: set the policy change date in YYYY-MM-DD format.')
  if (!accesses.includes(input.default as string))
    errors.push('default: use allow, paid, or deny.')
  if (input.payment !== undefined)
    checkPayment(input.payment, 'payment', errors)
  if (input.default === 'paid' && !input.payment)
    errors.push('payment: a paid default needs a payment endpoint.')
  checkUses(input.uses, 'uses', input.payment, false, errors)

  if (input.paths !== undefined) {
    if (!Array.isArray(input.paths)) {
      errors.push('paths: use an array of path overrides.')
    }
    else {
      input.paths.forEach((entry: unknown, index: number) => {
        const field = `paths[${index}]`
        if (!isRecord(entry)) {
          errors.push(`${field}: set a path match and AI use rules.`)
          return
        }
        if (typeof entry.match !== 'string' || !entry.match.startsWith('/'))
          errors.push(`${field}.match: start the path pattern with /.`)
        if (entry.payment !== undefined)
          checkPayment(entry.payment, `${field}.payment`, errors)
        checkUses(entry.uses, `${field}.uses`, entry.payment ?? input.payment, true, errors)
      })
    }
  }
  if (input.identity !== undefined) {
    if (!isRecord(input.identity)) {
      errors.push('identity: configure the identity checks used by your server.')
    }
    else {
      if (input.identity.verify !== undefined && (!Array.isArray(input.identity.verify) || input.identity.verify.some(value => typeof value !== 'string')))
        errors.push('identity.verify: use an array of verification methods.')
      if (input.identity.unverified !== undefined && typeof input.identity.unverified !== 'string')
        errors.push('identity.unverified: use a string.')
    }
  }
  if (input.receipts !== undefined && typeof input.receipts !== 'string')
    errors.push('receipts: use a string.')
  if (input.report_only !== undefined && typeof input.report_only !== 'boolean')
    errors.push('report_only: use true or false.')
  if (input.contact !== undefined && (!isRecord(input.contact) || (input.contact.licensing !== undefined && typeof input.contact.licensing !== 'string')))
    errors.push('contact.licensing: use a string.')
  if (input.preview !== undefined) {
    if (!isRecord(input.preview) || !['must-match', 'per-quote', 'not-checked'].includes(input.preview.delivery as string)) {
      errors.push('preview.delivery: use must-match, per-quote, or not-checked.')
    }
    else {
      if (input.preview.shows !== undefined && (!Array.isArray(input.preview.shows) || input.preview.shows.some(value => !['title', 'description', 'excerpt', 'words'].includes(value))))
        errors.push('preview.shows: use title, description, excerpt, or words.')
      if (input.preview.described_quote !== undefined && typeof input.preview.described_quote !== 'string')
        errors.push('preview.described_quote: use a string.')
    }
  }
  if (errors.length || !site)
    return { _tag: 'Invalid', errors }

  const policy = input as unknown as AiTermsConfig
  return {
    _tag: 'Enabled',
    config: {
      href: new URL(`${site.pathname.replace(/\/$/, '')}${AI_TERMS_PATH}`, site.origin).href,
      document: {
        ...policy,
        ai_terms: '0.1',
        site: site.origin,
        purpose_header: 'AI-Purpose',
        spec: 'https://aipaygen.com/ai-terms',
      },
    },
  }
}
