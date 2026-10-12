# Nuxt AI Ready Basic Example

A minimal Nuxt app with [Nuxt AI Ready](https://nuxtseo.com/docs/ai-ready/getting-started/introduction).

```bash
pnpm install
pnpm dev
```

While the dev server runs, request `llms.txt` and the Markdown version of `/about`:

```bash
curl http://localhost:3000/llms.txt
curl http://localhost:3000/about.md
curl -L -H 'Accept: text/markdown' http://localhost:3000/about
```

Run `pnpm generate` to write `llms-full.txt` with the full Markdown of each prerendered page.
