import { and, asc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { promoProfiles, promoProxies } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import {
  BEHAVIOUR_DEFAULTS,
  BEHAVIOUR_RANGES,
  NO_READER_MESSAGE,
} from "@/lib/social/options"
import { knownTimeZone } from "@/lib/social/waking"

import { promoAccounts, promoBehaviourSettings, promoComments, promoJobs } from "./schema"

/**
 * How every account behaves, whatever it runs on. Settings → Behaviour.
 *
 * Tyler, 9 Oct 2026: the fingerprint is probably not what gets an account
 * caught, the behaviour is. So an account never searches, keeps waking hours
 * in its own time zone, warms up before its first comment, and while young
 * cannot comment faster than a set pace. These are the numbers for all of
 * that, one row per person, and the reader browser that does the searching.
 */

export type BehaviourSettings = {
  readerProfileId: string | null
  wakeFromMinute: number
  wakeUntilMinute: number
  warmUpDays: number
  youngDays: number
  youngPerHour: number
  youngPerDay: number
  warnPerHour: number
}

const DAY_MS = 86_400_000

export async function readBehaviour(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<BehaviourSettings> {
  const [row] = await db
    .select()
    .from(promoBehaviourSettings)
    .where(eq(promoBehaviourSettings.userId, userId))
    .limit(1)
  if (!row) return { readerProfileId: null, ...BEHAVIOUR_DEFAULTS }
  return {
    readerProfileId: row.readerProfileId,
    wakeFromMinute: row.wakeFromMinute,
    wakeUntilMinute: row.wakeUntilMinute,
    warmUpDays: row.warmUpDays,
    youngDays: row.youngDays,
    youngPerHour: row.youngPerHour,
    youngPerDay: row.youngPerDay,
    warnPerHour: row.warnPerHour,
  }
}

/**
 * Saves every number and the reader together, so the tab sends what is on
 * screen and nothing half-saved is left.
 *
 * A reader has to be signed in to nobody. A profile that holds an account is
 * refused here by name, before it could search as that account.
 */
export async function saveBehaviour(
  userId: string,
  input: BehaviourSettings,
  db: CustomShellDb = defaultDb
): Promise<BehaviourSettings> {
  for (const key of Object.keys(BEHAVIOUR_RANGES) as Array<keyof typeof BEHAVIOUR_RANGES>) {
    const value = input[key]
    const range = BEHAVIOUR_RANGES[key]
    if (!Number.isInteger(value) || value < range.min || value > range.max) {
      throw new Error(`That number has to be a whole number from ${range.min} to ${range.max}.`)
    }
  }
  if (input.wakeFromMinute === input.wakeUntilMinute) {
    throw new Error("Waking hours have to start and end at different times.")
  }

  if (input.readerProfileId) {
    const [profile] = await db
      .select({ name: promoProfiles.name })
      .from(promoProfiles)
      .where(and(eq(promoProfiles.id, input.readerProfileId), eq(promoProfiles.userId, userId)))
      .limit(1)
    if (!profile) throw new Error("That browser profile does not exist.")
    const [holder] = await db
      .select({ handle: promoAccounts.handle })
      .from(promoAccounts)
      .where(eq(promoAccounts.profileId, input.readerProfileId))
      .limit(1)
    if (holder) {
      throw new Error(
        `The profile ${profile.name} holds an account, so it cannot be the reader. A reader is signed in to nobody.`
      )
    }
  }

  const values = { ...input, updatedAt: new Date() }
  await db
    .insert(promoBehaviourSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: promoBehaviourSettings.userId, set: values })
  return readBehaviour(userId, db)
}

/**
 * The reader profile a search, a reply read or a stranger's check runs in.
 *
 * Refused, never swapped for the account's own browser, when none is picked
 * or the one picked has since been given an account.
 */
export async function readerProfile(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<{ id: string; name: string }> {
  const { readerProfileId } = await readBehaviour(userId, db)
  if (!readerProfileId) throw new Refusal(NO_READER_MESSAGE)
  const [profile] = await db
    .select({ id: promoProfiles.id, name: promoProfiles.name })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, readerProfileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Refusal(NO_READER_MESSAGE)
  const [holder] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(eq(promoAccounts.profileId, readerProfileId))
    .limit(1)
  if (holder) {
    throw new Refusal(
      `The reader browser ${profile.name} now holds an account, so nothing is read in it. Pick another reader in Settings → Behaviour.`
    )
  }
  return profile
}

/**
 * The time zone an account lives in: the clock its browser shows.
 *
 * The browser copies its clock from the proxy's outside address, which the
 * proxy's last test read. Without a proxy, or before a test, it is the clock
 * the browser last showed a site. Neither known, UTC.
 */
export async function profileTimeZone(
  profileId: string | null,
  db: CustomShellDb = defaultDb
): Promise<string> {
  if (!profileId) return "UTC"
  const [row] = await db
    .select({ fingerprint: promoProfiles.fingerprint, proxyTest: promoProxies.lastTestResult })
    .from(promoProfiles)
    .leftJoin(promoProxies, eq(promoProxies.id, promoProfiles.proxyId))
    .where(eq(promoProfiles.id, profileId))
    .limit(1)
  return knownTimeZone(row?.proxyTest?.timezone || row?.fingerprint?.seen?.timezone || null)
}

/**
 * When an account's warm-up ends, counted from the day Reddit made it.
 * Null when it is over or switched off. Undefined when the age has never been
 * read, so nobody can tell.
 */
export function warmUpEndsAt(
  redditCreatedAt: Date | null,
  warmUpDays: number,
  now: Date = new Date()
): Date | null | undefined {
  if (warmUpDays === 0) return null
  if (!redditCreatedAt) return undefined
  const ends = new Date(redditCreatedAt.getTime() + warmUpDays * DAY_MS)
  return ends > now ? ends : null
}

/** Whether an account counts as young, which brings the pace limits in. Unknown age counts as young. */
export function isYoung(redditCreatedAt: Date | null, youngDays: number, now: Date = new Date()): boolean {
  if (youngDays === 0) return false
  if (!redditCreatedAt) return true
  return now.getTime() - redditCreatedAt.getTime() < youngDays * DAY_MS
}

/**
 * The account's comments that reached Reddit in the last day, oldest first,
 * and how many are pressed and waiting to go.
 */
export async function recentComments(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ posted: Date[]; waiting: number }> {
  const since = new Date(now.getTime() - DAY_MS)
  const rows = await db
    .select({ postedAt: promoComments.postedAt })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.accountId, accountId),
        eq(promoComments.status, "posted"),
        gte(promoComments.postedAt, since)
      )
    )
    .orderBy(asc(promoComments.postedAt))
  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoJobs)
    .where(
      and(
        eq(promoJobs.userId, userId),
        eq(promoJobs.kind, "comment"),
        inArray(promoJobs.status, ["queued", "running"]),
        sql`${promoJobs.payload}->>'accountId' = ${accountId}`
      )
    )
  return { posted: rows.map((row) => row.postedAt), waiting: pending?.count ?? 0 }
}

/** Every Reddit account in use with a browser profile, for the tickers. A retired one never warms up. */
export async function accountsWithProfiles(db: CustomShellDb = defaultDb) {
  return db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.platform, "reddit"),
        isNotNull(promoAccounts.profileId),
        isNull(promoAccounts.retiredAt)
      )
    )
}

export type BehaviourAccount = {
  id: string
  handle: string
  /** The clock its waking hours are counted on. */
  timeZone: string
  redditCreatedAt: Date | null
  /** Null when the warm-up is over, off, or the age is unknown. */
  warmUpEndsAt: Date | null
  ageUnknown: boolean
}

export type BehaviourView = {
  settings: BehaviourSettings
  /** Profiles that could be the reader: every one holding no account. */
  readers: Array<{ id: string; name: string }>
  accounts: BehaviourAccount[]
}

/** What Settings → Behaviour draws: the settings, the possible readers, and each account's clock and warm-up. */
export async function readBehaviourView(
  userId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<BehaviourView> {
  const settings = await readBehaviour(userId, db)
  const profiles = await db
    .select({ id: promoProfiles.id, name: promoProfiles.name, holder: promoAccounts.id })
    .from(promoProfiles)
    .leftJoin(promoAccounts, eq(promoAccounts.profileId, promoProfiles.id))
    .where(eq(promoProfiles.userId, userId))
    .orderBy(asc(promoProfiles.name))
  const accounts = await db
    .select()
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, "reddit"),
        isNull(promoAccounts.retiredAt)
      )
    )
    .orderBy(asc(promoAccounts.createdAt))

  const views: BehaviourAccount[] = []
  for (const account of accounts) {
    const ends = warmUpEndsAt(account.redditCreatedAt, settings.warmUpDays, now)
    views.push({
      id: account.id,
      handle: account.handle,
      timeZone: await profileTimeZone(account.profileId, db),
      redditCreatedAt: account.redditCreatedAt,
      warmUpEndsAt: ends ?? null,
      ageUnknown: ends === undefined,
    })
  }

  return {
    settings,
    // The join gives a profile one row per account it holds, and none of
    // those rows may be offered; a profile holding nothing has one row.
    readers: profiles
      .filter((row) => !row.holder)
      .map(({ id, name }) => ({ id, name })),
    accounts: views,
  }
}
