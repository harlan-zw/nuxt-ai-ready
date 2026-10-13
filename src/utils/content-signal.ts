import type { ModuleOptions } from '../runtime/types'

/**
 * The Content-Signal line robots.txt gets when `aiReady.contentSignal` is not
 * configured. It allows search and AI input and states no training
 * preference, so `ai-train` is left out.
 */
export const DEFAULT_CONTENT_SIGNAL = 'search=yes, ai-input=yes'

export type ContentSignalPolicy
  = | { _tag: 'Disabled' }
    | { _tag: 'Default' }
    | { _tag: 'Configured', contentSignal: string, contentUsage?: string }

/**
 * An object states the whole policy, so a permission it leaves out is sent
 * as `no`. Only an unset option gets the default.
 */
export function resolveContentSignalPolicy(option: ModuleOptions['contentSignal']): ContentSignalPolicy {
  if (option === false)
    return { _tag: 'Disabled' }
  if (option === undefined)
    return { _tag: 'Default' }
  const value = (allowed?: boolean) => allowed ? 'yes' : 'no'
  return {
    _tag: 'Configured',
    // One comma-separated line: validators reject one line per signal.
    contentSignal: `ai-train=${value(option.aiTrain)}, search=${value(option.search)}, ai-input=${value(option.aiInput)}`,
    ...(option.contentUsage !== false && { contentUsage: `train-ai=${option.aiTrain ? 'y' : 'n'}` }),
  }
}

interface RobotsGroup {
  userAgent?: string | string[]
  disallow?: string | string[]
  contentSignal?: unknown
  contentUsage?: unknown
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

function wildcardGroup(groups: RobotsGroup[]): RobotsGroup {
  const existing = groups.find(isWildcardGroup)
  if (existing)
    return existing
  const group: RobotsGroup = { userAgent: ['*'], disallow: [''] }
  groups.push(group)
  return group
}

/**
 * Write the policy into the wildcard group of the resolved `@nuxtjs/robots`
 * config, which robots passes to its `robots:config` hook. Robots copies its
 * options when it installs, so a group written to `nuxt.options.robots` after
 * that never reaches robots.txt.
 *
 * The default yields to a Content-Signal that any group already sets, from
 * the robots config or a merged robots.txt file. A configured policy is the
 * site's explicit choice, so it replaces the wildcard group's value.
 */
export function applyContentSignalPolicy(groups: RobotsGroup[], policy: ContentSignalPolicy): void {
  switch (policy._tag) {
    case 'Disabled':
      return
    case 'Default': {
      if (groups.some(group => hasContentSignal(group.contentSignal)))
        return
      wildcardGroup(groups).contentSignal = [DEFAULT_CONTENT_SIGNAL]
      return
    }
    case 'Configured': {
      const group = wildcardGroup(groups)
      group.contentSignal = [policy.contentSignal]
      if (policy.contentUsage)
        group.contentUsage = [policy.contentUsage]
    }
  }
}
