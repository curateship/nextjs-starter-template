import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm"

import { actionWords } from "@/lib/phones/options"
import { COUNTED_BAN_KINDS, type AppealAnswer, type BanKind } from "@/lib/bans/options"
import { decryptSecret } from "@/server/auth/encryption"
import { promoProxies } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { getFromR2 } from "@/server/media/storage"
import { promoPhoneActions, promoPhones } from "@/server/phones/schema"
import { promoAccounts, promoProjects } from "@/server/social/schema"

import { cleanUpHeldBack } from "./clean-up"
import { brakedApps } from "./rules"
import { unknownScreens, type UnknownScreenView } from "./phrases"
import { promoBanPhrases, promoBans } from "./schema"

/**
 * The Bans dashboard's reads (Bans task, part 12): every ban in one list to
 * spot patterns, one ban's picture and the actions before it, the sellers'
 * bans and dollars lost (part 16), each project's bans in the last 30 days
 * (part 18), the screens Promo is asking about (part 9) and the apps the
 * brake holds (part 11).
 */

export type BanRow = {
  id: string
  at: Date
  app: string
  kind: BanKind
  words: string
  account: { id: string; handle: string; retired: boolean } | null
  /** The handle when it happened, for an account that has since changed it. */
  handle: string
  phone: { id: string; name: string } | null
  proxy: { id: string; label: string } | null
  simCarrier: string
  project: { id: string; name: string } | null
  /** Days old on its network when it was banned, or null when unknown. */
  ageDays: number | null
  postsWeek: number
  seller: string
  appeal: { at: Date; note: string; answer: AppealAnswer | ""; answeredAt: Date | null } | null
  letRunAt: Date | null
  cleanedUpAt: Date | null
  looksBackAt: Date | null
  hasPicture: boolean
  /** True when it counts toward a phone kept off an app and the brake. */
  counts: boolean
  /** True while this ban still stops its account: not let run again, not cleaned up. */
  stopped: boolean
  /** Why Clean up cannot run now (an iPhone not read signed out of iCloud), or empty. */
  cleanUpHeldBack: string
}

export type SellerLine = { seller: string; bought: number; banned: number; lostCents: number }

export type BansPage = {
  bans: BanRow[]
  sellers: SellerLine[]
  unknown: UnknownScreenView[]
  /** The apps the brake holds, with when it went on. */
  brakes: Array<{ app: string; at: Date }>
}

const DAY_MS = 86_400_000

/** The newest 500 bans, newest first, with the sellers and what Promo is asking. */
export async function loadBans(userId: string, db: CustomShellDb = defaultDb): Promise<BansPage> {
  const rows = await db
    .select({
      ban: promoBans,
      accountHandle: promoAccounts.handle,
      retiredAt: promoAccounts.retiredAt,
      banScreenAt: promoAccounts.banScreenAt,
      seller: promoAccounts.seller,
      phoneName: promoPhones.name,
      proxyLabel: promoProxies.label,
      proxyHost: promoProxies.host,
      projectName: promoProjects.name,
    })
    .from(promoBans)
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoBans.accountId))
    .leftJoin(promoPhones, eq(promoPhones.id, promoBans.phoneId))
    .leftJoin(promoProxies, eq(promoProxies.id, promoBans.proxyId))
    .leftJoin(promoProjects, eq(promoProjects.id, promoBans.projectId))
    .where(eq(promoBans.userId, userId))
    .orderBy(desc(promoBans.at), desc(promoBans.id))
    .limit(500)
  const bans: BanRow[] = []
  for (const row of rows) {
    const { ban } = row
    const stopped = Boolean(ban.accountId && row.banScreenAt && !row.retiredAt && !ban.letRunAt && !ban.cleanedUpAt)
    bans.push({
      id: ban.id,
      at: ban.at,
      app: ban.app,
      kind: ban.kind,
      words: ban.words,
      account: ban.accountId && row.accountHandle !== null ? { id: ban.accountId, handle: row.accountHandle, retired: Boolean(row.retiredAt) } : null,
      handle: ban.handle,
      phone: ban.phoneId && row.phoneName !== null ? { id: ban.phoneId, name: row.phoneName } : null,
      proxy: ban.proxyId ? { id: ban.proxyId, label: row.proxyLabel || row.proxyHost || "A proxy" } : null,
      simCarrier: ban.simCarrier,
      project: ban.projectId && row.projectName !== null ? { id: ban.projectId, name: row.projectName } : null,
      ageDays: ban.accountBornAt ? Math.max(0, Math.floor((ban.at.getTime() - ban.accountBornAt.getTime()) / DAY_MS)) : null,
      postsWeek: ban.postsWeek,
      seller: row.seller ?? "",
      appeal: ban.appealedAt ? { at: ban.appealedAt, note: ban.appealNote, answer: ban.appealAnswer, answeredAt: ban.appealAnsweredAt } : null,
      letRunAt: ban.letRunAt,
      cleanedUpAt: ban.cleanedUpAt,
      looksBackAt: ban.looksBackAt,
      hasPicture: Boolean(ban.pictureKey),
      counts: (COUNTED_BAN_KINDS as readonly string[]).includes(ban.kind),
      stopped,
      cleanUpHeldBack: stopped && ban.accountId ? ((await cleanUpHeldBack(userId, ban.accountId, db)) ?? "") : "",
    })
  }
  const brakes = await brakedApps(userId, db)
  return {
    bans,
    sellers: await sellerLines(userId, db),
    unknown: await unknownScreens(userId, db),
    brakes: [...brakes].map(([app, at]) => ({ app, at })),
  }
}

/**
 * Each seller's bought accounts, how many of them a counted ban hit, and
 * the dollars those cost (part 16): "Seller A: 4 bans out of 10 bought,
 * $120 lost". Accounts with no seller named are left out.
 */
export async function sellerLines(userId: string, db: CustomShellDb = defaultDb): Promise<SellerLine[]> {
  const bought = await db
    .select({ id: promoAccounts.id, seller: promoAccounts.seller, priceCents: promoAccounts.priceCents })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.source, "bought"), sql`${promoAccounts.seller} <> ''`))
  if (!bought.length) return []
  const hit = new Set(
    (
      await db
        .selectDistinct({ accountId: promoBans.accountId })
        .from(promoBans)
        .where(and(eq(promoBans.userId, userId), inArray(promoBans.kind, [...COUNTED_BAN_KINDS]), inArray(promoBans.accountId, bought.map((row) => row.id))))
    ).map((row) => row.accountId)
  )
  const lines = new Map<string, SellerLine>()
  for (const account of bought) {
    const key = account.seller.trim()
    const line = lines.get(key.toLowerCase()) ?? { seller: key, bought: 0, banned: 0, lostCents: 0 }
    line.bought += 1
    if (hit.has(account.id)) {
      line.banned += 1
      line.lostCents += account.priceCents ?? 0
    }
    lines.set(key.toLowerCase(), line)
  }
  return [...lines.values()].sort((a, b) => b.banned - a.banned || b.lostCents - a.lostCents || a.seller.localeCompare(b.seller))
}

export type BanDetail = {
  /** The kept picture as a data address, or null when none was kept or it could not be opened. */
  picture: string | null
  /** The phone's last 20 actions before the ban, newest first. Empty for an account in a browser. */
  actionsBefore: Array<{ id: string; words: string; status: string; error: string; at: Date }>
}

/** One ban's picture and the actions before it, for its window (parts 10 and 12). */
export async function banDetail(userId: string, banId: string, db: CustomShellDb = defaultDb): Promise<BanDetail> {
  const [ban] = await db
    .select()
    .from(promoBans)
    .where(and(eq(promoBans.id, banId), eq(promoBans.userId, userId)))
    .limit(1)
  if (!ban) throw new Error("That ban is not there any more.")
  const actionsBefore = ban.phoneId
    ? await db
        .select({ id: promoPhoneActions.id, action: promoPhoneActions.action, status: promoPhoneActions.status, error: promoPhoneActions.error, at: promoPhoneActions.createdAt })
        .from(promoPhoneActions)
        .where(and(eq(promoPhoneActions.userId, userId), eq(promoPhoneActions.phoneId, ban.phoneId), lt(promoPhoneActions.createdAt, new Date(ban.at.getTime() + 1_000))))
        .orderBy(desc(promoPhoneActions.createdAt))
        .limit(20)
    : []
  return {
    picture: await openPicture(ban.pictureKey),
    actionsBefore: actionsBefore.map((row) => ({ id: row.id, words: actionWords(row.action), status: row.status, error: row.error, at: row.at })),
  }
}

/** An unknown screen's kept picture (part 9), for the question in Waiting on you, on the Anti Detect dashboard's Overview. */
export async function unknownScreenPicture(userId: string, phraseId: string, db: CustomShellDb = defaultDb): Promise<string | null> {
  const [phrase] = await db
    .select({ pictureKey: promoBanPhrases.pictureKey })
    .from(promoBanPhrases)
    .where(and(eq(promoBanPhrases.id, phraseId), eq(promoBanPhrases.userId, userId)))
    .limit(1)
  if (!phrase) throw new Error("That screen is not there any more.")
  return openPicture(phrase.pictureKey)
}

async function openPicture(key: string): Promise<string | null> {
  if (!key) return null
  try {
    const object = await getFromR2(key)
    if (!object.Body) return null
    const sealed = Buffer.from(await object.Body.transformToByteArray()).toString("utf8")
    return `data:image/jpeg;base64,${decryptSecret(sealed)}`
  } catch (error) {
    console.error(`Could not open the ban picture ${key}`, error)
    return null
  }
}

/**
 * How many accounts each project lost to a counted ban in the last 30 days
 * (part 18). A project with none is left out.
 */
export async function projectBanCounts(userId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<Map<string, number>> {
  const rows = await db
    .select({ projectId: promoBans.projectId, count: sql<number>`count(DISTINCT ${promoBans.accountId})::int` })
    .from(promoBans)
    .where(
      and(
        eq(promoBans.userId, userId),
        inArray(promoBans.kind, [...COUNTED_BAN_KINDS]),
        gte(promoBans.at, new Date(now.getTime() - 30 * DAY_MS))
      )
    )
    .groupBy(promoBans.projectId)
  return new Map(rows.flatMap((row) => (row.projectId ? [[row.projectId, row.count] as const] : [])))
}

