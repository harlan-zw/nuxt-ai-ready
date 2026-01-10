import { eventHandler } from 'h3'
import { useDatabase } from '../../db'
import { getPageCount, getUnindexedCount } from '../../db/queries'

export default eventHandler(async (event) => {
  const db = await useDatabase(event)

  const [total, unindexed] = await Promise.all([
    getPageCount(db),
    getUnindexedCount(db),
  ])

  return {
    total,
    indexed: total - unindexed,
    pending: unindexed,
  }
})
