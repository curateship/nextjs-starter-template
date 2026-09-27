import type { AppServerOptions } from "@/server/app-options"
import {
  directorySitemapChunkFiles,
  directorySitemapEntries,
} from "@/server/directory/sitemap"
import { directorySearchResults } from "@/server/directory/public"
import {
  readCategoriesRow,
  readDealsRow,
  readEventsRow,
  readListingsRow,
  readPostsRow,
} from "@/server/directory/front-page-row-readers"
import { runFeaturedRenewalReminders } from "@/server/directory/featured"
import { copyDirectoryWorkspace } from "@/server/directory/workspace-copy"
import { executeDraftEventsStep } from "@/server/events/ai-drafts"
import { eventSearchResults, eventSitemapEntries } from "@/server/events/public"
import { runRepeatTopUps } from "@/server/events/repeats"
import { postSearchResults, postSitemapEntries } from "@/server/posts/public"
import { DRAFT_EVENTS_KIND } from "@/lib/events/draft-events-step"

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
  pages: {
    /**
     * What fills each of this app's own front page rows, keyed by the same
     * names `options.ts` registers. Answering null leaves the row off the page,
     * which is how an empty category, nothing coming up, no deals on, no posts
     * yet, and a visitor who may not see the page behind the row are all said.
     */
    frontPageRowReaders: {
      listings: ({ settings, workspaceId }) =>
        readListingsRow(workspaceId, settings),
      categories: ({ settings, workspaceId }) =>
        readCategoriesRow(workspaceId, settings),
      events: ({ settings, workspaceId }) =>
        readEventsRow(workspaceId, settings),
      deals: ({ settings, workspaceId }) => readDealsRow(workspaceId, settings),
      posts: ({ settings, workspaceId }) => readPostsRow(workspaceId, settings),
    },
  },
  automations: {
    executors: { [DRAFT_EVENTS_KIND]: executeDraftEventsStep },
  },
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
