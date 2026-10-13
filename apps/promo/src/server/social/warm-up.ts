import { and, desc, eq, inArray, ne, sql } from "drizzle-orm"

import { redditWarmUp, type CommandTarget } from "@/server/browser/command"
import { promoProfileLabels, promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { isAwake, localDateKey, wakeEndsAt } from "@/lib/social/waking"

import {
  accountsWithProfiles,
  profileTimeZone,
  readBehaviour,
  warmUpEndsAt,
  type BehaviourSettings,
} from "./behaviour"
import { queueJob } from "./jobs"
import { pausedBy } from "./pause"
import { promoAccounts, promoBlockedSubreddits, promoFinds, promoJobs, promoKeywords } from "./schema"

/**
 * Warming up a new account before its first comment.
 *
 * An account Reddit made fewer than the warm-up's days ago is Warming. Post is
 * refused for it (`posting.ts`), and once a day, at a time picked at random
 * inside its waking hours, it visits Reddit: scrolls the feed, opens a few
 * posts, and joins one or two subreddits Promo has found posts in. Nothing is
 * written and nothing is voted on. Tyler, 12 Oct 2026: no upvotes.
 *
 * When the warm-up ends, a profile labelled Warming moves to Ready. A profile
 * with no label gets Warming while it warms. Banned, and any label a person
 * made, are never touched. The Ready and Warming labels are the ones the
 * Browser profiles dashboard makes on its first visit; until then there is
 * nothing to label with, and nothing is labelled.
 */

/** The latest a day's warm-up is put, so it never runs into the end of the account's day. */
const MAX_DELAY_MS = 4 * 3_600_000
const END_OF_DAY_MARGIN_MS = 20 * 60_000

/**
 * Queues today's warm-up for every warming, signed-in account that is awake
 * and has not had one today, its own day. Also keeps the profile label in
 * step with the warm-up. Returns how many it queued.
 */
export async function queueDueWarmUps(
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  random: () => number = Math.random
): Promise<number> {
  const accounts = await accountsWithProfiles(db)
  const settingsByUser = new Map<string, BehaviourSettings>()
  let queued = 0

  for (const account of accounts) {
    if (!account.profileId) continue
    // A paused account, or one in a paused project, does not warm up.
    if (await pausedBy(account.userId, account, db)) continue
    let settings = settingsByUser.get(account.userId)
    if (!settings) {
      settings = await readBehaviour(account.userId, db)
      settingsByUser.set(account.userId, settings)
    }
    const ends = warmUpEndsAt(account.redditCreatedAt, settings.warmUpDays, now)
    await keepLabelInStep(account.userId, account.profileId, ends, db)

    // Over, switched off, or the age never read: nothing to warm.
    if (!ends || !account.handle) continue

    const zone = await profileTimeZone(account.profileId, db)
    if (!isAwake(now, zone, settings.wakeFromMinute, settings.wakeUntilMinute)) continue

    const [last] = await db
      .select({ status: promoJobs.status, createdAt: promoJobs.createdAt })
      .from(promoJobs)
      .where(
        and(
          eq(promoJobs.userId, account.userId),
          eq(promoJobs.kind, "warm_up"),
          sql`${promoJobs.payload}->>'accountId' = ${account.id}`
        )
      )
      .orderBy(desc(promoJobs.createdAt))
      .limit(1)
    if (last && (last.status === "queued" || last.status === "running")) continue
    if (last && localDateKey(last.createdAt, zone) === localDateKey(now, zone)) continue

    // A time picked at random between now and four hours on, never later
    // than twenty minutes before the account's day ends, so no two days
    // start their warm-up at the same minute.
    const latest = Math.min(
      now.getTime() + MAX_DELAY_MS,
      wakeEndsAt(now, zone, settings.wakeUntilMinute).getTime() - END_OF_DAY_MARGIN_MS
    )
    const runAfter = new Date(now.getTime() + Math.max(0, latest - now.getTime()) * random())
    await queueJob(account.userId, "warm_up", { accountId: account.id }, db, runAfter)
    queued += 1
  }
  return queued
}

/**
 * Warming while the warm-up runs, Ready once it is over. Only a profile with
 * no label, or the other of these two, is changed.
 */
async function keepLabelInStep(
  userId: string,
  profileId: string,
  ends: Date | null | undefined,
  db: CustomShellDb
): Promise<void> {
  if (ends === undefined) return
  const labels = await db
    .select({ id: promoProfileLabels.id, name: promoProfileLabels.name })
    .from(promoProfileLabels)
    .where(
      and(
        eq(promoProfileLabels.userId, userId),
        inArray(sql`lower(${promoProfileLabels.name})`, ["warming", "ready"])
      )
    )
  const warming = labels.find((label) => label.name.toLowerCase() === "warming")?.id ?? null
  const ready = labels.find((label) => label.name.toLowerCase() === "ready")?.id ?? null

  const [profile] = await db
    .select({ labelId: promoProfiles.labelId })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) return

  let next: string | null = null
  if (ends && warming && profile.labelId === null) next = warming
  if (ends === null && ready && warming && profile.labelId === warming) next = ready
  if (!next) return
  await db
    .update(promoProfiles)
    .set({ labelId: next, updatedAt: new Date() })
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
}

/**
 * The subreddits to join today: those Promo has found the most posts in for
 * the keywords of the account's project, or of every project when it is in
 * none, leaving out blocked ones and ones already joined. One or two, so
 * joining is spread over the days. Keeping to its project's subreddits makes
 * an account look like one person with one interest.
 */
async function subredditsToJoin(
  userId: string,
  projectId: string | null,
  joined: readonly string[],
  db: CustomShellDb,
  random: () => number
): Promise<string[]> {
  const blocked = await db
    .select({ name: sql<string>`lower(${promoBlockedSubreddits.subreddit})` })
    .from(promoBlockedSubreddits)
    .where(eq(promoBlockedSubreddits.userId, userId))
  const skip = new Set([...joined, ...blocked.map((row) => row.name)])

  const found = await db
    .select({
      name: sql<string>`lower(${promoFinds.subreddit})`,
      posts: sql<number>`count(*)::int`,
    })
    .from(promoFinds)
    .innerJoin(promoKeywords, eq(promoKeywords.id, promoFinds.keywordId))
    .where(
      and(
        eq(promoFinds.userId, userId),
        ne(promoFinds.subreddit, ""),
        ...(projectId ? [eq(promoKeywords.projectId, projectId)] : [])
      )
    )
    .groupBy(sql`lower(${promoFinds.subreddit})`)
    .orderBy(sql`count(*) desc`)
    .limit(50)
  const wanted = random() < 0.5 ? 1 : 2
  return found
    .map((row) => row.name)
    .filter((name) => /^[a-z0-9_]{1,60}$/.test(name) && !skip.has(name))
    .slice(0, wanted)
}

/**
 * The day's visit, for a `warm_up` job. Remembers what was joined, so the
 * same subreddit is never asked for twice.
 */
export async function runWarmUp(
  userId: string,
  account: typeof promoAccounts.$inferSelect,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  random: () => number = Math.random
): Promise<void> {
  const joined = (account.joinedSubreddits ?? []).map((name) => name.toLowerCase())
  const subreddits = await subredditsToJoin(userId, account.projectId, joined, db, random)
  const result = await redditWarmUp(target, { subreddits })
  console.log(`Warm-up for account ${account.id}: ${JSON.stringify(result)}`)

  const nowJoined = [...new Set([...joined, ...result.joined, ...result.alreadyJoined])]
  await db
    .update(promoAccounts)
    .set({ joinedSubreddits: nowJoined })
    .where(and(eq(promoAccounts.id, account.id), eq(promoAccounts.userId, userId)))
}
