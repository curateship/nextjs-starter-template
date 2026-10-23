import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"

import { similarity, TOO_SIMILAR_FROM, type SimilarPiece } from "../medium/similar"
import { promoAccounts } from "../schema"
import { closestXPiece } from "../x/similar"
import { promoLinkedinComments, promoLinkedinPosts } from "./schema"

/**
 * The too-similar check on LinkedIn (part 27). Tyler, 22 Oct 2026: "Warn
 * only", as on X. Before a LinkedIn comment or post goes out, its words are
 * compared with what the person's other accounts already sent, on LinkedIn,
 * X, Medium and Reddit, by Medium's measure (`similarity`, runs of three
 * words). A close one is shown as a warning and written on the comment; Post
 * still goes.
 */

/** How many of the other accounts' newest LinkedIn pieces are compared. */
const COMPARED = 400

/** The closest piece another of the person's accounts sent, on LinkedIn or elsewhere, at or over the line, or null. */
export async function closestLinkedinPiece(
  userId: string,
  accountId: string,
  text: string,
  db: CustomShellDb = defaultDb
): Promise<SimilarPiece | null> {
  // X's look covers X, Medium and Reddit already.
  const elsewhere = await closestXPiece(userId, accountId, text, db)
  const comments = await db
    .select({ accountId: promoLinkedinComments.accountId, text: promoLinkedinComments.text })
    .from(promoLinkedinComments)
    .where(
      and(
        eq(promoLinkedinComments.userId, userId),
        ne(promoLinkedinComments.accountId, accountId),
        inArray(promoLinkedinComments.status, ["waiting", "posted"]),
        isNull(promoLinkedinComments.deletedAt)
      )
    )
    .orderBy(desc(promoLinkedinComments.createdAt))
    .limit(COMPARED)
  const posts = await db
    .select({ accountId: promoLinkedinPosts.accountId, text: promoLinkedinPosts.text })
    .from(promoLinkedinPosts)
    .where(
      and(
        eq(promoLinkedinPosts.userId, userId),
        ne(promoLinkedinPosts.accountId, accountId),
        inArray(promoLinkedinPosts.status, ["waiting", "posted"]),
        isNull(promoLinkedinPosts.deletedAt)
      )
    )
    .orderBy(desc(promoLinkedinPosts.createdAt))
    .limit(COMPARED)

  let found: { accountId: string; what: string; text: string; score: number } | null = null
  const pieces = [
    ...comments.map((row) => ({ accountId: row.accountId, text: row.text, what: "a LinkedIn comment" })),
    ...posts.flatMap((row) => (row.accountId ? [{ accountId: row.accountId, text: row.text, what: "a LinkedIn post" }] : [])),
  ]
  for (const piece of pieces) {
    const score = similarity(text, piece.text)
    if (score >= TOO_SIMILAR_FROM && (!found || score > found.score)) found = { ...piece, score }
  }
  if (!found || (elsewhere && elsewhere.score >= found.score)) return elsewhere

  const [account] = await db
    .select({ handle: promoAccounts.handle, platform: promoAccounts.platform })
    .from(promoAccounts)
    .where(and(eq(promoAccounts.id, found.accountId), eq(promoAccounts.userId, userId)))
    .limit(1)
  return {
    accountId: found.accountId,
    accountName: account?.handle ? handleWords(account.platform, account.handle) : "another of your accounts",
    what: found.what,
    opening: found.text.replace(/\s+/g, " ").trim().slice(0, 80),
    score: Math.round(found.score * 100) / 100,
  }
}
