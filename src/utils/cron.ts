/**
 * Schedule for the `ai-ready:cron` Nitro scheduled task and the platform
 * cron integrations (Vercel crons, Cloudflare wrangler triggers): every
 * 5 minutes. Repository docs describe this interval, so a change here
 * must update `CLAUDE.md` and `ARCHITECTURE.md` too.
 */
export const AI_READY_CRON_SCHEDULE = '*/5 * * * *'
