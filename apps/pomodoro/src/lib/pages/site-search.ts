export type SiteSearchResult = {
  type: string
  title: string
  snippet: string
  path: string
}

const SNIPPET_LENGTH = 180

/** A literal contains-match pattern; typed SQL wildcard characters stay literal. */
export function siteSearchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`
}

/** A short plain-text excerpt centred near the matching words. */
export function searchSnippet(text: string, query: string): string {
  const words = text.replace(/\s+/g, " ").trim()
  if (words.length <= SNIPPET_LENGTH) return words

  const matchAt = words.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  const start = Math.max(0, matchAt < 0 ? 0 : matchAt - 60)
  const end = Math.min(words.length, start + SNIPPET_LENGTH)
  return `${start > 0 ? "…" : ""}${words.slice(start, end).trim()}${end < words.length ? "…" : ""}`
}
