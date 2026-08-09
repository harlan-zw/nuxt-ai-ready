import { describe, expect, it } from 'vitest'
import { buildSchemaSql, SCHEMA_VERSION } from '../../src/runtime/server/db/schema-sql'

describe('sitemap continuation schema', () => {
  it('persists crawl state in the sitemap row', () => {
    const sitemapTable = buildSchemaSql().find(sql => sql.includes('CREATE TABLE IF NOT EXISTS ai_ready_sitemaps'))

    expect(sitemapTable).toContain('crawl_state TEXT')
  })

  it('bumps the rebuild version for existing databases', () => {
    expect(SCHEMA_VERSION).toBe('v2.2.0')
  })
})
