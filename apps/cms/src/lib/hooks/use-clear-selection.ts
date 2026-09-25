import * as React from "react"

/**
 * Ticked rows never follow you invisibly.
 *
 * Whenever the search, a filter, the sort, the page or the rows-per-page
 * changes, the selection is emptied — so a "Delete (n)" button can only ever
 * mean rows that are on screen right now. Without this, ticking five rows and
 * then retyping the search leaves the button meaning the original five, some of
 * which are no longer visible.
 *
 * `listKey` is every value that changes what the table shows, joined into one
 * string. Deliberately collecting ticks across pages is given up on purpose:
 * that is the only way a bulk delete cannot quietly act on rows that moved out
 * from under it.
 */
export function useClearSelectionOnListChange(
  setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>,
  listKey: string
) {
  React.useEffect(() => {
    // Returning the same Set when nothing is ticked keeps the first run (and
    // any change made with an empty selection) from causing a render.
    setSelectedIds((current) => (current.size ? new Set() : current))
  }, [listKey, setSelectedIds])
}
