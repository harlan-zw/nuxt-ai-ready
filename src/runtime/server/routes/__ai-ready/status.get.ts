import { eventHandler } from 'h3'
import { useDatabase } from '../../db'
import { countPages } from '../../db/queries'

export default eventHandler(async (event) => {
  const db = await useDatabase(event)

  const [total, pending] = await Promise.all([
    countPages(db),
    countPages(db, { where: { pending: true } }),
  ])

  return {
    total,
    indexed: total - pending,
    pending,
  }
})
