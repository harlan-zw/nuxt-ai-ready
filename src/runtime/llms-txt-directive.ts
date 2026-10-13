const RE_FRONTMATTER = /^\uFEFF?---[\t ]*\r?\n(?:[\s\S]*?\r?\n)?---[\t ]*(?:\r?\n|$)/

/** The line that points a reader of one page at the whole site's index. */
export function llmsTxtDirective(llmsTxtUrl: string): string {
  return `> Index of every page on this site: [llms.txt](${llmsTxtUrl})`
}

/**
 * Add the llms.txt directive near the top of a page's Markdown, after any
 * frontmatter so YAML parsers still find it first. An agent that lands on one
 * page then knows where the full index is.
 */
export function insertLlmsTxtDirective(markdown: string, llmsTxtUrl: string): string {
  const directive = llmsTxtDirective(llmsTxtUrl)
  const frontmatter = markdown.match(RE_FRONTMATTER)?.[0] ?? ''
  const body = markdown.slice(frontmatter.length).replace(/^(?:\r?\n)+/, '')
  if (body === directive || body.startsWith(`${directive}\n`) || body.startsWith(`${directive}\r\n`))
    return markdown
  return `${frontmatter}${frontmatter ? '\n' : ''}${directive}\n\n${body}`
}

/** Marks the injected HTML link so Markdown conversion can drop it again. */
const RE_DIRECTIVE_HTML = /<a [^>]*data-llms-txt-directive[^>]*>[^<]*<\/a>/g

/**
 * The HTML equivalent: a link at the top of the body, hidden visually but
 * kept for screen readers and agents that read the raw HTML.
 */
export function llmsTxtDirectiveHtml(llmsTxtPath: string): string {
  return `<a href="${llmsTxtPath}" tabindex="-1" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0" data-llms-txt-directive>Index of every page on this site: llms.txt</a>`
}

/** Remove the injected HTML link, so a page's Markdown carries the directive once. */
export function stripLlmsTxtDirectiveHtml(html: string): string {
  return html.replace(RE_DIRECTIVE_HTML, '')
}
