interface WebMcpDefaults {
  exposedTo?: string[]
}

let defaults: WebMcpDefaults = {}

export function setWebMcpDefaults(config: WebMcpDefaults): void {
  defaults = config
}

export function getWebMcpDefaults(): Readonly<WebMcpDefaults> {
  return defaults
}
