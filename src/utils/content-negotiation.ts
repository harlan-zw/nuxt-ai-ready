interface RouteRule {
  isr?: unknown
}

export type ContentNegotiationResolution
  = | { _tag: 'enabled', source: 'default' | 'explicit' }
    | { _tag: 'disabled', source: 'explicit' }
    | { _tag: 'disabled', source: 'isr', route: string }

export function resolveContentNegotiation(input: {
  configured: boolean | undefined
  routeRules: Readonly<Record<string, RouteRule>>
}): ContentNegotiationResolution {
  if (input.configured !== undefined) {
    return input.configured
      ? { _tag: 'enabled', source: 'explicit' }
      : { _tag: 'disabled', source: 'explicit' }
  }

  const isrRoute = Object.entries(input.routeRules)
    .find(([, rule]) => Boolean(rule.isr))?.[0]

  return isrRoute
    ? { _tag: 'disabled', source: 'isr', route: isrRoute }
    : { _tag: 'enabled', source: 'default' }
}
