import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { X_SEARCHER_JOB_KINDS } from "@/lib/social/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { X_BEHAVIOUR_RANGES, type XBehaviourNumber } from "@/lib/social/x/options"

import { TryAgainLater } from "../jobs"
import { ringBell } from "../notices"
import { promoAccounts, promoBehaviourSettings, promoJobs } from "../schema"
import { promoLinkedinSearchers } from "../linkedin/schema"
import { promoXSearchers, promoXSettings } from "./schema"

/**
 * X's search accounts (parts 3, 4 and 5).
 *
 * Tyler's rule is that the account a network sees posting never searches,
 * and on Reddit and Medium a reader browser signed in to nobody does it. X
 * shows no search and no replies to a visitor who is not signed in, so a
 * signed-out reader cannot read X at all. A search account is the answer
 * Tyler accepted: a browser profile signed in to a throwaway X account that
 * only ever reads. It is never offered as an account that posts, and a write
 * job never runs in it.
 *
 * X caps how many posts one account may see in a day, so each search account
 * counts its views and stops at the number in Settings → Behaviour (500 to
 * begin with). Several can take turns: each read goes to the one with the
 * most views left, and one X locked or rate-limited is skipped until the
 * next day.
 */

export type XSettings = Record<XBehaviourNumber, number>

const X_SETTINGS_START: XSettings = {
  repliesPerDay: X_BEHAVIOUR_RANGES.repliesPerDay.start,
  repliesPerHour: X_BEHAVIOUR_RANGES.repliesPerHour.start,
  viewsPerDay: X_BEHAVIOUR_RANGES.viewsPerDay.start,
  followsPerDay: X_BEHAVIOUR_RANGES.followsPerDay.start,
}

export async function readXSettings(userId: string, db: CustomShellDb = defaultDb): Promise<XSettings> {
  const [row] = await db.select().from(promoXSettings).where(eq(promoXSettings.userId, userId)).limit(1)
  if (!row) return { ...X_SETTINGS_START }
  return {
    repliesPerDay: row.repliesPerDay,
    repliesPerHour: row.repliesPerHour,
    viewsPerDay: row.viewsPerDay,
    followsPerDay: row.followsPerDay,
  }
}

/** Saves X's numbers in Settings → Behaviour, each checked against its bounds. */
export async function saveXSettings(
  userId: string,
  input: XSettings,
  db: CustomShellDb = defaultDb
): Promise<XSettings> {
  for (const key of Object.keys(X_BEHAVIOUR_RANGES) as XBehaviourNumber[]) {
    const value = input[key]
    const range = X_BEHAVIOUR_RANGES[key]
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(`That number has to be a whole number from ${range.min} to ${range.max}.`)
    }
  }
  if (input.repliesPerHour > input.repliesPerDay) {
    throw new Error("Replies an hour can't be more than replies a day.")
  }
  const values = {
    repliesPerDay: input.repliesPerDay,
    repliesPerHour: input.repliesPerHour,
    viewsPerDay: input.viewsPerDay,
    followsPerDay: input.followsPerDay,
    updatedAt: new Date(),
  }
  await db
    .insert(promoXSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: promoXSettings.userId, set: values })
  return readXSettings(userId, db)
}

/** Today's date in UTC, as a date column stores it. X's day is counted in UTC: its own limit is not tied to anyone's clock. */
export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export type SearcherView = {
  id: string
  profileId: string
  profileName: string
  /** Who X last said the profile is signed in as, or "" when it was signed out or never looked at. */
  handle: string
  viewsToday: number
  viewsPerDay: number
  /** Why it takes no reads today, or "" when it does. */
  stoppedReason: string
  lastUsedAt: Date | null
}

function viewsToday(row: { viewsOn: string | null; views: number }, today: string): number {
  return row.viewsOn === today ? row.views : 0
}

function stoppedToday(row: { stoppedOn: string | null }, today: string): boolean {
  return row.stoppedOn === today
}

export async function listSearchers(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<SearcherView[]> {
  const today = utcDay(now)
  const { viewsPerDay } = await readXSettings(userId, db)
  const rows = await db
    .select({ searcher: promoXSearchers, profileName: promoProfiles.name })
    .from(promoXSearchers)
    .innerJoin(promoProfiles, eq(promoProfiles.id, promoXSearchers.profileId))
    .where(eq(promoXSearchers.userId, userId))
    .orderBy(asc(promoXSearchers.createdAt), asc(promoXSearchers.id))
  return rows.map(({ searcher, profileName }) => {
    const views = viewsToday(searcher, today)
    return {
      id: searcher.id,
      profileId: searcher.profileId,
      profileName,
      handle: searcher.handle,
      viewsToday: views,
      viewsPerDay,
      stoppedReason: stoppedToday(searcher, today)
        ? searcher.stopReason
        : views >= viewsPerDay
          ? `It has seen ${views} of ${viewsPerDay} posts today, so it rests until midnight UTC.`
          : "",
      lastUsedAt: searcher.lastUsedAt,
    }
  })
}

/**
 * Makes a browser profile an X search account. The profile must hold no
 * account of any network, because a search account never posts, and must not
 * be the reader, which has to stay signed in to nobody.
 */
export async function addSearcher(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const [profile] = await db
    .select({ name: promoProfiles.name })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Error("That browser profile does not exist.")
  const [holder] = await db
    .select({ platform: promoAccounts.platform })
    .from(promoAccounts)
    .where(eq(promoAccounts.profileId, profileId))
    .limit(1)
  if (holder) {
    throw new Error(
      `The profile ${profile.name} holds an account that posts, so it can't search X. A search account only ever reads.`
    )
  }
  const [reader] = await db
    .select({ id: promoBehaviourSettings.readerProfileId })
    .from(promoBehaviourSettings)
    .where(eq(promoBehaviourSettings.userId, userId))
    .limit(1)
  if (reader?.id === profileId) {
    throw new Error(
      `The profile ${profile.name} is the reader, which has to stay signed in to nobody. Make a new profile for X's searching.`
    )
  }
  const [linkedinSearcher] = await db
    .select({ id: promoLinkedinSearchers.id })
    .from(promoLinkedinSearchers)
    .where(eq(promoLinkedinSearchers.profileId, profileId))
    .limit(1)
  if (linkedinSearcher) {
    throw new Error(`The profile ${profile.name} already searches LinkedIn. Make a new profile for X's searching.`)
  }
  const id = uuid()
  const added = await db
    .insert(promoXSearchers)
    .values({ id, userId, profileId })
    .onConflictDoNothing()
    .returning({ id: promoXSearchers.id })
  if (!added.length) throw new Error(`The profile ${profile.name} already searches X.`)
  return id
}

/** Stops a profile searching X. Its waiting reads go to another search account when they run. */
export async function removeSearcher(userId: string, searcherId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoXSearchers)
    .where(and(eq(promoXSearchers.id, searcherId), eq(promoXSearchers.userId, userId)))
    .returning({ id: promoXSearchers.id })
  if (!removed.length) throw new Error("That search account is not saved any more.")
}

/** A read waiting in a search account's lane is counted as this many views when picking where the next goes. */
const VIEWS_PER_WAITING_READ = 20

/** What any X read says when there is no search account at all. */
const NO_SEARCHER_MESSAGE =
  "There is no X search account, so X can't be read. X shows nothing to a visitor who is not signed in. Add a browser profile signed in to a throwaway X account under X in Settings → Behaviour."

export type PickedSearcher = { id: string; profileId: string; profileName: string; viewsLeft: number }

/**
 * The search account to read with now: the one with the most views left
 * today, then the one used longest ago. Refused, never swapped for an account
 * that posts, when there is none or every one has used its day.
 */
export async function pickSearcher(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PickedSearcher> {
  const searchers = await listSearchers(userId, db, now)
  if (!searchers.length) throw new Refusal(NO_SEARCHER_MESSAGE)
  // Reads already waiting count too, so a batch queued at once spreads over
  // every search account instead of all landing on the one with most left.
  const waiting = await db
    .select({ lane: promoJobs.lane, n: sql<number>`count(*)::int` })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), inArray(promoJobs.kind, [...X_SEARCHER_JOB_KINDS]), inArray(promoJobs.status, ["queued", "running"])))
    .groupBy(promoJobs.lane)
  const queued = new Map(waiting.map((row) => [row.lane ?? "", row.n]))
  const load = (searcher: SearcherView) => searcher.viewsToday + (queued.get(searcher.profileId) ?? 0) * VIEWS_PER_WAITING_READ
  const usable = searchers
    .filter((searcher) => !searcher.stoppedReason)
    .sort(
      (a, b) =>
        load(a) - load(b) ||
        (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0) ||
        a.id.localeCompare(b.id)
    )
  const best = usable[0]
  if (!best) {
    const first = searchers[0]
    throw new Refusal(
      searchers.length === 1 && first
        ? `The X search account in ${first.profileName} can't read any more today. ${first.stoppedReason}`
        : `Every X search account is resting until midnight UTC. Each has used its ${first?.viewsPerDay ?? 0} views or was stopped by X. Add another under X in Settings → Behaviour, or raise the number there.`
    )
  }
  return { id: best.id, profileId: best.profileId, profileName: best.profileName, viewsLeft: best.viewsPerDay - best.viewsToday }
}

/**
 * The search account a read filed under `profileId` runs as, or the one it
 * should move to: the one it was filed under while it still has views left,
 * else the best other one. Refused when none can read.
 */
export async function searcherForLane(
  userId: string,
  profileId: string | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ searcher: PickedSearcher } | { moveTo: string }> {
  const searchers = await listSearchers(userId, db, now)
  const filed = searchers.find((searcher) => searcher.profileId === profileId)
  if (filed && !filed.stoppedReason) {
    return {
      searcher: {
        id: filed.id,
        profileId: filed.profileId,
        profileName: filed.profileName,
        viewsLeft: filed.viewsPerDay - filed.viewsToday,
      },
    }
  }
  const picked = await pickSearcher(userId, db, now)
  return { moveTo: picked.profileId }
}

/**
 * Adds what one read put in front of the search account to its day, and
 * stops it for the rest of the day when X showed its rate limit.
 */
async function countViews(
  searcherId: string,
  read: { viewed: number; limited: boolean },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const today = utcDay(now)
  const viewed = Math.max(0, Math.round(read.viewed))
  await db
    .update(promoXSearchers)
    .set({
      views: sql`CASE WHEN ${promoXSearchers.viewsOn} = ${today}::date THEN ${promoXSearchers.views} + ${viewed} ELSE ${viewed} END`,
      viewsOn: today,
      lastUsedAt: now,
      ...(read.limited
        ? { stoppedOn: today, stopReason: "X showed its rate limit, so it rests until midnight UTC." }
        : {}),
    })
    .where(eq(promoXSearchers.id, searcherId))
}

/**
 * Counts one read against its search account, then refuses to go on when X
 * showed its rate limit: X then answers with nothing, which must never be
 * read as a post gone or an account missing. The job tries again later, on
 * another search account if there is one with views left.
 */
export async function spendViews(
  searcherId: string,
  read: { viewed: number; limited: boolean },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await countViews(searcherId, read, db, now)
  if (!read.limited) return
  const [searcher] = await db
    .select({ userId: promoXSearchers.userId, name: promoProfiles.name })
    .from(promoXSearchers)
    .innerJoin(promoProfiles, eq(promoProfiles.id, promoXSearchers.profileId))
    .where(eq(promoXSearchers.id, searcherId))
    .limit(1)
  if (searcher) {
    await ringBell(
      searcher.userId,
      {
        kind: "x_searcher",
        targetId: `${searcherId}:${utcDay(now)}`,
        message: `${NOTICE_HEADINGS.x_searcher} ${searcher.name}`,
        detail: "X showed its rate limit, which caps how many posts an account may see in a day. It reads nothing more today; the other search accounts carry on.",
        href: "/admin/settings/behaviour",
      },
      db,
      now
    )
  }
  throw new TryAgainLater("X showed its rate limit to the search account, so nothing it read was kept.", 15 * 60_000)
}

/** Stops a search account for the rest of today with X's own words: a lock, a sign-out, an account that posts. */
export async function stopSearcher(
  searcherId: string,
  reason: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(promoXSearchers)
    .set({ stoppedOn: utcDay(now), stopReason: reason.slice(0, 1_000) })
    .where(eq(promoXSearchers.id, searcherId))
}

/** Writes who X says the search account is signed in as, after each read. */
export async function saveSearcherHandle(searcherId: string, handle: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db.update(promoXSearchers).set({ handle: handle.slice(0, 20) }).where(eq(promoXSearchers.id, searcherId))
}

/** True when an X account that posts carries this handle, so a search account signed in as it is refused. */
export async function handlePosts(userId: string, handle: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  if (!handle) return false
  const [row] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, "x"),
        sql`lower(${promoAccounts.handle}) = lower(${handle})`
      )
    )
    .limit(1)
  return Boolean(row)
}

/** The X reads waiting or running of one kind, by a payload key, so two presses never queue the same read twice. */
export async function waitingXReads(
  userId: string,
  kind: "x_search" | "x_read" | "x_check" | "x_community" | "x_lookup" | "x_reach" | "x_mentions",
  key: string,
  db: CustomShellDb = defaultDb
): Promise<Set<string>> {
  const rows = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, kind), inArray(promoJobs.status, ["queued", "running"])))
  return new Set(rows.map((row) => String(row.payload?.[key] ?? "")).filter(Boolean))
}
