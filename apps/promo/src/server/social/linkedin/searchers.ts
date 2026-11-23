import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { Refusal } from "@/server/browser/refusal"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { LINKEDIN_SEARCHER_JOB_KINDS, type JobKind } from "@/lib/social/options"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { LINKEDIN_BEHAVIOUR_RANGES, type LinkedinBehaviourNumber } from "@/lib/social/linkedin/options"

import { TryAgainLater } from "../jobs"
import { ringBell } from "../notices"
import { promoAccounts, promoBehaviourSettings, promoJobs } from "../schema"
import { utcDay } from "../x/searchers"
import { promoXSearchers } from "../x/schema"
import { promoLinkedinSearchers, promoLinkedinSettings } from "./schema"

/**
 * LinkedIn's search accounts (part 3), the same idea as X's
 * (`../x/searchers.ts`).
 *
 * Tyler's rule is that the account a network sees posting never searches.
 * LinkedIn shows almost nothing to a visitor who is not signed in, so a
 * signed-out reader cannot read it. A search account is a browser profile
 * signed in to a spare LinkedIn account that only ever reads. It is never
 * offered as an account that comments, and a write job never runs in it.
 *
 * LinkedIn limits how much one account may look at in a day, so each search
 * account counts its views and stops at the number in Settings → Behaviour.
 * Tyler, 22 Oct 2026: "You set it, start at 300". Several can take turns:
 * each read goes to the one with the most views left, and one LinkedIn
 * restricted or showed a check is skipped until the next day (UTC, as X's).
 */

export type LinkedinSettings = Record<LinkedinBehaviourNumber, number>

const SETTINGS_START: LinkedinSettings = {
  commentsPerDay: LINKEDIN_BEHAVIOUR_RANGES.commentsPerDay.start,
  viewsPerDay: LINKEDIN_BEHAVIOUR_RANGES.viewsPerDay.start,
  connectsPerWeek: LINKEDIN_BEHAVIOUR_RANGES.connectsPerWeek.start,
}

export async function readLinkedinSettings(userId: string, db: CustomShellDb = defaultDb): Promise<LinkedinSettings> {
  const [row] = await db.select().from(promoLinkedinSettings).where(eq(promoLinkedinSettings.userId, userId)).limit(1)
  if (!row) return { ...SETTINGS_START }
  return { commentsPerDay: row.commentsPerDay, viewsPerDay: row.viewsPerDay, connectsPerWeek: row.connectsPerWeek }
}

/** Saves LinkedIn's numbers in Settings → Behaviour, each checked against its bounds. */
export async function saveLinkedinSettings(
  userId: string,
  input: LinkedinSettings,
  db: CustomShellDb = defaultDb
): Promise<LinkedinSettings> {
  for (const key of Object.keys(LINKEDIN_BEHAVIOUR_RANGES) as LinkedinBehaviourNumber[]) {
    const value = input[key]
    const range = LINKEDIN_BEHAVIOUR_RANGES[key]
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(`That number has to be a whole number from ${range.min} to ${range.max}.`)
    }
  }
  const values = {
    commentsPerDay: input.commentsPerDay,
    viewsPerDay: input.viewsPerDay,
    connectsPerWeek: input.connectsPerWeek,
    updatedAt: new Date(),
  }
  await db
    .insert(promoLinkedinSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: promoLinkedinSettings.userId, set: values })
  return readLinkedinSettings(userId, db)
}

export type LinkedinSearcherView = {
  id: string
  profileId: string
  profileName: string
  /** Who LinkedIn last said the profile is signed in as, or "" when it was signed out or never looked at. */
  slug: string
  viewsToday: number
  viewsPerDay: number
  /** Why it takes no reads today, or "" when it does. */
  stoppedReason: string
  lastUsedAt: Date | null
}

function viewsToday(row: { viewsOn: string | null; views: number }, today: string): number {
  return row.viewsOn === today ? row.views : 0
}

export async function listLinkedinSearchers(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<LinkedinSearcherView[]> {
  const today = utcDay(now)
  const { viewsPerDay } = await readLinkedinSettings(userId, db)
  const rows = await db
    .select({ searcher: promoLinkedinSearchers, profileName: promoProfiles.name })
    .from(promoLinkedinSearchers)
    .innerJoin(promoProfiles, eq(promoProfiles.id, promoLinkedinSearchers.profileId))
    .where(eq(promoLinkedinSearchers.userId, userId))
    .orderBy(asc(promoLinkedinSearchers.createdAt), asc(promoLinkedinSearchers.id))
  return rows.map(({ searcher, profileName }) => {
    const views = viewsToday(searcher, today)
    return {
      id: searcher.id,
      profileId: searcher.profileId,
      profileName,
      slug: searcher.slug,
      viewsToday: views,
      viewsPerDay,
      stoppedReason:
        searcher.stoppedOn === today
          ? searcher.stopReason
          : views >= viewsPerDay
            ? `It has seen ${views} of ${viewsPerDay} posts today, so it rests until midnight UTC.`
            : "",
      lastUsedAt: searcher.lastUsedAt,
    }
  })
}

/**
 * Makes a browser profile a LinkedIn search account. The profile must hold no
 * account of any network, must not be the reader, which has to stay signed
 * in to nobody, and must not already search X, because one profile is one
 * person to a website.
 */
export async function addLinkedinSearcher(userId: string, profileId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const [profile] = await db
    .select({ name: promoProfiles.name })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Error("That browser profile does not exist.")
  const [holder] = await db.select({ id: promoAccounts.id }).from(promoAccounts).where(eq(promoAccounts.profileId, profileId)).limit(1)
  if (holder) {
    throw new Error(`The profile ${profile.name} holds an account that posts, so it can't search LinkedIn. A search account only ever reads.`)
  }
  const [reader] = await db
    .select({ id: promoBehaviourSettings.readerProfileId })
    .from(promoBehaviourSettings)
    .where(eq(promoBehaviourSettings.userId, userId))
    .limit(1)
  if (reader?.id === profileId) {
    throw new Error(`The profile ${profile.name} is the reader, which has to stay signed in to nobody. Make a new profile for LinkedIn's searching.`)
  }
  const [xSearcher] = await db.select({ id: promoXSearchers.id }).from(promoXSearchers).where(eq(promoXSearchers.profileId, profileId)).limit(1)
  if (xSearcher) {
    throw new Error(`The profile ${profile.name} already searches X. Make a new profile for LinkedIn's searching.`)
  }
  const id = uuid()
  const added = await db
    .insert(promoLinkedinSearchers)
    .values({ id, userId, profileId })
    .onConflictDoNothing()
    .returning({ id: promoLinkedinSearchers.id })
  if (!added.length) throw new Error(`The profile ${profile.name} already searches LinkedIn.`)
  return id
}

/** Stops a profile searching LinkedIn. Its waiting reads go to another search account when they run. */
export async function removeLinkedinSearcher(userId: string, searcherId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoLinkedinSearchers)
    .where(and(eq(promoLinkedinSearchers.id, searcherId), eq(promoLinkedinSearchers.userId, userId)))
    .returning({ id: promoLinkedinSearchers.id })
  if (!removed.length) throw new Error("That search account is not saved any more.")
}

/** A read waiting in a search account's lane is counted as this many views when picking where the next goes. */
const VIEWS_PER_WAITING_READ = 15

/** What any LinkedIn read says when there is no search account at all. */
const NO_SEARCHER_MESSAGE =
  "There is no LinkedIn search account, so LinkedIn can't be read. LinkedIn shows almost nothing to a visitor who is not signed in. Add a browser profile signed in to a spare LinkedIn account under LinkedIn in Settings → Behaviour."

export type PickedLinkedinSearcher = { id: string; profileId: string; profileName: string; viewsLeft: number }

/**
 * The search account to read with now: the one with the most views left
 * today, then the one used longest ago. Refused, never swapped for an account
 * that comments, when there is none or every one has used its day.
 */
export async function pickLinkedinSearcher(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<PickedLinkedinSearcher> {
  const searchers = await listLinkedinSearchers(userId, db, now)
  if (!searchers.length) throw new Refusal(NO_SEARCHER_MESSAGE)
  // Reads already waiting count too, so a batch queued at once spreads over
  // every search account instead of all landing on the one with most left.
  const waiting = await db
    .select({ lane: promoJobs.lane, n: sql<number>`count(*)::int` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        inArray(promoJobs.kind, [...LINKEDIN_SEARCHER_JOB_KINDS]),
        inArray(promoJobs.status, ["queued", "running"])
      )
    )
    .groupBy(promoJobs.lane)
  const queued = new Map(waiting.map((row) => [row.lane ?? "", row.n]))
  const load = (searcher: LinkedinSearcherView) => searcher.viewsToday + (queued.get(searcher.profileId) ?? 0) * VIEWS_PER_WAITING_READ
  const best = searchers
    .filter((searcher) => !searcher.stoppedReason)
    .sort(
      (a, b) =>
        load(a) - load(b) || (a.lastUsedAt?.getTime() ?? 0) - (b.lastUsedAt?.getTime() ?? 0) || a.id.localeCompare(b.id)
    )[0]
  if (!best) {
    const first = searchers[0]
    throw new Refusal(
      searchers.length === 1 && first
        ? `The LinkedIn search account in ${first.profileName} can't read any more today. ${first.stoppedReason}`
        : `Every LinkedIn search account is resting until midnight UTC. Each has used its ${first?.viewsPerDay ?? 0} views or was stopped by LinkedIn. Add another under LinkedIn in Settings → Behaviour, or raise the number there.`
    )
  }
  return { id: best.id, profileId: best.profileId, profileName: best.profileName, viewsLeft: best.viewsPerDay - best.viewsToday }
}

/**
 * The search account a read filed under `profileId` runs as, or the one it
 * should move to: the one it was filed under while it still has views left,
 * else the best other one. Refused when none can read.
 */
export async function linkedinSearcherForLane(
  userId: string,
  profileId: string | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ searcher: PickedLinkedinSearcher } | { moveTo: string }> {
  const searchers = await listLinkedinSearchers(userId, db, now)
  const filed = searchers.find((searcher) => searcher.profileId === profileId)
  if (filed && !filed.stoppedReason) {
    return {
      searcher: { id: filed.id, profileId: filed.profileId, profileName: filed.profileName, viewsLeft: filed.viewsPerDay - filed.viewsToday },
    }
  }
  const picked = await pickLinkedinSearcher(userId, db, now)
  return { moveTo: picked.profileId }
}

/**
 * Counts one read against its search account, then refuses to go on when
 * LinkedIn showed its limit or a check: it then answers with nothing, which
 * must never be read as a post gone or a person missing. The job tries again
 * later, on another search account if there is one with views left.
 */
export async function spendLinkedinViews(
  searcherId: string,
  read: { viewed: number; limited: boolean },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const today = utcDay(now)
  const viewed = Math.max(0, Math.round(read.viewed))
  await db
    .update(promoLinkedinSearchers)
    .set({
      views: sql`CASE WHEN ${promoLinkedinSearchers.viewsOn} = ${today}::date THEN ${promoLinkedinSearchers.views} + ${viewed} ELSE ${viewed} END`,
      viewsOn: today,
      lastUsedAt: now,
      ...(read.limited ? { stoppedOn: today, stopReason: "LinkedIn showed its limit, so it rests until midnight UTC." } : {}),
    })
    .where(eq(promoLinkedinSearchers.id, searcherId))
  if (!read.limited) return
  const [searcher] = await db
    .select({ userId: promoLinkedinSearchers.userId, name: promoProfiles.name })
    .from(promoLinkedinSearchers)
    .innerJoin(promoProfiles, eq(promoProfiles.id, promoLinkedinSearchers.profileId))
    .where(eq(promoLinkedinSearchers.id, searcherId))
    .limit(1)
  if (searcher) {
    await ringBell(
      searcher.userId,
      {
        kind: "linkedin_searcher",
        targetId: `${searcherId}:${today}`,
        message: `${NOTICE_HEADINGS.linkedin_searcher} ${searcher.name}`,
        detail: "LinkedIn showed its limit, which caps how much an account may look at in a day. It reads nothing more today; the other search accounts carry on.",
        href: "/admin/settings/behaviour",
      },
      db,
      now
    )
  }
  throw new TryAgainLater("LinkedIn showed its limit to the search account, so nothing it read was kept.", 15 * 60_000)
}

/** Stops a search account for the rest of today with LinkedIn's own words: a restriction, a sign-out, an account that comments. */
export async function stopLinkedinSearcher(
  searcherId: string,
  reason: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(promoLinkedinSearchers)
    .set({ stoppedOn: utcDay(now), stopReason: reason.slice(0, 1_000) })
    .where(eq(promoLinkedinSearchers.id, searcherId))
}

/** Writes who LinkedIn says the search account is signed in as, after each read. */
export async function saveLinkedinSearcherSlug(searcherId: string, slug: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db.update(promoLinkedinSearchers).set({ slug: slug.slice(0, 100) }).where(eq(promoLinkedinSearchers.id, searcherId))
}

/** True when a LinkedIn account that comments is this member, so a search account signed in as it is refused. */
export async function slugComments(userId: string, slug: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  if (!slug) return false
  const [row] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.platform, "linkedin"), sql`lower(${promoAccounts.handle}) = lower(${slug})`))
    .limit(1)
  return Boolean(row)
}

/** The LinkedIn jobs waiting or running of one kind, by a payload key, so two presses never queue the same thing twice. */
export async function waitingLinkedinJobs(
  userId: string,
  kind: JobKind,
  key: string,
  db: CustomShellDb = defaultDb
): Promise<Set<string>> {
  const rows = await db
    .select({ payload: promoJobs.payload })
    .from(promoJobs)
    .where(and(eq(promoJobs.userId, userId), eq(promoJobs.kind, kind), inArray(promoJobs.status, ["queued", "running"])))
  return new Set(rows.map((row) => String(row.payload?.[key] ?? "")).filter(Boolean))
}
