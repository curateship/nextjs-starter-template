import { and, eq, gte, inArray, isNotNull, ne, or, sql } from "drizzle-orm"

import {
  appName,
  AT_RISK_SCREEN_MS,
  COUNTED_BAN_KINDS,
  NEIGHBOUR_SLOW_MS,
  PHONE_KEPT_OFF_AFTER,
  timesWords,
} from "@/lib/bans/options"
import { aNetwork, isNetwork } from "@/lib/social/networks"
import { promoProfiles, promoProxies } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoPhones } from "@/server/phones/schema"
import { promoAccounts } from "@/server/social/schema"

import { promoAppBrakes, promoBans } from "./schema"

/**
 * What a ban leaves behind, read back (Bans task, parts 3, 5, 11, 13, 20, 21,
 * 23 and 24). Only rows are read here; nothing is written.
 *
 * Only the kinds in `COUNTED_BAN_KINDS` mark a phone, a proxy or a SIM. A ban
 * that was let run again still counts, because the app still saw it.
 */

/**
 * Per place, how many accounts a counted ban of each app hit: `{ instagram: 2 }`.
 * Accounts, not rows: one account let run again and banned again is still
 * one account lost.
 */
export type BanCounts = Record<string, number>

const counted = inArray(promoBans.kind, [...COUNTED_BAN_KINDS])

/** Counted bans per phone and app. Phones with none are left out. */
export async function phoneBanCounts(userId: string, phoneIds: string[] | null, db: CustomShellDb = defaultDb): Promise<Map<string, BanCounts>> {
  if (phoneIds && !phoneIds.length) return new Map()
  const rows = await db
    .select({ place: promoBans.phoneId, app: promoBans.app, count: sql<number>`count(DISTINCT coalesce(${promoBans.accountId}, ${promoBans.id}))::int` })
    .from(promoBans)
    .where(and(eq(promoBans.userId, userId), counted, isNotNull(promoBans.phoneId), ...(phoneIds ? [inArray(promoBans.phoneId, phoneIds)] : [])))
    .groupBy(promoBans.phoneId, promoBans.app)
  return gather(rows)
}

/** Counted bans per proxy and app (part 13). */
export async function proxyBanCounts(userId: string, proxyIds: string[] | null, db: CustomShellDb = defaultDb): Promise<Map<string, BanCounts>> {
  if (proxyIds && !proxyIds.length) return new Map()
  const rows = await db
    .select({ place: promoBans.proxyId, app: promoBans.app, count: sql<number>`count(DISTINCT coalesce(${promoBans.accountId}, ${promoBans.id}))::int` })
    .from(promoBans)
    .where(and(eq(promoBans.userId, userId), counted, isNotNull(promoBans.proxyId), ...(proxyIds ? [inArray(promoBans.proxyId, proxyIds)] : [])))
    .groupBy(promoBans.proxyId, promoBans.app)
  return gather(rows)
}

/** Counted bans per SIM number and app (part 13). An empty number is no SIM and never matches. */
async function simBanCounts(userId: string, simNumbers: string[], db: CustomShellDb = defaultDb): Promise<Map<string, BanCounts>> {
  const numbers = [...new Set(simNumbers.map((number) => number.trim()).filter(Boolean))]
  if (!numbers.length) return new Map()
  const rows = await db
    .select({ place: promoBans.simNumber, app: promoBans.app, count: sql<number>`count(DISTINCT coalesce(${promoBans.accountId}, ${promoBans.id}))::int` })
    .from(promoBans)
    .where(and(eq(promoBans.userId, userId), counted, inArray(promoBans.simNumber, numbers)))
    .groupBy(promoBans.simNumber, promoBans.app)
  return gather(rows)
}

function gather(rows: Array<{ place: string | null; app: string; count: number }>): Map<string, BanCounts> {
  const out = new Map<string, BanCounts>()
  for (const row of rows) {
    if (!row.place) continue
    const counts = out.get(row.place) ?? {}
    counts[row.app] = row.count
    out.set(row.place, counts)
  }
  return out
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
const numberWords = (count: number) => NUMBER_WORDS[count] ?? String(count)

/** The refusal for a phone kept off an app (part 3), the same words on every screen and on the server. */
function phoneKeptOffWords(app: string, count: number): string {
  const name = appName(app)
  return `This phone lost ${numberWords(count)} ${name} accounts. Use another phone for ${name}.`
}

/** What a place's bans say about a new account of `app` going there. */
export type PlaceBanCheck = {
  /** Why it is refused, or null. */
  refusal: string | null
  /** What it warns about, each a sentence. Saving still goes through. */
  warnings: string[]
  /** The same in a few words, for beside the phone or profile in a picker. Empty when there is nothing. */
  note: string
}

/**
 * Whether a new account of `app` may go on this phone or browser profile,
 * from the bans there (parts 3, 5 and 13):
 *
 * - the phone after one counted ban of the app warns, after two it is
 *   refused for that app and stays open to the others;
 * - a proxy that was in a counted ban of the app is refused for that app,
 *   on a Wi-Fi phone and on a browser profile alike;
 * - a SIM that was in a counted ban of the app warns, because a new SIM is a
 *   trip to the shop (Tyler, 3 Nov 2026).
 */
export async function placeBanCheck(
  userId: string,
  place: { phoneId: string | null; profileId: string | null },
  app: string,
  db: CustomShellDb = defaultDb
): Promise<PlaceBanCheck> {
  if (place.phoneId) {
    const [phone] = await db
      .select({ id: promoPhones.id, proxyId: promoPhones.proxyId, connection: promoPhones.connection, simNumber: promoPhones.simNumber })
      .from(promoPhones)
      .where(and(eq(promoPhones.id, place.phoneId), eq(promoPhones.userId, userId)))
      .limit(1)
    if (!phone) return { refusal: null, warnings: [], note: "" }
    return (await phonesBanChecks(userId, [phone], app, db)).get(phone.id) ?? { refusal: null, warnings: [], note: "" }
  }
  if (!place.profileId) return { refusal: null, warnings: [], note: "" }
  const [profile] = await db
    .select({ proxyId: promoProfiles.proxyId })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, place.profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  const proxyId = profile?.proxyId ?? null
  const proxy = proxyId && ((await proxyBanCounts(userId, [proxyId], db)).get(proxyId)?.[app] ?? 0) > 0 ? await proxyName(proxyId, db) : null
  return describePlace(app, { phoneCount: 0, simBanned: false, proxy, proxyOn: "profile" })
}

type PhonePlace = { id: string; proxyId: string | null; connection: string; simNumber: string }

/**
 * The same check for many phones at once, three reads in all, for the phone
 * pickers (`phonesFreeFor`), which list every phone each time they open.
 */
export async function phonesBanChecks(userId: string, phones: readonly PhonePlace[], app: string, db: CustomShellDb = defaultDb): Promise<Map<string, PlaceBanCheck>> {
  const proxyOf = (phone: PhonePlace) => (phone.connection === "wifi" ? phone.proxyId : null)
  const simOf = (phone: PhonePlace) => (phone.connection === "sim" ? phone.simNumber.trim() : "")
  const [byPhone, byProxy, bySim] = await Promise.all([
    phoneBanCounts(userId, phones.map((phone) => phone.id), db),
    proxyBanCounts(userId, phones.flatMap((phone) => proxyOf(phone) ?? []), db),
    simBanCounts(userId, phones.map(simOf), db),
  ])
  const out = new Map<string, PlaceBanCheck>()
  for (const phone of phones) {
    const proxyId = proxyOf(phone)
    const sim = simOf(phone)
    const proxyBanned = Boolean(proxyId && (byProxy.get(proxyId)?.[app] ?? 0) > 0)
    out.set(
      phone.id,
      describePlace(app, {
        phoneCount: byPhone.get(phone.id)?.[app] ?? 0,
        simBanned: Boolean(sim && (bySim.get(sim)?.[app] ?? 0) > 0),
        proxy: proxyBanned && proxyId ? await proxyName(proxyId, db) : null,
        proxyOn: "phone",
      })
    )
  }
  return out
}

async function proxyName(proxyId: string, db: CustomShellDb): Promise<string> {
  const [proxy] = await db.select({ label: promoProxies.label, host: promoProxies.host }).from(promoProxies).where(eq(promoProxies.id, proxyId)).limit(1)
  return proxy ? proxy.label || proxy.host : "its proxy"
}

/** The words for one place, from what its bans add up to. One place for them, so the picker and the refusal never differ. */
function describePlace(
  app: string,
  found: { phoneCount: number; simBanned: boolean; proxy: string | null; proxyOn: "phone" | "profile" }
): PlaceBanCheck {
  const name = appName(app)
  const article = isNetwork(app) ? aNetwork(app).split(" ")[0] : "a"
  const warnings: string[] = []
  const notes: string[] = []
  let refusal: string | null = null
  if (found.phoneCount >= PHONE_KEPT_OFF_AFTER) {
    refusal = phoneKeptOffWords(app, found.phoneCount)
    notes.push(`banned ${timesWords(found.phoneCount)}, kept off ${name}`)
  } else if (found.phoneCount > 0) {
    warnings.push(`Banned on ${name} ${timesWords(found.phoneCount)}.`)
    notes.push(`banned on ${name} ${timesWords(found.phoneCount)}`)
  }
  if (found.simBanned) {
    warnings.push(`This SIM was used by a banned ${name} account.`)
    notes.push(`its SIM was in ${article} ${name} ban`)
  }
  if (!refusal && found.proxy) {
    refusal =
      found.proxyOn === "phone"
        ? `The proxy ${found.proxy} was used by a banned ${name} account. Pick another proxy on the phone's Settings tab before it takes ${article} ${name} account.`
        : `The proxy ${found.proxy} was used by a banned ${name} account. Pick another proxy for this browser profile on the Browser profiles dashboard before it takes ${article} ${name} account.`
    notes.push(`its proxy was in ${article} ${name} ban`)
  }
  return { refusal, warnings, note: notes.join(", ") }
}

/**
 * Refuses a new account of `app` on a place its bans keep it off, with
 * words naming what to do (parts 3 and 5). The account already there keeps
 * it, so saving its own settings again is never refused.
 */
export async function refuseBannedPlace(
  userId: string,
  place: { phoneId: string | null; profileId: string | null },
  app: string,
  accountId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!place.phoneId && !place.profileId) return
  if (accountId) {
    const [already] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(
        and(
          eq(promoAccounts.id, accountId),
          place.phoneId ? eq(promoAccounts.phoneId, place.phoneId) : eq(promoAccounts.profileId, place.profileId ?? "")
        )
      )
      .limit(1)
    if (already) return
  }
  const check = await placeBanCheck(userId, place, app, db)
  if (check.refusal) throw new Error(check.refusal)
}

/** Where an account runs now: its phone, the proxy it shows, and its SIM number. */
type AccountPlace = { id: string; phoneId: string | null; proxyId: string | null; simNumber: string }

async function accountPlaces(userId: string, accountIds: string[], db: CustomShellDb): Promise<AccountPlace[]> {
  if (!accountIds.length) return []
  const rows = await db
    .select({
      id: promoAccounts.id,
      phoneId: promoAccounts.phoneId,
      phoneProxy: promoPhones.proxyId,
      connection: promoPhones.connection,
      sim: promoPhones.simNumber,
      profileProxy: promoProfiles.proxyId,
    })
    .from(promoAccounts)
    .leftJoin(promoPhones, eq(promoPhones.id, promoAccounts.phoneId))
    .leftJoin(promoProfiles, eq(promoProfiles.id, promoAccounts.profileId))
    .where(and(eq(promoAccounts.userId, userId), inArray(promoAccounts.id, accountIds)))
  return rows.map((row) => ({
    id: row.id,
    phoneId: row.phoneId,
    proxyId: row.phoneId ? (row.connection === "wifi" ? row.phoneProxy : null) : row.profileProxy,
    simNumber: row.phoneId && row.connection === "sim" ? (row.sim ?? "").trim() : "",
  }))
}

/** A ban that touched an account's phone, proxy or SIM in the last 2 days, by another account (part 24). */
type NeighbourBan = { on: "phone" | "proxy" | "SIM"; at: Date; app: string }

/** Each account's newest neighbour ban in the last 2 days, if any (parts 21 and 24). */
export async function neighbourBans(
  userId: string,
  accountIds: string[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Map<string, NeighbourBan>> {
  const out = new Map<string, NeighbourBan>()
  const places = await accountPlaces(userId, accountIds, db)
  const phones = places.flatMap((place) => (place.phoneId ? [place.phoneId] : []))
  const proxies = places.flatMap((place) => (place.proxyId ? [place.proxyId] : []))
  const sims = places.flatMap((place) => (place.simNumber ? [place.simNumber] : []))
  if (!phones.length && !proxies.length && !sims.length) return out
  const bans = await db
    .select({ accountId: promoBans.accountId, phoneId: promoBans.phoneId, proxyId: promoBans.proxyId, simNumber: promoBans.simNumber, at: promoBans.at, app: promoBans.app })
    .from(promoBans)
    .where(
      and(
        eq(promoBans.userId, userId),
        gte(promoBans.at, new Date(now.getTime() - NEIGHBOUR_SLOW_MS)),
        or(
          ...(phones.length ? [inArray(promoBans.phoneId, phones)] : []),
          ...(proxies.length ? [inArray(promoBans.proxyId, proxies)] : []),
          ...(sims.length ? [and(ne(promoBans.simNumber, ""), inArray(promoBans.simNumber, sims))] : [])
        )
      )
    )
  for (const place of places) {
    for (const ban of bans) {
      if (ban.accountId === place.id) continue
      const on: NeighbourBan["on"] | null =
        place.phoneId && ban.phoneId === place.phoneId
          ? "phone"
          : place.proxyId && ban.proxyId === place.proxyId
            ? "proxy"
            : place.simNumber && ban.simNumber === place.simNumber
              ? "SIM"
              : null
      if (!on) continue
      const known = out.get(place.id)
      if (!known || known.at < ban.at) out.set(place.id, { on, at: ban.at, app: ban.app })
    }
  }
  return out
}

const dayWords = (at: Date) => at.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })

/** What an account needs to know whether it goes at half pace. */
export type SlowFields = { id: string; platform: string; shadowbanned: boolean | null; slowUntil: Date | null }

/**
 * Why each account goes at half pace, in the words its row shows, or no
 * entry when it runs at full pace (parts 20, 23 and 24):
 *
 * - "Half pace while shadowbanned" until a clear reading;
 * - "Half pace until 10 Nov" for 7 days after "Let it run again";
 * - "Half pace: an account on the same phone was banned" for 2 days after a
 *   ban on its phone, proxy or SIM.
 *
 * Half pace never queues anything: nothing posts without a person pressing Post.
 */
export async function slowReasons(
  userId: string,
  accounts: readonly SlowFields[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const rest: string[] = []
  for (const account of accounts) {
    if (account.shadowbanned === true) out.set(account.id, "Half pace while shadowbanned")
    else if (account.slowUntil && account.slowUntil > now) out.set(account.id, `Half pace until ${dayWords(account.slowUntil)}`)
    else rest.push(account.id)
  }
  const neighbours = await neighbourBans(userId, rest, db, now)
  for (const [accountId, ban] of neighbours) out.set(accountId, `Half pace: an account on the same ${ban.on} was banned`)
  return out
}

/** One account's half-pace reason, or null at full pace. */
export async function slowReason(
  userId: string,
  account: SlowFields,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  return (await slowReasons(userId, [account], db, now)).get(account.id) ?? null
}

/** The fields the At risk signs read (part 21). */
export type RiskFields = { id: string; platform: string; shadowbanned: boolean | null; xReach: string; linkedinSeen: string }

/**
 * Why each account is At risk, in the words under its status, or no entry
 * (part 21): shadowbanned, its X reach read hidden or folded or its
 * LinkedIn read hidden, a locked or "confirm it's you" screen in the last 7
 * days, or another account on its phone, proxy or SIM banned in the last 2
 * days. Banned wins over all of these; the caller decides that.
 */
export async function atRiskSigns(
  userId: string,
  accounts: readonly RiskFields[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (!accounts.length) return out
  const ids = accounts.map((account) => account.id)
  const screens = await db
    .select({ accountId: promoBans.accountId, kind: promoBans.kind, at: promoBans.at })
    .from(promoBans)
    .where(
      and(
        eq(promoBans.userId, userId),
        inArray(promoBans.accountId, ids),
        inArray(promoBans.kind, ["locked", "confirm"]),
        gte(promoBans.at, new Date(now.getTime() - AT_RISK_SCREEN_MS))
      )
    )
  const lastScreen = new Map<string, { kind: string; at: Date }>()
  for (const row of screens) {
    if (!row.accountId) continue
    const known = lastScreen.get(row.accountId)
    if (!known || known.at < row.at) lastScreen.set(row.accountId, { kind: row.kind, at: row.at })
  }
  const neighbours = await neighbourBans(userId, ids, db, now)
  for (const account of accounts) {
    const screen = lastScreen.get(account.id)
    const neighbour = neighbours.get(account.id)
    const sign =
      account.shadowbanned === true
        ? "At risk: shadowbanned"
        : account.platform === "x" && (account.xReach === "hidden" || account.xReach === "folded")
          ? `At risk: X reads its replies as ${account.xReach}`
          : account.platform === "linkedin" && account.linkedinSeen === "hidden"
            ? "At risk: its LinkedIn comments read as hidden"
            : screen
              ? `At risk: ${screen.kind === "confirm" ? "a \"confirm it's you\"" : "a locked"} screen on ${dayWords(screen.at)}`
              : neighbour
                ? `At risk: an account on the same ${neighbour.on} was banned on ${dayWords(neighbour.at)}`
                : null
    if (sign) out.set(account.id, sign)
  }
  return out
}

/** The apps the brake is on for (part 11). */
export async function brakedApps(userId: string, db: CustomShellDb = defaultDb): Promise<Map<string, Date>> {
  const rows = await db.select({ app: promoAppBrakes.app, at: promoAppBrakes.brakedAt }).from(promoAppBrakes).where(eq(promoAppBrakes.userId, userId))
  return new Map(rows.map((row) => [row.app, row.at]))
}

/** Whether the brake holds this app's accounts (part 11). */
export async function isBraked(userId: string, app: string, db: CustomShellDb = defaultDb): Promise<boolean> {
  const [row] = await db
    .select({ app: promoAppBrakes.app })
    .from(promoAppBrakes)
    .where(and(eq(promoAppBrakes.userId, userId), eq(promoAppBrakes.app, app)))
    .limit(1)
  return Boolean(row)
}
