import { LIBRARY_SAVED_VIEW_KIND } from "@/lib/viral/library"
import { TEXT_POSTS_SAVED_VIEW_KIND } from "@/lib/viral/text-posts"
import { VAULT_SAVED_VIEW_KIND } from "@/lib/viral/vault-saved-views"
import { VIRAL_SAVED_VIEW_KIND } from "@/lib/viral/viral-saved-views"
import type { AppServerOptions } from "@/server/app-options"
import {
  librarySavedViewScreen,
  textPostsSavedViewScreen,
  vaultSavedViewScreen,
  viralSavedViewScreen,
} from "@/server/viral/saved-views"

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
    workers: [
      // Adds Projects and Vault to each left menu once (task part 1).
      {
        name: "viral-navigation",
        tick: () => import("@/server/viral/navigation").then((menu) => menu.addViralNavigation()),
      },
      // Downloads saved videos and has Gemini watch them, then writes any
      // analysis that was waiting for the breakdown.
      {
        name: "viral-saved-videos",
        tick: () => import("@/server/viral/saved-videos").then((saved) => saved.viralVideoTick()),
      },
      // Searches the keywords somebody queued, or the daily re-check queued.
      {
        name: "viral-search",
        tick: () => import("@/server/viral/project-search").then((search) => search.viralSearchTick()),
      },
      // Queues each project's keywords once a day (VIRAL_WATCH_ENABLED=1).
      {
        name: "viral-daily-recheck",
        tick: () => import("@/server/viral/daily-checks").then((checks) => checks.dailyRecheckTick()),
      },
      // Keeps copies of TikTok covers, whose addresses expire.
      {
        name: "viral-creator-covers",
        tick: () => import("@/server/viral/creators/covers").then((covers) => covers.creatorCoverTick()).then(() => undefined),
      },
      // Reads followed creators every 6 hours (VIRAL_WATCH_ENABLED=1).
      {
        name: "viral-creator-watch",
        tick: () => import("@/server/viral/creators/watch").then((watch) => watch.creatorWatchTick()),
      },
      // Asks Promo to read X, Reddit and LinkedIn searches daily and people
      // every 6 hours (VIRAL_WATCH_ENABLED=1).
      {
        name: "viral-social-watch",
        tick: () => import("@/server/viral/social-watches").then((watch) => watch.socialWatchTick()).then(() => undefined),
      },
    ],
  },
  savedViews: {
    screens: {
      [VIRAL_SAVED_VIEW_KIND]: viralSavedViewScreen,
      [VAULT_SAVED_VIEW_KIND]: vaultSavedViewScreen,
      [LIBRARY_SAVED_VIEW_KIND]: librarySavedViewScreen,
      [TEXT_POSTS_SAVED_VIEW_KIND]: textPostsSavedViewScreen,
    },
  },
}
