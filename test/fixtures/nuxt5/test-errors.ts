import assert from 'node:assert/strict'

export async function verifyErrorRepresentations(origin: string): Promise<void> {
  const missingHtml = await fetch(`${origin}/unrelated-missing-route`, { headers: { accept: 'text/html' } })
  assert.equal(missingHtml.status, 404, 'HTML rendering must preserve the missing page status')
  assert.match(missingHtml.headers.get('content-type') || '', /text\/html/)
  const missingMarkdown = await fetch(`${origin}/unrelated-missing-route.md`)
  assert.equal(missingMarkdown.status, 404, 'Markdown conversion must preserve the missing page status')
  assert.match(await missingMarkdown.text(), /Page not found/)
  const disabledSkill = await fetch(`${origin}/skills/internal/SKILL.md`)
  assert.equal(disabledSkill.status, 404, 'Disabled Agent Skills must not publish source files')
  assert.doesNotMatch(await disabledSkill.text(), /private-fixture-skill-source/)
}
