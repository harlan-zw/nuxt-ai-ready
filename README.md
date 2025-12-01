# Nuxt AI Ready

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Nuxt][nuxt-src]][nuxt-href]

> Best practice AI & LLM discoverability for Nuxt sites 

## Why Nuxt AI Ready?

Search is changing. Outside of search engines, people now get answers directly from [ChatGPT](https://chatgpt.com/), [Claude](https://claude.ai/), and other AI assistants. When these LLMs answer questions about topics related to your site, you want your content to be the source they cite
to drive traffic and engagement back to you.

For that to happen, AI systems need to understand your content. New standards are being shaped like [llms.txt](https://llmstxt.org/) for discoverability and [MCP](https://modelcontextprotocol.io/) for letting agents query your site directly. But these standards are still evolving, and implementing them correctly
can be complex and time-consuming.

- **📈 Increase citations by LLMs**: AI assistants pull from sources they can parse easily. Structured, AI-friendly content gets referenced more often.
- **🔗 Direct site queries for LLMs**: MCP support means assistants can pull live data from you, not just static snippets from their training.

Nuxt AI Ready converts your indexable pages into clean markdown that AI systems can consume, generates the right artifacts at build time, and serves AI-friendly formats to bots automatically.

## Features

- 📄 **llms.txt Generation**: Auto-generates `llms.txt` and `llms-full.txt` at build time
- 🚀 **On-Demand Markdown**: Any route available as `.md` (e.g., `/about` → `/about.md`)
- 🤖 **Smart Bot Detection**: Serves markdown to AI crawlers automatically
- 📡 **Content Signals**: Help AI systems understand how to use your pages
- 📦 **RAG-Ready Output**: Chunked content for semantic search and AI chat pipelines
- ⚡ **MCP Integration**: Let AI agents query your site directly

## Installation

Install `nuxt-ai-ready` dependency to your project:

```bash
npx nuxi@latest module add nuxt-ai-ready
```

## Documentation

[📖 Read the full documentation](https://nuxtseo.com/ai-ready) for more information.

## Sponsors

<p align="center">
  <a href="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
    <img src='https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg'/>
  </a>
</p>

## License

This module requires a [Nuxt SEO Pro license](https://nuxtseo.com/pro), see [LICENSE](https://github.com/harlan-zw/nuxt-ai-ready/blob/main/LICENSE) for full details.

<!-- Badges -->
[npm-version-src]: https://img.shields.io/npm/v/nuxt-ai-ready/latest.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-version-href]: https://npmjs.com/package/nuxt-ai-ready

[npm-downloads-src]: https://img.shields.io/npm/dm/nuxt-ai-ready.svg?style=flat&colorA=18181B&colorB=28CF8D
[npm-downloads-href]: https://npmjs.com/package/nuxt-ai-ready

[nuxt-src]: https://img.shields.io/badge/Nuxt-18181B?logo=nuxt
[nuxt-href]: https://nuxt.com
