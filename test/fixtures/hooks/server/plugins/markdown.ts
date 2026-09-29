export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:mdreamConfig', (config) => {
    config.filter ??= {}
    config.filter.exclude = [...(config.filter.exclude || []), 'ul']
  })
  nitroApp.hooks.hook('ai-ready:page:markdown', (ctx) => {
    ctx.markdown += `\n\nNitro Markdown hook ran (isPrerender: ${ctx.isPrerender}).`
  })
})
