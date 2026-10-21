import { createServerOnlyFn } from "@tanstack/react-start"

import { DATING_SAVED_VIEW_KIND } from "@/lib/dating/lead-views"
import type { AppServerOptions } from "@/server/app-options"
import { datingSavedViewScreen } from "@/server/dating/saved-views"

/**
 * What this app changes about the shell, on the server side.
 *
 * The companion to `options.ts`. That file is seen by the browser, so it holds
 * the drawing and the wording; this one never is, so it holds the work — the
 * parts that reach the database or call something outside.
 *
 * Open `src/server/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * This file belongs to the app, not the shell. **In custom-shell itself it
 * stays empty forever.** The moment the shell puts a value here, every app ever
 * copied from it conflicts on this file on every future merge — which is the
 * exact problem the file exists to avoid.
 *
 * New server functions still go in `src/lib/api/`, never here: the guard test
 * only walks that folder, so an endpoint declared here would be an unguarded
 * door nobody is told about.
 */

/**
 * Date's one background job: the next Tinder walk on each phone, the AI's
 * reads and drafts, automated replies whose time has come, and one step of
 * the swipe loop while a phone runs. The slow parts are started and not waited
 * for, so this pass returns in moments and never holds up the shell's jobs.
 *
 * Inside `createServerOnlyFn` because the browser build can reach this file
 * through the shell's options, and a dynamic import there would otherwise
 * become a browser file holding the database.
 */
const datingTick = createServerOnlyFn(async () => {
  const { runDatingPass } = await import("@/server/dating/worker")
  const { work } = await runDatingPass()
  void Promise.allSettled(work)
})

export const appServerOptions: AppServerOptions = {
  background: {
    workers: [{ name: "dating", tick: datingTick }],
  },
  savedViews: { screens: { [DATING_SAVED_VIEW_KIND]: datingSavedViewScreen } },
}
