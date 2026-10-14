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

/** Refuses a job's step when the self-test last found its action broken. */
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
  if (!check || check.passed) return
  const day = check.checkedAt.toISOString().slice(0, 10)
  throw new Refusal(
    `The daily self-test found ${actionWords(action)} broken on ${day}, at "${check.step || "its first step"}". Promo refuses it until the self-test passes again; see the self-test on the Phones dashboard. Nothing was sent.`
  )
}
