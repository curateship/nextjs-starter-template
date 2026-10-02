import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm"

import { coinsNamedIn, type CoinMatch } from "@/lib/trade/social/coin-matcher"
import { db } from "@/server/db"
import { loadSocialMatchStocks } from "@/server/trade/prefs"
import { loadMarketMatchList } from "@/server/trade/social-coin-list"
import { tradeSocialPostCoins, tradeSocialPosts } from "@/server/trade/schema"

/**
 * Reading the coins out of posts already held, and keeping the answers.
 *
 * The rules live in `src/lib/trade/social/coin-matcher.ts` and know nothing
 * about the database. This file is the part that decides which posts to read
 * and writes down what came back.
 *
 * **A post that names no coin is marked as read all the same.** Naming nothing
 * is an answer, and without the mark the pass below would pick the same post up
 * every time it ran and never finish.
 */

/**
 * How many posts one pass reads, and how long it may take.
 *
 * Bounded the way `src/server/trade/candle-refresh.ts` is bounded, and for the
 * same reason: a pass that runs until it is done can hold a creator's dashboard
 * open for a minute on a member with a thousand posts. It stops, the rest are
 * read the next time that creator is opened, and nothing is lost.
 *
 * Nothing here asks anybody else's server, so the numbers are generous: the
 * cost is one query and a pass over the words.
 */
export const POSTS_PER_PASS = 500

/** How long one pass may take before it leaves the rest for the next one. */
export const PASS_BUDGET_MS = 5_000

/** How many posts one read-and-write step carries. */
const BATCH = 100

/**
 * Raised when the list of coins Trade trades cannot be read, which is the one
 * thing here that depends on anybody outside this app. Named so the button can
 * say what actually went wrong instead of blaming the dashboard.
 */
export class SocialCoinsError extends Error {}

type PostToRead = {
  id: string
  text: string
}

/**
 * Read the coins out of every post of this creator's that has not been read
 * yet, newest first so the posts somebody is looking at fill in first.
 *
 * Returns how many posts were read, which is what tells the caller whether
 * anything on screen changed.
 */
export function fillPostCoinsForCreator(
  userId: string,
  creatorId: string
): Promise<number> {
  return runPass(userId, creatorId, false)
}

/**
 * Read every post of this creator's again and replace the answers.
 *
 * This is the button. The match rules and the stop list will change, and a
 * stored answer has to be able to catch up: without this, a word added to the
 * stop list today would go on counting against a creator forever.
 *
 * It works by forgetting that the posts were ever read and then running the
 * same pass, so there is one reading loop rather than two. A creator with more
 * posts than one pass reads is left part-read on purpose; pressing the button
 * again finishes them off, and opening the dashboard does the same quietly.
 */
export function rereadPostCoinsForCreator(
  userId: string,
  creatorId: string
): Promise<number> {
  return runPass(userId, creatorId, true)
}

async function runPass(
  userId: string,
  creatorId: string,
  fromScratch: boolean
): Promise<number> {
  // The list first. A market list an exchange will not answer for must not
  // cost a creator the answers already stored.
  const stocks = await loadSocialMatchStocks(userId)
  const list = await loadMarketMatchList(stocks).catch((error: unknown) => {
    console.error("The list of markets Trade lists could not be read", error)
    throw new SocialCoinsError("SOCIAL_COINS_UNAVAILABLE")
  })

  // **Pressing the button again carries on rather than starting over.** One
  // pass reads 500 posts, so a creator with 900 is left with 400 waiting and a
  // toast that says so. Forgetting every mark a second time would re-read the
  // same newest 500 for ever and never reach the older 400, which is the
  // opposite of what pressing it again is for.
  if (fromScratch && (await countPostsAwaitingCoins(userId, creatorId)) === 0) {
    await forgetCoinsWereRead(userId, creatorId)
  }

  const until = Date.now() + PASS_BUDGET_MS
  let read = 0

  while (read < POSTS_PER_PASS && Date.now() < until) {
    const posts = await nextUnreadPosts(
      userId,
      creatorId,
      Math.min(BATCH, POSTS_PER_PASS - read)
    )
    if (posts.length === 0) break

    await writeCoins(
      userId,
      creatorId,
      posts.map((post) => ({
        id: post.id,
        coins: coinsNamedIn(post.text, list),
      }))
    )
    read += posts.length
  }

  return read
}

/** Marks every held post unread, which is what makes the next pass re-read. */
async function forgetCoinsWereRead(userId: string, creatorId: string) {
  await db
    .update(tradeSocialPosts)
    .set({ coinsReadAt: null })
    .where(
      and(
        eq(tradeSocialPosts.userId, userId),
        eq(tradeSocialPosts.creatorId, creatorId)
      )
    )
}

/** The next posts with no answer yet, newest first. */
async function nextUnreadPosts(
  userId: string,
  creatorId: string,
  limit: number
): Promise<PostToRead[]> {
  return db
    .select({ id: tradeSocialPosts.id, text: tradeSocialPosts.text })
    .from(tradeSocialPosts)
    .where(
      and(
        eq(tradeSocialPosts.userId, userId),
        eq(tradeSocialPosts.creatorId, creatorId),
        isNull(tradeSocialPosts.coinsReadAt)
      )
    )
    .orderBy(desc(tradeSocialPosts.postedAt), desc(tradeSocialPosts.id))
    .limit(limit)
}

type PostCoins = {
  id: string
  coins: CoinMatch[]
}

/**
 * Write one batch's answers.
 *
 * The old rows for these posts go first, so a coin the rules no longer match is
 * gone rather than left behind beside the new answer. Every post in the batch
 * is marked read in the same step, whether it named a coin or not.
 */
async function writeCoins(
  userId: string,
  creatorId: string,
  answers: PostCoins[]
) {
  const ids = answers.map((answer) => answer.id)
  const rows = answers.flatMap((answer) =>
    answer.coins.map((match) => ({
      postId: answer.id,
      creatorId,
      userId,
      coin: match.coin,
      kind: match.kind,
      marketKey: match.marketKey,
      matchedAs: match.how,
      matchedText: match.text,
    }))
  )

  // All three in one transaction. The old rows go before the new ones are
  // written, so without this a write that failed halfway would leave a post
  // showing no coins at all until somebody re-read the creator.
  await db.transaction(async (tx) => {
    await tx
      .delete(tradeSocialPostCoins)
      .where(
        and(
          eq(tradeSocialPostCoins.userId, userId),
          inArray(tradeSocialPostCoins.postId, ids)
        )
      )

    if (rows.length > 0) {
      await tx
        .insert(tradeSocialPostCoins)
        .values(rows)
        // A post naming the same coin twice is one row, so a pass that runs
        // twice over the same post leaves the table exactly as it was.
        .onConflictDoNothing({
          target: [tradeSocialPostCoins.postId, tradeSocialPostCoins.coin],
        })
    }

    await tx
      .update(tradeSocialPosts)
      .set({ coinsReadAt: new Date() })
      .where(
        and(
          eq(tradeSocialPosts.userId, userId),
          inArray(tradeSocialPosts.id, ids)
        )
      )
  })
}

/** How many of this creator's held posts have not been read for coins yet. */
export async function countPostsAwaitingCoins(
  userId: string,
  creatorId: string
): Promise<number> {
  const [row] = await db
    .select({ waiting: sql<number>`count(*)::int` })
    .from(tradeSocialPosts)
    .where(
      and(
        eq(tradeSocialPosts.userId, userId),
        eq(tradeSocialPosts.creatorId, creatorId),
        isNull(tradeSocialPosts.coinsReadAt)
      )
    )
  return row?.waiting ?? 0
}

/**
 * Catch every stored answer up after the stocks switch moved.
 *
 * The two directions are not the same job, and doing the cheap one cheaply
 * matters: a member tracking forty creators holds tens of thousands of posts.
 *
 * - **Switched off**, every stock, metal and currency row of this member's
 *   goes. Nothing about the coins changed, so no post needs reading again and
 *   the panels are right the moment the switch lands.
 * - **Switched on**, every post of this member's is marked unread, and each
 *   creator is read again the next time their dashboard or the feed is opened.
 *   A pass reads 500 posts, so a big member catches up over several opens
 *   rather than holding one screen for a minute.
 */
export async function catchUpAfterStocksSwitch(
  userId: string,
  stocks: boolean
): Promise<void> {
  if (!stocks) {
    await db
      .delete(tradeSocialPostCoins)
      .where(
        and(
          eq(tradeSocialPostCoins.userId, userId),
          ne(tradeSocialPostCoins.kind, "coin")
        )
      )
    return
  }

  await db
    .update(tradeSocialPosts)
    .set({ coinsReadAt: null })
    .where(eq(tradeSocialPosts.userId, userId))
}
