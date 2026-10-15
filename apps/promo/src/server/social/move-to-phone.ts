import { and, eq, isNull, ne } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { recordPhoneEvent } from "@/server/phones/history"
import { queuePhoneAction } from "@/server/phones/queue"
import { promoPhones } from "@/server/phones/schema"
import { isTestPhone } from "@/server/phones/self-test"
import { refusePhoneNotReady } from "@/server/phones/wipe"

import { noteImportantOnPhone, refuseMixedProject, refuseMixedVoice, refuseSharedProxy } from "./apart"
import { queueJob } from "./jobs"
import { promoAccounts } from "./schema"

/**
 * Moving a throwaway from its browser profile to a phone, one way only
 * (part 31 of the phone farm): how a throwaway that turned valuable is
 * promoted.
 *
 * A person picks a phone that is free and ready, then signs in to Reddit on
 * it by hand through its screen window. The account keeps running on its
 * profile meanwhile. Once the phone reads the account signed in, the move
 * finishes in one go: the account runs on the phone, is marked important,
 * and its old profile's browser is closed and its saved sign-in deleted by
 * a `forget` job. From then on, pointing it at any profile is refused,
 * because an important account runs on a phone only (`apart.ts`).
 */

type AccountRow = typeof promoAccounts.$inferSelect

async function ownAccount(userId: string, accountId: string, db: CustomShellDb): Promise<AccountRow> {
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account || account.retiredAt) throw new Error("That account is not there any more.")
  return account
}

/** Starts a move to a phone, or refuses it with why. */
export async function startMoveToPhone(
  userId: string,
  accountId: string,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const account = await ownAccount(userId, accountId, db)
  const who = account.handle ? `u/${account.handle}` : "This account"
  if (account.importance === "important") throw new Error(`${who} is already important and runs on a phone.`)
  if (!account.profileId) throw new Error(`${who} is not on a browser profile, so there is nothing to move from. Set its phone in its settings instead.`)
  if (!account.handle) {
    throw new Error(
      `${who} has never been seen signed in, so the phone could not tell it apart from another account. Let its browser profile read who is signed in first.`
    )
  }
  const [phone] = await db
    .select({ id: promoPhones.id, name: promoPhones.name, proxyId: promoPhones.proxyId })
    .from(promoPhones)
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .limit(1)
  if (!phone) throw new Error("That phone does not exist.")
  if (await isTestPhone(phoneId, db)) {
    throw new Error(`The phone ${phone.name} is the self-test phone, which carries only its test account. Pick another phone.`)
  }
  const [taken] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        eq(promoAccounts.platform, "reddit"),
        ne(promoAccounts.id, accountId),
        // Another account on it, or on its way to it.
        eq(promoAccounts.phoneId, phoneId)
      )
    )
    .limit(1)
  const [incoming] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(
      and(
        eq(promoAccounts.userId, userId),
        ne(promoAccounts.id, accountId),
        eq(promoAccounts.movingToPhoneId, phoneId),
        isNull(promoAccounts.retiredAt)
      )
    )
    .limit(1)
  if (taken || incoming) {
    throw new Error(`The phone ${phone.name} already has a Reddit account on it, or one on its way. One Reddit account per phone.`)
  }
  await refusePhoneNotReady(userId, phoneId, null, db)
  // The account will be important once it lands, so the rules for an
  // important account are asked now, before anyone signs in by hand.
  const asImportant = { id: account.id, handle: account.handle, importance: "important" as const }
  await refuseMixedVoice(userId, asImportant, account.voiceId, db)
  await refuseMixedProject(userId, asImportant, account.projectId, db)
  await refuseSharedProxy(userId, phone.proxyId, "phone", db)

  await db
    .update(promoAccounts)
    .set({ movingToPhoneId: phoneId, updatedAt: new Date() })
    .where(eq(promoAccounts.id, accountId))
  await recordPhoneEvent(userId, phoneId, "account_moved", `u/${account.handle} is being moved onto it from a browser profile.`, db)
}

/** Stops a move that has not finished. The account stays on its profile. */
export async function cancelMoveToPhone(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const account = await ownAccount(userId, accountId, db)
  if (!account.movingToPhoneId) throw new Error("That account is not being moved.")
  await db
    .update(promoAccounts)
    .set({ movingToPhoneId: null, updatedAt: new Date() })
    .where(eq(promoAccounts.id, accountId))
}

/**
 * Asks the phone who the Reddit app is signed in as, after the person signed
 * in by hand. The answer finishes the move when it is the account
 * (`finishMoveFromPhone`).
 */
export async function checkMoveToPhone(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const account = await ownAccount(userId, accountId, db)
  if (!account.movingToPhoneId) throw new Error("That account is not being moved.")
  await queuePhoneAction(userId, account.movingToPhoneId, "reddit/state", db)
}

/**
 * Why a waiting move cannot finish now, in words, or null when it can. Asked
 * when the phone reads the account signed in, and shown on the dashboard
 * while the move waits, because things change while a person signs in by
 * hand: the phone may have become the self-test phone, been given to
 * another account, or been wiped, and the account's voice or project may now
 * be shared with a throwaway.
 */
export async function moveHeldBack(
  userId: string,
  account: Pick<AccountRow, "id" | "handle" | "phoneId" | "voiceId" | "projectId">,
  phoneId: string,
  db: CustomShellDb = defaultDb
): Promise<string | null> {
  if (account.phoneId) return "It already runs on a phone. Cancel the move."
  if (await isTestPhone(phoneId, db)) {
    return "That phone is the self-test phone now. Cancel the move and pick another phone."
  }
  const [taken] = await db
    .select({ handle: promoAccounts.handle })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.phoneId, phoneId), eq(promoAccounts.platform, "reddit"), ne(promoAccounts.id, account.id)))
    .limit(1)
  if (taken) return `Another Reddit account${taken.handle ? `, u/${taken.handle},` : ""} was put on that phone meanwhile. Cancel the move and pick another phone.`
  try {
    await refusePhoneNotReady(userId, phoneId, account.id, db)
    // The rules for an important account, asked again in case its voice or
    // project changed while it waited.
    const asImportant = { id: account.id, handle: account.handle, importance: "important" as const }
    await refuseMixedVoice(userId, asImportant, account.voiceId, db)
    await refuseMixedProject(userId, asImportant, account.projectId, db)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  return null
}

/**
 * The rack's answer to "who is signed in" on a phone. When an account is
 * being moved to that phone and the app is signed in as it, the move
 * finishes, unless something now holds it back (`moveHeldBack`). Any other
 * answer leaves the move waiting; the dashboard shows what the phone read.
 * Returns the handle when a move finished.
 */
export async function finishMoveFromPhone(
  userId: string,
  phoneId: string,
  result: Record<string, unknown> | null,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  const handle = typeof result?.handle === "string" ? result.handle.trim() : ""
  if (!handle) return null
  const [account] = await db
    .select()
    .from(promoAccounts)
    .where(and(eq(promoAccounts.userId, userId), eq(promoAccounts.movingToPhoneId, phoneId), isNull(promoAccounts.retiredAt)))
    .limit(1)
  if (!account || account.handle.toLowerCase() !== handle.toLowerCase()) return null
  if (await moveHeldBack(userId, account, phoneId, db)) return null

  const oldProfileId = account.profileId
  await db
    .update(promoAccounts)
    .set({
      phoneId,
      profileId: null,
      movingToPhoneId: null,
      importance: "important",
      // Its sign-in was just read on the phone, by the phone.
      handle,
      stateReadAt: now,
      updatedAt: now,
    })
    .where(eq(promoAccounts.id, account.id))
  await noteImportantOnPhone(userId, phoneId, db, now)
  await recordPhoneEvent(userId, phoneId, "account_moved", `u/${handle} moved onto it from a browser profile, and is now important.`, db, now)
  await recordPhoneEvent(userId, phoneId, "account_signed_in", `u/${handle} is signed in to Reddit.`, db, now)
  if (oldProfileId) await queueJob(userId, "forget", { profileId: oldProfileId, accountId: account.id }, db)
  return handle
}
