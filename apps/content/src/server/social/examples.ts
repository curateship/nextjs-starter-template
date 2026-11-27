import { and, desc, eq, isNull, sql } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoComments } from "./schema"

/**
 * The comments that really went out, used as examples of how the person
 * writes.
 *
 * Showing beats telling for voice. Three real comments teach a model more than
 * a paragraph describing them, and they are already stored. A comment sent
 * with no draft behind it was typed or edited by the person (the answer panel
 * drops the draft's id the moment its words change), so it says more about
 * their voice than one the model wrote and they sent as it was. Those come
 * first.
 *
 * Only comments that landed count. A failed attempt never reached anybody and
 * may never have been finished. An answer to a reply does not count either:
 * it has no row of its own on the Comments screen, so its Voice example
 * switch could never be turned off.
 */

/** How many examples a prompt carries. */
export const EXAMPLES_PER_PROMPT = 3

/** Hand-written first, then newest. The one order both reads below use. */
const exampleOrder = [
  desc(sql`(${promoComments.draftId} IS NULL)`),
  desc(promoComments.postedAt),
] as const

/** The words of the comments a draft for this account copies the voice of. */
export async function exampleComments(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<string[]> {
  const rows = await db
    .select({ text: promoComments.text })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.accountId, accountId),
        eq(promoComments.status, "posted"),
        eq(promoComments.notExample, false),
        isNull(promoComments.parentId)
      )
    )
    .orderBy(...exampleOrder)
    .limit(EXAMPLES_PER_PROMPT)
  return rows.map((row) => row.text)
}

/**
 * The ids of the comments the next draft will carry, for every account the
 * person has: the first three by the order above that nobody marked as not a
 * good example. The comments screen marks these.
 */
export async function nextExampleIds(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<Set<string>> {
  const rows = await db
    .select({ id: promoComments.id, accountId: promoComments.accountId })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.status, "posted"),
        eq(promoComments.notExample, false),
        isNull(promoComments.parentId)
      )
    )
    .orderBy(...exampleOrder)

  const perAccount = new Map<string, number>()
  const picked = new Set<string>()
  for (const row of rows) {
    const taken = perAccount.get(row.accountId) ?? 0
    if (taken >= EXAMPLES_PER_PROMPT) continue
    perAccount.set(row.accountId, taken + 1)
    picked.add(row.id)
  }
  return picked
}

/** Marks a sent comment as a good example or not. The record itself never changes. */
export async function setNotExample(
  userId: string,
  commentId: string,
  notExample: boolean,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const updated = await db
    .update(promoComments)
    .set({ notExample })
    .where(and(eq(promoComments.id, commentId), eq(promoComments.userId, userId)))
    .returning({ id: promoComments.id })
  if (!updated.length) throw new Error("That comment is no longer saved.")
}
