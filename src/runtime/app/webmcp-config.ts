import type { ResolvedWebMcpConfig } from '../../utils/webmcp'

let defaults: Pick<ResolvedWebMcpConfig, 'exposedTo'> = {}

export function setWebMcpDefaults(config: Pick<ResolvedWebMcpConfig, 'exposedTo'>): void {
  defaults = config
}

export function getWebMcpDefaults(): Readonly<Pick<ResolvedWebMcpConfig, 'exposedTo'>> {
  return defaults
}
