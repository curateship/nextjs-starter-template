/**
 * The one colour for anything pinned in Video: a pinned project row, a pinned
 * carousel project row and a pinned template's pin. It is the amber the shell
 * uses for a favourite (automation-inspector.tsx), so a pin and a favourite
 * read as the same idea. The theme has no colour of its own for this; one
 * would belong in the shell's theme.css, for every app at once.
 */

/** A pinned table row: tinted so it reads as pinned from across the list. */
export const PINNED_ROW_CLASS =
  "bg-amber-50 hover:bg-amber-100/70 dark:bg-amber-400/10 dark:hover:bg-amber-400/15"

/** The pin icon beside a pinned name. */
export const PINNED_ICON_CLASS = "text-amber-500 dark:text-amber-400"
