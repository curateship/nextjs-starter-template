import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { queueDueHealthChecks } from "./health"
import { readDueLinkPages } from "./link-page"
import { queueDueSearches } from "./reddit/timed-searches"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { proxiesRenewingSoon } from "@/server/browser/proxies"
import { noticeRung, ringBell } from "./notices"
import { tidyOldFinds } from "./tidy"
import { queueDueWarmUps } from "./warm-up"
import {
  markDeadSessions,
  reapIdleSessions,
  removeOrphanContainers,
} from "@/server/browser/session"

/**
 * The quick, regular jobs. These ride the shell's one fifteen-second ticker,
 * which is right for them: each is a read and a few outside calls.
 *
 * The slow browser work is deliberately not here. It lives in its own process
 * (`worker/src/social-browser.ts`), because a search takes tens of seconds and
 * would hold up every other app job on the shared ticker. The browser steps
 * below only ever ask Docker. They need no command key and never open or
 * drive a browser, which stays the browser program's job alone.
 */

/**
 * Keeps the browsers honest: closes the idle ones, marks the dead ones, and
 * removes containers nothing claims.
 *
 * Dead before orphans, so a container that crashed and was then cleared away
 * is still recorded as a crash with its reason, rather than vanishing.
 */
export async function reapBrowsers(db: CustomShellDb = defaultDb): Promise<void> {
  const closed = await reapIdleSessions(db)
  if (closed) console.log(`Shut down ${closed} idle browser(s)`)

  const dead = await markDeadSessions(db)
  if (dead) console.log(`Marked ${dead} browser(s) dead`)

  const orphans = await removeOrphanContainers(db)
  if (orphans) console.log(`Removed ${orphans} leftover browser container(s)`)
}

/**
 * Asks for a fresh karma, age and stranger's-eye reading of each signed-in
 * Reddit account once a day. Only writes jobs: the browser program takes the
 * reading, in a tab of its own, so a page a person is using never moves.
 */
export async function queueAccountHealth(db: CustomShellDb = defaultDb): Promise<void> {
  const queued = await queueDueHealthChecks(db)
  if (queued) console.log(`Asked for ${queued} Reddit account health reading(s)`)
}

/**
 * How often the tidy-up runs. Nothing about a post's age changes in fifteen
 * seconds, so most ticks skip it.
 */
const TIDY_GAP_MS = 10 * 60_000

let lastTidyAt = 0

/**
 * Deletes long-skipped posts and clears the stored replies of old open ones,
 * a bounded number each pass, and says how many. See `tidy.ts` for what is
 * never touched.
 */
export async function tidyOldPosts(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (now.getTime() - lastTidyAt < TIDY_GAP_MS) return
  lastTidyAt = now.getTime()
  const { deleted, cleared } = await tidyOldFinds(db, now)
  if (deleted || cleared) {
    console.log(
      `Tidied old Reddit posts: deleted ${deleted} skipped post(s), cleared the stored replies of ${cleared} open one(s)`
    )
  }
}

/**
 * How often the warm-up looks for accounts to warm. A day's warm-up is picked
 * once per day per account, so every five minutes is plenty.
 */
const WARM_UP_GAP_MS = 5 * 60_000

let lastWarmUpAt = 0

/**
 * Queues each warming account's daily visit inside its waking hours, and moves
 * a profile labelled Warming to Ready once its warm-up is over. Only writes
 * jobs and labels; the browser program does the visiting.
 */
export async function queueWarmUps(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (now.getTime() - lastWarmUpAt < WARM_UP_GAP_MS) return
  lastWarmUpAt = now.getTime()
  const queued = await queueDueWarmUps(db, now)
  if (queued) console.log(`Picked a time for ${queued} account warm-up visit(s)`)
}

/**
 * How often the timed searches look for keywords that are due. A keyword's
 * gap is hours, so every five minutes is plenty.
 */
const TIMED_SEARCH_GAP_MS = 5 * 60_000

let lastTimedSearchAt = 0

/**
 * Searches every switched-on keyword again once its last search is the set
 * number of hours old, while the reader is awake. Only writes jobs; the
 * browser program searches. See `reddit/timed-searches.ts`.
 */
export async function queueTimedSearches(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  if (now.getTime() - lastTimedSearchAt < TIMED_SEARCH_GAP_MS) return
  lastTimedSearchAt = now.getTime()
  const queued = await queueDueSearches(db, now)
  if (queued) console.log(`Queued ${queued} timed keyword search(es)`)
}

/** How many days ahead a proxy's renewal rings the bell. */
const RENEWAL_WARNING_DAYS = 3

/** Renewals change by the day, so once an hour is plenty. */
const RENEWAL_GAP_MS = 60 * 60_000

let lastRenewalAt = 0

/**
 * Rings the bell once for each proxy renewing in the next three days, so an
 * expired proxy never takes its accounts offline without warning. Once per
 * renewal date: a new date is a new notice.
 */
export async function ringProxyRenewals(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  if (now.getTime() - lastRenewalAt < RENEWAL_GAP_MS) return 0
  lastRenewalAt = now.getTime()
  const day = (offset: number) =>
    new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
  const due = await proxiesRenewingSoon(day(0), day(RENEWAL_WARNING_DAYS), db)
  let rung = 0
  for (const proxy of due) {
    const targetId = `${proxy.id}:${proxy.renewsOn}`
    if (await noticeRung("proxy_renewal", targetId, db)) continue
    const name = proxy.label || proxy.host
    const cost = proxy.monthlyCost === null ? "" : ` It costs $${proxy.monthlyCost.toFixed(2)} a month.`
    await ringBell(
      proxy.userId,
      {
        kind: "proxy_renewal",
        targetId,
        message: `${NOTICE_HEADINGS.proxy_renewal} ${name}`,
        detail: `The proxy ${name} renews on ${proxy.renewsOn}.${cost} Renew it, or move its profiles to another proxy before then.`,
        href: `/admin/proxies?open=${encodeURIComponent(proxy.id)}`,
      },
      db,
      now
    )
    rung += 1
  }
  return rung
}

/**
 * Reads the page a few link posts point to, so a post with no words of its
 * own can still be answered. A handful a pass, side by side, each capped at
 * eight seconds, so the shared ticker is never held for long. See
 * `link-page.ts` for the guard against addresses inside the network.
 */
export async function readLinkPages(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const { read, failed, refused } = await readDueLinkPages(db, now)
  if (read || failed || refused) {
    console.log(
      `Read the linked page of ${read} Reddit post(s); ${failed} could not be read; ${refused} pointed inside the network and were refused`
    )
  }
}
