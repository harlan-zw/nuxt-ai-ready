import { queryCollection } from '@harlan-zw/comark-content/server'
import { defineEventHandler, getQuery } from 'h3'

// The page fetches its content through this route rather than through comark's
// client query, so the fixture renders the same HTML in both arms of the
// equivalence test without depending on auto-imports the root typecheck cannot
// see.
export default defineEventHandler(async (event) => {
  const path = String(getQuery(event).path || '')
  return await queryCollection(event, 'docs').path(path).first()
})
