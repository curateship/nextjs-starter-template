import { and, eq } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import { X_TOP_REPLIES, xPostUrl } from "@/lib/social/x/options"

import { noticeRung, ringBell } from "../notices"
import { xReadPost, xSearch, xTrends, type XPost } from "./calls"
import { hiddenHandles } from "./finds"
import { rankXFind } from "./rank"
import { promoXFinds, promoXKeywords, promoXTrends } from "./schema"
import { spendViews, type PickedSearcher } from "./searchers"

/**
 * Running an X keyword, reading one post again with its top replies, and
 * reading the trends, each through a search account (parts 9, 11, 12, 13,
 * 15, 16, 17 and 22).
 *
 * A search adds whatever is new and updates the figures of what it found
 * before: views, likes, replies, followers, whether replies are open, and
 * rank. It never changes a decision: a post skipped or replied to stays that
 * way however often it turns up. Posts by a hidden account are dropped
 * before they are stored (part 16).
 */

/** A search account's browser and the account itself, which every read here counts its views against. */
export type XReader = { target: CommandTarget; searcher: PickedSearcher }

/** How many posts one search may put in front of a search account at most. */
const SEARCH_MAX = 40

/** How many posts a watched account's page is read for. Its newest are all that matter. */
const WATCH_MAX = 5

function postedAt(seconds: number | null): Date | null {
  return seconds ? new Date(seconds * 1000) : null
}

/** The figures a search or a read keeps fresh on a find, the same for both. */
function figures(post: XPost) {
  return {
    // X writes the address. Anything that is not X's own https address is
    // put back to the post's own one, since the screens draw it as a link.
    url: /^https:\/\/(x|twitter)\.com\//.test(post.url) ? post.url.slice(0, 300) : xPostUrl(post.postId, post.authorHandle),
    text: post.text,
    authorId: post.authorId.slice(0, 25),
    authorHandle: post.authorHandle.slice(0, 20),
    authorName: post.authorName.slice(0, 200),
    authorFollowers: post.authorFollowers,
    postedAt: postedAt(post.postedSeconds),
    views: post.views,
    likes: post.likes,
    replies: post.replies,
    reposts: post.reposts,
    repliesOpen: post.repliesOpen,
    link: /^https?:\/\//.test(post.link) ? post.link.slice(0, 600) : "",
  }
}

/** The most posts a read may take in: what it wants, or what the search account has left today. */
function viewsFor(reader: XReader, wanted: number): number {
  return Math.max(1, Math.min(wanted, reader.searcher.viewsLeft))
}

/**
 * Searches one keyword and stores what came back. A failure is written on
 * the keyword, so its chip can say why, and then thrown so the job fails. A
 * watched account's new posts ring the bell once each (part 12), and only
 * after its first search, so adding an account does not ring for its last
 * ten posts.
 */
export async function runXSearch(
  userId: string,
  keywordId: string,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ seen: number; added: number }> {
  const [keyword] = await db
    .select()
    .from(promoXKeywords)
    .where(and(eq(promoXKeywords.id, keywordId), eq(promoXKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That X keyword is no longer saved.")

  let answer: Awaited<ReturnType<typeof xSearch>>
  try {
    const max = viewsFor(reader, keyword.kind === "account" ? WATCH_MAX : SEARCH_MAX)
    answer = await xSearch(reader.target, { kind: keyword.kind, value: keyword.value, max })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoXKeywords)
      .set({ lastRunAt: now, lastError: message.slice(0, 1_000), updatedAt: now })
      .where(eq(promoXKeywords.id, keywordId))
    throw error
  }
  await spendViews(reader.searcher.id, answer, db, now)

  const hidden = await hiddenHandles(userId, db)
  const named = keyword.mark !== ""
  // Nothing stored under it yet means this is its first read that worked:
  // a watched account's last few posts then ring nothing.
  const [stored] = await db.select({ id: promoXFinds.id }).from(promoXFinds).where(eq(promoXFinds.keywordId, keywordId)).limit(1)
  const firstSearch = !stored
  let added = 0
  for (const post of answer.posts) {
    if (!post.postId || !post.text) continue
    if (post.authorHandle && hidden.has(post.authorHandle.toLowerCase())) continue
    // A reply under somebody else's post is only worth answering from a
    // search; a watched account's own replies are its conversations, not posts.
    if (keyword.kind === "account" && post.isReply) continue
    const rank = rankXFind(
      {
        position: post.position,
        replies: post.replies,
        postedAt: postedAt(post.postedSeconds),
        authorFollowers: post.authorFollowers,
        named,
      },
      now
    )
    const inserted = await db
      .insert(promoXFinds)
      .values({
        id: uuid(),
        userId,
        keywordId,
        postId: post.postId.slice(0, 25),
        ...figures(post),
        position: post.position,
        rank,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [promoXFinds.keywordId, promoXFinds.postId],
        set: { ...figures(post), position: post.position, rank, lastSeenAt: now },
      })
      .returning({ id: promoXFinds.id, firstSeenAt: promoXFinds.firstSeenAt })
    const row = inserted[0]
    if (!row || row.firstSeenAt.getTime() !== now.getTime()) continue
    added += 1
    if (keyword.kind === "account" && keyword.notify && !firstSearch && post.repliesOpen) {
      await ringWatched(userId, keyword.projectId, row.id, post, db, now)
    }
  }

  await db
    .update(promoXKeywords)
    .set({ lastRunAt: now, lastError: "", updatedAt: now })
    .where(eq(promoXKeywords.id, keywordId))
  return { seen: answer.posts.length, added }
}

/** One bell per new post from a watched account, opening it in the X module. */
async function ringWatched(
  userId: string,
  projectId: string,
  findId: string,
  post: XPost,
  db: CustomShellDb,
  now: Date
): Promise<void> {
  // The person's id is in the target, because X's ids are the same for everyone.
  const target = `${userId}:${post.postId}`
  if (await noticeRung("x_watched", target, db)) return
  await ringBell(
    userId,
    {
      kind: "x_watched",
      targetId: target,
      message: `${NOTICE_HEADINGS.x_watched} @${post.authorHandle}`,
      detail: post.text.slice(0, 300),
      href: `/admin/projects/${encodeURIComponent(projectId)}?network=x&open=${encodeURIComponent(findId)}`,
    },
    db,
    now
  )
}

/**
 * Reads one post again for the right column: fresh figures and its top
 * replies (part 22). Every find of the same post is updated, so a post found
 * by two keywords reads the same under both. A post that is gone or whose
 * replies have closed is marked so, and leaves To look at.
 */
export async function readXPost(
  userId: string,
  findId: string,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [find] = await db
    .select({ postId: promoXFinds.postId })
    .from(promoXFinds)
    .where(and(eq(promoXFinds.id, findId), eq(promoXFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That X post is no longer saved.")
  const read = await xReadPost(reader.target, { postId: find.postId })
  await spendViews(reader.searcher.id, read, db, now)
  const replies = read.replies.slice(0, X_TOP_REPLIES)
  const where = and(eq(promoXFinds.userId, userId), eq(promoXFinds.postId, find.postId))
  if (read.missing || !read.post) {
    await db.update(promoXFinds).set({ repliesOpen: false, topReplies: replies, readAt: now }).where(where)
    return
  }
  await db.update(promoXFinds).set({ ...figures(read.post), topReplies: replies, readAt: now }).where(where)
}

/** Reads what X says is trending for the search account's place, for the keyword ideas (part 15). */
export async function readXTrends(
  userId: string,
  reader: XReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const read = await xTrends(reader.target)
  await spendViews(reader.searcher.id, read, db, now)
  const values = { place: read.place.slice(0, 200), trends: read.trends.slice(0, 40), readAt: now }
  await db
    .insert(promoXTrends)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: promoXTrends.userId, set: values })
}

/** The trends last read, and when, or null before any read. */
export async function lastXTrends(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<{ place: string; trends: Array<{ name: string; posts: number | null }>; readAt: Date } | null> {
  const [row] = await db.select().from(promoXTrends).where(eq(promoXTrends.userId, userId)).limit(1)
  return row ? { place: row.place, trends: row.trends, readAt: row.readAt } : null
}

