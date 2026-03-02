# Nuxt AI Ready

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Nuxt][nuxt-src]][nuxt-href]

> Best practice AI & LLM discoverability for Nuxt sites

## Why Nuxt AI Ready?

ChatGPT search interest doubled in the past year. Users now ask AI assistants questions your site could answer—but LLMs only cite sources they can parse.

Two standards are emerging: [llms.txt](https://llmstxt.org/) (4,400 searches/mo, +26,900% YoY) for AI-readable site summaries, and [MCP](https://modelcontextprotocol.io/) (22,200 searches/mo) for letting agents query your content directly.

Nuxt AI Ready implements both. It converts your pages to markdown, generates llms.txt at build time, and exposes an MCP server for AI agents to search your site.

## Features

- 📄 **llms.txt Generation**: Auto-generate `llms.txt` and `llms-full.txt` with page metadata and full markdown content
- 🚀 **On-Demand Markdown**: Any route available as `.md` (e.g., `/about` → `/about.md`), automatically served to AI crawlers
- 📡 **Content Signals**: Configure AI training/search/input permissions via [Nuxt Robots](https://nuxtseo.com/robots)
- 🌐 **Sitemap Integration**: Index AI-allowed pages via [Nuxt Sitemap](https://nuxtseo.com/sitemap)
- ⚡ **MCP Server**: `list_pages` and `search_pages` tools with FTS5 full-text search
- 🗄️ **Runtime Indexing**: Index pages on-demand without prerendering, with SQLite/D1/LibSQL support
- 🔔 **[IndexNow](https://nuxtseo.com/ai-ready/guides/indexnow)**: Instantly notify Bing, Yandex, and other search engines when pages change
- 🧠 **[RAG Ready](https://nuxtseo.com/ai-ready/advanced/rag-example)**: Markdown output optimized for vectorizing and semantic search

## Installation

Install `nuxt-ai-ready` dependency to your project:

```bash
npx nuxi@latest module add nuxt-ai-ready
```

> [!TIP]
> Generate an Agent Skill for this package using [skilld](https://github.com/harlan-zw/skilld):
> ```bash
> npx skilld add nuxt-ai-ready
> ```

## Documentation

[📖 Read the full documentation](https://nuxtseo.com/ai-ready) for more information.

## Sponsors

<p align="center">
  <a href="https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg">
    <img src='https://raw.githubusercontent.com/harlan-zw/static/main/sponsors.svg' alt="Sponsors"/>
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
