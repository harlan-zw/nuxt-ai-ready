/** Keep plain metadata literal when Markdown allows inline HTML. */
export function escapeMarkdownHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
