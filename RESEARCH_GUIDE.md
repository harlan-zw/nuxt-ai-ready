# Research Guide

Use this guide when researching topics for articles. Point to an article path and this guide will help gather accurate, sourced information while adhering to the Writing Guide.

---

## Context Required

Before researching, check what's available. **Prompt if missing:**

| Context | Why |
|---------|-----|
| **Sitemap URL** | Understand existing content, identify gaps, internal linking opportunities |
| **Article path** | The specific article to research/improve |
| **Content pillars** | Core topics the site covers—ensures research aligns with site strategy |

> "I need the sitemap to understand your content structure. Can you provide the sitemap URL or paste its contents?"

<!-- SITEMAP: [Paste sitemap.xml content or URL here] -->

---

## Content Pillars

Content pillars are the core topics your site owns. All content should ladder up to these.

**Identify pillars from sitemap:**
1. Look at top-level `/docs/` sections
2. Note `/learn/` category groupings
3. Identify recurring themes across pages

**For nuxtseo.com, likely pillars:**
- Meta tags & SEO fundamentals
- Technical SEO (sitemaps, robots, structured data)
- Performance & Core Web Vitals
- OG images & social sharing
- Nuxt-specific SEO patterns

**When researching, ask:**
- Does this article support an existing pillar?
- Is there a gap in pillar coverage?
- Should this become a new pillar? (rare—needs 5+ articles to justify)

**Suggest new content when:**
- Keyword research reveals high-volume gaps in pillar coverage
- Existing articles reference topics with no dedicated page
- User questions/search terms have no matching content

**Track opportunities in `content/todo.md`:**
As you research articles, add missed opportunities to `content/todo.md`. Prioritize by keyword volume/difficulty. Another LLM will pick these up later.

```markdown
## In content/todo.md

- [ ] **Article Title** (`/path/to/article.md`)
  - Target: "keyword" (volume/mo, difficulty)
  - Cover: [what to include]
  - Link from: [existing pages]
```

---

## Keyword Research (DataForSEO)

Before writing, find the best long-tail keywords to target using DataForSEO API.

**Check cache first:** Read `dataforseo.md` before making API calls. If the keyword data exists and is recent (within 30 days), use cached data. After fetching new data, append results to `dataforseo.md`.

**Credentials:**
```
Authorization: Basic aGFybGFuQGhhcmxhbnp3LmNvbTpkYTc1Mzg3NDQxYjg5ZTlj
```

**Keyword suggestions endpoint:**
```bash
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/keyword_suggestions/live" \
  -H "Authorization: Basic aGFybGFuQGhhcmxhbnp3LmNvbTpkYTc1Mzg3NDQxYjg5ZTlj" \
  -H "Content-Type: application/json" \
  -d '[{"keyword": "nuxt meta tags", "location_code": 2840, "language_code": "en", "include_seed_keyword": true, "limit": 20}]'
```

**Related keywords endpoint:**
```bash
curl -X POST "https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live" \
  -H "Authorization: Basic aGFybGFuQGhhcmxhbnp3LmNvbTpkYTc1Mzg3NDQxYjg5ZTlj" \
  -H "Content-Type: application/json" \
  -d '[{"keyword": "nuxt seo", "location_code": 2840, "language_code": "en", "limit": 20}]'
```

**What to look for:**
- `keyword` — the search term
- `search_volume` — monthly searches (prefer 100-1000 for long-tail)
- `keyword_difficulty` — lower is easier to rank (aim <40)
- `cpc` — higher CPC often means commercial intent

**Workflow:**
1. Check `dataforseo.md` for existing keyword data
2. If missing/stale, fetch from API and append to `dataforseo.md`
3. Pick 3-5 long-tail keywords with decent volume + low difficulty
4. Pass these to writing as `<!-- SEARCH_TERMS: ... -->`

---

## Research Workflow

```
1. Get sitemap—prompt if missing
2. Identify which content pillar this supports
3. Check dataforseo.md for cached keyword data
4. If missing/stale, fetch from API and append to dataforseo.md
5. Read the target article
6. Identify claims needing verification/sources
7. Research each claim using web search
8. Find statistics, official docs, and authoritative sources
9. Update article with sourced information + target keywords
10. Add relatedPages frontmatter
11. Update content/todo.md with content gaps found
12. Add [NEEDS VERIFICATION] for anything unconfirmed
```

---

## Invoking Research

When asked to research an article:

```markdown
Research and improve: /content/learn-seo/nuxt/0.mastering-meta/0.index.md
```

**Steps to follow:**

1. **Read the article** — understand current content and claims
2. **List research gaps** — unsourced stats, outdated info, missing context
3. **Search for each gap** — use WebSearch, prioritize primary sources
4. **Update inline** — add sources, fix inaccuracies, mark unknowns
5. **Cross-reference Writing Guide** — ensure style compliance

---

## Source Priority

| Priority | Source Type | Example |
|----------|-------------|---------|
| 1 | Official docs | Google Search Central, MDN, framework docs |
| 2 | Primary research | Google studies, industry reports |
| 3 | Notable ecosystem voices | Core team members, library authors, recognized experts |
| 4 | Authoritative blogs | web.dev, developers.google.com |
| 5 | Reputable tech sites | Moz, Ahrefs (for SEO), Smashing Magazine |
| 6 | Community consensus | Stack Overflow (high-voted), GitHub discussions |

**Find notable voices for the topic:**
- Check who maintains the relevant libraries/frameworks
- Look for core team members on Twitter/GitHub
- Prioritize authors who contribute code, not just content

**Vue/Nuxt ecosystem examples:**
- Anthony Fu (@antfu7) — Nuxt/Vue core, VueUse
- Daniel Roe (@danielroe) — Nuxt lead
- Eduardo San Martin (@posva) — Vue Router, Pinia
- Sébastien Chopin (@atinux) — Nuxt creator
- Evan You — Vue creator

**Avoid:** Generic dev tutorial sites (tutorialspoint, w3schools, geeksforgeeks), Medium posts without known authors, outdated articles (>2 years for SEO), content farms, AI-generated summaries.

---

## Claim Types & Research Approach

### Statistics
- Find primary source, not articles citing it
- Include year/date of study
- Note sample size if relevant
- Mark outdated stats with `[STAT: year]`

```markdown
<!-- Research needed -->
[STAT NEEDED: % of sites with broken meta tags]

<!-- After research -->
70% of meta descriptions are rewritten by Google (Portent, 2020)
```

### Technical Facts
- Verify against official documentation
- Check if behavior changed in recent versions
- Note version-specific behavior

```markdown
<!-- Research query -->
"Google meta description length 2024"
"Nuxt 4 useSeoMeta changes"
```

### Best Practices
- Distinguish between "Google says" vs "SEO community consensus"
- Link to official guidance when available
- Note when practices are debated

---

## Source Formatting

### Inline Citations
For stats and specific claims, cite inline:

```markdown
Google rewrites 70% of meta descriptions ([Portent study](https://www.portent.com/blog/seo/how-google-treats-meta-descriptions.htm)).
```

### Reference Links
For general background, use reference-style:

```markdown
See [Google's documentation on meta descriptions][meta-docs] for official guidance.

[meta-docs]: https://developers.google.com/search/docs/appearance/snippet
```

### Official Docs
Always link to official docs for Nuxt/Vue/web platform features:

```markdown
The `useSeoMeta` composable ([docs](/docs/seo-utils/api/use-seo-meta)) handles...
```

---

## Research Markers

Use these markers for gaps during research:

```markdown
[VERIFY: claim about X - check official docs]
[STAT NEEDED: specific statistic to find]
[SOURCE NEEDED: claim requires authoritative source]
[OUTDATED: info from YYYY - needs update]
[CONFLICTING: sources disagree - investigate]
```

---

## Search Queries

### Effective Query Patterns

| Topic | Query Pattern |
|-------|---------------|
| Current best practice | `"[topic] best practices 2025 site:web.dev OR site:developers.google.com"` |
| Official stance | `"[topic] site:developers.google.com OR site:support.google.com"` |
| Statistics | `"[topic] statistics study research"` |
| Nuxt-specific | `"[topic] site:nuxt.com OR site:github.com/nuxt"` |
| Vue-specific | `"[topic] site:vuejs.org"` |

### Search Operators
- `site:` — limit to domain
- `"exact phrase"` — exact match
- `after:2023-01-01` — recent content only
- `-site:medium.com` — exclude unreliable sources

---

## Verification Checklist

Before updating an article:

- [ ] All statistics have sources and dates
- [ ] Technical claims verified against official docs
- [ ] Links tested and working
- [ ] No sources older than 2 years (for SEO/web topics)
- [ ] Conflicting information noted and resolved
- [ ] Nuxt version compatibility confirmed

---

## Output Format

After researching, provide:

```markdown
## Research Summary

**Article:** [path]
**Researched:** [date]

### Verified Claims
- [claim] — [source with link]

### Updated Information
- [what changed] — [old info] → [new info] ([source])

### Needs Further Verification
- [claim] — [why unclear, conflicting sources, etc.]

### Suggested Additions
- [topic] — [why it's relevant, source]
```

---

## Example Research Session

**Task:** Research `/content/learn-seo/nuxt/0.mastering-meta/descriptions.md`

**Process:**
1. Read article, note claims: "Google rewrites most meta descriptions"
2. Search: `"google meta description rewrite percentage study"`
3. Find: Portent study (2020) says 70%, Ahrefs study says 62.78%
4. Verify recency: Both studies pre-2023, search for newer data
5. Find: No major new studies, note the range
6. Update article:

```markdown
Google rewrites 60-70% of meta descriptions
([Portent](https://portent.com/...), [Ahrefs](https://ahrefs.com/...)).
```

---

## Integration with Writing Guide

Research should support Writing Guide principles:

| Writing Guide Rule | Research Implication |
|--------------------|---------------------|
| "Open with facts" | Research verifiable opening statements |
| "Be specific" | Find exact numbers, not vague claims |
| "State what NOT to do" | Research common mistakes and anti-patterns |
| "Say when it's overkill" | Research when simpler solutions exist |
| "No hedging" | Only include well-sourced, confident claims |

---

## Quick Reference

```
# Start research
Get sitemap (prompt if missing)
Identify content pillar
DataForSEO keyword research for topic
Read [article path]
List claims needing sources
WebSearch for each claim
Update with inline citations + target keywords
Suggest content gaps if found
Mark unknowns with [VERIFY: ...]
Cross-check Writing Guide
```
