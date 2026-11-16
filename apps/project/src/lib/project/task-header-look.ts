/** How the task headers' buttons look on My dashboard, a project page and a team's Tasks tab. */

/**
 * The task headers' buttons, as the shell's CRM header has them (the Admin 3
 * panel design): every button but New task takes the outline look, a white
 * fill and a light grey line of its own, and so does the search box. Put on
 * the row that holds the buttons.
 */
export const TASK_HEADER_BUTTONS =
  "flex min-w-0 shrink items-center gap-1 [&_[data-variant=ghost]]:border [&_[data-variant=ghost]]:bg-background [&_[data-variant=ghost]:hover]:bg-muted [&_[data-variant=ghost]]:border-zinc-200/60 [&_[data-variant=outline]]:border-zinc-200/60 [&_input]:border-zinc-200/60 dark:[&_[data-variant=ghost]]:border-zinc-700/60 dark:[&_[data-variant=outline]]:border-zinc-700/60 dark:[&_input]:border-zinc-700/60"

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

/** The New task button's look in a task header, its word dropping with the header's. */
export const TASK_HEADER_NEW: Record<TaskHeaderNarrow, { button: string; word: string }> = {
  normal: { button: "ml-1 @max-4xl:size-8 @max-4xl:px-0", word: "@max-4xl:hidden" },
  early: { button: "ml-1 @max-[68rem]:size-8 @max-[68rem]:px-0", word: "@max-[68rem]:hidden" },
}
