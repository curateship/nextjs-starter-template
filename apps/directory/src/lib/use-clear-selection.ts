"use client"

import { useEffect, type Dispatch, type SetStateAction } from "react"

export interface ClearableSelection {
  setSelectedIds: Dispatch<SetStateAction<Set<string>>>
  setAllSelected: Dispatch<SetStateAction<boolean>>
}

/**
 * Ticked rows never follow you invisibly.
 *
 * Whenever the search, a filter, the sort, the page, the rows-per-page or the
 * site changes, the selection is emptied — so a "Delete (n)" button can only
 * ever mean rows that are on screen right now. Without this, ticking five rows
 * and then retyping the search leaves the button meaning the original five,
 * some of which are no longer visible.
 *
 * `listKey` is every value that changes what the table shows, joined into one
 * string. Collecting ticks across pages is given up on purpose: that is the
 * only way a bulk delete cannot quietly act on rows that moved out from under
 * it. A refetch with the same key (after a delete, say) leaves the remaining
 * ticks alone, because the key describes the query and not the rows.
 *
 * Ported from custom-shell's `lib/use-clear-selection.ts`, taking directory's
 * selection object so its extra "all pages selected" flag clears alongside.
 */
export function useClearSelectionOnListChange(
  selection: ClearableSelection,
  listKey: string
) {
  const { setSelectedIds, setAllSelected } = selection

  useEffect(() => {
    // Returning the same value when nothing is ticked keeps the first run (and
    // any change made with an empty selection) from causing a render.
    setSelectedIds((current) => (current.size ? new Set() : current))
    setAllSelected((current) => (current ? false : current))
  }, [listKey, setAllSelected, setSelectedIds])
}
