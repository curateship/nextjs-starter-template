/**
 * Builds the Postgres `to_tsquery` expression that site search runs against
 * `site_search_documents.search_vector`.
 *
 * Every word becomes a prefix term (`'pizz':*`), so a half-typed word still
 * matches: typing "pizz" finds "Pizzeria Roma". Words are joined with AND, so
 * each extra word narrows the results.
 *
 * Each word is wrapped in single quotes and stripped of the only two characters
 * that could break out of those quotes (`'` and `\`). Nothing a visitor types
 * can become a tsquery operator such as `|` (or) or `!` (not), which would
 * otherwise change what the search means.
 *
 * Returns an empty string when no usable word is left. Callers treat that as
 * "no results" and skip the database entirely, rather than asking Postgres to
 * match an empty query that can never hit anything.
 */
export function buildSiteSearchTsQuery(query: string) {
  return query
    .split(/\s+/)
    .map((word) => word.replace(/['\\]/g, ''))
    .filter(Boolean)
    .map((word) => `'${word}':*`)
    .join(' & ')
}
