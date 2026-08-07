import { appServerOptions } from "@/app/server-options"
import type { AutomationExecutor } from "@/server/automations/executors"

/**
 * The same idea as `src/lib/app-options.ts`, for the answers that can only run
 * on the server.
 *
 * Most of what an app changes about the shell is drawing and wording, and that
 * belongs in the other file, which the browser is allowed to see. Some of it
 * is work — reaching the database, sending something, calling somebody's API —
 * and that must never cross into the browser bundle. So it gets its own pair of
 * files on this side of the line, read only by `src/lib/api/*`,
 * `src/routes/api/**` and `src/server/*`.
 *
 * Everything the other file says still holds: the shell owns the list, the app
 * writes its answers in `src/app/server-options.ts`, neither side is ever in
 * the other's file, and anything not offered here is a compile error rather
 * than a quiet fork.
 */
export type AppServerOptions = {
  automations?: AutomationServerOptions
}

type AutomationServerOptions = {
  /**
   * What this app's own automation steps actually do, keyed by the same `kind`
   * the descriptor in `src/app/options.ts` uses.
   *
   * The two halves are deliberately apart. The descriptor draws the step and
   * says what a valid setting looks like, and the canvas needs that in the
   * browser; the executor reaches the database and must not go there.
   *
   * A `kind` the shell already runs is refused out loud. An app adds steps of
   * its own; it never quietly changes what one of the shell's does.
   */
  executors?: Record<string, AutomationExecutor>
}

/*
 * Readers, under the same two rules as the ones in `src/lib/app-options.ts`,
 * and for the same reason: an app's answers import app code, which imports
 * shell code, which can import this file.
 *
 *   1. Every reader is a `function`, never a `const`.
 *   2. Shell code calls them inside a request or a handler, never at the top
 *      level of a module.
 *
 * A default is written once, here, and call sites read through the reader
 * rather than reaching into `appServerOptions` with their own `??`.
 */

/**
 * What this app's own automation steps do, or nothing.
 *
 * The argument is only ever passed by the tests, which check that an unset
 * option still means today's behaviour — written this way so that check keeps
 * working inside an app that has set the option.
 */
export function appAutomationExecutors(
  options: AppServerOptions = appServerOptions
): Record<string, AutomationExecutor> {
  return options.automations?.executors ?? {}
}
