import type { AiTermsConfig, AiTermsDocument, AiTermsUse, ModuleOptions } from 'nuxt-ai-ready'
import { expectTypeOf } from 'vitest'

const policy = {
  updated: '2026-11-18',
  default: 'deny',
  uses: {
    search: { access: 'allow', attribution: 'required' },
    answer: { access: 'allow' },
    training: { access: 'deny' },
    agent: { access: 'paid', price: { amount: '0.002', currency: 'USD', per: 'page' } },
  },
  payment: { protocol: 'x402', endpoint: 'https://pay.example.com' },
} satisfies AiTermsConfig

expectTypeOf({ aiTerms: policy }).toMatchTypeOf<ModuleOptions>()
expectTypeOf<AiTermsDocument['site']>().toEqualTypeOf<string>()
expectTypeOf<{ access: 'paid' }>().not.toMatchTypeOf<AiTermsUse>()
expectTypeOf<{ access: 'allow', price: { amount: '1', currency: 'USD', per: 'page' } }>().not.toMatchTypeOf<AiTermsUse>()
