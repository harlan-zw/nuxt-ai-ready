export function supportsSitemapStreamingParser(version: string | undefined): boolean {
  const match = /^(\d+)\.(\d+)/.exec(version || '')
  if (!match)
    return false

  const major = Number(match[1])
  const minor = Number(match[2])
  return major > 8 || (major === 8 && minor >= 3)
}
