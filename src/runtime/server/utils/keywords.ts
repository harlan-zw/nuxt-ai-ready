// Simple keyword extractor - English only, no dependencies
// Based on keyword-extractor but simplified for our use case

const STOPWORDS = new Set([
  // Articles, pronouns, prepositions
  'a', 'an', 'the', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  'this', 'that', 'these', 'those', 'who', 'whom', 'which', 'what', 'whose',
  'in', 'on', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'out', 'off',
  'over', 'under', 'again', 'further', 'then', 'once', 'of',
  // Conjunctions
  'and', 'but', 'or', 'nor', 'so', 'yet', 'both', 'either', 'neither', 'not', 'only',
  'if', 'when', 'where', 'why', 'how', 'because', 'as', 'until', 'while', 'although', 'though',
  // Common verbs
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having',
  'do', 'does', 'did', 'doing', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'get', 'gets', 'got', 'getting',
  'make', 'makes', 'made', 'making', 'go', 'goes', 'went', 'going', 'gone',
  'take', 'takes', 'took', 'taking', 'taken', 'come', 'comes', 'came', 'coming',
  'see', 'sees', 'saw', 'seeing', 'seen', 'know', 'knows', 'knew', 'knowing', 'known',
  'think', 'thinks', 'thought', 'thinking', 'want', 'wants', 'wanted', 'wanting',
  'use', 'uses', 'using', 'find', 'finds', 'found', 'finding', 'give', 'gives', 'gave', 'giving', 'given',
  'tell', 'tells', 'told', 'telling', 'say', 'says', 'said', 'saying',
  'let', 'lets', 'put', 'puts', 'keep', 'keeps', 'kept', 'keeping',
  // Adverbs & misc
  'very', 'really', 'just', 'also', 'still', 'even', 'now', 'here', 'there',
  'always', 'never', 'sometimes', 'often', 'usually', 'already', 'soon',
  'more', 'most', 'less', 'least', 'much', 'many', 'few', 'some', 'any', 'no', 'all', 'each', 'every',
  'other', 'another', 'such', 'same', 'different', 'own', 'well', 'back', 'way',
  'new', 'old', 'first', 'last', 'next', 'good', 'best', 'better', 'bad', 'worst', 'worse',
  'right', 'left', 'high', 'low', 'long', 'short', 'big', 'small', 'great', 'little',
  // Common web/doc terms
  'click', 'page', 'link', 'see', 'read', 'learn', 'view', 'example', 'following',
  'http', 'https', 'www', 'com', 'org', 'html', 'css', 'js',
  // Single chars and numbers
  ...'abcdefghijklmnopqrstuvwxyz'.split(''),
])

/**
 * Extract keywords from text using word frequency
 */
export function extractKeywords(text: string, metaKeywords?: string, max = 10): string[] {
  // Use meta keywords if available
  if (metaKeywords) {
    return metaKeywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, max)
  }

  if (!text?.trim())
    return []

  // Tokenize: lowercase, split on non-word chars, filter
  const words = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))

  // Count frequency
  const freq = new Map<string, number>()
  for (const word of words)
    freq.set(word, (freq.get(word) || 0) + 1)

  // Sort by frequency, take top N
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word)
}

/**
 * Strip markdown formatting to get plain text
 */
export function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`[^`]+`/g, '') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '') // images
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, '$1') // emphasis
    .replace(/<[^>]+>/g, '') // html
    .replace(/\s+/g, ' ')
    .trim()
}
