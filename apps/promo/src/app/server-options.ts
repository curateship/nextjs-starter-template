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
    ],
  },
}
