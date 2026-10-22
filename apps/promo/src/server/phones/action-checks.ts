import { and, eq } from "drizzle-orm"

import { PHONE_KIND_WORDS, actionWords, type PhoneKind } from "@/lib/phones/options"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoPhoneActionChecks } from "./schema"

/**
 * The daily self-test's verdict, read where a job's step is about to go to a
 * phone (`dispatch.ts`). Kept apart from `self-test.ts`, which reaches the
 * bell and the queue, so the browser's command layer that imports this stays
 * light and free of loops.
 *
 * The verdict is per kind of phone: a step the iPhone self-test found broken
 * refuses iPhone jobs only, and the Androids keep running (part 51).
 */

/**
 * Actions that never run on a phone until the self-test has walked them and
 * passed at least once: the comment goes live only once the self-test covers
 * it (phone farm file 05), and so do an Instagram or TikTok post and profile
 * change (file 06), each walked up to its last button with a picture the
 * rack makes for the purpose. Answers to messages and comments are not on
 * this list: the test account may have nothing in its inbox to rehearse on,
 * so they are refused only when the self-test finds them broken. A Medium
 * response is the same: with no Medium story found in the last week there is
 * nothing to rehearse it on, so it is refused only once found broken.
 */
const NEEDS_A_PASS = new Set(["reddit/comment", "instagram/post", "tiktok/post", "instagram/profile", "tiktok/profile"])

/**
 * The bell's id for a broken action, one per action per kind. The person is
 * in it, because an action's name is the same for everyone. The Android one
 * keeps the shape it had before there were kinds, so notices already up are
 * still found.
 */
export function brokenActionTarget(userId: string, action: string, kind: PhoneKind): string {
  return kind === "iphone" ? `${userId}:${action}:iphone` : `${userId}:${action}`
}

/** Refuses a job's step when that kind's self-test last found its action broken, or has never passed it where that is required. */
export async function refuseBrokenAction(
  userId: string,
  action: string,
  kind: PhoneKind,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [check] = await db
    .select()
    .from(promoPhoneActionChecks)
    .where(
      and(
        eq(promoPhoneActionChecks.userId, userId),
        eq(promoPhoneActionChecks.action, action),
        eq(promoPhoneActionChecks.kind, kind)
      )
    )
    .limit(1)
  const testPhone = `${PHONE_KIND_WORDS[kind]} test phone`
  if (!check && NEEDS_A_PASS.has(action)) {
    throw new Refusal(
      `The daily self-test has not walked ${actionWords(action)} on the ${testPhone} yet, and it never goes out from a phone before it has. Pick a self-test ${PHONE_KIND_WORDS[kind]} in Settings → Phones and press Run it now in the Self-test window on the Phones dashboard. Nothing was sent.`
    )
  }
  if (!check || check.passed) return
  const day = check.checkedAt.toISOString().slice(0, 10)
  throw new Refusal(
    `The daily self-test found ${actionWords(action)} broken on ${day}, at "${check.step || "its first step"}", on the ${testPhone}. Promo refuses it on every ${PHONE_KIND_WORDS[kind]} until the self-test passes again; see the self-test on the Phones dashboard. Nothing was sent.`
  )
}
