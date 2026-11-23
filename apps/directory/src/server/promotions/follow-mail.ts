import { and, asc, eq, gt, isNull, lt, or } from "drizzle-orm"

import { wallClockAt } from "@/lib/events/event-time"
import { dealDaysText } from "@/lib/promotions/deal-days"
import { shownHeadline } from "@/lib/promotions/deal-headline"
import { dealStage } from "@/lib/promotions/deal-times"
import { now } from "@/server/auth/security"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import { directoryListings } from "@/server/directory/schema"
import { siteTimeZone } from "@/server/directory/settings"
import { directorySiteUrl } from "@/server/directory/site-url"
import { buildUnfollowUrl } from "@/server/promotions/follows"
import {
  dealsPublishedSince,
  type DealForFollowers,
} from "@/server/promotions/public"
import { listingFollows } from "@/server/promotions/schema"
import { customShellUsers, customShellWorkspaces } from "@/server/schema"

/**
 * The email a follower gets when a listing they follow publishes new deals.
 *
 * **At most one email per listing per day, naming every new deal.** Tyler
 * chose that on 9 Oct 2026, so an owner posting ten deals at once sends one
 * email, not ten. Two rules make it so:
 *
 * - **It waits for an hour of quiet.** The email goes once the listing's
 *   newest unsent deal is an hour old, so deals posted in one sitting land in
 *   one email even if the sitting ran long.
 * - **One a day.** Once a follower has had an email about a listing today, by
 *   the site's own calendar, anything newer waits for tomorrow's.
 *
 * A deal that has ended, or was unpublished or deleted, before its email went
 * is left out of it. Nothing is sent while the Deals page is switched off; the
 * deals wait and go once it is back on, if they are still running.
 */

/** How long a listing must be quiet before its followers are told. */
export const FOLLOW_MAIL_QUIET_MS = 60 * 60 * 1000

/** A send older than this never finished, and the next pass tries again. */
const CLAIM_EXPIRES_MS = 10 * 60 * 1000

/** How many follows are read at once; a pass pages through all of them. */
const FOLLOWS_PER_PAGE = 500

type Send = typeof sendDirectoryEmail

/** What the email says, built apart from sending it so it can be read in a test. */
export function followEmail(input: {
  siteName: string
  siteUrl: string
  listingTitle: string
  /** The listing's page, or null when the directory is closed to visitors. */
  listingUrl: string | null
  deals: DealForFollowers[]
}): { subject: string; lines: string[]; action: { label: string; url: string } } {
  const { siteName, siteUrl, listingTitle, deals } = input
  const first = deals[0]!
  const dealUrl = (deal: DealForFollowers) => `${siteUrl}/deals/${deal.slug}`
  return {
    subject:
      deals.length === 1
        ? `New deal at ${listingTitle}: ${shownHeadline(first.headline)}`
        : `${deals.length} new deals at ${listingTitle}`,
    lines: [
      `${listingTitle} has ${deals.length === 1 ? "a new deal" : `${deals.length} new deals`} on ${siteName}.`,
      ...deals.map(
        (deal) =>
          `${shownHeadline(deal.headline)}: ${deal.title}. ${dealDaysText(deal)}. ${dealUrl(deal)}`
      ),
      `You get this because you follow ${listingTitle}. It is one email a day at most.`,
    ],
    action:
      deals.length === 1
        ? { label: "See the deal", url: dealUrl(first) }
        : {
            label: `See the deals at ${listingTitle}`,
            url: input.listingUrl ?? `${siteUrl}/deals`,
          },
  }
}

/**
 * One pass over every site with followers. Each follow is claimed before its
 * email goes, so two passes at once never send it twice, and a send that
 * throws keeps its claim until it expires and is tried again.
 */
export async function runFollowMailPass(
  database: CustomShellDb = db,
  at: Date = now(),
  send: Send = sendDirectoryEmail
): Promise<{ sent: number }> {
  const sites = await database
    .selectDistinct({ id: listingFollows.workspaceId })
    .from(listingFollows)
  let sent = 0
  for (const site of sites) {
    sent += await mailOneSite(site.id, database, at, send)
  }
  return { sent }
}

async function mailOneSite(
  siteId: string,
  database: CustomShellDb,
  at: Date,
  send: Send
): Promise<number> {
  if ((await readPageVisibility(siteId, "/deals", database)) === "off") {
    return 0
  }
  const clock = wallClockAt(await siteTimeZone(siteId, database), at)
  const today = clock.slice(0, 10)
  const claimExpired = new Date(at.getTime() - CLAIM_EXPIRES_MS)

  let sent = 0
  // A page of follows at a time, in id order, so a site with more than one
  // page still reaches every follower.
  let afterId = ""
  for (;;) {
    const follows = await database
      .select({
        id: listingFollows.id,
        listingId: listingFollows.listingId,
        userId: listingFollows.userId,
        toldThrough: listingFollows.toldThrough,
      })
      .from(listingFollows)
      .where(
        and(
          eq(listingFollows.workspaceId, siteId),
          gt(listingFollows.id, afterId),
          or(
            isNull(listingFollows.lastMailedDay),
            lt(listingFollows.lastMailedDay, today)
          ),
          or(
            isNull(listingFollows.claimedAt),
            lt(listingFollows.claimedAt, claimExpired)
          )
        )
      )
      .orderBy(asc(listingFollows.id))
      .limit(FOLLOWS_PER_PAGE)
    if (follows.length === 0) break
    afterId = follows[follows.length - 1]!.id
    sent += await mailFollows(follows, siteId, clock, claimExpired, database, at, send)
    if (follows.length < FOLLOWS_PER_PAGE) break
  }
  return sent
}

type DueFollow = {
  id: string
  listingId: string
  userId: string
  toldThrough: Date
}

async function mailFollows(
  follows: DueFollow[],
  siteId: string,
  clock: string,
  claimExpired: Date,
  database: CustomShellDb,
  at: Date,
  send: Send
): Promise<number> {
  const today = clock.slice(0, 10)
  // Each listing from the earliest moment any of its followers heard about.
  const after = new Map<string, Date>()
  for (const follow of follows) {
    const earliest = after.get(follow.listingId)
    if (!earliest || follow.toldThrough < earliest) {
      after.set(follow.listingId, follow.toldThrough)
    }
  }
  const deals = await dealsPublishedSince(
    siteId,
    [...after].map(([listingId, moment]) => ({ listingId, after: moment })),
    database
  )
  if (deals.length === 0) return 0

  let sent = 0
  for (const follow of follows) {
    const fresh = deals.filter(
      (deal) =>
        deal.listingId === follow.listingId &&
        deal.publishedAt > follow.toldThrough
    )
    if (fresh.length === 0) continue
    const newest = fresh[fresh.length - 1]!.publishedAt
    // Still posting: wait for an hour of quiet so it is one email.
    if (at.getTime() - newest.getTime() < FOLLOW_MAIL_QUIET_MS) continue

    const [claimed] = await database
      .update(listingFollows)
      .set({ claimedAt: at })
      .where(
        and(
          eq(listingFollows.id, follow.id),
          // A pass that read this follow before another pass mailed it finds
          // it moved on, and leaves it.
          eq(listingFollows.toldThrough, follow.toldThrough),
          or(
            isNull(listingFollows.lastMailedDay),
            lt(listingFollows.lastMailedDay, today)
          ),
          or(
            isNull(listingFollows.claimedAt),
            lt(listingFollows.claimedAt, claimExpired)
          )
        )
      )
      .returning({ id: listingFollows.id })
    if (!claimed) continue

    const live = fresh.filter((deal) => dealStage(deal, clock) !== "ended")
    if (live.length > 0) {
      try {
        await mailFollower(siteId, follow, live, database, send)
        sent += 1
      } catch (error) {
        // The claim stays, so the next pass after it expires tries again.
        console.error("Follow email failed", error)
        continue
      }
    }
    // Every fresh deal is now told, or was over before it could be. Only an
    // email that went uses up today.
    await database
      .update(listingFollows)
      .set({
        toldThrough: newest,
        claimedAt: null,
        ...(live.length > 0 ? { lastMailedDay: today } : {}),
      })
      .where(eq(listingFollows.id, follow.id))
  }
  return sent
}

async function mailFollower(
  siteId: string,
  follow: { id: string; listingId: string; userId: string },
  deals: DealForFollowers[],
  database: CustomShellDb,
  send: Send
) {
  const [row] = await database
    .select({
      email: customShellUsers.email,
      listingTitle: directoryListings.title,
      listingSlug: directoryListings.slug,
      siteName: customShellWorkspaces.name,
      subdomain: customShellWorkspaces.subdomain,
      customDomain: customShellWorkspaces.customDomain,
    })
    .from(customShellUsers)
    .innerJoin(directoryListings, eq(directoryListings.id, follow.listingId))
    .innerJoin(customShellWorkspaces, eq(customShellWorkspaces.id, siteId))
    .where(eq(customShellUsers.id, follow.userId))
    .limit(1)
  if (!row) return

  const siteUrl = directorySiteUrl(row)
  const directoryOpen =
    (await readPageVisibility(siteId, "/directory", database)) === "everyone"
  await send(
    {
      workspaceId: siteId,
      to: row.email,
      ...followEmail({
        siteName: row.siteName,
        siteUrl,
        listingTitle: row.listingTitle,
        listingUrl: directoryOpen
          ? `${siteUrl}/directory/${row.listingSlug}`
          : null,
        deals,
      }),
      unsubscribeUrl: buildUnfollowUrl(siteUrl, follow.id),
      unsubscribeLabel: `Stop following ${row.listingTitle}`,
    },
    database
  )
}

/** The last time this process ran a pass, so the 15-second loop asks once a minute. */
let lastPassAt = 0

/** The background loop's entry: at most one pass a minute per process. */
export async function followMailTick(): Promise<void> {
  const at = now()
  if (at.getTime() - lastPassAt < 60_000) return
  lastPassAt = at.getTime()
  await runFollowMailPass(db, at)
}
