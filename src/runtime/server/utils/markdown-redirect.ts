import { markdownAlternatePath, toMarkdownPath } from '../../markdown-path'

const RE_ABSOLUTE_URL = /^(?:[a-z][a-z\d+.-]*:|\/\/)/i

/**
 * What a `.md` request does with an upstream redirect of its HTML page.
 *
 * `redirect` sends the client to `location`. `follow` means the target is the
 * same markdown document as the request, as with a trailing-slash redirect, so
 * the handler converts the HTML at `path` instead of redirecting to itself.
 */
export type MarkdownRedirect
  = | { _tag: 'redirect', location: string }
    | { _tag: 'follow', path: string }

export interface MarkdownRedirectOptions {
  /** Absolute URL of the HTML page that answered with the redirect. */
  pageUrl: string
  /** Other origins that serve this site, such as the configured site URL. */
  origins?: readonly string[]
}

/**
 * Map an upstream `Location` onto the markdown sibling of its target.
 *
 * A target on another origin, or one without a markdown sibling, keeps its
 * original location. Query and fragment carry over to the sibling.
 */
export function resolveMarkdownRedirect(location: string, { pageUrl, origins = [] }: MarkdownRedirectOptions): MarkdownRedirect {
  const page = new URL(pageUrl)
  const target = URL.canParse(location, page) ? new URL(location, page) : null
  if (!target || (target.origin !== page.origin && !origins.includes(target.origin)))
    return { _tag: 'redirect', location }

  const markdownPath = markdownAlternatePath(target.pathname)
  if (!markdownPath)
    return { _tag: 'redirect', location }

  if (markdownPath === toMarkdownPath(page.pathname))
    return { _tag: 'follow', path: `${target.pathname}${target.search}` }

  const markdownLocation = `${markdownPath}${target.search}${target.hash}`
  return {
    _tag: 'redirect',
    location: RE_ABSOLUTE_URL.test(location) ? `${target.origin}${markdownLocation}` : markdownLocation,
  }
}
