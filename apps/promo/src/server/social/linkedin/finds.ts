import { and, asc, desc, eq, gte, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { TIDY_DEFAULT_DAYS } from "@/lib/social/options"
import {
  LINKEDIN_TIDY_AFTER_HOURS,
  isWatchKind,
  linkedinKeywordLabel,
  type LinkedinFindStatus,
  type LinkedinKeywordKind,
  type LinkedinKeywordMark,
  type LinkedinTopComment,
} from "@/lib/social/linkedin/options"

import { promoAccounts, promoRedditSettings } from "../schema"
import { linkedinFitBand, linkedinRankReason, type LinkedinFitBand } from "./rank"
import { promoLinkedinComments, promoLinkedinDrafts, promoLinkedinFinds, promoLinkedinHidden, promoLinkedinKeywords } from "./schema"

/**
 * The posts a project's LinkedIn keywords and its accounts' feeds found, as
 * the middle column lists them (parts 10, 13, 17, 18, 19 and 20).
 *
 * One post found twice is one row on screen, under every keyword that found
 * it, so skipping it once skips it everywhere. People and pages hidden by
 * the person are left out when the list is read; their posts stay stored, so
 * showing one again brings them back.
 *
 * Two kinds of post never reach To look at: one the account can't comment
 * on (part 18), and one older than 2 days (part 19, Tyler: "2 days"). The old
 * ones stay stored and come back when words are typed in the search box
 * (part 20).
 */

/** The tabs of posts. Today, Comments, Posts and People are lists of their own. */
export type LinkedinFindsTab = "new" | "commented" | "skipped"

const TAB_STATUSES: Record<LinkedinFindsTab, LinkedinFindStatus[]> = {
  new: ["new", "shortlisted"],
  commented: ["commented"],
  skipped: ["skipped"],
}

/** How many posts one list read returns at most. */
const LIST_LIMIT = 200

const HOUR_MS = 3_600_000

export type LinkedinFindView = {
  id: string
  postId: string
  url: string
  text: string
  author: { name: string; headline: string; slug: string; kind: "person" | "company"; followers: number | null }
  postedAt: Date | null
  reactions: number
  comments: number
  reposts: number
  link: string
  rank: number
  band: LinkedinFitBand
  /** Plain words for the rank, for the row's tooltip. */
  reason: string
  status: LinkedinFindStatus
  /** "you" or "rival" when a marked keyword found it (part 15), else "". */
  named: Exclude<LinkedinKeywordMark, ""> | ""
  /** The project's buyer title the writer matched (part 14), or "". */
  matchedTitle: string
  /** True when a watched person or page posted it (part 12). */
  watched: boolean
  /** The account whose own feed it came from (part 13), offered only to that account, or null. */
  feedAccount: { id: string; handle: string } | null
  /** Every keyword that found it, as its chip reads. */
  keywords: string[]
  /** The top comments read for it, null until read (part 22). */
  topComments: LinkedinTopComment[] | null
  canComment: boolean
  /** True once it is older than 2 days, so it has left To look at. */
  old: boolean
}

export type LinkedinFindsQuery = {
  projectId: string
  /** One keyword, or null for every keyword and feed of the project (part 20). */
  keywordId: string | null
  tab: LinkedinFindsTab
  /** Words to look for in the post or the writer's name. Typed words also bring back posts older than 2 days. */
  search?: string
  /** At most this many posts, 200 when not said, or null for every one (for the counts). */
  limit?: number | null
}

type FindRow = typeof promoLinkedinFinds.$inferSelect

type Found = { label: string; mark: LinkedinKeywordMark; kind: LinkedinKeywordKind } | { feed: string }

/** The people and pages a person hid, as "kind:slug" in lower case. */
export async function hiddenSlugs(userId: string, db: CustomShellDb = defaultDb): Promise<Set<string>> {
  const rows = await db
    .select({ slug: promoLinkedinHidden.slug, kind: promoLinkedinHidden.kind })
    .from(promoLinkedinHidden)
    .where(eq(promoLinkedinHidden.userId, userId))
  return new Set(rows.map((row) => `${row.kind}:${row.slug.toLowerCase()}`))
}

/** The key a writer is hidden by. */
export function hiddenKey(kind: "person" | "company", slug: string): string {
  return `${kind}:${slug.toLowerCase()}`
}

/** When a post leaves To look at: 2 days after it was posted, or after it was found when LinkedIn gave no time. */
export function linkedinFindIsOld(find: Pick<FindRow, "postedAt" | "firstSeenAt">, now: Date): boolean {
  const from = find.postedAt ?? find.firstSeenAt
  return now.getTime() - from.getTime() > LINKEDIN_TIDY_AFTER_HOURS * HOUR_MS
}

function view(find: FindRow, found: Found[], feedHandle: string | null, now: Date): LinkedinFindView {
  const keywords = found.filter((item): item is Exclude<Found, { feed: string }> => "kind" in item)
  const named = keywords.find((keyword) => keyword.mark)?.mark ?? ""
  const watched = keywords.some((keyword) => isWatchKind(keyword.kind))
  const fromFeed = find.feedAccountId !== null
  return {
    id: find.id,
    postId: find.postId,
    url: find.url,
    text: find.text,
    author: { name: find.authorName, headline: find.authorHeadline, slug: find.authorSlug, kind: find.authorKind, followers: find.authorFollowers },
    postedAt: find.postedAt,
    reactions: find.reactions,
    comments: find.comments,
    reposts: find.reposts,
    link: find.link,
    rank: find.rank,
    band: linkedinFitBand(find.rank),
    reason: linkedinRankReason(
      {
        position: find.position,
        comments: find.comments,
        postedAt: find.postedAt,
        authorFollowers: find.authorFollowers,
        named: named !== "",
        matchedTitle: find.matchedTitle,
        watched,
        fromFeed,
      },
      now
    ),
    status: find.status,
    named,
    matchedTitle: find.matchedTitle,
    watched,
    feedAccount: find.feedAccountId ? { id: find.feedAccountId, handle: feedHandle ?? "" } : null,
    keywords: [...new Set(found.map((item) => ("feed" in item ? item.feed : item.label)))].sort((a, b) => a.localeCompare(b)),
    topComments: find.topComments,
    canComment: find.canComment,
    old: linkedinFindIsOld(find, now),
  }
}

/** One find's keyword or feed, as the list names it. */
function foundBy(row: { kind: LinkedinKeywordKind | null; value: string | null; mark: LinkedinKeywordMark | null; feedHandle: string | null }): Found {
  if (row.kind && row.value !== null) return { label: linkedinKeywordLabel({ kind: row.kind, value: row.value }), mark: row.mark ?? "", kind: row.kind }
  return { feed: row.feedHandle ? `in/${row.feedHandle}'s feed` : "An account's feed" }
}

/**
 * The posts of one tab, best first, one row per post. The row kept for a
 * post found twice is its best-ranked one.
 */
export async function listLinkedinFinds(
  userId: string,
  query: LinkedinFindsQuery,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<LinkedinFindView[]> {
  // A % or _ typed in the box is looked for as itself, not as a wildcard.
  const words = (query.search?.trim().toLowerCase() ?? "").replace(/[\\%_]/g, "\\$&")
  const fresh = new Date(now.getTime() - LINKEDIN_TIDY_AFTER_HOURS * HOUR_MS)
  const rows = await db
    .select({
      find: promoLinkedinFinds,
      kind: promoLinkedinKeywords.kind,
      value: promoLinkedinKeywords.value,
      mark: promoLinkedinKeywords.mark,
      feedHandle: promoAccounts.handle,
    })
    .from(promoLinkedinFinds)
    .leftJoin(promoLinkedinKeywords, eq(promoLinkedinKeywords.id, promoLinkedinFinds.keywordId))
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinFinds.feedAccountId))
    .where(
      and(
        eq(promoLinkedinFinds.userId, userId),
        eq(promoLinkedinFinds.projectId, query.projectId),
        query.keywordId ? eq(promoLinkedinFinds.keywordId, query.keywordId) : undefined,
        inArray(promoLinkedinFinds.status, TAB_STATUSES[query.tab]),
        // A post nobody can comment on is never listed to comment on (part 18).
        query.tab === "new" ? eq(promoLinkedinFinds.canComment, true) : undefined,
        // Older than 2 days leaves To look at, unless words are typed (parts 19 and 20).
        query.tab === "new" && !words
          ? or(
              gte(promoLinkedinFinds.postedAt, fresh),
              and(sql`${promoLinkedinFinds.postedAt} IS NULL`, gte(promoLinkedinFinds.firstSeenAt, fresh))
            )
          : undefined,
        words
          ? sql`(lower(${promoLinkedinFinds.text}) LIKE ${`%${words}%`} OR lower(${promoLinkedinFinds.authorName}) LIKE ${`%${words}%`} OR lower(${promoLinkedinFinds.authorHeadline}) LIKE ${`%${words}%`})`
          : undefined
      )
    )
    .orderBy(desc(promoLinkedinFinds.rank), asc(promoLinkedinFinds.id))

  const hidden = await hiddenSlugs(userId, db)
  const byPost = new Map<string, { find: FindRow; found: Found[]; feedHandle: string | null }>()
  for (const row of rows) {
    if (row.find.authorSlug && hidden.has(hiddenKey(row.find.authorKind, row.find.authorSlug))) continue
    const seen = byPost.get(row.find.postId)
    if (seen) seen.found.push(foundBy(row))
    else byPost.set(row.find.postId, { find: row.find, found: [foundBy(row)], feedHandle: row.feedHandle })
  }
  const limit = query.limit === undefined ? LIST_LIMIT : query.limit
  // A watched person's or page's posts go to the top of To look at (part 12), best first among them.
  const isWatched = (item: { found: Found[] }) => item.found.some((found) => "kind" in found && isWatchKind(found.kind))
  const listed = [...byPost.values()].sort((a, b) => (query.tab === "new" ? Number(isWatched(b)) - Number(isWatched(a)) : 0))
  return (limit === null ? listed : listed.slice(0, limit)).map((item) => view(item.find, item.found, item.feedHandle, now))
}

/** One find, checked as the person's, or null. */
export async function ownedLinkedinFind(userId: string, findId: string, db: CustomShellDb = defaultDb): Promise<FindRow | null> {
  const [row] = await db
    .select()
    .from(promoLinkedinFinds)
    .where(and(eq(promoLinkedinFinds.id, findId), eq(promoLinkedinFinds.userId, userId)))
    .limit(1)
  return row ?? null
}

/** One find as the right column draws it, with every keyword or feed that found its post. */
export async function readLinkedinFind(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<LinkedinFindView | null> {
  const own = await ownedLinkedinFind(userId, findId, db)
  if (!own) return null
  const rows = await db
    .select({
      find: promoLinkedinFinds,
      kind: promoLinkedinKeywords.kind,
      value: promoLinkedinKeywords.value,
      mark: promoLinkedinKeywords.mark,
      feedHandle: promoAccounts.handle,
    })
    .from(promoLinkedinFinds)
    .leftJoin(promoLinkedinKeywords, eq(promoLinkedinKeywords.id, promoLinkedinFinds.keywordId))
    .leftJoin(promoAccounts, eq(promoAccounts.id, promoLinkedinFinds.feedAccountId))
    .where(
      and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.projectId, own.projectId), eq(promoLinkedinFinds.postId, own.postId))
    )
  const feedHandle = rows.find((row) => row.find.id === findId)?.feedHandle ?? null
  return view(own, rows.map(foundBy), feedHandle, now)
}

/**
 * Skips posts, or puts them back on To look at. Every find of the same post
 * moves together. One with a comment against it is left alone and reported,
 * because it has been answered whatever the tab says.
 */
export async function setLinkedinFindsStatus(
  userId: string,
  findIds: string[],
  status: "new" | "skipped",
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const ids = [...new Set(findIds)]
  if (!ids.length) return { completed: [], skipped: [] }
  const finds = await db
    .select({ id: promoLinkedinFinds.id, postId: promoLinkedinFinds.postId, status: promoLinkedinFinds.status })
    .from(promoLinkedinFinds)
    .where(and(eq(promoLinkedinFinds.userId, userId), inArray(promoLinkedinFinds.id, ids)))
  const completed: string[] = []
  const skipped: string[] = []
  for (const find of finds) {
    if (find.status === "commented") {
      skipped.push(find.id)
      continue
    }
    await db
      .update(promoLinkedinFinds)
      .set({ status })
      .where(
        and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.postId, find.postId), sql`${promoLinkedinFinds.status} <> 'commented'`)
      )
    completed.push(find.id)
  }
  for (const id of ids) if (!completed.includes(id) && !skipped.includes(id)) skipped.push(id)
  return { completed, skipped }
}

/** Marks every find of a post as commented, once a comment on it has gone out. */
export async function markPostCommented(userId: string, postId: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db
    .update(promoLinkedinFinds)
    .set({ status: "commented" })
    .where(and(eq(promoLinkedinFinds.userId, userId), eq(promoLinkedinFinds.postId, postId)))
}

export type LinkedinHiddenRow = { id: string; slug: string; kind: "person" | "company"; name: string; createdAt: Date }

export async function listLinkedinHidden(userId: string, db: CustomShellDb = defaultDb): Promise<LinkedinHiddenRow[]> {
  return db
    .select({
      id: promoLinkedinHidden.id,
      slug: promoLinkedinHidden.slug,
      kind: promoLinkedinHidden.kind,
      name: promoLinkedinHidden.name,
      createdAt: promoLinkedinHidden.createdAt,
    })
    .from(promoLinkedinHidden)
    .where(eq(promoLinkedinHidden.userId, userId))
    .orderBy(asc(promoLinkedinHidden.name))
}

/**
 * Hides the person or page that posted one find, across every keyword and
 * project, until it is shown again (part 17). Their later posts are dropped
 * by the search before they are stored. Says how many stored posts went with
 * them.
 */
export async function hideLinkedinAuthor(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<{ name: string; hiddenPosts: number }> {
  const find = await ownedLinkedinFind(userId, findId, db)
  if (!find) throw new Error("That LinkedIn post is no longer saved.")
  if (!find.authorSlug) throw new Error("LinkedIn did not say who wrote this, so they can't be hidden.")
  const name = find.authorName || find.authorSlug
  await db
    .insert(promoLinkedinHidden)
    .values({ id: uuid(), userId, slug: find.authorSlug, kind: find.authorKind, name })
    .onConflictDoNothing()
  const [counted] = await db
    .select({ n: sql<number>`count(DISTINCT ${promoLinkedinFinds.postId})::int` })
    .from(promoLinkedinFinds)
    .where(
      and(
        eq(promoLinkedinFinds.userId, userId),
        eq(promoLinkedinFinds.authorKind, find.authorKind),
        sql`lower(${promoLinkedinFinds.authorSlug}) = lower(${find.authorSlug})`
      )
    )
  return { name, hiddenPosts: counted?.n ?? 0 }
}

/** Shows a hidden person or page again. */
export async function unhideLinkedin(userId: string, hiddenId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoLinkedinHidden)
    .where(and(eq(promoLinkedinHidden.id, hiddenId), eq(promoLinkedinHidden.userId, userId)))
    .returning({ id: promoLinkedinHidden.id })
  if (!removed.length) throw new Error("That one is not hidden any more.")
}

/** Rows one tidy pass deletes at most, so a backlog never holds up the shared ticker. */
const TIDY_BATCH = 500

/**
 * Deletes LinkedIn posts nobody answered that were found longer ago than the
 * person's tidy-up days, the same number the other networks' tidy-ups use
 * (Settings → Reddit, 30 to begin with, 0 for never). Leaving To look at
 * after 2 days needs no deleting: the list reads the post's time. A post
 * with a comment against it, a draft, or the Commented tab's status is never
 * touched.
 */
export async function tidyOldLinkedinFinds(db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<number> {
  const people = await db.selectDistinct({ userId: promoLinkedinFinds.userId }).from(promoLinkedinFinds)
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
      .select({ id: promoLinkedinFinds.id })
      .from(promoLinkedinFinds)
      .where(
        and(
          eq(promoLinkedinFinds.userId, userId),
          inArray(promoLinkedinFinds.status, ["new", "shortlisted", "skipped"]),
          lt(promoLinkedinFinds.lastSeenAt, before),
          notExists(
            db.select({ id: promoLinkedinComments.id }).from(promoLinkedinComments).where(eq(promoLinkedinComments.findId, promoLinkedinFinds.id))
          ),
          notExists(db.select({ id: promoLinkedinDrafts.id }).from(promoLinkedinDrafts).where(eq(promoLinkedinDrafts.findId, promoLinkedinFinds.id)))
        )
      )
      .limit(TIDY_BATCH)
    if (!old.length) continue
    const gone = await db
      .delete(promoLinkedinFinds)
      .where(inArray(promoLinkedinFinds.id, old.map((row) => row.id)))
      .returning({ id: promoLinkedinFinds.id })
    deleted += gone.length
  }
  return deleted
}

/** The newest finds of a project that ask a question in their words or top comments, for post ideas (part 35). */
export async function questionFinds(userId: string, projectId: string, db: CustomShellDb = defaultDb): Promise<FindRow[]> {
  return db
    .select()
    .from(promoLinkedinFinds)
    .where(
      and(
        eq(promoLinkedinFinds.userId, userId),
        eq(promoLinkedinFinds.projectId, projectId),
        or(sql`${promoLinkedinFinds.text} LIKE '%?%'`, sql`${promoLinkedinFinds.topComments}::text LIKE '%?%'`),
        isNull(promoLinkedinFinds.feedAccountId)
      )
    )
    .orderBy(desc(promoLinkedinFinds.firstSeenAt))
    .limit(30)
}
