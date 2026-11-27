import { and, eq, isNotNull, isNull, ne } from "drizzle-orm"

import { handleWords } from "@/lib/social/networks"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { recordPhoneEvent } from "@/server/phones/history"
import { clearProblem } from "@/server/phones/notices"
import { promoPhones } from "@/server/phones/schema"
import { ICLOUD_SIGNED_IN_WORDS, icloudState, noteAccountLeftPhone, queueWipe } from "@/server/phones/wipe"
import { queueJob } from "@/server/social/jobs"
import { promoAccounts } from "@/server/social/schema"

import { closeTenancy, recordAccountEvent } from "./history"
import { promoBans } from "./schema"

/**
 * Clean up after a ban (Bans task, part 6): one press puts a banned
 * account's phone back to work. Never automatic (Tyler, 3 Nov 2026), so an
 * appeal can come first.
 *
 * In this order, because the phone's one place per app and the wipe both
 * wait on the account leaving it: retire the account as Banned, take it off
 * its phone or browser profile, close its row on the phone as banned, then
 * queue the phone's wipe. A browser profile's saved sign-in is forgotten
 * instead, the way a move to a phone forgets it, unless other accounts still
 * sign in to that profile: forgetting clears every sign-in in it.
 *
 * An iPhone still needs the iCloud check first, so it is refused before
 * anything changes, with what to do. A phone that still holds another app's
 * account is cleaned up all the same, and its wipe waits: the answer says why.
 */

export type CleanUpAnswer = {
  /** True when the phone's wipe was queued. */
  wipeQueued: boolean
  /** What happened, or why the wipe waits, in a sentence. */
  words: string
}

/** Why Clean up cannot run on this account now, or null when it can. Shown beside the button. */
export async function cleanUpHeldBack(userId: string, accountId: string, db: CustomShellDb = defaultDb): Promise<string | null> {
  const [account] = await db
    .select({ banScreenAt: promoAccounts.banScreenAt, phoneId: promoAccounts.phoneId, retiredAt: promoAccounts.retiredAt })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  if (!account) return "That account is not there any more."
  if (account.retiredAt) return "That account is already retired, so there is nothing to clean up."
  if (!account.banScreenAt) return "Only an account a ban stopped is cleaned up."
  if (!account.phoneId) return null
  const [phone] = await db.select({ kind: promoPhones.kind, wipedAt: promoPhones.wipedAt }).from(promoPhones).where(eq(promoPhones.id, account.phoneId)).limit(1)
  if (phone?.kind !== "iphone") return null
  const state = await icloudState(userId, account.phoneId, db)
  const signedOut = state?.signedOut === true && (!phone.wipedAt || state.checkedAt > phone.wipedAt)
  return signedOut ? null : `This is an iPhone. ${ICLOUD_SIGNED_IN_WORDS}`
}

export async function cleanUpBan(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<CleanUpAnswer> {
  const held = await cleanUpHeldBack(userId, accountId, db)
  if (held) throw new Error(held)
  // All or nothing, so a failure part-way never leaves an account retired off
  // its phone with no wipe queued and its ban still open.
  const answer = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ phoneId: promoAccounts.phoneId, profileId: promoAccounts.profileId })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId)))
      .limit(1)
    // Only a banned account not yet retired, so two presses at once clean up once.
    const [account] = await tx
      .update(promoAccounts)
      .set({ retiredAt: now, retiredReason: "banned", retiredNote: "", phoneId: null, profileId: null, movingToPhoneId: null, updatedAt: now })
      .where(and(eq(promoAccounts.id, accountId), eq(promoAccounts.userId, userId), isNull(promoAccounts.retiredAt), isNotNull(promoAccounts.banScreenAt)))
      .returning({ id: promoAccounts.id, platform: promoAccounts.platform, handle: promoAccounts.handle })
    if (!account || !before) throw new Error("That account is already retired, so there is nothing to clean up.")
    return finishCleanUp(userId, { ...account, ...before }, tx, now)
  })
  for (const kind of ["ban_screen", "looks_back", "appeal_waiting"] as const) await clearProblem(userId, kind, accountId, null, db, now)
  return answer
}

async function finishCleanUp(
  userId: string,
  account: { id: string; platform: string; handle: string; phoneId: string | null; profileId: string | null },
  db: CustomShellDb,
  now: Date
): Promise<CleanUpAnswer> {
  const who = handleWords(account.platform, account.handle) || "The account"
  await closeTenancy(userId, account.id, "banned", db, now)
  await db.update(promoBans).set({ cleanedUpAt: now }).where(and(eq(promoBans.accountId, account.id), isNull(promoBans.cleanedUpAt)))

  let answer: CleanUpAnswer = { wipeQueued: false, words: `${who} is retired as Banned.` }
  if (account.phoneId) {
    await recordPhoneEvent(userId, account.phoneId, "account_moved", `${who} was cleaned up after a ban and moved off it. It needs wiping before another account goes on.`, db, now)
    await noteAccountLeftPhone(userId, account.phoneId, db, now)
    try {
      await queueWipe(userId, account.phoneId, db, now)
      answer = { wipeQueued: true, words: `${who} is retired as Banned, and its phone's wipe is queued.` }
    } catch (error) {
      answer = { wipeQueued: false, words: `${who} is retired as Banned. The wipe waits: ${error instanceof Error ? error.message : String(error)}` }
    }
  } else if (account.profileId) {
    // Forgetting deletes the whole profile's saved sign-ins and backups, so it
    // only runs when no other account still signs in there.
    const [other] = await db
      .select({ id: promoAccounts.id })
      .from(promoAccounts)
      .where(and(eq(promoAccounts.profileId, account.profileId), ne(promoAccounts.id, account.id)))
      .limit(1)
    if (other) {
      answer = { wipeQueued: false, words: `${who} is retired as Banned. Its browser profile keeps its saved sign-ins, because other accounts sign in there too.` }
    } else {
      await queueJob(userId, "forget", { profileId: account.profileId, accountId: account.id }, db)
      answer = { wipeQueued: false, words: `${who} is retired as Banned, and its browser profile's saved sign-in is being forgotten.` }
    }
  }
  await recordAccountEvent(userId, account.id, "cleaned_up", answer.words, db, now)
  return answer
}
