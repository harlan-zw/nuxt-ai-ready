import type {
  ApiCatalogEntry,
  ApiCatalogLinks,
  ApiCatalogLinkTarget,
  ModuleOptions,
} from '../runtime/types'

export const API_CATALOG_PATH = '/.well-known/api-catalog'
export const API_CATALOG_PROFILE = 'https://www.rfc-editor.org/info/rfc9727'
export const API_CATALOG_MEDIA_TYPE = `application/linkset+json; profile="${API_CATALOG_PROFILE}"`

const RELATION_FIELDS = {
  item: 'item',
  serviceDesc: 'service-desc',
  serviceDoc: 'service-doc',
  serviceMeta: 'service-meta',
  status: 'status',
  apiCatalog: 'api-catalog',
} as const

type ApiCatalogRelationField = keyof typeof RELATION_FIELDS

export interface ResolvedApiCatalogLinkTarget {
  href: string
  type?: string
  title?: string
  hreflang?: string[]
  media?: string
}

export type ResolvedApiCatalogLinksetEntry = Record<string, string | ResolvedApiCatalogLinkTarget[]>

export interface ResolvedApiCatalogConfig {
  href: string
  mediaType: string
  document: {
    linkset: ResolvedApiCatalogLinksetEntry[]
  }
}

export type ApiCatalogConfigError
  = | { _tag: 'InvalidOptions' }
    | { _tag: 'MissingEntries' }
    | { _tag: 'InvalidEntry', entryIndex: number }
    | { _tag: 'InvalidAnchor', entryIndex: number }
    | { _tag: 'InvalidRelation', entryIndex: number, relation: string }
    | { _tag: 'MissingLinks', entryIndex: number }
    | { _tag: 'InvalidLink', entryIndex: number, relation: string, targetIndex: number }
    | { _tag: 'InvalidLinkHref', entryIndex: number, relation: string, targetIndex: number }
    | { _tag: 'InvalidUrl', entryIndex: number, field: string, value: string }
    | { _tag: 'MissingSiteUrl', entryIndex: number, field: string }

export type ResolveApiCatalogResult
  = | { _tag: 'Disabled' }
    | { _tag: 'Invalid', errors: ApiCatalogConfigError[] }
    | { _tag: 'Enabled', config: ResolvedApiCatalogConfig }

export interface ResolveApiCatalogContext {
  siteBaseURL?: string
  generatedEntries?: ApiCatalogEntry[]
}

function parseBaseURL(siteBaseURL: string | undefined): URL | undefined {
  if (!siteBaseURL || !URL.canParse(siteBaseURL))
    return undefined
  const parsed = new URL(siteBaseURL)
  if (!parsed.pathname.endsWith('/'))
    parsed.pathname = `${parsed.pathname}/`
  return parsed
}

function resolveUrl(
  value: string,
  baseURL: URL | undefined,
  errorContext: { entryIndex: number, field: string },
): { _tag: 'Ok', value: string } | { _tag: 'Err', error: ApiCatalogConfigError } {
  if (!value.trim()) {
    return {
      _tag: 'Err',
      error: errorContext.field === 'anchor'
        ? { _tag: 'InvalidAnchor', entryIndex: errorContext.entryIndex }
        : {
            _tag: 'InvalidUrl',
            entryIndex: errorContext.entryIndex,
            field: errorContext.field,
            value,
          },
    }
  }

  if (value.startsWith('//')) {
    if (!baseURL) {
      return {
        _tag: 'Err',
        error: { _tag: 'MissingSiteUrl', entryIndex: errorContext.entryIndex, field: errorContext.field },
      }
    }
    return URL.canParse(value, baseURL)
      ? { _tag: 'Ok', value: new URL(value, baseURL).href }
      : {
          _tag: 'Err',
          error: {
            _tag: 'InvalidUrl',
            entryIndex: errorContext.entryIndex,
            field: errorContext.field,
            value,
          },
        }
  }

  if (URL.canParse(value))
    return { _tag: 'Ok', value: new URL(value).href }

  if (!baseURL) {
    return {
      _tag: 'Err',
      error: { _tag: 'MissingSiteUrl', entryIndex: errorContext.entryIndex, field: errorContext.field },
    }
  }

  const relativeValue = value.replace(/^\/+/, '')
  return URL.canParse(relativeValue, baseURL)
    ? { _tag: 'Ok', value: new URL(relativeValue, baseURL).href }
    : {
        _tag: 'Err',
        error: {
          _tag: 'InvalidUrl',
          entryIndex: errorContext.entryIndex,
          field: errorContext.field,
          value,
        },
      }
}

function normalizeLinks(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value]
}

const registeredRelationPattern = /^[a-z][a-z0-9.-]*$/

function isValidCustomRelation(relation: string): boolean {
  return relation !== 'anchor'
    && (registeredRelationPattern.test(relation) || URL.canParse(relation))
}

function parseLinks(
  input: ApiCatalogLinks | unknown,
  relation: string,
  entryIndex: number,
  baseURL: URL | undefined,
  errors: ApiCatalogConfigError[],
): ResolvedApiCatalogLinkTarget[] {
  const resolved: ResolvedApiCatalogLinkTarget[] = []
  for (const [targetIndex, target] of normalizeLinks(input).entries()) {
    if (!target || typeof target !== 'object' || Array.isArray(target)) {
      errors.push({ _tag: 'InvalidLink', entryIndex, relation, targetIndex })
      continue
    }

    const candidate = target as Partial<ApiCatalogLinkTarget>
    if (typeof candidate.href !== 'string' || !candidate.href.trim()) {
      errors.push({ _tag: 'InvalidLinkHref', entryIndex, relation, targetIndex })
      continue
    }

    const href = resolveUrl(candidate.href, baseURL, {
      entryIndex,
      field: `${relation}[${targetIndex}].href`,
    })
    if (href._tag === 'Err') {
      errors.push(href.error)
      continue
    }

    resolved.push({
      href: href.value,
      ...(typeof candidate.type === 'string' && { type: candidate.type }),
      ...(typeof candidate.title === 'string' && { title: candidate.title }),
      ...(typeof candidate.hreflang === 'string'
        ? { hreflang: [candidate.hreflang] }
        : (Array.isArray(candidate.hreflang) && candidate.hreflang.every(value => typeof value === 'string'))
            ? { hreflang: candidate.hreflang }
            : {}),
      ...(typeof candidate.media === 'string' && { media: candidate.media }),
    })
  }
  return resolved
}

function parseEntry(
  input: ApiCatalogEntry | unknown,
  entryIndex: number,
  baseURL: URL | undefined,
  errors: ApiCatalogConfigError[],
): ResolvedApiCatalogLinksetEntry | undefined {
  const entryErrorStart = errors.length
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    errors.push({ _tag: 'InvalidEntry', entryIndex })
    return undefined
  }

  const entry = input as Partial<ApiCatalogEntry>
  if (typeof entry.anchor !== 'string') {
    errors.push({ _tag: 'InvalidAnchor', entryIndex })
    return undefined
  }

  const anchor = resolveUrl(entry.anchor, baseURL, { entryIndex, field: 'anchor' })
  if (anchor._tag === 'Err')
    errors.push(anchor.error)

  const resolved: ResolvedApiCatalogLinksetEntry = {
    anchor: anchor._tag === 'Ok' ? anchor.value : entry.anchor,
  }

  for (const [field, relation] of Object.entries(RELATION_FIELDS) as Array<[ApiCatalogRelationField, string]>) {
    const links = entry[field]
    if (links === undefined)
      continue
    resolved[relation] = parseLinks(links, field, entryIndex, baseURL, errors)
  }

  if (entry.relations !== undefined) {
    if (!entry.relations || typeof entry.relations !== 'object' || Array.isArray(entry.relations)) {
      errors.push({ _tag: 'InvalidRelation', entryIndex, relation: 'relations' })
    }
    else {
      for (const [relation, links] of Object.entries(entry.relations)) {
        if (!isValidCustomRelation(relation)) {
          errors.push({ _tag: 'InvalidRelation', entryIndex, relation })
          continue
        }
        const parsed = parseLinks(links, relation, entryIndex, baseURL, errors)
        const existing = resolved[relation]
        resolved[relation] = Array.isArray(existing) ? [...existing, ...parsed] : parsed
      }
    }
  }

  const hasLinks = Object.entries(resolved).some(([relation, links]) => relation !== 'anchor'
    && Array.isArray(links)
    && links.length > 0)
  if (!hasLinks && errors.length === entryErrorStart)
    errors.push({ _tag: 'MissingLinks', entryIndex })

  return resolved
}

export function resolveApiCatalogConfig(
  input: ModuleOptions['apiCatalog'] | unknown,
  context: ResolveApiCatalogContext,
): ResolveApiCatalogResult {
  if (input === false)
    return { _tag: 'Disabled' }

  const generatedEntries = context.generatedEntries || []
  if (input === undefined && generatedEntries.length === 0)
    return { _tag: 'Disabled' }

  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
    return { _tag: 'Invalid', errors: [{ _tag: 'InvalidOptions' }] }
  }

  const configuredEntries = input === undefined
    ? []
    : Array.isArray((input as { entries?: unknown }).entries)
      ? (input as { entries: unknown[] }).entries
      : []
  const entries = [...configuredEntries, ...generatedEntries]
  if (entries.length === 0)
    return { _tag: 'Invalid', errors: [{ _tag: 'MissingEntries' }] }

  const errors: ApiCatalogConfigError[] = []
  const baseURL = parseBaseURL(context.siteBaseURL)
  const linkset = entries
    .map((entry, entryIndex) => parseEntry(entry, entryIndex, baseURL, errors))
    .filter((entry): entry is ResolvedApiCatalogLinksetEntry => !!entry)

  if (errors.length > 0)
    return { _tag: 'Invalid', errors }

  const href = baseURL
    ? new URL(API_CATALOG_PATH.slice(1), baseURL).href
    : API_CATALOG_PATH

  return {
    _tag: 'Enabled',
    config: {
      href,
      mediaType: API_CATALOG_MEDIA_TYPE,
      document: { linkset },
    },
  }
}

export function formatApiCatalogConfigError(error: ApiCatalogConfigError): string {
  switch (error._tag) {
    case 'InvalidOptions':
      return '`aiReady.apiCatalog` must be false or an object.'
    case 'MissingEntries':
      return '`aiReady.apiCatalog.entries` must contain at least one entry.'
    case 'InvalidEntry':
      return `\`aiReady.apiCatalog.entries[${error.entryIndex}]\` must be an object.`
    case 'InvalidAnchor':
      return `\`aiReady.apiCatalog.entries[${error.entryIndex}].anchor\` must be a non-empty URL.`
    case 'InvalidRelation':
      return `API catalog relation \`${error.relation}\` in entry ${error.entryIndex} is invalid.`
    case 'MissingLinks':
      return `API catalog entry ${error.entryIndex} must contain at least one link.`
    case 'InvalidLink':
      return `API catalog ${error.relation} target ${error.targetIndex} in entry ${error.entryIndex} must be an object.`
    case 'InvalidLinkHref':
      return `API catalog ${error.relation} target ${error.targetIndex} in entry ${error.entryIndex} needs a non-empty href.`
    case 'InvalidUrl':
      return `API catalog URL \`${error.value}\` at ${error.field} in entry ${error.entryIndex} is invalid.`
    case 'MissingSiteUrl':
      return `API catalog relative URL at ${error.field} in entry ${error.entryIndex} requires a configured site.url.`
  }
}
