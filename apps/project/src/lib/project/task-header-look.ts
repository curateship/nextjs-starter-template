/** How the task headers' buttons look on My dashboard, a project page and a team's Tasks tab. */

/**
 * The task headers' buttons, as the shell's CRM header has them (the Admin 3
 * panel design): every button but New task takes the outline look, a white
 * fill and a light grey line of its own, and so does the search box. Put on
 * the row that holds the buttons.
 *
 * Every button has the search box's 10px corners, and a button showing only
 * its icon is a 32px square, as New task is (Tyler, 16 Nov 2026: "also need
 * to fix the ui here too", where Select, Filter and Views were 38px wide with
 * 8px corners beside the square New task). Filter and Views drop
 * their words under 896px of header, so they turn square there. The search
 * box's × sits inside the box, so it keeps its own size.
 *
 * "Only its icon" means no tag but icons inside, which CSS can see; bare
 * words are not tags. So a button of words ending in a dropdown arrow, as
 * mass select's "3 selected" is, is left at its own width: it was squeezed
 * to 32px and read "ected" (Tyler, 16 Nov 2026: "just fix the mass select").
 */
export const TASK_HEADER_BUTTONS =
  "flex min-w-0 shrink items-center gap-1.5 [&_button:not(.absolute)]:rounded-lg [&_button:not(.absolute):not(:has(>:not(svg))):not(:has(>.lucide-chevron-down))]:w-8 [&_button:not(.absolute):not(:has(>:not(svg))):not(:has(>.lucide-chevron-down))]:px-0 @max-4xl:[&_button[aria-label=Filter]]:w-8 @max-4xl:[&_button[aria-label=Filter]]:px-0 @max-4xl:[&_button:has(>.lucide-bookmark)]:w-8 @max-4xl:[&_button:has(>.lucide-bookmark)]:px-0 [&_[data-variant=ghost]]:border [&_[data-variant=ghost]]:bg-background [&_[data-variant=ghost]:hover]:bg-muted [&_[data-variant=ghost]]:border-zinc-200/60 [&_[data-variant=outline]]:border-zinc-200/60 [&_input]:border-zinc-200/60 dark:[&_[data-variant=ghost]]:border-zinc-700/60 dark:[&_[data-variant=outline]]:border-zinc-700/60 dark:[&_input]:border-zinc-700/60"

/**
 * Where a task header starts saving room: the search box narrows and the
 * Select and New task words drop, leaving their icons. A team's Tasks header
 * does it under 896px wide. My dashboard and a project page do it under
 * 1088px, since their tabs, and a project's members button, need more room.
 */
export type TaskHeaderNarrow = "normal" | "early"

export const NARROW_SEARCH: Record<TaskHeaderNarrow, string> = {
  normal: "sm:w-40 lg:w-48 @max-4xl:sm:w-38 @max-4xl:lg:w-38",
  early: "sm:w-40 lg:w-48 @max-[68rem]:sm:w-38 @max-[68rem]:lg:w-38",
}
export const NARROW_WORD: Record<TaskHeaderNarrow, string> = {
  normal: "@max-4xl:sr-only",
  early: "@max-[68rem]:sr-only",
}
/** A button whose word has dropped: a 32px square round its icon. */
export const NARROW_SQUARE: Record<TaskHeaderNarrow, string> = {
  normal: "@max-4xl:w-8 @max-4xl:px-0",
  early: "@max-[68rem]:w-8 @max-[68rem]:px-0",
}

/**
 * On a header that saves room early (My dashboard and a project page), Filter
 * and Views drop their words with Select and New task under 1088px, so the
 * row is never half words and half squares. Put beside `TASK_HEADER_BUTTONS`.
 */
export const TASK_HEADER_EARLY =
  "@max-[68rem]:[&_button[aria-label=Filter]>span]:sr-only @max-[68rem]:[&_button[aria-label=Filter]]:w-8 @max-[68rem]:[&_button[aria-label=Filter]]:px-0 @max-[68rem]:[&_button:has(>.lucide-bookmark)>span]:sr-only @max-[68rem]:[&_button:has(>.lucide-bookmark)]:w-8 @max-[68rem]:[&_button:has(>.lucide-bookmark)]:px-0"

/** The New task button's look in a task header, its word dropping with the header's. */
export const TASK_HEADER_NEW: Record<TaskHeaderNarrow, { button: string; word: string }> = {
  normal: { button: "@max-4xl:size-8 @max-4xl:px-0", word: "@max-4xl:hidden" },
  early: { button: "@max-[68rem]:size-8 @max-[68rem]:px-0", word: "@max-[68rem]:hidden" },
}
