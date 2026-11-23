export interface SearchHighlightSegment {
  text: string
  match: boolean
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Splits a suggestion's title into the parts that match what the visitor typed
 * and the parts that do not, so the dropdown can bold the matching text.
 *
 * Longer words are matched first, so a query like "pizza pizzeria" highlights
 * the whole of "Pizzeria" rather than only its first five letters.
 */
export function buildSearchHighlightSegments(text: string, query: string): SearchHighlightSegment[] {
  if (!text) return []

  const words = query
    .split(/\s+/)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)

  if (!words.length) return [{ text, match: false }]

  // One capture group, so `split` returns the matched words at the odd indexes.
  return text
    .split(new RegExp(`(${words.join('|')})`, 'gi'))
    .map((part, index) => ({ text: part, match: index % 2 === 1 }))
    .filter((segment) => segment.text !== '')
}
