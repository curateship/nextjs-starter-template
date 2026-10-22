import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"

import { closestFromOtherAccounts, similarity, TOO_SIMILAR_FROM, type SimilarPiece } from "../medium/similar"
import { promoAccounts } from "../schema"
import { promoXPosts, promoXReplies } from "./schema"

/**
 * The too-similar check on X (part 28). Tyler, 21 Oct 2026: "Warn only",
 * unlike Medium, where it refuses. Before an X reply, quote or post goes out,
 * its words are compared with what the person's other accounts already sent,
 * on X, Medium and Reddit, by Medium's measure (`similarity`, runs of three
 * words). A close one is shown as a warning and written on the reply; Post
 * still goes.
 */

/** How many of the other accounts' newest X pieces are compared. */
const COMPARED = 400

/** The closest piece another of the person's accounts sent, on X or elsewhere, at or over the line, or null. */
export async function closestXPiece(
  userId: string,
  accountId: string,
  text: string,
  db: CustomShellDb = defaultDb
): Promise<SimilarPiece | null> {
  const elsewhere = await closestFromOtherAccounts(userId, accountId, text, db)
  const replies = await db
    .select({ accountId: promoXReplies.accountId, text: promoXReplies.text })
    .from(promoXReplies)
    .where(
      and(
        eq(promoXReplies.userId, userId),
        ne(promoXReplies.accountId, accountId),
        inArray(promoXReplies.status, ["waiting", "posted"]),
        isNull(promoXReplies.deletedAt)
      )
    )
    .orderBy(desc(promoXReplies.createdAt))
    .limit(COMPARED)
  const posts = await db
    .select({ accountId: promoXPosts.accountId, pieces: promoXPosts.pieces })
    .from(promoXPosts)
    .where(
      and(
        eq(promoXPosts.userId, userId),
        ne(promoXPosts.accountId, accountId),
        inArray(promoXPosts.status, ["waiting", "posted"]),
        isNull(promoXPosts.deletedAt)
      )
    )
    .orderBy(desc(promoXPosts.createdAt))
    .limit(COMPARED)

  let found: { accountId: string; what: string; text: string; score: number } | null = elsewhere
    ? { accountId: elsewhere.accountId, what: elsewhere.what, text: elsewhere.opening, score: elsewhere.score }
    : null
  const pieces = [
    ...replies.map((row) => ({ accountId: row.accountId, text: row.text, what: "an X reply" })),
    ...posts.flatMap((row) => (row.accountId ? row.pieces.map((piece) => ({ accountId: row.accountId ?? "", text: piece.text, what: "an X post" })) : [])),
  ]
  let foundOnX = false
  for (const piece of pieces) {
    const score = similarity(text, piece.text)
    if (score >= TOO_SIMILAR_FROM && (!found || score > found.score)) {
      found = { accountId: piece.accountId, what: piece.what, text: piece.text, score }
      foundOnX = true
    }
  }
  if (!found) return null
  if (!foundOnX && elsewhere) return elsewhere

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

/** The warning a close piece gives, in the words the composer and the reply row show. */
export function similarWarning(close: SimilarPiece): string {
  return `Close to ${close.what} ${close.accountName} sent ("${close.opening}…"). Two accounts writing the same words can be tied together.`
}
