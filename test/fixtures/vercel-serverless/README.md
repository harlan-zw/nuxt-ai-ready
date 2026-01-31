# Vercel Serverless Smoke Test

Manual smoke test fixture for verifying nuxt-ai-ready works on Vercel serverless with Neon Postgres.

> **Note**: This smoke test uses the published npm package. Run after releasing a new version to verify Vercel integration works.

## Prerequisites

1. Vercel account with CLI installed: `npm i -g vercel`
2. Vercel Postgres (Neon) addon configured

## Setup

```bash
# From repo root
cd test/fixtures/vercel-serverless
pnpm install

# Link to Vercel project (first time only)
vercel link

# Add Vercel Postgres addon in dashboard, or:
vercel env pull  # If already configured
```

## Deploy

```bash
# Deploy to preview
vercel

# Or deploy to production
vercel --prod
```

## Smoke Test Checklist

After deployment, verify these endpoints:

- [ ] `/__ai-ready/status` - Returns JSON with database stats (not filesystem error)
- [ ] `/llms.txt` - Returns site index
- [ ] `/llms-full.txt` - Returns full markdown (may be empty without prerender)
- [ ] `/.md` - Returns homepage as markdown
- [ ] `/about.md` - Returns about page as markdown

## Expected Behavior

1. **Auto-detection**: Module detects `VERCEL` env var
2. **Auto-upgrade**: SQLite config auto-upgrades to Neon when `POSTGRES_URL` present
3. **Database**: Pages stored in Vercel Postgres (Neon), not filesystem

## Troubleshooting

### "No POSTGRES_URL found"

Add Vercel Postgres addon:
1. Go to Vercel dashboard → Project → Storage
2. Add Postgres (Neon)
3. Redeploy

### "Cannot create database directory"

This error means auto-detection failed. Check:
- `VERCEL` env var is set (automatic on Vercel)
- `POSTGRES_URL` is available from Vercel Postgres addon

### Testing LibSQL/Turso instead

```ts
// nuxt.config.ts
aiReady: {
  database: {
    type: 'libsql',
    url: process.env.TURSO_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
  }
}
```
