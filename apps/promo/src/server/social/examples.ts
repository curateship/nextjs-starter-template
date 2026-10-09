import { and, desc, eq, sql } from "drizzle-orm"

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
 * may never have been finished.
 */

/** How many examples a prompt carries. */
export const EXAMPLES_PER_PROMPT = 3

/** How many sent comments the settings tab lists, to tick in and out. */
const LISTED = 10

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
        eq(promoComments.notExample, false)
      )
    )
    .orderBy(...exampleOrder)
    .limit(EXAMPLES_PER_PROMPT)
  return rows.map((row) => row.text)
}

export type SentComment = {
  id: string
  text: string
  postedAt: Date
  commentUrl: string
  /** True when it was sent with no draft behind it, so the words are the person's. */
  handWritten: boolean
  /** True when a person marked it as not a good example. */
  notExample: boolean
  /** True when the next draft will carry it as an example. */
  inNextDraft: boolean
}

/**
 * An account's most recent sent comments, in the order examples are picked,
 * each saying whether the next draft will use it.
 */
export async function listSentComments(
  userId: string,
  accountId: string,
  db: CustomShellDb = defaultDb
): Promise<SentComment[]> {
  const rows = await db
    .select({
      id: promoComments.id,
      text: promoComments.text,
      postedAt: promoComments.postedAt,
      commentUrl: promoComments.commentUrl,
      draftId: promoComments.draftId,
      notExample: promoComments.notExample,
    })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        eq(promoComments.accountId, accountId),
        eq(promoComments.status, "posted")
      )
    )
    .orderBy(...exampleOrder)
    .limit(LISTED)

  let picked = 0
  return rows.map((row) => {
    const inNextDraft = !row.notExample && picked < EXAMPLES_PER_PROMPT
    if (inNextDraft) picked += 1
    return {
      id: row.id,
      text: row.text,
      postedAt: row.postedAt,
      commentUrl: row.commentUrl,
      handWritten: row.draftId === null,
      notExample: row.notExample,
      inNextDraft,
    }
  })
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
