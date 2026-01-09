# Writing Guide

## Context Required

Before writing or rewriting content, check what's already available in conversation/files. **Only ask for what's missing:**

| Context | Why |
|---------|-----|
| **Sitemap URL** | Internal linking—need to know what pages exist |
| **Page type** | Marketing/landing vs technical docs vs tutorial |
| **Search terms** | SEO—what users type into Google to find this content |

**If context is missing, ask:**
> "I'm missing [X] to write this well. Can you provide [specific item]?"

Don't ask for everything—only what you can't infer or find.

<!-- SITEMAP: [Paste sitemap.xml content or URL here] -->
<!-- NAV_STRUCTURE: [Paste navigation structure here] -->
<!-- SEARCH_TERMS: [Target search queries for this page] -->

---

## Search Term Optimization

Target long-tail keywords—specific phrases with clear intent. "how to add meta tags nuxt 4" beats "meta tags" (less competition, higher intent, matches how devs actually search).

Optimize content structure for search terms without stuffing or unnatural language.

**Where search terms matter:**

| Element | Priority | How to use |
|---------|----------|------------|
| **H1 / Title** | Highest | Include primary term naturally |
| **H2 headings** | High | Use variations/related terms |
| **First paragraph** | High | Primary term in opening sentences |
| **Meta description** | Medium | Include term, focus on click appeal |
| **H3+ headings** | Lower | Long-tail variations, questions users ask |

**Natural placement rules:**
- Primary term: 1-2x in first 100 words, then only where natural
- Headings should read as useful navigation, not keyword lists
- If you'd cringe reading it aloud, rewrite it

**Heading structure for SEO:**

```markdown
# [Primary search term as natural title]

[Opening paragraph uses primary term naturally]

## [Related term / user question]

## [Another angle / variation]

### [Long-tail question users actually ask]
```

**Example:**

Search terms: `how to add meta tags nuxt 4`, `useSeoMeta example`, `nuxt dynamic meta tags per page`

```markdown
# How to Add Meta Tags in Nuxt               ← long-tail primary

Adding meta tags in Nuxt 4 takes one composable...

## useSeoMeta for static meta tags           ← specific method

## Dynamic meta tags per page                ← long-tail variation

### Meta tags not updating on navigation?    ← problem users search
```

**LLM search considerations:**

LLMs often append year and use question-based queries. Light touches help without being spammy:

- Mention year once naturally (intro or where version matters)
- Version numbers where relevant: "Nuxt 4", "Vue 3"
- Some H2s as questions users/LLMs ask
- "Recommended" when genuinely recommending something

Don't plaster "(2025)" everywhere or force question headings.

**Don't:**
- Repeat exact phrase in every heading
- Force terms where they don't fit
- Write headings for Google instead of humans
- Add "Nuxt" to every heading when context is obvious

**Do:**
- Use the term humans would actually search
- Let headings answer real questions
- Front-load important terms in headings
- Match search intent (tutorial vs reference vs troubleshooting)
- Include current year for time-sensitive topics

---

## Audience

Three segments, all developers:
- **Beginners (40%)**: Need guidance, want "guardrails," fear missing something
- **Intermediate (35%)**: Time-poor, want "just works," hate configuration
- **Experienced (25%)**: Want depth, customization, data ownership

Universal motivator: **saving time** on things they know they should do but can't prioritize.

---

## Reference Style: Stripe / Anthropic / Claude Code

These docs exemplify developer writing. Study them.

**Core patterns:**
- Task-oriented titles: "Create a sitemap" not "Understanding sitemaps"
- Code within first 3 scrolls
- Tables for parameters, not prose
- States limitations clearly
- Assumes reader intelligence—skip obvious setup

**Page structure:**
1. What it does (1 sentence)
2. Quickstart code
3. Options table (if applicable)
4. Edge cases / limitations
5. Related pages (internal links)

**Title patterns:**
| ✅ Good | ❌ Bad |
|---------|--------|
| Create a sitemap | Understanding sitemaps |
| Configure robots.txt | Working with robots.txt |
| Debug OG images | Troubleshooting OG image issues |

---

## Internal Linking

Link aggressively. Every page should link to 2-5 related pages.

**Two linking methods:**
1. **Inline links** — within content, first mention of features/concepts
2. **`relatedPages` frontmatter** — rendered automatically at page end

```yaml
relatedPages:
  - path: /learn-seo/vue/mastering-meta/descriptions
    title: Meta Descriptions
  - path: /docs/og-image/getting-started
    title: OG Image Setup
```

**When to inline link:**
- First mention of another feature/module
- Prerequisites ("Requires [Site Config](/docs/site-config/getting-started)")
- Alternatives ("For simpler cases, use [X](/docs/x)")

**Link text:**
| ✅ Good | ❌ Bad |
|---------|--------|
| Configure [robots.txt](/docs/robots) | [Click here](/docs/robots) for robots |
| See [OG Image docs](/docs/og-image) | See the docs [here](/docs/og-image) |

**Don't:**
- Link the same page twice in one section
- Link every mention—first mention only
- Use "click here" or "this page"
- Add "Related" or "See also" H2 sections—use frontmatter instead

---

## Banned (AI Slop)

**Words:** dive into, crucial, essential, vital, robust, seamless, leverage, utilize, ensure, comprehensive, harness, empower, elevate, unlock, game-changer, navigate, streamlined, synergy, best-in-class, delve, realm, landscape, tapestry, multifaceted, myriad, plethora, whilst, firstly, secondly, in conclusion

**Phrases:** "it's important to note", "in today's [X]", "whether you're a beginner or expert", "let's explore", "this is where X comes in", "at its core", "take X to the next level", "when it comes to", "plays a crucial role", "it's worth noting", "without further ado", "by the end of this guide", "in this article"

**Patterns:**
- Rhetorical questions
- Three-adjective chains ("powerful, flexible, and robust")
- Hedging ("might potentially", "could possibly")
- Superlatives without proof
- Filler intros before getting to the point

**Quick fixes:**
| Slop | Fix |
|------|-----|
| It's important to note that... | [just state it] |
| This allows you to... | You can... |
| In order to... | To... |
| It is recommended that... | Do X |
| provides a way to | lets you |
| is designed to / aims to | does |
| is intended to return | returns |

---

## Voice

- Developer-to-developer, casual but accurate
- First person plural for shared experience ("we"), second person for instructions ("you")
- Contractions allowed, exclamation marks rare
- Be specific to Nuxt—avoid copy that fits any SEO tool
- Say what NOT to do. Real experts know pitfalls.
- Vary sentence length. Some short. Others longer when explaining.

**Before/after:**

❌ AI slop:
> "In today's digital landscape, it's crucial to leverage comprehensive SEO strategies. Let's dive into how Nuxt SEO can help you unlock your site's potential."

✅ Fixed:
> "Most Nuxt sites ship with broken meta tags. Here's how to fix that in 2 minutes."

---

## Prompting AI

When using AI to draft content:

- Paste this guide in system prompt
- Ask for "rough draft with `[NEEDS: X]` placeholders for missing info"
- Tell AI: "Write like a tired senior dev explaining to a colleague, not a tutorial"
- Request: "One fact per sentence. No filler."

**Gap marking convention:**
```markdown
[STAT NEEDED: % of sites with X]
[VERIFY: does this work in Nuxt 4?]
[EXAMPLE NEEDED: real-world use case]
[LINK: internal link to related page]
```

This prevents hallucination and shows where to fill gaps.

---

## Problem-First Pages (Marketing, Intros, Landing)

**Core rules:**
1. Lead with problems/outcomes, not features. "Be the source AI cites" not "AI-ready structured data generation"
2. Explain why briefly—one sentence max before describing
3. Time-saving framing: "Catches X before it costs you traffic" / "Zero config"
4. Integration messaging: "Everything in one place" / "Works together out of the box"

**Structure:**
- **Headlines (≤10 words)**: [Problem solved] or [Outcome + minimal effort]
- **Descriptions (~20 words)**: [What it does] so [business impact]—[DX benefit]
- **Feature blocks**: Problem (1 sentence) → What it does (1-2 sentences) → Outcome

**Word substitutions:**
| Use | Avoid |
|-----|-------|
| guardrails, safety net | features, tools |
| catches [X] before... | detects [X] |
| zero config | easy setup |
| one install | full suite |

---

## Technical Pages (Docs, Guides, Recipes)

**Core rules:**
1. Open with facts, not introductions: "Meta descriptions don't affect rankings. They affect clicks."
2. State opinions: "This is lazy", "overkill for most sites", "don't bother"
3. Be specific: "Google rewrites 70%" not "search engines may modify"
4. Skip hedging: Say "do X" not "you may want to consider X"

**Required structure:**
```markdown
---
title: [Topic]
relatedPages:
  - path: /docs/related
    title: Related Page
  - path: /learn-seo/vue/another
    title: Another Page
---

[1-2 sentence opener: what it does + who it's for. Use case should be obvious.]

[Code for the 80% use case—no heading if one code block fits]

[If setup needs multiple steps, use a "Setup" section—not "Quick Setup"]

[Deeper content as needed]

[Mention limitations/overkill inline where relevant, not in dedicated section]
```

**Related pages:** Use `relatedPages` frontmatter, not a "Related" H2 section. The template renders these automatically.

**Don't add:**
- "Best practices" sections
- "✅ When to use" / "❌ When not to use" blocks
- Dedicated decision sections—the intro makes use case clear

**Code examples:**
- Use `::code-group` for multiple approaches
- Show ❌ Bad / ✅ Good comparisons
- Use real URLs (nuxtseo.com) not example.com
- TypeScript, not JavaScript
- Inline code needs language: `doSomething()`{lang="ts"}, `<MyComponent>`{lang="html"}, `nuxt.config.ts`{lang="bash"}

**Parameter docs—use tables:**
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `enabled` | `boolean` | `true` | Generate sitemap |

Not: "The enabled prop is a boolean that defaults to true and controls whether..."

---

## Personality (Use Sparingly)

- Personal preferences: "I'd recommend...", "One of my favourite ways..."
- Call out laziness: "Template descriptions are lazy"
- Admit limitations: "can be annoying to learn", "might be overkill"
- Reference @harlan_zw, Unlighthouse, RequestIndexing where relevant

---

## Quality Tests

1. **"So what?" test**: After every sentence, reader shouldn't think "so what?" If they might, cut or add implication.
2. **Read aloud test**: If it sounds like a press release, rewrite.
3. **Delete test**: If you can remove a sentence without losing meaning, remove it.
4. **Information density**: Every sentence adds new info. No filler.

---

## Endings

**Don't write:**
- "Now you're ready to..."
- "Happy coding!"
- "And that's it!"
- "In conclusion..."

**Do:** Just stop. Or link to next logical action.

---

## Pre-Publish Checklist

**Structure:**
- [ ] Opener makes use case obvious (no separate "when to use" section)
- [ ] Code within first 3 scrolls
- [ ] Parameters in tables, not prose

**Links:**
- [ ] `relatedPages` frontmatter with 2-3 related pages
- [ ] Inline links on first mention of features/concepts
- [ ] Descriptive link text (no "click here")

**SEO:**
- [ ] Search terms identified for page
- [ ] Primary term in H1 and first paragraph
- [ ] H2s use variations/related terms naturally
- [ ] Headings read as navigation, not keyword lists

**Content:**
- [ ] States what NOT to do / when it's overkill
- [ ] Includes verification method (how to test it works)
