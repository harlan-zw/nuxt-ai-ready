import { defineNitroPlugin, useRuntimeConfig } from 'nitropack/runtime'

export default defineNitroPlugin((nitroApp) => {
  if (useRuntimeConfig().app.baseURL !== '/docs/')
    return

  nitroApp.hooks.hook('sitemap:resolved', (ctx) => {
    ctx.urls = ctx.urls.map((entry) => {
      if (!entry.loc.endsWith('/docs/api'))
        return entry
      return { ...entry, loc: entry.loc.replace('/docs/', '/docs/docs/') }
    })
  })
})
