import { and, eq, isNotNull } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import type { CommandTarget } from "@/server/browser/command"
import { Refusal } from "@/server/browser/refusal"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { NOTICE_HEADINGS } from "@/lib/social/notice-words"
import {
  LINKEDIN_TOP_COMMENTS,
  isWatchKind,
  linkedinPostUrl,
  matchedTitle,
} from "@/lib/social/linkedin/options"

import { noticeRung, ringBell } from "../notices"
import { promoAccounts } from "../schema"
import { linkedinFeed, linkedinReadPost, linkedinSearch, type LinkedinPost } from "./calls"
import { hiddenKey, hiddenSlugs } from "./finds"
import { readBuyerTitles } from "./keywords"
import { rankLinkedinFind } from "./rank"
import { promoLinkedinFinds, promoLinkedinKeywords } from "./schema"
import { spendLinkedinViews, type PickedLinkedinSearcher } from "./searchers"

/**
 * Running a LinkedIn keyword, reading one post again with its top comments,
 * and reading an account's own feed (parts 10, 12, 13, 14, 15, 17, 18 and
 * 22). Keywords and posts are read through a search account; a feed is read
 * in the account's own browser, since it is that account's feed.
 *
 * A search adds whatever is new and updates the figures of what it found
 * before: reactions, comments, followers, whether comments are open, the
 * matched job title and rank. It never changes a decision: a post skipped or
 * commented on stays that way however often it turns up. Posts by a hidden
 * person or page are dropped before they are stored (part 17).
 */

/** A search account's browser and the account itself, which every read here counts its views against. */
export type LinkedinReader = { target: CommandTarget; searcher: PickedLinkedinSearcher }

/** How many posts one search may put in front of a search account at most. */
const SEARCH_MAX = 30

/** How many posts a watched person's or page's activity is read for. Their newest are all that matter. */
const WATCH_MAX = 5

/** How many posts of an account's own feed are read at most. */
const FEED_MAX = 25

function postedAt(seconds: number | null): Date | null {
  return seconds ? new Date(seconds * 1000) : null
}

/** The figures a search or a read keeps fresh on a find, the same for both. */
function figures(post: LinkedinPost, titles: readonly string[]) {
  return {
    // LinkedIn writes the address. Anything that is not LinkedIn's own https
    // address is put back to the post's own one, since the screens draw it as a link.
    url: /^https:\/\/(www\.)?linkedin\.com\//.test(post.url) ? post.url.slice(0, 400) : linkedinPostUrl(post.postId),
    text: post.text,
    authorName: post.authorName.slice(0, 200),
    authorHeadline: post.authorHeadline.slice(0, 300),
    authorSlug: post.authorSlug.slice(0, 100),
    authorKind: post.authorKind,
    authorFollowers: post.authorFollowers,
    postedAt: postedAt(post.postedSeconds),
    reactions: post.reactions,
    comments: post.comments,
    reposts: post.reposts,
    canComment: post.canComment,
    link: /^https?:\/\//.test(post.link) ? post.link.slice(0, 600) : "",
    matchedTitle: post.authorKind === "person" ? matchedTitle(post.authorHeadline, titles).slice(0, 60) : "",
  }
}

/** The most posts a read may take in: what it wants, or what the search account has left today. */
function viewsFor(reader: LinkedinReader, wanted: number): number {
  return Math.max(1, Math.min(wanted, reader.searcher.viewsLeft))
}

/** True when a post is worth listing at all: it has words and an id, is not a bare repost, and its writer is not hidden. */
function listable(post: LinkedinPost, hidden: Set<string>): boolean {
  if (!post.postId || !post.text || post.isRepost) return false
  return !(post.authorSlug && hidden.has(hiddenKey(post.authorKind, post.authorSlug)))
}

/**
 * Searches one keyword and stores what came back. A failure is written on
 * the keyword, so its chip can say why, and then thrown so the job fails. A
 * watched person's or page's new posts ring the bell once each (part 12),
 * and only after its first search, so adding someone does not ring for their
 * last five posts.
 */
export async function runLinkedinSearch(
  userId: string,
  keywordId: string,
  reader: LinkedinReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ seen: number; added: number }> {
  const [keyword] = await db
    .select()
    .from(promoLinkedinKeywords)
    .where(and(eq(promoLinkedinKeywords.id, keywordId), eq(promoLinkedinKeywords.userId, userId)))
    .limit(1)
  if (!keyword) throw new Error("That LinkedIn keyword is no longer saved.")
  const watch = isWatchKind(keyword.kind)

  let answer: Awaited<ReturnType<typeof linkedinSearch>>
  try {
    answer = await linkedinSearch(reader.target, { kind: keyword.kind, value: keyword.value, max: viewsFor(reader, watch ? WATCH_MAX : SEARCH_MAX) })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(promoLinkedinKeywords)
      .set({ lastRunAt: now, lastError: message.slice(0, 1_000), updatedAt: now })
      .where(eq(promoLinkedinKeywords.id, keywordId))
    throw error
  }
  await spendLinkedinViews(reader.searcher.id, answer, db, now)

  const hidden = await hiddenSlugs(userId, db)
  const titles = await readBuyerTitles(userId, keyword.projectId, db)
  // Nothing stored under it yet means this is its first read that worked:
  // a watched person's last few posts then ring nothing.
  const [stored] = await db.select({ id: promoLinkedinFinds.id }).from(promoLinkedinFinds).where(eq(promoLinkedinFinds.keywordId, keywordId)).limit(1)
  const firstSearch = !stored
  let added = 0
  for (const post of answer.posts) {
    if (!listable(post, hidden)) continue
    const values = figures(post, titles)
    const rank = rankLinkedinFind(
      {
        position: post.position,
        comments: post.comments,
        postedAt: values.postedAt,
        authorFollowers: post.authorFollowers,
        named: keyword.mark !== "",
        matchedTitle: values.matchedTitle,
      },
      now
    )
    const inserted = await db
      .insert(promoLinkedinFinds)
      .values({
        id: uuid(),
        userId,
        projectId: keyword.projectId,
        keywordId,
        postId: post.postId.slice(0, 25),
        ...values,
        position: post.position,
        rank,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [promoLinkedinFinds.keywordId, promoLinkedinFinds.postId],
        targetWhere: isNotNull(promoLinkedinFinds.keywordId),
        set: { ...values, position: post.position, rank, lastSeenAt: now },
      })
      .returning({ id: promoLinkedinFinds.id, firstSeenAt: promoLinkedinFinds.firstSeenAt })
    const row = inserted[0]
    if (!row || row.firstSeenAt.getTime() !== now.getTime()) continue
    added += 1
    if (watch && keyword.notify && !firstSearch && post.canComment) {
      await ringWatched(userId, keyword.projectId, row.id, post, db, now)
    }
  }

  await db
    .update(promoLinkedinKeywords)
    .set({ lastRunAt: now, lastError: "", updatedAt: now })
    .where(eq(promoLinkedinKeywords.id, keywordId))
  return { seen: answer.posts.length, added }
}

/** One bell per new post from a watched person or page, opening it in the LinkedIn module. */
async function ringWatched(
  userId: string,
  projectId: string,
  findId: string,
  post: LinkedinPost,
  db: CustomShellDb,
  now: Date
): Promise<void> {
  // The person's id is in the target, because LinkedIn's ids are the same for everyone.
  const target = `${userId}:${post.postId}`
  if (await noticeRung("linkedin_watched", target, db)) return
  await ringBell(
    userId,
    {
      kind: "linkedin_watched",
      targetId: target,
      message: `${NOTICE_HEADINGS.linkedin_watched} ${post.authorName || post.authorSlug}`,
      detail: post.text.slice(0, 300),
      href: `/admin/projects/${encodeURIComponent(projectId)}?network=linkedin&open=${encodeURIComponent(findId)}`,
    },
    db,
    now
  )
}

/**
 * Reads one post again for the right column: fresh figures and its top
 * comments (part 22). Every find of the same post is updated, so a post found
 * twice reads the same under both. A post that is gone or whose comments have
 * closed is marked so, and leaves To look at.
 */
export async function readLinkedinPost(
  userId: string,
  findId: string,
  reader: LinkedinReader,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [find] = await db
    .select({ postId: promoLinkedinFinds.postId, projectId: promoLinkedinFinds.projectId })
    .from(promoLinkedinFinds)
    .where(and(eq(promoLinkedinFinds.id, findId), eq(promoLinkedinFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That LinkedIn post is no longer saved.")
  const read = await linkedinReadPost(reader.target, { postId: find.postId })
  await spendLinkedinViews(reader.searcher.id, read, db, now)
  const comments = read.comments.slice(0, LINKEDIN_TOP_COMMENTS)
  const where = and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.postId, find.postId))
  if (read.missing || !read.post) {
    await db.update(promoLinkedinFinds).set({ canComment: false, topComments: comments, readAt: now }).where(where)
    return
  }
  const titles = await readBuyerTitles(userId, find.projectId, db)
  await db.update(promoLinkedinFinds).set({ ...figures(read.post, titles), topComments: comments, readAt: now }).where(where)
}

/**
 * True when a feed post belongs to the project (part 13): its words hold one
 * of the project's search words or hashtags, or its writer is someone the
 * project sells to.
 */
export function feedPostFits(post: Pick<LinkedinPost, "text" | "authorHeadline" | "authorKind">, words: string[], titles: readonly string[]): boolean {
  const text = post.text.toLowerCase()
  if (words.some((word) => word && text.includes(word.toLowerCase()))) return true
  return post.authorKind === "person" && Boolean(matchedTitle(post.authorHeadline, titles))
}

/**
 * Reads an account's own home feed in its own browser (part 13), and keeps
 * the posts that fit its project under a "From your feed" label, offered only
 * to that account. Nothing is clicked.
 */
export async function runLinkedinFeed(
  userId: string,
  account: Pick<typeof promoAccounts.$inferSelect, "id" | "projectId">,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  if (!account.projectId) throw new Refusal("This LinkedIn account is in no project, so nothing in its feed belongs anywhere.")
  const keywords = await db
    .select({ kind: promoLinkedinKeywords.kind, value: promoLinkedinKeywords.value })
    .from(promoLinkedinKeywords)
    .where(and(eq(promoLinkedinKeywords.userId, userId), eq(promoLinkedinKeywords.projectId, account.projectId), eq(promoLinkedinKeywords.enabled, true)))
  const words = keywords.flatMap((keyword) => (keyword.kind === "search" ? [keyword.value] : keyword.kind === "hashtag" ? [`#${keyword.value}`] : []))
  const titles = await readBuyerTitles(userId, account.projectId, db)
  const { posts } = await linkedinFeed(target, { max: FEED_MAX })
  const hidden = await hiddenSlugs(userId, db)
  let added = 0
  for (const post of posts) {
    if (!listable(post, hidden) || !feedPostFits(post, words, titles)) continue
    const values = figures(post, titles)
    const rank = rankLinkedinFind(
      { position: post.position, comments: post.comments, postedAt: values.postedAt, authorFollowers: post.authorFollowers, named: false, matchedTitle: values.matchedTitle, fromFeed: true },
      now
    )
    const inserted = await db
      .insert(promoLinkedinFinds)
      .values({
        id: uuid(),
        userId,
        projectId: account.projectId,
        feedAccountId: account.id,
        postId: post.postId.slice(0, 25),
        ...values,
        position: post.position,
        rank,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [promoLinkedinFinds.feedAccountId, promoLinkedinFinds.postId],
        targetWhere: isNotNull(promoLinkedinFinds.feedAccountId),
        set: { ...values, position: post.position, rank, lastSeenAt: now },
      })
      .returning({ firstSeenAt: promoLinkedinFinds.firstSeenAt })
    if (inserted[0]?.firstSeenAt.getTime() === now.getTime()) added += 1
  }
  return added
}
