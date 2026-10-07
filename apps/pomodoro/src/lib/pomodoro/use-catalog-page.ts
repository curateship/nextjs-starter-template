import * as React from "react"

/** How many cards one page of a picker shows: two rows of four. */
const CATALOG_PER_PAGE = 8

/**
 * One page of a picker's cards, and where that page is. The Sounds and Theme
 * pages both page their cards this way, so they count and turn the same.
 */
export function useCatalogPage<T>(items: readonly T[]) {
  const [page, setPage] = React.useState(0)
  const pages = Math.max(1, Math.ceil(items.length / CATALOG_PER_PAGE))
  const first = page * CATALOG_PER_PAGE
  return {
    page,
    pages,
    first,
    shown: items.slice(first, first + CATALOG_PER_PAGE),
    setPage,
  }
}
