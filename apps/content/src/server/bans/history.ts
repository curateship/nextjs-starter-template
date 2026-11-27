import { and, desc, eq, isNull } from "drizzle-orm"

import type { AccountEventKind, TenancyEnd } from "@/lib/bans/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoAccounts } from "@/server/social/schema"

import { promoAccountEvents, promoPhoneTenancies } from "./schema"

/**
 * Two records of where an account has been (Bans task, parts 2 and 14): each
 * account's own history, and each phone's accounts over time. Like a phone's
 * history (`src/server/phones/history.ts`), neither ever fails the thing it
 * records: a line that cannot be written is logged, and the work carries on.
 */

/** One line in an account's own history (part 14). */
export async function recordAccountEvent(
  userId: string,
  accountId: string,
  kind: AccountEventKind,
  detail: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  try {
    await db.insert(promoAccountEvents).values({ id: uuid(), userId, accountId, kind, detail: detail.slice(0, 2_000), createdAt: now })
  } catch (error) {
    console.error(`Could not write a ${kind} line in account ${accountId}'s history`, error)
  }
}

export type AccountEventView = { id: string; kind: AccountEventKind; detail: string; at: Date }

/** An account's newest 200 lines, newest first. */
export async function accountHistory(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<AccountEventView[]> {
  const [owned] = await db
    .select({ id: promoAccounts.id })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!owned) throw new Error("That account is not there any more.")
  const rows = await db
    .select()
    .from(promoAccountEvents)
    .where(and(eq(promoAccountEvents.accountId, accountId), eq(promoAccountEvents.userId, userId)))
    .orderBy(desc(promoAccountEvents.createdAt), desc(promoAccountEvents.id))
    .limit(200)
  return rows.map((row) => ({ id: row.id, kind: row.kind, detail: row.detail, at: row.createdAt }))
}

/**
 * An account arriving on a phone (part 2). Any row still open for the
 * account is closed as moved first, so it is never on two phones at once.
 */
export async function openTenancy(
  userId: string,
  account: { id: string; platform: string; handle: string },
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  try {
    await closeTenancy(userId, account.id, "moved", db, now)
    await db.insert(promoPhoneTenancies).values({
      id: uuid(),
      userId,
      phoneId,
      accountId: account.id,
      platform: account.platform.slice(0, 20),
      handle: account.handle.slice(0, 120),
      arrivedAt: now,
    })
  } catch (error) {
    console.error(`Could not open account ${account.id}'s row on phone ${phoneId}`, error)
  }
}

/** An account leaving its phone, and how (part 2). Nothing happens when it was on none. */
export async function closeTenancy(
  userId: string,
  accountId: string,
  how: TenancyEnd,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  try {
    const [account] = await db.select({ handle: promoAccounts.handle }).from(promoAccounts).where(eq(promoAccounts.id, accountId)).limit(1)
    await db
      .update(promoPhoneTenancies)
      .set({ leftAt: now, leftHow: how, ...(account?.handle ? { handle: account.handle.slice(0, 120) } : {}) })
      .where(
        and(
          eq(promoPhoneTenancies.userId, userId),
          eq(promoPhoneTenancies.accountId, accountId),
          isNull(promoPhoneTenancies.leftAt)
        )
      )
  } catch (error) {
    console.error(`Could not close account ${accountId}'s row on its phone`, error)
  }
}

export type TenancyView = {
  id: string
  accountId: string | null
  platform: string
  handle: string
  arrivedAt: Date
  leftAt: Date | null
  leftHow: TenancyEnd | ""
}

/** Every account a phone has held, newest first (part 2). */
export async function phoneTenancies(userId: string, phoneId: string, db: CustomShellDb = defaultDb): Promise<TenancyView[]> {
  const rows = await db
    .select()
    .from(promoPhoneTenancies)
    .where(and(eq(promoPhoneTenancies.phoneId, phoneId), eq(promoPhoneTenancies.userId, userId)))
    .orderBy(desc(promoPhoneTenancies.arrivedAt), desc(promoPhoneTenancies.id))
    .limit(200)
  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    platform: row.platform,
    handle: row.handle,
    arrivedAt: row.arrivedAt,
    leftAt: row.leftAt,
    leftHow: row.leftHow,
  }))
}
