import type { HTMLAnchorElement } from 'happy-dom'
import { fileURLToPath } from 'node:url'
import { $fetch, setup } from '@nuxt/test-utils/e2e'
import { Window } from 'happy-dom'
import { describe, expect, it } from 'vitest'

describe('llms.txt directive in HTML', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../fixtures/basic', import.meta.url)),
    build: true,
    server: true,
    nuxtConfig: {
      aiReady: { llmsTxt: { directive: { html: true } } },
    },
  })

  it('links llms.txt first thing in the body', async () => {
    const html = await $fetch<string>('/about')
    const body = html.slice(html.indexOf('>', html.indexOf('<body')) + 1)
    expect(body).toMatch(/^<a href="\/llms\.txt"[^>]*>[^<]*llms\.txt<\/a>/)
  })

  it('keeps the link visually hidden and outside keyboard navigation', async () => {
    const html = await $fetch<string>('/about')
    const window = new Window()
    // Keep parsed HTML disconnected so resource links cannot start loads.
    const template = window.document.createElement('template')
    template.innerHTML = html
    const link = template.content.querySelector<HTMLAnchorElement>('a[data-llms-txt-directive]')!
    expect(link.getAttribute('href')).toBe('/llms.txt')
    expect(link.style.position).toBe('absolute')
    expect(link.style.width).toBe('1px')
    expect(link.style.height).toBe('1px')
    expect(link.style.overflow).toBe('hidden')
    expect(link.style.clip.replaceAll(/\s|px/g, '')).toBe('rect(0,0,0,0)')
    expect(link.tabIndex).toBe(-1)
  })
})
