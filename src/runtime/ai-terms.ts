export type AiTermsPurpose = 'search' | 'answer' | 'training' | 'agent'
export type AiTermsAccess = 'allow' | 'paid' | 'deny'

export interface AiTermsPrice {
  amount: string
  currency: 'USD'
  per: 'page' | 'request'
}

interface AiTermsUseBase {
  attribution?: 'required' | 'requested' | 'none'
}

export type AiTermsUse = AiTermsUseBase & (
  | { access: 'allow', price?: never, free?: never }
  | { access: 'deny', price?: never, free?: AiTermsFreeAllowance }
  | { access: 'paid', price: AiTermsPrice, free?: AiTermsFreeAllowance }
)

export interface AiTermsFreeAllowance {
  requests: number
  per: 'hour' | 'day'
}

export interface AiTermsPayment {
  protocol: 'x402'
  /** Absolute HTTPS URL without a query or fragment. */
  endpoint: string
  version?: number
  network?: string
  asset?: string
}

export interface AiTermsPath {
  match: string
  uses: Partial<Record<AiTermsPurpose, AiTermsUse>>
  payment?: AiTermsPayment
}

/** Explicit AI Terms 0.1 policy. Publishing does not enforce the policy. */
export interface AiTermsConfig {
  /** Date of the last policy change, in YYYY-MM-DD format. */
  updated: string
  uses: Record<AiTermsPurpose, AiTermsUse>
  /** Access for a client that declares no purpose. */
  default: AiTermsAccess
  paths?: AiTermsPath[]
  payment?: AiTermsPayment
  identity?: { verify?: string[], unverified?: string }
  receipts?: string
  report_only?: boolean
  contact?: { licensing?: string }
  preview?: {
    shows?: Array<'title' | 'description' | 'excerpt' | 'words'>
    delivery: 'must-match' | 'per-quote' | 'not-checked'
    described_quote?: string
  }
}

export interface AiTermsDocument extends AiTermsConfig {
  ai_terms: '0.1'
  site: string
  purpose_header: 'AI-Purpose'
  spec: 'https://aipaygen.com/ai-terms'
}

export interface ResolvedAiTermsConfig {
  href: string
  document: AiTermsDocument
}

export const AI_TERMS_PATH = '/.well-known/ai-terms'
