import { and, asc, desc, eq, gte, inArray, lt, notExists, or, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { TIDY_DEFAULT_DAYS } from "@/lib/social/options"
import {
  X_TIDY_AFTER_HOURS,
  xKeywordLabel,
  type XFindStatus,
  type XKeywordKind,
  type XKeywordMark,
  type XTopReply,
} from "@/lib/social/x/options"

import { promoRedditSettings } from "../schema"
import { xFitBand, xRankReason, type XFitBand } from "./rank"
import { promoXDrafts, promoXFinds, promoXHidden, promoXKeywords, promoXReplies } from "./schema"

/**
 * The posts a project's X keywords found, as the middle column lists them
 * (parts 9, 16, 17, 18 and 19).
 *
 * One post found by two keywords is one row, under every keyword that found
 * it, so skipping it once skips it everywhere. Accounts hidden by the person
 * are left out when the list is read; their posts stay stored, so showing
 * one again brings them back.
 *
 * Two kinds of post never reach To look at: one whose replies are limited
 * to followers or named people (part 17), and one older than 12 hours (part
 * 18, Tyler: "12 hours"), because a reply under it is seen by almost nobody.
 * The old ones stay stored and come back when words are typed in the search
 * box (part 19).
 */

/** The tabs of posts. Today, Replies, Posts and Communities are lists of their own. */
export type XFindsTab = "new" | "replied" | "skipped"

const TAB_STATUSES: Record<XFindsTab, XFindStatus[]> = {
  new: ["new", "shortlisted"],
  replied: ["commented"],
  skipped: ["skipped"],
}

/** How many posts one list read returns at most. */
const LIST_LIMIT = 200

const HOUR_MS = 3_600_000

export type XFindView = {
  id: string
  postId: string
  url: string
  text: string
  author: { id: string; handle: string; name: string; followers: number | null }
  postedAt: Date | null
  views: number | null
  likes: number
  replies: number
  reposts: number
  link: string
  rank: number
  band: XFitBand
  /** Plain words for the rank, for the row's tooltip. */
  reason: string
  status: XFindStatus
  /** "you" or "rival" when a marked keyword found it (part 13), else "". */
  named: Exclude<XKeywordMark, ""> | ""
  /** True when a watched account posted it (part 11). */
  watched: boolean
  /** Every keyword that found it, as its chip reads. */
  keywords: string[]
  /** The top replies read for it, null until read (part 22). */
  topReplies: XTopReply[] | null
  /** True once it is older than 12 hours, so it has left To look at. */
  old: boolean
}

export type XFindsQuery = {
  projectId: string
  /** One keyword, or null for every keyword of the project (Everything, part 19). */
  keywordId: string | null
  tab: XFindsTab
  /** Words to look for in the post or the poster's name. Typed words also bring back posts older than 12 hours. */
  search?: string
  /** At most this many posts, 200 when not said, or null for every one (for the counts). */
  limit?: number | null
}

type FindRow = typeof promoXFinds.$inferSelect

/** The handles a person hid, lower case. */
export async function hiddenHandles(userId: string, db: CustomShellDb = defaultDb): Promise<Set<string>> {
  const rows = await db.select({ handle: promoXHidden.handle }).from(promoXHidden).where(eq(promoXHidden.userId, userId))
  return new Set(rows.map((row) => row.handle.toLowerCase()))
}

/** When a post leaves To look at: 12 hours after it was posted, or after it was found when X gave no time. */
export function xFindIsOld(find: Pick<FindRow, "postedAt" | "firstSeenAt">, now: Date): boolean {
  const from = find.postedAt ?? find.firstSeenAt
  return now.getTime() - from.getTime() > X_TIDY_AFTER_HOURS * HOUR_MS
}

function view(
  find: FindRow,
  keywords: Array<{ label: string; mark: XKeywordMark; kind: XKeywordKind }>,
  now: Date
): XFindView {
  const named = keywords.find((keyword) => keyword.mark)?.mark ?? ""
  return {
    id: find.id,
    postId: find.postId,
    url: find.url,
    text: find.text,
    author: { id: find.authorId, handle: find.authorHandle, name: find.authorName, followers: find.authorFollowers },
    postedAt: find.postedAt,
    views: find.views,
    likes: find.likes,
    replies: find.replies,
    reposts: find.reposts,
    link: find.link,
    rank: find.rank,
    band: xFitBand(find.rank),
    reason: xRankReason(
      {
        position: find.position,
        replies: find.replies,
        postedAt: find.postedAt,
        authorFollowers: find.authorFollowers,
        named: named !== "",
        watched: keywords.some((keyword) => keyword.kind === "account"),
      },
      now
    ),
    status: find.status,
    named: named === "" ? "" : named,
    watched: keywords.some((keyword) => keyword.kind === "account"),
    keywords: [...new Set(keywords.map((keyword) => keyword.label))].sort((a, b) => a.localeCompare(b)),
    topReplies: find.topReplies,
    old: xFindIsOld(find, now),
  }
}

/**
 * The posts of one tab, best first, one row per post. The row kept for a
 * post found twice is its best-ranked one.
 */
export async function listXFinds(
  userId: string,
  query: XFindsQuery,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XFindView[]> {
  // A % or _ typed in the box is looked for as itself, not as a wildcard.
  const words = (query.search?.trim().toLowerCase() ?? "").replace(/[\\%_]/g, "\\$&")
  const fresh = new Date(now.getTime() - X_TIDY_AFTER_HOURS * HOUR_MS)
  const rows = await db
    .select({ find: promoXFinds, kind: promoXKeywords.kind, value: promoXKeywords.value, mark: promoXKeywords.mark })
    .from(promoXFinds)
    .innerJoin(promoXKeywords, eq(promoXKeywords.id, promoXFinds.keywordId))
    .where(
      and(
        eq(promoXFinds.userId, userId),
        eq(promoXKeywords.projectId, query.projectId),
        query.keywordId ? eq(promoXFinds.keywordId, query.keywordId) : undefined,
        inArray(promoXFinds.status, TAB_STATUSES[query.tab]),
        // A post nobody can reply to is never listed to reply to (part 17).
        query.tab === "new" ? eq(promoXFinds.repliesOpen, true) : undefined,
        // Older than 12 hours leaves To look at, unless words are typed (parts 18 and 19).
        query.tab === "new" && !words
          ? or(gte(promoXFinds.postedAt, fresh), and(sql`${promoXFinds.postedAt} IS NULL`, gte(promoXFinds.firstSeenAt, fresh)))
          : undefined,
        words
          ? sql`(lower(${promoXFinds.text}) LIKE ${`%${words}%`} OR lower(${promoXFinds.authorName}) LIKE ${`%${words}%`} OR lower(${promoXFinds.authorHandle}) LIKE ${`%${words}%`})`
          : undefined
      )
    )
    .orderBy(desc(promoXFinds.rank), asc(promoXFinds.id))

  const hidden = await hiddenHandles(userId, db)
  const byPost = new Map<string, { find: FindRow; keywords: Array<{ label: string; mark: XKeywordMark; kind: XKeywordKind }> }>()
  for (const row of rows) {
    if (row.find.authorHandle && hidden.has(row.find.authorHandle.toLowerCase())) continue
    const keyword = { label: xKeywordLabel({ kind: row.kind, value: row.value }), mark: row.mark, kind: row.kind }
    const seen = byPost.get(row.find.postId)
    if (seen) seen.keywords.push(keyword)
    else byPost.set(row.find.postId, { find: row.find, keywords: [keyword] })
  }
  const limit = query.limit === undefined ? LIST_LIMIT : query.limit
  // A watched account's posts go to the top of To look at (part 11), best first among them.
  const isWatched = (item: { keywords: Array<{ kind: XKeywordKind }> }) => item.keywords.some((keyword) => keyword.kind === "account")
  const listed = [...byPost.values()].sort((a, b) => (query.tab === "new" ? Number(isWatched(b)) - Number(isWatched(a)) : 0))
  return (limit === null ? listed : listed.slice(0, limit)).map((item) => view(item.find, item.keywords, now))
}

/** One find, checked as the person's, with its project, or null. */
export async function ownedXFind(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<(FindRow & { projectId: string }) | null> {
  const [row] = await db
    .select({ find: promoXFinds, projectId: promoXKeywords.projectId })
    .from(promoXFinds)
    .innerJoin(promoXKeywords, eq(promoXKeywords.id, promoXFinds.keywordId))
    .where(and(eq(promoXFinds.id, findId), eq(promoXFinds.userId, userId)))
    .limit(1)
  return row ? { ...row.find, projectId: row.projectId } : null
}

/** One find as the right column draws it. */
export async function readXFind(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<XFindView | null> {
  const rows = await db
    .select({ find: promoXFinds, kind: promoXKeywords.kind, value: promoXKeywords.value, mark: promoXKeywords.mark })
    .from(promoXFinds)
    .innerJoin(promoXKeywords, eq(promoXKeywords.id, promoXFinds.keywordId))
    .where(
      and(
        eq(promoXFinds.userId, userId),
        sql`${promoXFinds.postId} = (SELECT "post_id" FROM "promo_x_finds" WHERE "id" = ${findId} AND "user_id" = ${userId})`
      )
    )
  const own = rows.find((row) => row.find.id === findId)
  if (!own) return null
  return view(
    own.find,
    rows.map((row) => ({ label: xKeywordLabel({ kind: row.kind, value: row.value }), mark: row.mark, kind: row.kind })),
    now
  )
}

/**
 * Skips posts, or puts them back on To look at. Every find of the same post
 * moves together. One with a reply against it is left alone and reported,
 * because it has been answered whatever the tab says.
 */
export async function setXFindsStatus(
  userId: string,
  findIds: string[],
  status: "new" | "skipped",
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const ids = [...new Set(findIds)]
  if (!ids.length) return { completed: [], skipped: [] }
  const finds = await db
    .select({ id: promoXFinds.id, postId: promoXFinds.postId, status: promoXFinds.status })
    .from(promoXFinds)
    .where(and(eq(promoXFinds.userId, userId), inArray(promoXFinds.id, ids)))
  const completed: string[] = []
  const skipped: string[] = []
  for (const find of finds) {
    if (find.status === "commented") {
      skipped.push(find.id)
      continue
    }
    await db
      .update(promoXFinds)
      .set({ status })
      .where(and(eq(promoXFinds.userId, userId), eq(promoXFinds.postId, find.postId), sql`${promoXFinds.status} <> 'commented'`))
    completed.push(find.id)
  }
  for (const id of ids) if (!completed.includes(id) && !skipped.includes(id)) skipped.push(id)
  return { completed, skipped }
}

/** Marks every find of a post as replied, once a reply or quote to it has gone out. */
export async function markPostReplied(userId: string, postId: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db
    .update(promoXFinds)
    .set({ status: "commented" })
    .where(and(eq(promoXFinds.userId, userId), eq(promoXFinds.postId, postId)))
}

export type XHiddenRow = { id: string; handle: string; name: string; createdAt: Date }

export async function listXHidden(userId: string, db: CustomShellDb = defaultDb): Promise<XHiddenRow[]> {
  return db
    .select({ id: promoXHidden.id, handle: promoXHidden.handle, name: promoXHidden.name, createdAt: promoXHidden.createdAt })
    .from(promoXHidden)
    .where(eq(promoXHidden.userId, userId))
    .orderBy(asc(promoXHidden.handle))
}

/**
 * Hides the account that posted one find, across every keyword and project,
 * until it is shown again (part 16). Its later posts are dropped by the
 * search before they are stored. Says how many stored posts went with it.
 */
export async function hideXAuthor(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<{ handle: string; name: string; hiddenPosts: number }> {
  const [find] = await db
    .select()
    .from(promoXFinds)
    .where(and(eq(promoXFinds.id, findId), eq(promoXFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That X post is no longer saved.")
  if (!find.authorHandle) throw new Error("X did not say who posted this.")
  const name = find.authorName || `@${find.authorHandle}`
  await db
    .insert(promoXHidden)
    .values({ id: uuid(), userId, handle: find.authorHandle, name })
    .onConflictDoNothing()
  const [counted] = await db
    .select({ n: sql<number>`count(DISTINCT ${promoXFinds.postId})::int` })
    .from(promoXFinds)
    .where(and(eq(promoXFinds.userId, userId), sql`lower(${promoXFinds.authorHandle}) = lower(${find.authorHandle})`))
  return { handle: find.authorHandle, name, hiddenPosts: counted?.n ?? 0 }
}

/** Shows a hidden account again. */
export async function unhideX(userId: string, hiddenId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoXHidden)
    .where(and(eq(promoXHidden.id, hiddenId), eq(promoXHidden.userId, userId)))
    .returning({ id: promoXHidden.id })
  if (!removed.length) throw new Error("That account is not hidden any more.")
}

/** Rows one tidy pass deletes at most, so a backlog never holds up the shared ticker. */
const TIDY_BATCH = 500

/**
 * Deletes X posts nobody answered that were found longer ago than the
 * person's tidy-up days, the same number Reddit's and Medium's tidy-ups use
 * (Settings → Reddit, 30 to begin with, 0 for never). Leaving To look at
 * after 12 hours needs no deleting: the list reads the post's time. A post
 * with a reply against it, a draft, or the Replied tab's status is never
 * touched.
 */
export async function tidyOldXFinds(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const people = await db.selectDistinct({ userId: promoXFinds.userId }).from(promoXFinds)
  let deleted = 0
  for (const { userId } of people) {
    const [setting] = await db
      .select({ days: promoRedditSettings.tidyAfterDays })
      .from(promoRedditSettings)
      .where(eq(promoRedditSettings.userId, userId))
      .limit(1)
    const days = setting?.days ?? TIDY_DEFAULT_DAYS
    if (!days) continue
    const before = new Date(now.getTime() - days * 86_400_000)
    const old = await db
      .select({ id: promoXFinds.id })
      .from(promoXFinds)
      .where(
        and(
          eq(promoXFinds.userId, userId),
          inArray(promoXFinds.status, ["new", "shortlisted", "skipped"]),
          lt(promoXFinds.lastSeenAt, before),
          notExists(db.select({ id: promoXReplies.id }).from(promoXReplies).where(eq(promoXReplies.findId, promoXFinds.id))),
          notExists(db.select({ id: promoXDrafts.id }).from(promoXDrafts).where(eq(promoXDrafts.findId, promoXFinds.id)))
        )
      )
      .limit(TIDY_BATCH)
    if (!old.length) continue
    const gone = await db
      .delete(promoXFinds)
      .where(inArray(promoXFinds.id, old.map((row) => row.id)))
      .returning({ id: promoXFinds.id })
    deleted += gone.length
  }
  return deleted
}
