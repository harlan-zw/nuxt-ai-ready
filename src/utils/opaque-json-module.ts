/**
 * Source of a module that exports JSON values the bundler cannot rewrite.
 *
 * Nitro's define replacement rewrites expressions such as
 * `import.meta.server` anywhere in a module's text, string literals included.
 * A SKILL.md that quoted one was served with different bytes than its index
 * digest covers, or broke the build. Base64 text contains no such expression.
 */
export function opaqueJsonModule(exports: Record<string, unknown>): string {
  const encode = (value: unknown) => JSON.stringify(Buffer.from(JSON.stringify(value), 'utf8').toString('base64'))
  return [
    'const decode = value => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), char => char.charCodeAt(0))))',
    ...Object.entries(exports).map(([name, value]) => `export const ${name} = decode(${encode(value)})`),
  ].join('\n')
}
