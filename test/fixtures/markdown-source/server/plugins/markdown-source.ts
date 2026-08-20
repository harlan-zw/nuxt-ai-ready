import { defineNitroPlugin } from '#imports'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('ai-ready:markdown:source', (context) => {
    if (context.route !== '/about')
      return
    context.source = {
      markdown: '# Supplied by the host application\n\nRead from the original file, not the rendering.',
      title: 'About, from source',
      description: 'Markdown the site already held',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
  })
})
