import { and, desc, eq, isNull, or } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"
import { promoAccounts } from "@/server/social/schema"

import { recordPhoneEvent } from "./history"
import { queuePhoneAction } from "./queue"
import { promoPhoneActions, promoPhones } from "./schema"

/**
 * Wiping a phone between accounts (part 26 of the phone farm): a new account
 * never inherits an old one's device history.
 *
 * When an account leaves a phone, the phone needs wiping, and no account is
 * set onto it until the rack has factory-reset it and a setup check after the
 * wipe has passed. A wipe also forgets that the phone held an important
 * account (part 22).
 *
 * An iPhone erased while still signed into an Apple ID is locked to that
 * Apple ID and useless to the rack (part 54). So an iPhone's wipe is refused
 * until a person has signed out of iCloud through the screen window (the
 * Apple ID password is typed by that person, never saved) and the rack has
 * read the phone as signed out, with Check iCloud on its Setup tab.
 */

/** How long the rack has to walk Settings to the last button and press it. */
const WIPE_TIMEOUT_SECONDS = 180

/** Reading the top of Settings for an Apple ID is a couple of screens. */
const ICLOUD_TIMEOUT_SECONDS = 120

/** What the rack said when it last read whether an Apple ID is signed in on an iPhone. */
export type IcloudState = { signedOut: boolean; appleId: string; checkedAt: Date }

export const ICLOUD_SIGNED_IN_WORDS =
  "Sign out of iCloud on its screen first (Settings, your name, Sign Out), then press Check iCloud. An iPhone erased while signed in is locked to that Apple ID."

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
    .select({ handle: promoAccounts.handle, platform: promoAccounts.platform, phoneId: promoAccounts.phoneId })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        // A retired account still on the phone counts: it holds the phone's
        // network's one place on it, and bringing it back finds it signed in there.
        or(eq(promoAccounts.phoneId, phoneId), and(eq(promoAccounts.movingToPhoneId, phoneId), isNull(promoAccounts.retiredAt)))
      )
    )
    .limit(1)
  if (onIt) {
    const who = handleWords(onIt.platform, onIt.handle) || "An account"
    throw new Error(
      onIt.phoneId === phoneId
        ? `${who} runs on this phone. Move it to another phone or a browser profile on the Accounts dashboard before wiping, or its sign-in goes with everything else.`
        : `${who} is being moved onto this phone. Cancel the move on the Accounts dashboard before wiping.`
    )
  }
  const [phone] = await db
    .select({ kind: promoPhones.kind, wipedAt: promoPhones.wipedAt })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (phone?.kind !== "iphone") {
    return queuePhoneAction(userId, phoneId, "phone/wipe", db, now, { timeoutSeconds: WIPE_TIMEOUT_SECONDS })
  }
  // Only a read newer than the last wipe counts: a fresh setup signs in again.
  const state = await icloudState(userId, phoneId, db)
  const signedOut = state?.signedOut === true && (!phone.wipedAt || state.checkedAt > phone.wipedAt)
  if (!signedOut) throw new Error(ICLOUD_SIGNED_IN_WORDS)
  // The rack refuses an iPhone wipe without this word, so a wipe never
  // reaches an iPhone that was not read as signed out.
  return queuePhoneAction(userId, phoneId, "phone/wipe", db, now, {
    timeoutSeconds: WIPE_TIMEOUT_SECONDS,
    args: { icloudSignedOut: true },
  })
}

/**
 * Asks the rack to read whether an Apple ID is signed in on an iPhone, from
 * Check iCloud on its Setup tab. The answer is `{ signedOut, appleId }`,
 * kept on the action row, which is what the wipe and the tab read.
 */
export async function queueIcloudCheck(
  userId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const [phone] = await db
    .select({ kind: promoPhones.kind })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  if (phone.kind !== "iphone") throw new Error("Only an iPhone has an Apple ID to check.")
  return queuePhoneAction(userId, phoneId, "phone/icloud-state", db, now, { timeoutSeconds: ICLOUD_TIMEOUT_SECONDS })
}

/** The newest finished iCloud read for a phone, or null when the rack has never read it. */
export async function icloudState(userId: string, phoneId: string, db: CustomShellDb = defaultDb): Promise<IcloudState | null> {
  const [row] = await db
    .select({ result: promoPhoneActions.result, finishedAt: promoPhoneActions.finishedAt })
    .from(promoPhoneActions)
    .where(
      and(
        eq(promoPhoneActions.userId, userId),
        eq(promoPhoneActions.phoneId, phoneId),
        eq(promoPhoneActions.action, "phone/icloud-state"),
        eq(promoPhoneActions.status, "done")
      )
    )
    .orderBy(desc(promoPhoneActions.finishedAt))
    .limit(1)
  if (!row?.finishedAt) return null
  return {
    signedOut: row.result?.signedOut === true,
    appleId: String(row.result?.appleId ?? "").slice(0, 200),
    checkedAt: row.finishedAt,
  }
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
  const [phone] = await db
    .update(promoPhones)
    .set({ wipedAt: now, needsWipeAt: null, heldImportantAt: null, held: true, updatedAt: now })
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .returning({ kind: promoPhones.kind })
  await recordPhoneEvent(
    userId,
    phoneId,
    "wiped",
    phone?.kind === "iphone"
      ? "The rack erased everything on it. It is held while it is set up again: tap Trust this computer when it asks, sign in to an Apple ID, put the apps on from the App Store, then release it and run its setup check."
      : "The rack erased everything on it. It is held while it is set up again: turn on USB debugging, sign in to Google, put the apps on, then release it and run its setup check.",
    db,
    now
  )
}
