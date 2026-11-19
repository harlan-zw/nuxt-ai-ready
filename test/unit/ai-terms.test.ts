import { describe, expect, it } from 'vitest'
import { resolveAiTermsConfig } from '../../src/utils/ai-terms'

function terms() {
  return {
    updated: '2026-11-18',
    default: 'deny',
    uses: {
      search: { access: 'allow', attribution: 'required' },
      answer: { access: 'allow' },
      training: { access: 'deny' },
      agent: { access: 'allow' },
    },
  }
}

describe('publishing AI Terms', () => {
  it.each([undefined, false])('publishes nothing without an explicit policy: %s', (config) => {
    expect(resolveAiTermsConfig(config)).toEqual({ _tag: 'Disabled' })
  })

  it('publishes the configured policy using the site origin and deployed discovery URL', () => {
    const policy = terms()
    expect(resolveAiTermsConfig(policy, 'https://example.com/docs/')).toEqual({
      _tag: 'Enabled',
      config: {
        href: 'https://example.com/docs/.well-known/ai-terms',
        document: {
          ...policy,
          ai_terms: '0.1',
          site: 'https://example.com',
          purpose_header: 'AI-Purpose',
          spec: 'https://aipaygen.com/ai-terms',
        },
      },
    })
  })

  it('keeps paid path overrides and their own payment endpoint', () => {
    const policy = {
      ...terms(),
      paths: [{
        match: '/data/*',
        uses: { agent: { access: 'paid', price: { amount: '0.002', currency: 'USD', per: 'request' } } },
        payment: { protocol: 'x402', endpoint: 'https://pay.example.com/x402' },
      }],
      contact: { licensing: 'https://example.com/licensing' },
      report_only: true,
    }
    expect(resolveAiTermsConfig(policy, 'https://example.com')).toMatchObject({
      _tag: 'Enabled',
      config: { document: policy },
    })
  })

  it('publishes only policy fields at every level', () => {
    const price = { amount: '0.002', currency: 'USD', per: 'request' }
    const free = { requests: 100, per: 'day' }
    const payment = { protocol: 'x402', endpoint: 'https://pay.example.com/x402', version: 2 }
    const agent = { access: 'paid', attribution: 'requested', price, free }
    const policy = {
      ...terms(),
      uses: { ...terms().uses, agent },
      paths: [{ match: '/data/*', uses: { agent }, payment }],
      payment,
      identity: { verify: ['published-ip-ranges'], unverified: 'treated-as-unidentified' },
      preview: { shows: ['title'], delivery: 'must-match', described_quote: 'https://example.com/quote' },
      contact: { licensing: 'https://example.com/licensing' },
      receipts: 'The gateway returns PAYMENT-RESPONSE.',
      report_only: false,
    }
    const privateFields = { internalToken: 'private test value' }
    const privateAgent = { ...agent, ...privateFields, price: { ...price, ...privateFields }, free: { ...free, ...privateFields } }
    const result = resolveAiTermsConfig({
      ...policy,
      ...privateFields,
      uses: { ...policy.uses, ...privateFields, agent: privateAgent },
      paths: [{
        ...policy.paths[0],
        ...privateFields,
        uses: { agent: privateAgent, ...privateFields },
        payment: { ...payment, ...privateFields },
      }],
      payment: { ...payment, ...privateFields },
      identity: { ...policy.identity, ...privateFields },
      preview: { ...policy.preview, ...privateFields },
      contact: { ...policy.contact, ...privateFields },
    }, 'https://example.com')

    expect(result).toEqual({
      _tag: 'Enabled',
      config: {
        href: 'https://example.com/.well-known/ai-terms',
        document: {
          ...policy,
          ai_terms: '0.1',
          site: 'https://example.com',
          purpose_header: 'AI-Purpose',
          spec: 'https://aipaygen.com/ai-terms',
        },
      },
    })
  })

  it('keeps the discovery URL on the site origin for a double-slash base path', () => {
    expect(resolveAiTermsConfig(terms(), 'https://example.com//docs/')).toMatchObject({
      _tag: 'Enabled',
      config: { href: 'https://example.com//docs/.well-known/ai-terms' },
    })
  })

  it('allows paid uses to inherit the top level payment endpoint', () => {
    const policy = {
      ...terms(),
      default: 'paid',
      uses: { ...terms().uses, training: { access: 'paid', price: { amount: '0.002', currency: 'USD', per: 'page' } } },
      payment: { protocol: 'x402', version: 2, endpoint: 'https://pay.example.com', network: 'eip155:8453', asset: 'USDC' },
    }
    expect(resolveAiTermsConfig(policy, 'https://example.com')).toMatchObject({
      _tag: 'Enabled',
      config: { document: policy },
    })
  })

  it('preserves explicitly configured identity, allowance, and preview declarations', () => {
    const policy = {
      ...terms(),
      uses: { ...terms().uses, training: { access: 'deny', free: { requests: 100, per: 'day' } } },
      identity: { verify: ['published-ip-ranges'], unverified: 'treated-as-unidentified' },
      receipts: 'The gateway returns PAYMENT-RESPONSE.',
      preview: { shows: ['title', 'words'], delivery: 'per-quote', described_quote: 'https://pay.example.com/preview' },
    }
    expect(resolveAiTermsConfig(policy, 'https://example.com')).toMatchObject({ _tag: 'Enabled', config: { document: policy } })
  })

  const sparse: unknown[] = []
  sparse.length = 1

  it.each([
    [true, 'aiTerms'],
    [{ ...terms(), updated: '2026-02-30' }, 'updated'],
    [{ ...terms(), updated: '18/11/2026' }, 'updated'],
    [{ ...terms(), default: undefined }, 'default'],
    [{ ...terms(), uses: { ...terms().uses, agent: undefined } }, 'uses.agent'],
    [{ ...terms(), uses: { ...terms().uses, training: { access: 'license' } } }, 'uses.training.access'],
    [{ ...terms(), uses: { ...terms().uses, training: { access: 'paid' } } }, 'uses.training.price'],
    [{ ...terms(), uses: { ...terms().uses, training: { access: 'paid', price: { amount: 0.002, currency: 'USD', per: 'page' } } } }, 'uses.training.price.amount'],
    [{ ...terms(), default: 'paid' }, 'payment'],
    [{ ...terms(), paths: [{ match: 'data/*', uses: { agent: { access: 'deny' } } }] }, 'paths[0].match'],
    [{ ...terms(), paths: [{ match: '/data/*#preview', uses: { agent: { access: 'deny' } } }] }, 'paths[0].match'],
    [{ ...terms(), paths: sparse }, 'paths[0]'],
    [{ ...terms(), paths: [{ match: '/data/*', uses: {} }] }, 'paths[0].uses'],
    [{ ...terms(), paths: [{ match: '/data/*', uses: { agent: { access: 'paid', price: { amount: '1', currency: 'USD', per: 'page' } } } }] }, 'paths[0].payment'],
    [{ ...terms(), payment: { protocol: 'other', endpoint: 'https://pay.example.com' } }, 'payment.protocol'],
    [{ ...terms(), payment: { protocol: 'x402', endpoint: 'https://' } }, 'payment.endpoint'],
    [{ ...terms(), payment: { protocol: 'x402', endpoint: '/x402' } }, 'payment.endpoint'],
    [{ ...terms(), payment: { protocol: 'x402', endpoint: 'http://pay.example.com/x402' } }, 'payment.endpoint'],
    [{ ...terms(), payment: { protocol: 'x402', endpoint: 'https://pay.example.com/x402?plan=basic' } }, 'payment.endpoint'],
    [{ ...terms(), payment: { protocol: 'x402', endpoint: 'https://account:password@pay.example.com/x402' } }, 'payment.endpoint'],
    [{ ...terms(), paths: [{ match: '/data/*', uses: { agent: { access: 'deny' } }, payment: { protocol: 'x402', endpoint: 'https://pay.example.com/x402#plan' } }] }, 'paths[0].payment.endpoint'],
    [{ ...terms(), identity: { verify: 'published-ip-ranges' } }, 'identity.verify'],
    [{ ...terms(), identity: { verify: sparse } }, 'identity.verify'],
    [{ ...terms(), report_only: 'yes' }, 'report_only'],
    [{ ...terms(), uses: { ...terms().uses, training: { access: 'deny', free: { requests: 0, per: 'day' } } } }, 'uses.training.free'],
    [{ ...terms(), preview: { delivery: 'guaranteed' } }, 'preview.delivery'],
    [{ ...terms(), preview: { delivery: 'must-match', shows: sparse } }, 'preview.shows'],
  ])('rejects an invalid policy at %s', (policy, field) => {
    const result = resolveAiTermsConfig(policy, 'https://example.com')
    expect(result).toMatchObject({ _tag: 'Invalid', errors: expect.arrayContaining([expect.stringContaining(field)]) })
  })

  it.each([undefined, 'https://[', 'ftp://example.com'])('requires an HTTP site URL: %s', (siteUrl) => {
    expect(resolveAiTermsConfig(terms(), siteUrl)).toMatchObject({
      _tag: 'Invalid',
      errors: expect.arrayContaining([expect.stringContaining('site.url')]),
    })
  })
})
