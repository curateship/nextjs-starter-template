import { and, eq } from "drizzle-orm"

import { actionWords } from "@/lib/phones/options"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoPhoneActionChecks } from "./schema"

/**
 * The daily self-test's verdict, read where a job's step is about to go to a
 * phone (`dispatch.ts`). Kept apart from `self-test.ts`, which reaches the
 * bell and the queue, so the browser's command layer that imports this stays
 * light and free of loops.
 */

/**
 * Actions that never run on a phone until the self-test has walked them and
 * passed at least once: the comment goes live only once the self-test covers
 * it (phone farm file 05), and so do an Instagram or TikTok post and profile
 * change (file 06), each walked up to its last button with a picture the
 * rack makes for the purpose. Answers to messages and comments are not on
 * this list: the test account may have nothing in its inbox to rehearse on,
 * so they are refused only when the self-test finds them broken.
 */
const NEEDS_A_PASS = new Set(["reddit/comment", "instagram/post", "tiktok/post", "instagram/profile", "tiktok/profile"])

/** Refuses a job's step when the self-test last found its action broken, or has never passed it where that is required. */
export async function refuseBrokenAction(
  userId: string,
  action: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [check] = await db
    .select()
    .from(promoPhoneActionChecks)
    .where(and(eq(promoPhoneActionChecks.userId, userId), eq(promoPhoneActionChecks.action, action)))
    .limit(1)
  if (!check && NEEDS_A_PASS.has(action)) {
    throw new Refusal(
      `The daily self-test has not walked ${actionWords(action)} on the test phone yet, and it never goes out from a phone before it has. Pick a self-test phone in Settings → Phones and press Run it now in the Self-test window on the Phones dashboard. Nothing was sent.`
    )
  }
  if (!check || check.passed) return
  const day = check.checkedAt.toISOString().slice(0, 10)
  throw new Refusal(
    `The daily self-test found ${actionWords(action)} broken on ${day}, at "${check.step || "its first step"}". Promo refuses it until the self-test passes again; see the self-test on the Phones dashboard. Nothing was sent.`
  )
}
