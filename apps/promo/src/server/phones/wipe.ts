import { and, eq, isNull, or } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoAccounts } from "@/server/social/schema"

import { recordPhoneEvent } from "./history"
import { queuePhoneAction } from "./queue"
import { promoPhones } from "./schema"

/**
 * Wiping a phone between accounts (part 26 of the phone farm): a new account
 * never inherits an old one's device history.
 *
 * When an account leaves a phone, the phone needs wiping, and no account is
 * set onto it until the rack has factory-reset it and a setup check after the
 * wipe has passed. A wipe also forgets that the phone held an important
 * account (part 22).
 */

/** How long the rack has to walk Settings to the last button and press it. */
const WIPE_TIMEOUT_SECONDS = 180

const dateWords = (at: Date) => at.toISOString().slice(0, 10)

/**
 * Refuses setting an account onto a phone that needs wiping, or that was
 * wiped and has not passed a setup check since. The account already on the
 * phone keeps it, so saving its settings again is never refused.
 */
export async function refusePhoneNotReady(
  userId: string,
  phoneId: string | null,
  accountId: string | null,
  db: CustomShellDb = defaultDb
): Promise<void> {
  if (!phoneId) return
  const [phone] = await db
    .select({
      name: promoPhones.name,
      needsWipeAt: promoPhones.needsWipeAt,
      wipedAt: promoPhones.wipedAt,
      setupCheck: promoPhones.setupCheck,
      setupCheckedAt: promoPhones.setupCheckedAt,
    })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone) return
  if (accountId) {
    const [already] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.phoneId, phoneId)))
      .limit(1)
    if (already) return
  }
  if (phone.needsWipeAt) {
    throw new Error(
      `The phone ${phone.name} needs wiping: an account left it on ${dateWords(phone.needsWipeAt)}, and a new account never inherits an old one's phone. Wipe it from its window on the Phones dashboard before it takes an account.`
    )
  }
  if (phone.wipedAt && !(phone.setupCheck?.passed && phone.setupCheckedAt && phone.setupCheckedAt > phone.wipedAt)) {
    throw new Error(
      `The phone ${phone.name} was wiped on ${dateWords(phone.wipedAt)} and has to be set up again: run its setup check from its window on the Phones dashboard, and fix every line until it passes, before it takes an account.`
    )
  }
}

/** Marks a phone as needing a wipe because an account left it. */
export async function noteAccountLeftPhone(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(promoPhones)
    .set({ needsWipeAt: now, updatedAt: now })
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
}

/**
 * Asks the rack to factory-reset a phone, from a Wipe a person pressed and
 * confirmed in the phone's window. Refused while an account is on it or
 * being moved to it: its sign-in would go with everything else.
 */
export async function queueWipe(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const [onIt] = await db
    .select({ handle: promoAccounts.handle, phoneId: promoAccounts.phoneId })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        // A retired account still on the phone counts: it holds the phone's
        // one Reddit place, and bringing it back finds it signed in there.
        or(eq(promoAccounts.phoneId, phoneId), and(eq(promoAccounts.movingToPhoneId, phoneId), isNull(promoAccounts.retiredAt)))
      )
    )
    .limit(1)
  if (onIt) {
    const who = onIt.handle ? `u/${onIt.handle}` : "An account"
    throw new Error(
      onIt.phoneId === phoneId
        ? `${who} runs on this phone. Move it to another phone or a browser profile on the Accounts dashboard before wiping, or its sign-in goes with everything else.`
        : `${who} is being moved onto this phone. Cancel the move on the Accounts dashboard before wiping.`
    )
  }
  return queuePhoneAction(userId, phoneId, "phone/wipe", db, now, { timeoutSeconds: WIPE_TIMEOUT_SECONDS })
}

/**
 * The rack pressed the last button and the phone is erasing itself. The
 * phone is held, so its going away for setup does not ring the bell as
 * offline, and it forgets that it needed wiping or held an important
 * account. It takes an account once a setup check after this has passed.
 */
export async function recordWipe(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db
    .update(promoPhones)
    .set({ wipedAt: now, needsWipeAt: null, heldImportantAt: null, held: true, updatedAt: now })
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
  await recordPhoneEvent(
    userId,
    phoneId,
    "wiped",
    "The rack erased everything on it. It is held while it is set up again: turn on USB debugging, sign in to Google, put the apps on, then release it and run its setup check.",
    db,
    now
  )
}
