import { LIBRARY_SAVED_VIEW_KIND } from "@/lib/viral/library"
import { TEXT_POSTS_SAVED_VIEW_KIND } from "@/lib/viral/text-posts"
import { VAULT_SAVED_VIEW_KIND } from "@/lib/viral/vault-saved-views"
import { VIRAL_SAVED_VIEW_KIND } from "@/lib/viral/viral-saved-views"
import type { AppServerOptions } from "@/server/app-options"
import { archiveSavedViewScreens } from "@/server/archive/saved-views"
import { rackSavedViewScreens } from "@/server/phones/saved-views"
import {
  CAROUSEL_MEDIA_FILTER,
  EDITOR_MEDIA_FILTER,
} from "@/lib/video/media-saved-views"
import { mediaSavedViewScreen } from "@/server/video/media-saved-views"
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
 *
 * Content is Video, Promo and Viral in one app, so its workers and saved views
 * are the three apps' together (`workspace/docs/content-app.md`).
 */
export const appServerOptions: AppServerOptions = {
  media: {
    // The smooth copies count towards the Media library's storage total.
    storageUsed: (ownerId) =>
      import("@/server/video/storage-used").then((used) =>
        used.videoStorageUsed(ownerId)
      ),
  },
  background: {
    workers: [
      {
        // Builds playback proxies and timeline filmstrips for library videos.
        // Imported on the tick, not up here, so loading this options file
        // never drags the worker (and its ffmpeg plumbing) into boot.
        name: "video-media",
        tick: () =>
          import("@/server/video/media-workers").then((workers) =>
            workers.videoMediaTick()
          ),
      },
      {
        // Renders exports, and puts back anything a restart interrupted.
        name: "video-render",
        tick: () =>
          import("@/server/video/render-queue").then((queue) =>
            queue.videoRenderTick()
          ),
      },
      {
        // Starts and checks durable AI shot jobs. A page reload never owns the job.
        name: "video-generation",
        tick: () =>
          import("@/server/video/asset-factories/generations").then(
            (generations) => generations.videoGenerationTick()
          ),
      },
      {
        // Puts a finished shot made from a timeline picture in that
        // picture's place, when no editor has the project open to do it.
        name: "video-moving-stills",
        tick: () =>
          import("@/server/video/asset-factories/moving-stills").then(
            (stills) => stills.movingStillTick()
          ),
      },
      {
        // Asks Sync Labs about lip matching nobody's editor is waiting on, so
        // it still lands, is charged, and the files sent are deleted.
        name: "video-lip-sync",
        tick: () =>
          import("@/server/video/lip-sync").then((lipSync) => lipSync.lipSyncTick()),
      },
      {
        // Ends a Send to Promo nobody's window is watching once it has waited
        // three hours, with a bell, so a send never sits "sending" for ever
        // (workspace/docs/send-to-promo.md).
        name: "video-promo-sends",
        tick: () =>
          import("@/server/video/promo-sends").then((sends) => sends.sweepStalePromoSends()),
      },
      {
        // Starts a Send to Video from Viral whose copy was lost to a restart,
        // and ends one stuck past its hour (workspace/docs/viral-connection.md).
        name: "video-viral-arrivals",
        tick: () =>
          import("@/server/video/viral-link/arrivals").then((arrivals) => arrivals.sweepViralArrivals()),
      },
      {
        // Makes a brief's scenes one after another, then lays made scenes on
        // the timeline when no editor has the project open to do it.
        name: "video-briefs",
        tick: () =>
          import("@/server/video/briefs").then((briefs) => briefs.briefTick()),
      },
      {
        // Makes the queued AI steps of Flow runs, one after another, so a run
        // goes on with the tab closed (workspace/docs/flow.md).
        name: "video-flow",
        tick: () =>
          import("@/server/video/flow/tick").then((flow) => flow.flowTick()),
      },
      {
        // Downloads the viral video an editor video copies and has Gemini
        // break it down, when Try again on the Copy panel put it back in the
        // queue. A restart puts an interrupted job back.
        name: "video-viral-breakdown",
        tick: () =>
          import("@/server/video/viral/saved-videos").then((saved) =>
            saved.viralVideoTick()
          ),
      },
      {
        // Downloads the TikTok, Instagram and YouTube links pasted into a
        // project's Media panel, a few at a time, without holding up the
        // pass (workspace/docs/import-from-a-link.md).
        name: "video-link-imports",
        tick: () =>
          import("@/server/video/link-imports").then((imports) =>
            imports.linkImportTick()
          ),
      },
      // From Promo: accounts, browsers, phones, networks, bans and the Archive.
      {
        name: "promo-proxy-health",
        /**
         * Re-tests the three proxies that have waited longest, never-tested
         * ones first, so a line that has died is marked dead, and rings the
         * bell once, before a browser finds out the hard way.
         */
        tick: async () => {
          const { sweepProxyHealth } = await import("@/server/browser/proxies")
          await sweepProxyHealth()
          // Once an hour, the bell for a proxy renewing in the next three days.
          const { ringProxyRenewals } = await import("@/server/social/upkeep")
          await ringProxyRenewals()
        },
      },
      {
        name: "promo-account-health",
        /**
         * Once a day per signed-in Reddit account, asks for its karma, its
         * age and whether its profile loads for a stranger. Only writes a
         * job; the browser program does the reading.
         */
        tick: async () => {
          const { queueAccountHealth } = await import("@/server/social/upkeep")
          await queueAccountHealth()
        },
      },
      {
        name: "promo-account-warm-up",
        /**
         * Once a day per warming Reddit account, picks a time inside its
         * waking hours for a visit to Reddit: the feed, a few posts, a
         * subreddit or two joined. Only writes a job; the browser program
         * visits. Also moves a profile labelled Warming to Ready when the
         * warm-up is over.
         */
        tick: async () => {
          const { queueWarmUps } = await import("@/server/social/upkeep")
          await queueWarmUps()
        },
      },
      {
        name: "promo-timed-searches",
        /**
         * Searches every switched-on keyword again once its last search is
         * the hours set in Settings → Behaviour old, while the reader browser
         * is awake. Only writes jobs; the browser program searches.
         */
        tick: async () => {
          const { queueTimedSearches } = await import("@/server/social/upkeep")
          await queueTimedSearches()
        },
      },
      {
        name: "promo-tidy-old-posts",
        /**
         * Every ten minutes, deletes skipped Reddit posts no search has seen
         * for the days set in Settings and clears the stored replies of old
         * open ones, a bounded number each pass. A post with a comment
         * against it is never touched.
         */
        tick: async () => {
          const { tidyOldPosts } = await import("@/server/social/upkeep")
          await tidyOldPosts()
        },
      },
      {
        name: "promo-read-link-pages",
        /**
         * Reads the title and opening paragraph of the page a few Reddit link
         * posts point to, so the AI has something to answer. Refuses any
         * address inside the network. No browser: a plain request with a
         * short cap.
         */
        tick: async () => {
          const { readLinkPages } = await import("@/server/social/upkeep")
          await readLinkPages()
        },
      },
      {
        name: "promo-medium",
        /**
         * Medium's upkeep (`src/server/social/medium/upkeep.ts`): every five
         * minutes, searches each switched-on Medium keyword again once it is
         * due and picks a time for each warming account's daily visit; every
         * ten, asks for a fresh reading of responses and articles a day old
         * and tidies away old stories nobody answered. Only writes jobs and
         * deletes old rows; the browser program reads and visits.
         */
        tick: async () => {
          const { mediumUpkeep } = await import("@/server/social/medium/upkeep")
          await mediumUpkeep()
        },
      },
      {
        name: "promo-x",
        /**
         * X's upkeep (`src/server/social/x/upkeep.ts`): every five minutes,
         * reads each watched account again 15 minutes after its last read and
         * each X keyword 2 hours after, and picks a time for each warming
         * account's daily visit; every ten, asks for a fresh reading of replies
         * and posts a day old, each account's mentions and daily look, the
         * day's trends and an X browser account's messages, and tidies away
         * old posts nobody answered. Only writes jobs and deletes old rows;
         * the browser program reads and visits, through the search accounts.
         */
        tick: async () => {
          const { xUpkeep } = await import("@/server/social/x/upkeep")
          await xUpkeep()
        },
      },
      {
        name: "promo-linkedin",
        /**
         * LinkedIn's upkeep (`src/server/social/linkedin/upkeep.ts`): every
         * five minutes, inside the search accounts' workday, reads each
         * watched person or page again 30 minutes after its last read and
         * each LinkedIn keyword 3 hours after, and picks a time for each
         * warming account's daily visit; every ten, asks for a fresh reading
         * of comments and posts a day old, each account's weekly comments look
         * and numbers, its daily requests, viewers, feed and messages, and
         * tidies away old posts nobody answered. Only writes jobs and deletes
         * old rows; the browser program reads and visits.
         */
        tick: async () => {
          const { linkedinUpkeep } = await import("@/server/social/linkedin/upkeep")
          await linkedinUpkeep()
        },
      },
      {
        name: "promo-youtube",
        /**
         * YouTube's upkeep (`src/server/social/youtube/upkeep.ts`): every ten
         * minutes, asks for each signed-in channel's daily reading inside its
         * waking hours, once a day: subscribers, the numbers of the videos
         * Promo uploaded, and the newest comments under them. Only writes
         * jobs; the browser program reads, in the channel's browser or on its
         * phone.
         */
        tick: async () => {
          const { youtubeUpkeep } = await import("@/server/social/youtube/upkeep")
          await youtubeUpkeep()
        },
      },
      {
        name: "promo-bans",
        /**
         * The Bans task's upkeep (`src/server/bans/upkeep.ts`): every five
         * minutes, a time for each warming Instagram or TikTok account's
         * daily visit; every ten, the bell for an appeal 7 days old with no
         * answer and the weekly look at each banned account's app. Only
         * writes jobs, phone actions and notices.
         */
        tick: async () => {
          const { banUpkeep } = await import("@/server/bans/upkeep")
          await banUpkeep()
        },
      },
      {
        name: "promo-phone-health",
        /**
         * Rings the bell for a phone offline five minutes, a battery over
         * 45°C, a SIM with no signal for ten minutes, storage over 90 out of
         * 100 full, and the rack not checking in, one notice per phone per
         * problem, and takes each away when it ends. Asks for the daily
         * self-test and store look on each kind's test phone, opens each
         * iPhone account's inbox once an hour in waking hours (an iPhone
         * hands the rack no notifications), and once an hour deletes old
         * step pictures and chart readings.
         */
        tick: async () => {
          const { tidyPhoneRecords, sweepPhoneHealth } = await import("@/server/phones/upkeep")
          await sweepPhoneHealth()
          const { queueDailySelfTest } = await import("@/server/phones/self-test")
          await queueDailySelfTest()
          const { queueIphoneInboxReads } = await import("@/server/social/phone-apps/iphone-inbox")
          await queueIphoneInboxReads()
          await tidyPhoneRecords()
        },
      },
      {
        name: "promo-archive",
        /**
         * The Archive's upkeep (`src/server/archive/`): starts a copy from
         * Video whose start was lost and ends one past its three hours, and
         * deletes items 30 days in a Bin, a bounded number each pass. Each
         * copy runs on its own, so this never waits for one.
         */
        tick: async () => {
          const { sweepArrivals } = await import("@/server/archive/arrivals")
          await sweepArrivals()
          const { emptyOldBins } = await import("@/server/archive/items")
          await emptyOldBins()
        },
      },
      {
        name: "promo-viral",
        /**
         * The link with the Viral app (`src/server/viral-link/`): a read
         * whose job failed is told to Viral, an answer Viral missed is sent
         * again, and posts made from Viral's ideas are reported back, at most
         * every ten minutes.
         */
        tick: async () => {
          const { sweepViralReads } = await import("@/server/viral-link/reads")
          await sweepViralReads()
          const { reportAllViralPosts } = await import("@/server/viral-link/reports")
          await reportAllViralPosts()
        },
      },
      {
        name: "promo-browser-reaper",
        /**
         * Shuts down a browser nobody has used for an hour, marks one whose
         * container died as dead, and removes containers no session row
         * claims. An idle or leftover Camoufox still holds about 1.5GB of
         * memory. All three ask Docker and need no key to the browser.
         */
        tick: async () => {
          const { reapBrowsers } = await import("@/server/social/upkeep")
          await reapBrowsers()
        },
      },
      // From Viral, which Content shows as a project's Research.
      {
        // Content's section at the top of the left menu, and the Projects
        // dashboard as the home page, once each. It runs in place of Viral's
        // own menu job, which would add Viral's section and make its
        // dashboard home (`workspace/docs/content-app.md`).
        name: "content-navigation",
        tick: () => import("@/server/content-app/navigation").then((menu) => menu.addContentNavigation()),
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
  // Views on the video editor's Media panel and the carousel editor's Image
  // panel.
  savedViews: {
    screens: {
      [EDITOR_MEDIA_FILTER.kind]: mediaSavedViewScreen(EDITOR_MEDIA_FILTER),
      [CAROUSEL_MEDIA_FILTER.kind]: mediaSavedViewScreen(CAROUSEL_MEDIA_FILTER),
      // Promo's Archive and racks.
      ...archiveSavedViewScreens,
      ...rackSavedViewScreens,
      // Research's lists: found videos, the vault, the library and text posts.
      [VIRAL_SAVED_VIEW_KIND]: viralSavedViewScreen,
      [VAULT_SAVED_VIEW_KIND]: vaultSavedViewScreen,
      [LIBRARY_SAVED_VIEW_KIND]: librarySavedViewScreen,
      [TEXT_POSTS_SAVED_VIEW_KIND]: textPostsSavedViewScreen,
    },
  },
}
