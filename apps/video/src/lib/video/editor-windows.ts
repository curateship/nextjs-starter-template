/**
 * How the editor knows a project is already open in another window. Shared by
 * the window that writes its row and the server that reads the rows back, so
 * the two can never disagree about how long a window counts as open.
 */

/** How often an open editor window says it is still there. */
export const EDITOR_WINDOW_CHECK_IN_MS = 15_000

/**
 * How long a window that has stopped checking in still counts as open.
 *
 * Six check-ins' worth, because a browser slows the timers of a tab left in
 * the background to about one a minute. Anything shorter would have a window
 * minimised on the other screen flicker in and out of being "open".
 */
export const EDITOR_WINDOW_GONE_AFTER_MS = 90_000

/** A window either saves what is done in it, or it only shows the project. */
export const EDITOR_WINDOW_MODES = ["edit", "view"] as const
export type EditorWindowMode = (typeof EDITOR_WINDOW_MODES)[number]

/** What a window hears back each time it checks in. */
export type EditorWindowCheckIn = {
  /** When each other window editing this project was opened, oldest first. */
  others_editing: string[]
}
