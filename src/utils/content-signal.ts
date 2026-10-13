/**
 * The Content-Signal line robots.txt gets when `aiReady.contentSignal` is not
 * configured. It allows search and AI input and states no training
 * preference, so `ai-train` is left out.
 */
export const DEFAULT_CONTENT_SIGNAL = 'search=yes, ai-input=yes'

interface RobotsGroup {
  userAgent?: string | string[]
  disallow?: string | string[]
  contentSignal?: unknown
}

function hasContentSignal(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some(Boolean)
  if (value && typeof value === 'object')
    return Object.keys(value).length > 0
  return Boolean(value)
}

function isWildcardGroup(group: RobotsGroup): boolean {
  const userAgents = Array.isArray(group.userAgent) ? group.userAgent : [group.userAgent ?? '*']
  return userAgents.length === 1 && userAgents[0] === '*'
}

/**
 * Add the default Content-Signal to the wildcard group of a resolved
 * `@nuxtjs/robots` config. A policy that any group already states, from the
 * robots config or a merged robots.txt file, is the site's own, so it stays
 * the only one.
 */
export function applyDefaultContentSignal(groups: RobotsGroup[]): void {
  if (groups.some(group => hasContentSignal(group.contentSignal)))
    return
  const wildcard = groups.find(isWildcardGroup)
  if (wildcard)
    wildcard.contentSignal = [DEFAULT_CONTENT_SIGNAL]
  else
    groups.push({ userAgent: ['*'], disallow: [''], contentSignal: [DEFAULT_CONTENT_SIGNAL] })
}
