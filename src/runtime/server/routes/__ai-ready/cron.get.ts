import { eventHandler } from 'h3'
import { runCron } from '../../utils/runCron'

/**
 * Cron endpoint for platforms that use HTTP-based cron (Vercel, etc.)
 */
export default eventHandler(event => runCron(event))
