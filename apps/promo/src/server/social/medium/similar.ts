import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm"

import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { handleWords } from "@/lib/social/networks"

import { promoAccounts, promoComments } from "../schema"
import { promoMediumArticles, promoMediumResponses } from "./schema"

/**
 * The too-similar check (part 25). Tyler, 21 Oct 2026: "Refuse it". Before a
 * Medium response or article goes out, its words are compared with what the
 * person's other accounts already sent, on Medium and on Reddit. Near-copies
 * are one of the ways a site ties accounts together, so a close one refuses
 * Post and names the other account's piece, to be rewritten first.
 *
 * Words are compared as runs of three, after lower-casing and dropping
 * punctuation, and the score is the share of the shorter piece's runs that
 * the other piece also has. A copy with a word or two changed shares most of
 * its runs; two honest pieces on one topic share a few common phrases.
 * Measured with the sentences in `medium.test.ts`: a 38-word response with
 * three words changed scores 0.75, and a different response about picking
 * the same kind of tool scores 0.
 */

/** At or above this share of three-word runs, two pieces count as one written twice. */
export const TOO_SIMILAR_FROM = 0.5

/** Pieces shorter than this many words are too short to tell copying from coincidence. */
const MIN_WORDS = 12

/** How many of the other accounts' newest pieces of each kind are compared. */
const COMPARED = 400

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function runs(list: string[]): Set<string> {
  const out = new Set<string>()
  for (let index = 0; index + 2 < list.length; index += 1) {
    out.add(`${list[index]} ${list[index + 1]} ${list[index + 2]}`)
  }
  return out
}

/** How much of the shorter piece the longer one also says, 0 to 1. 0 when either is too short to tell. */
export function similarity(a: string, b: string): number {
  const left = words(a)
  const right = words(b)
  if (left.length < MIN_WORDS || right.length < MIN_WORDS) return 0
  const leftRuns = runs(left)
  const rightRuns = runs(right)
  const [small, large] = leftRuns.size <= rightRuns.size ? [leftRuns, rightRuns] : [rightRuns, leftRuns]
  if (!small.size) return 0
  let shared = 0
  for (const run of small) if (large.has(run)) shared += 1
  return shared / small.size
}

export type SimilarPiece = {
  accountId: string
  accountName: string
  /** "a Medium response", "a Medium article", "a Reddit comment". */
  what: string
  opening: string
  score: number
}

/**
 * The closest piece another of the person's accounts sent, when it is at or
 * over the line, or null. Pieces from the same account are left out: an
 * account repeating itself links nothing.
 */
export async function closestFromOtherAccounts(
  userId: string,
  accountId: string,
  text: string,
  db: CustomShellDb = defaultDb
): Promise<SimilarPiece | null> {
  if (words(text).length < MIN_WORDS) return null
  const responses = await db
    .select({ accountId: promoMediumResponses.accountId, text: promoMediumResponses.text })
    .from(promoMediumResponses)
    .where(
      and(
        eq(promoMediumResponses.userId, userId),
        ne(promoMediumResponses.accountId, accountId),
        inArray(promoMediumResponses.status, ["waiting", "posted"]),
        isNull(promoMediumResponses.deletedAt)
      )
    )
    .orderBy(desc(promoMediumResponses.createdAt))
    .limit(COMPARED)
  const articles = await db
    .select({ accountId: promoMediumArticles.accountId, text: promoMediumArticles.body })
    .from(promoMediumArticles)
    .where(
      and(
        eq(promoMediumArticles.userId, userId),
        ne(promoMediumArticles.accountId, accountId),
        inArray(promoMediumArticles.status, ["waiting", "published"]),
        isNull(promoMediumArticles.deletedAt)
      )
    )
    .orderBy(desc(promoMediumArticles.createdAt))
    .limit(COMPARED)
  const comments = await db
    .select({ accountId: promoComments.accountId, text: promoComments.text })
    .from(promoComments)
    .where(
      and(
        eq(promoComments.userId, userId),
        ne(promoComments.accountId, accountId),
        eq(promoComments.status, "posted"),
        isNull(promoComments.deletedAt)
      )
    )
    .orderBy(desc(promoComments.postedAt))
    .limit(COMPARED)

  let found: { accountId: string; what: string; text: string; score: number } | null = null
  const pieces = [
    ...responses.map((row) => ({ ...row, what: "a Medium response" })),
    ...articles.map((row) => ({ ...row, what: "a Medium article" })),
    ...comments.map((row) => ({ ...row, what: "a Reddit comment" })),
  ]
  for (const piece of pieces) {
    if (!piece.accountId) continue
    const score = similarity(text, piece.text)
    if (score >= TOO_SIMILAR_FROM && (!found || score > found.score)) {
      found = { accountId: piece.accountId, what: piece.what, text: piece.text, score }
    }
  }
  if (!found) return null

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

/** Refuses Post when another account already sent words this close. */
export async function refuseTooSimilar(
  userId: string,
  accountId: string,
  text: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const close = await closestFromOtherAccounts(userId, accountId, text, db)
  if (!close) return
  throw new Refusal(
    `These words are too close to ${close.what} ${close.accountName} sent ("${close.opening}…"). Two accounts writing the same words can be tied together, so rewrite it first. Nothing was sent.`
  )
}
