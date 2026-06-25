import { defineNitroPlugin } from 'nitropack/runtime'

// Reproduces issue #36: stamp a markdown-preferring Accept header + AI bot UA on
// the Nitro prerender crawler request. Without the prerender guard in
// negotiateRepresentation, the markdown middleware 307-redirects the route to
// its `.md` twin and Nitro bakes that redirect's meta-refresh stub into the
// canonical `index.html`, destroying the prerendered page.
export default defineNitroPlugin((nitroApp) => {
  if (!import.meta.prerender)
    return
  nitroApp.hooks.hook('request', (event) => {
    event.node.req.headers.accept = 'text/markdown'
    event.node.req.headers['user-agent'] = 'Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)'
  })
})
