import { eventHandler } from 'h3'
import { countPages } from '../../db/queries'

export default eventHandler(async (event) => {
  const [total, pending] = await Promise.all([
    countPages(event),
    countPages(event, { where: { pending: true } }),
  ])

  return {
    total,
    indexed: total - pending,
    pending,
  }
})
