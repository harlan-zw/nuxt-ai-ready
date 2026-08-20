import { describe, expect, it } from 'vitest'
import { buildSchemaSql } from '../../src/runtime/server/db/schema-sql'

describe('sitemap continuation schema', () => {
  it('persists crawl state in the sitemap row', () => {
    const sitemapTable = buildSchemaSql().find(sql => sql.includes('CREATE TABLE IF NOT EXISTS ai_ready_sitemaps'))

    expect(sitemapTable).toContain('crawl_state TEXT')
  })
})
