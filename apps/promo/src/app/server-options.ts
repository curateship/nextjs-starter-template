import type { AppServerOptions } from "@/server/app-options"

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
export const appServerOptions: AppServerOptions = {
  background: {
    /**
     * Only the quick jobs ride the shell's ticker. The Reddit browser is its
     * own process (`worker/src/social-browser.ts`) because a search through a
     * real browser takes tens of seconds, and the ticker fires every fifteen
     * and runs every other job in turn.
     */
    workers: [
      {
        name: "promo-proxy-health",
        /**
         * Re-tests one proxy that has not been checked for ten minutes, so a
         * line that has died is marked dead before a search finds out the
         * hard way. One per pass, because the point of being here is speed.
         */
        tick: async () => {
          const { sweepProxyHealth } = await import("@/server/social/upkeep")
          await sweepProxyHealth()
        },
      },
      {
        name: "promo-browser-reaper",
        /**
         * Shuts down a browser nobody has used for an hour. An idle Camoufox
         * still holds about 1.5GB of memory, so leaving one open all day
         * costs more than starting it again costs.
         */
        tick: async () => {
          const { reapBrowsers } = await import("@/server/social/upkeep")
          await reapBrowsers()
        },
      },
    ],
  },
}
