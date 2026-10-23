"use client"

import { useEffect, type Dispatch, type SetStateAction } from "react"

/**
 * Changing what a list shows always sends you back to page 1.
 *
 * Without this, searching while you are on page 3 leaves you on page 3 of a
 * four-row result — an empty table that looks like the search found nothing.
 * The same goes for a filter, the sort or the site you are looking at.
 *
 * `listKey` is every value that changes what the table shows, joined into one
 * string — but never the page itself, because resetting on a page change would
 * undo the page you just clicked. Its sibling `useClearSelectionOnListChange`
 * takes the same key *with* the page appended, since ticks must not survive a
 * page change either.
 */
export function useResetPageOnListChange(
  setCurrentPage: Dispatch<SetStateAction<number>>,
  listKey: string
) {
  useEffect(() => {
    // Returning the same value when already on page 1 keeps the first run (and
    // any change made from page 1) from causing a render.
    setCurrentPage((current) => (current === 1 ? current : 1))
  }, [listKey, setCurrentPage])
}
