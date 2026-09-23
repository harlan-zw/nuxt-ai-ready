import { defineEventHandler, sendRedirect } from 'h3'

// Upstream redirects that a `.md` request must map onto markdown siblings.
const redirects: Record<string, string> = {
  '/go-home': '/',
  '/moved-about': '/about?from=moved#top',
  '/elsewhere': 'https://other.example.org/page',
  // Trailing-slash redirect: /@slash.md must not redirect back to itself.
  '/@slash': '/@slash/',
}

export default defineEventHandler((event) => {
  const target = redirects[event.path]
  if (target)
    return sendRedirect(event, target, 301)
})
