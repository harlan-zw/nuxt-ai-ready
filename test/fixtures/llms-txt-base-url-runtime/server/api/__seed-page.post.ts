import { queryPages, upsertPage, useRawDb } from '#ai-ready'
import { defineEventHandler, readBody } from 'h3'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ action: 'delete' | 'upsert', route: string, title?: string }>(event)
  if (body.action === 'delete') {
    await queryPages(event)
    const db = await useRawDb(event)
    await db.exec('DELETE FROM ai_ready_pages WHERE route = ?', [body.route])
    return
  }

  await upsertPage(event, {
    route: body.route,
    title: body.title || '',
    description: '',
    markdown: '# Persisted About',
    headings: '[]',
    keywords: [],
    updatedAt: new Date().toISOString(),
  })
})
