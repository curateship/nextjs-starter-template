import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm"

import {
  appName,
  BAN_KIND_LABELS,
  BRAKE_BANS,
  BRAKE_WINDOW_MS,
  COUNTED_BAN_KINDS,
  countsAsBan,
  type BanKind,
} from "@/lib/bans/options"
import { handleWords } from "@/lib/social/networks"
import { uuid } from "@/server/auth/security"
import { promoProfiles } from "@/server/browser/schema"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { getFromR2, uploadToR2 } from "@/server/media/storage"
import { recordPhoneEvent } from "@/server/phones/history"
import { clearProblem } from "@/server/phones/notices"
import { promoPhones, promoPhoneScreenshots } from "@/server/phones/schema"
import { ringBell } from "@/server/social/notices"
import { promoAccounts } from "@/server/social/schema"

import { recordAccountEvent } from "./history"
import { promoAppBrakes, promoBans } from "./schema"

/**
 * Writes the ban record every other part reads (Bans task, part 1).
 *
 * Called once, when an account is first stopped: by a phone's ban screen
 * (`stopForBanScreen`), a browser's ban page (X, LinkedIn, Reddit and
 * Medium), a suspended Reddit reading (part 8) and an unknown screen a person
 * called a ban (part 9). A second report of the same stop writes nothing:
 * while the account's newest ban has not been let run again, it is the same
 * ban, so one screen never counts twice toward a phone kept off an app or
 * the app-wide brake. One exception: an open ban that does not count (a
 * locked or "confirm it's you" screen) followed by one that does (the app
 * then suspends the account) becomes the counted kind, so the suspension
 * still marks the phone and can put the brake on.
 *
 * Where it ran is copied now (phone, browser profile, proxy, SIM, project),
 * with the account's age and its posts in the 7 days before. The phone's
 * History gets a `banned` line, the account's own history a Banned line, the
 * picture of the step that found it is kept apart from the step pictures the
 * tidy-up deletes (part 10), and a second counted ban of the same app inside
 * 24 hours puts the app-wide brake on (part 11).
 *
 * Returns the new row's id, or null when nothing was written.
 */
export async function recordBan(
  userId: string,
  input: { accountId: string; kind: BanKind; words: string; actionId?: string | null },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, input.accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) return null
  const [open] = await db
    .select({ id: promoBans.id, kind: promoBans.kind, pictureKey: promoBans.pictureKey })
    .from(promoBans)
    .where(and(eq(promoBans.accountId, account.id), isNull(promoBans.letRunAt), isNull(promoBans.cleanedUpAt)))
    .orderBy(desc(promoBans.at))
    .limit(1)
  if (open) {
    if (!countsAsBan(open.kind) && countsAsBan(input.kind)) await upgradeBan(userId, account, open, input, db, now)
    return null
  }

  const [phone] = account.phoneId
    ? await db
        .select({ id: promoPhones.id, name: promoPhones.name, proxyId: promoPhones.proxyId, connection: promoPhones.connection, simNumber: promoPhones.simNumber, simCarrier: promoPhones.simCarrier })
        .from(promoPhones)
        .where(eq(promoPhones.id, account.phoneId))
        .limit(1)
    : []
  const [profile] = !phone && account.profileId
    ? await db.select({ proxyId: promoProfiles.proxyId }).from(promoProfiles).where(eq(promoProfiles.id, account.profileId)).limit(1)
    : []
  const onSim = phone?.connection === "sim"
  const words = input.words.trim().slice(0, 2_000)
  const id = uuid()
  await db.insert(promoBans).values({
    id,
    userId,
    accountId: account.id,
    app: account.platform.slice(0, 20),
    handle: account.handle.slice(0, 120),
    kind: input.kind,
    words,
    phoneId: phone?.id ?? null,
    profileId: phone ? null : account.profileId,
    // A SIM phone shows its SIM's address, not a proxy's, so only a Wi-Fi
    // phone's proxy was in the ban.
    proxyId: phone ? (phone.connection === "wifi" ? phone.proxyId : null) : (profile?.proxyId ?? null),
    simNumber: onSim ? phone.simNumber.trim() : "",
    simCarrier: onSim ? phone.simCarrier : "",
    projectId: account.projectId,
    accountBornAt: accountBorn(account),
    postsWeek: await postsBefore(account.id, now, db),
    actionId: input.actionId ?? null,
    pictureKey: input.actionId ? await keepBanPicture(input.actionId, id, db) : "",
    at: now,
  })

  const who = handleWords(account.platform, account.handle) || `${appName(account.platform)} account`
  const kindWords = BAN_KIND_LABELS[input.kind].toLowerCase()
  if (phone) {
    // A wipe never clears this line: a wipe doesn't clear the app's mark.
    await recordPhoneEvent(userId, phone.id, "banned", `${who} on ${appName(account.platform)}, ${kindWords}${words ? `: "${words.slice(0, 300)}"` : "."}`, db, now)
  }
  await recordAccountEvent(userId, account.id, "banned", `${BAN_KIND_LABELS[input.kind]}${words ? `: "${words.slice(0, 300)}"` : ""}`, db, now)
  if (countsAsBan(input.kind)) await brakeIfCrackdown(userId, account.platform, db, now)
  return id
}

/** An open uncounted ban that the app has since turned into a counted one. */
async function upgradeBan(
  userId: string,
  account: typeof promoAccounts.$inferSelect,
  open: { id: string; pictureKey: string },
  input: { kind: BanKind; words: string; actionId?: string | null },
  db: CustomShellDb,
  now: Date
): Promise<void> {
  const words = input.words.trim().slice(0, 2_000)
  await db
    .update(promoBans)
    .set({
      kind: input.kind,
      words,
      // It became a counted ban now, which is when the brake's 24 hours count from.
      at: now,
      ...(!open.pictureKey && input.actionId ? { actionId: input.actionId, pictureKey: await keepBanPicture(input.actionId, open.id, db) } : {}),
    })
    .where(eq(promoBans.id, open.id))
  const who = handleWords(account.platform, account.handle) || `${appName(account.platform)} account`
  if (account.phoneId) {
    await recordPhoneEvent(userId, account.phoneId, "banned", `${who} on ${appName(account.platform)}, ${BAN_KIND_LABELS[input.kind].toLowerCase()}${words ? `: "${words.slice(0, 300)}"` : "."}`, db, now)
  }
  await recordAccountEvent(userId, account.id, "banned", `${BAN_KIND_LABELS[input.kind]}${words ? `: "${words.slice(0, 300)}"` : ""}`, db, now)
  await brakeIfCrackdown(userId, account.platform, db, now)
}

/** When an account was born on its network, as well as Promo knows. */
function accountBorn(account: typeof promoAccounts.$inferSelect): Date {
  const born =
    account.platform === "reddit"
      ? account.redditCreatedAt
      : account.platform === "medium"
        ? account.mediumJoinedAt
        : account.platform === "x"
          ? (account.xJoinedAt ?? account.signedInAt)
          : account.platform === "linkedin"
            ? account.signedInAt
            : null
  return born ?? account.createdAt
}

const WEEK_MS = 7 * 86_400_000

/** Where each network keeps what an account sent, and the column saying when it went. */
const SENT_TABLES: ReadonlyArray<readonly [string, string]> = [
  ["promo_comments", "posted_at"],
  ["promo_posts", "posted_at"],
  ["promo_app_posts", "posted_at"],
  ["promo_medium_responses", "posted_at"],
  ["promo_medium_articles", "published_at"],
  ["promo_x_replies", "posted_at"],
  ["promo_x_posts", "posted_at"],
  ["promo_linkedin_comments", "posted_at"],
  ["promo_linkedin_posts", "posted_at"],
]

/** How many posts, comments and replies the account sent in the 7 days before. */
async function postsBefore(accountId: string, now: Date, db: CustomShellDb): Promise<number> {
  const from = new Date(now.getTime() - WEEK_MS).toISOString()
  const to = now.toISOString()
  const counts = SENT_TABLES.map(
    ([table, column]) =>
      sql`(SELECT count(*) FROM ${sql.identifier(table)} WHERE "account_id" = ${accountId} AND ${sql.identifier(column)} >= ${from}::timestamptz AND ${sql.identifier(column)} < ${to}::timestamptz)`
  )
  const result = await db.execute(sql`SELECT (${sql.join(counts, sql` + `)})::int AS "total"`)
  return Number((result.rows as Array<{ total: number }>)[0]?.total ?? 0)
}

function banPictureKey(banId: string): string {
  return `promo-ban-pictures/${banId}.bin`
}

/**
 * Copies the last step picture of the action that found the ban to a key of
 * its own (part 10). The tidy-up deletes step pictures after the days set in
 * Settings → Phones and never looks here, so the proof stays for an appeal.
 * The copy stays encrypted with the server's key, as the step picture was.
 * Returns '' when there was no picture or it could not be copied.
 */
export async function keepBanPicture(actionId: string, banId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const [last] = await db
    .select({ objectKey: promoPhoneScreenshots.objectKey })
    .from(promoPhoneScreenshots)
    .where(eq(promoPhoneScreenshots.actionId, actionId))
    .orderBy(desc(promoPhoneScreenshots.position), desc(promoPhoneScreenshots.createdAt))
    .limit(1)
  if (!last?.objectKey) return ""
  try {
    const object = await getFromR2(last.objectKey)
    if (!object.Body) return ""
    const key = banPictureKey(banId)
    await uploadToR2(key, Buffer.from(await object.Body.transformToByteArray()), "application/octet-stream")
    return key
  } catch (error) {
    console.error(`Could not keep the ban picture of phone action ${actionId}`, error)
    return ""
  }
}

/**
 * The app-wide brake (part 11): a second counted ban of one app inside 24
 * hours pauses every account on that app, on phones and in browsers, until a
 * person presses Release. Other apps keep running.
 */
async function brakeIfCrackdown(userId: string, app: string, db: CustomShellDb, now: Date): Promise<void> {
  // Accounts, not rows: one account banned again after "Let it run again" is one crackdown sign, not two.
  const [{ count }] = await db
    .select({ count: sql<number>`count(DISTINCT coalesce(${promoBans.accountId}, ${promoBans.id}))::int` })
    .from(promoBans)
    .where(
      and(
        eq(promoBans.userId, userId),
        eq(promoBans.app, app),
        inArray(promoBans.kind, [...COUNTED_BAN_KINDS]),
        gte(promoBans.at, new Date(now.getTime() - BRAKE_WINDOW_MS))
      )
    )
  if (count < BRAKE_BANS) return
  const put = await db.insert(promoAppBrakes).values({ userId, app, brakedAt: now }).onConflictDoNothing().returning({ app: promoAppBrakes.app })
  if (!put.length) return
  const name = appName(app)
  await ringBell(
    userId,
    {
      kind: "app_brake",
      targetId: app,
      message: `Two ${name} bans in a day. Every ${name} account is paused.`,
      detail: `Every ${name} account is paused, on phones and in browsers. Their waiting jobs wait and are not failed, and the other apps keep running. Press Release ${name} on the Bans dashboard or in Settings → Phones once you have looked.`,
      href: "/admin/bans",
    },
    db,
    now
  )
}

/** Releases the app-wide brake on one app (part 11). Nothing restarts by itself before this. */
export async function releaseBrake(userId: string, app: string, db: CustomShellDb = defaultDb): Promise<void> {
  const released = await db
    .delete(promoAppBrakes)
    .where(and(eq(promoAppBrakes.userId, userId), eq(promoAppBrakes.app, app)))
    .returning({ app: promoAppBrakes.app })
  if (!released.length) throw new Error(`${appName(app)} is not paused.`)
  await clearProblem(userId, "app_brake", app, null, db)
}
