import type * as React from "react"

/**
 * One click anywhere on a List heading folds or opens it (Tyler, 28 Oct 2026:
 * "Make section one click to uncollapsed"). A click on the heading's own
 * buttons does only that. A click inside a dropdown opened from the heading,
 * such as New task from its "+", reaches here through React but sits outside
 * the heading on the page, so it is left alone.
 */
export function foldOnHeadingClick(toggle: () => void) {
  return (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return
    if (target.closest("button, a, input")) return
    toggle()
  }
}

/** The pointer a heading shows, since the whole heading is a press. */
export const FOLDING_HEADING_CLASS = "cursor-pointer select-none"
