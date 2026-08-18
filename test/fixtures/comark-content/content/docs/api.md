---
title: API Reference
description: Every option the module accepts.
---

# API Reference

Configuration lives in your Nuxt config.

## Options

| Option | Default | Notes |
| --- | --- | --- |
| `enabled` | `true` | Turns the module off wholesale |
| `debug` | `false` | Logs every indexed route |

## Example

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  aiReady: { debug: true },
})
```
