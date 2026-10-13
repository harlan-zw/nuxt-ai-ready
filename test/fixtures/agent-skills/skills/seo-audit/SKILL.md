---
name: seo-audit
description: Audit a site for critical SEO issues.
---

# SEO audit

Inspect indexability, metadata, canonical URLs, and structured data.

Bundlers rewrite these expressions in code, so the served file must keep them as written:

```ts
if (import.meta.server && import.meta.env.SSR && !import.meta.dev)
  console.log(import.meta.client, import.meta.prerender, process.env.NODE_ENV)
```
