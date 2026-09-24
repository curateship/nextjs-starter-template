import type { AppServerOptions } from "@/server/app-options"
import {
  directorySitemapChunkFiles,
  directorySitemapEntries,
} from "@/server/directory/sitemap"
import { directorySearchResults } from "@/server/directory/public"
import { runFeaturedRenewalReminders } from "@/server/directory/featured"
import { copyDirectoryWorkspace } from "@/server/directory/workspace-copy"
import { eventSearchResults, eventSitemapEntries } from "@/server/events/public"
import { runRepeatTopUps } from "@/server/events/repeats"
import { postSearchResults, postSitemapEntries } from "@/server/posts/public"

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
 * New server functions still go in `src/lib/api/`, never here: the guard test
 * only walks that folder, so an endpoint declared here would be an unguarded
 * door nobody is told about.
 */
export const appServerOptions: AppServerOptions = {
  workspaces: {
    copyChoices: [{ key: "listings", label: "Copy listings" }],
    onCopy: copyDirectoryWorkspace,
  },
  sitemap: {
    // Category pages, posts and events. Listings are in the numbered files
    // below.
    extraEntries: async (workspaceId) =>
      (
        await Promise.all([
          directorySitemapEntries(workspaceId),
          postSitemapEntries(workspaceId),
          eventSitemapEntries(workspaceId),
        ])
      ).flat(),
    chunkFiles: directorySitemapChunkFiles,
  },
  search: {
    sources: [directorySearchResults, postSearchResults, eventSearchResults],
  },
  background: {
    workers: [
      {
        name: "directory featured renewal reminders",
        tick: runFeaturedRenewalReminders,
      },
      {
        name: "repeating events top-up",
        tick: runRepeatTopUps,
      },
    ],
  },
}
