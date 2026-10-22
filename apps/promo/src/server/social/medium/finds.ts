import { and, asc, desc, eq, inArray, lt, notExists, sql } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { TIDY_DEFAULT_DAYS } from "@/lib/social/options"
import { mediumKeywordLabel, type MediumFindStatus, type MediumKeywordMark } from "@/lib/social/medium/options"

import { promoRedditSettings } from "../schema"
import { mediumFitBand, mediumRankReason, type MediumFitBand } from "./rank"
import {
  promoMediumDrafts,
  promoMediumFinds,
  promoMediumHidden,
  promoMediumKeywords,
  promoMediumResponses,
} from "./schema"

/**
 * The stories a project's Medium keywords found, as the middle column lists
 * them (parts 6, 10, 11 and 12).
 *
 * One story found by two keywords is one row, under every keyword that found
 * it, so skipping it once skips it everywhere. Writers and publications
 * hidden by the person are left out when the list is read; their stories stay
 * stored, so showing one again brings them back.
 */

/** The tabs of stories. Today, Responses, Articles and Publications are lists of their own. */
export type MediumFindsTab = "new" | "replied" | "skipped"

const TAB_STATUSES: Record<MediumFindsTab, MediumFindStatus[]> = {
  new: ["new", "shortlisted"],
  replied: ["commented"],
  skipped: ["skipped"],
}

/** How many stories one list read returns at most. */
const LIST_LIMIT = 200

export type MediumFindView = {
  id: string
  storyId: string
  url: string
  title: string
  subtitle: string
  writer: { id: string; handle: string; name: string; followers: number | null }
  publication: { slug: string; name: string } | null
  tags: string[]
  postedAt: Date | null
  claps: number
  responseCount: number
  membersOnly: boolean
  rank: number
  band: MediumFitBand
  /** Plain words for the rank, for the row's tooltip. */
  reason: string
  status: MediumFindStatus
  /** "you" or "rival" when a marked keyword found it (part 13), else "". */
  named: Exclude<MediumKeywordMark, ""> | ""
  /** Every keyword that found it, as its chip reads. */
  keywords: string[]
  /** True once the reader has read it in full. */
  read: boolean
}

export type MediumFindsQuery = {
  projectId: string
  /** One keyword, or null for every keyword of the project (Everything). */
  keywordId: string | null
  tab: MediumFindsTab
  /** Words to look for in the title, the subtitle or the writer's name. */
  search?: string
  /** At most this many stories, 200 when not said, or null for every one (for the counts). */
  limit?: number | null
}

type FindRow = typeof promoMediumFinds.$inferSelect

/** The writers and publications a person hid, lower case, by kind. */
export async function hiddenSets(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<{ writers: Set<string>; publications: Set<string> }> {
  const rows = await db
    .select({ kind: promoMediumHidden.kind, value: promoMediumHidden.value })
    .from(promoMediumHidden)
    .where(eq(promoMediumHidden.userId, userId))
  return {
    writers: new Set(rows.filter((row) => row.kind === "writer").map((row) => row.value.toLowerCase())),
    publications: new Set(rows.filter((row) => row.kind === "publication").map((row) => row.value.toLowerCase())),
  }
}

export function isHidden(
  find: Pick<FindRow, "writerHandle" | "publicationSlug">,
  hidden: { writers: Set<string>; publications: Set<string> }
): boolean {
  return (
    (find.writerHandle !== "" && hidden.writers.has(find.writerHandle.toLowerCase())) ||
    (find.publicationSlug !== "" && hidden.publications.has(find.publicationSlug.toLowerCase()))
  )
}

function view(
  find: FindRow,
  keywords: Array<{ label: string; mark: MediumKeywordMark }>,
  now: Date
): MediumFindView {
  const named = keywords.find((keyword) => keyword.mark)?.mark ?? ""
  return {
    id: find.id,
    storyId: find.storyId,
    url: find.url,
    title: find.title,
    subtitle: find.subtitle,
    writer: { id: find.writerId, handle: find.writerHandle, name: find.writerName, followers: find.writerFollowers },
    publication: find.publicationSlug ? { slug: find.publicationSlug, name: find.publicationName } : null,
    tags: find.tags,
    postedAt: find.postedAt,
    claps: find.claps,
    responseCount: find.responseCount,
    membersOnly: find.membersOnly,
    rank: find.rank,
    band: mediumFitBand(find.rank),
    reason: mediumRankReason(
      {
        position: find.position,
        responseCount: find.responseCount,
        postedAt: find.postedAt,
        writerFollowers: find.writerFollowers,
        named: named !== "",
      },
      now
    ),
    status: find.status,
    named: named === "" ? "" : named,
    keywords: [...new Set(keywords.map((keyword) => keyword.label))].sort((a, b) => a.localeCompare(b)),
    read: find.storyReadAt !== null,
  }
}

/**
 * The stories of one tab, best first, one row per story. The row kept for a
 * story found twice is its best-ranked one.
 */
export async function listMediumFinds(
  userId: string,
  query: MediumFindsQuery,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediumFindView[]> {
  // A % or _ typed in the box is looked for as itself, not as a wildcard.
  const words = (query.search?.trim().toLowerCase() ?? "").replace(/[\\%_]/g, "\\$&")
  const rows = await db
    .select({ find: promoMediumFinds, kind: promoMediumKeywords.kind, value: promoMediumKeywords.value, mark: promoMediumKeywords.mark })
    .from(promoMediumFinds)
    .innerJoin(promoMediumKeywords, eq(promoMediumKeywords.id, promoMediumFinds.keywordId))
    .where(
      and(
        eq(promoMediumFinds.userId, userId),
        eq(promoMediumKeywords.projectId, query.projectId),
        query.keywordId ? eq(promoMediumFinds.keywordId, query.keywordId) : undefined,
        inArray(promoMediumFinds.status, TAB_STATUSES[query.tab]),
        words
          ? sql`(lower(${promoMediumFinds.title}) LIKE ${`%${words}%`} OR lower(${promoMediumFinds.subtitle}) LIKE ${`%${words}%`} OR lower(${promoMediumFinds.writerName}) LIKE ${`%${words}%`} OR lower(${promoMediumFinds.writerHandle}) LIKE ${`%${words}%`})`
          : undefined
      )
    )
    .orderBy(desc(promoMediumFinds.rank), asc(promoMediumFinds.id))

  const hidden = await hiddenSets(userId, db)
  const byStory = new Map<string, { find: FindRow; keywords: Array<{ label: string; mark: MediumKeywordMark }> }>()
  for (const row of rows) {
    if (isHidden(row.find, hidden)) continue
    const keyword = { label: mediumKeywordLabel({ kind: row.kind, value: row.value }), mark: row.mark }
    const seen = byStory.get(row.find.storyId)
    if (seen) seen.keywords.push(keyword)
    else byStory.set(row.find.storyId, { find: row.find, keywords: [keyword] })
  }
  const limit = query.limit === undefined ? LIST_LIMIT : query.limit
  const listed = [...byStory.values()]
  return (limit === null ? listed : listed.slice(0, limit)).map((item) => view(item.find, item.keywords, now))
}

/** One find, checked as the person's, or null. */
export async function ownedMediumFind(
  userId: string,
  findId: string,
  db: CustomShellDb = defaultDb
): Promise<(FindRow & { projectId: string }) | null> {
  const [row] = await db
    .select({ find: promoMediumFinds, projectId: promoMediumKeywords.projectId })
    .from(promoMediumFinds)
    .innerJoin(promoMediumKeywords, eq(promoMediumKeywords.id, promoMediumFinds.keywordId))
    .where(and(eq(promoMediumFinds.id, findId), eq(promoMediumFinds.userId, userId)))
    .limit(1)
  return row ? { ...row.find, projectId: row.projectId } : null
}

/**
 * Skips stories, or puts them back on To look at. Every find of the same
 * story moves together. One with a response against it is left alone and
 * reported, because it has been answered whatever the tab says.
 */
export async function setMediumFindsStatus(
  userId: string,
  findIds: string[],
  status: "new" | "skipped",
  db: CustomShellDb = defaultDb
): Promise<{ completed: string[]; skipped: string[] }> {
  const ids = [...new Set(findIds)]
  if (!ids.length) return { completed: [], skipped: [] }
  const finds = await db
    .select({ id: promoMediumFinds.id, storyId: promoMediumFinds.storyId, status: promoMediumFinds.status })
    .from(promoMediumFinds)
    .where(and(eq(promoMediumFinds.userId, userId), inArray(promoMediumFinds.id, ids)))
  const completed: string[] = []
  const skipped: string[] = []
  for (const find of finds) {
    if (find.status === "commented") {
      skipped.push(find.id)
      continue
    }
    await db
      .update(promoMediumFinds)
      .set({ status })
      .where(
        and(
          eq(promoMediumFinds.userId, userId),
          eq(promoMediumFinds.storyId, find.storyId),
          sql`${promoMediumFinds.status} <> 'commented'`
        )
      )
    completed.push(find.id)
  }
  for (const id of ids) if (!completed.includes(id) && !skipped.includes(id)) skipped.push(id)
  return { completed, skipped }
}

/** Marks every find of a story as replied, once a response to it has gone out. */
export async function markStoryReplied(
  userId: string,
  storyId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await db
    .update(promoMediumFinds)
    .set({ status: "commented" })
    .where(and(eq(promoMediumFinds.userId, userId), eq(promoMediumFinds.storyId, storyId)))
}

export type HiddenRow = { id: string; kind: "writer" | "publication"; value: string; name: string; createdAt: Date }

export async function listHidden(userId: string, db: CustomShellDb = defaultDb): Promise<HiddenRow[]> {
  return db
    .select({
      id: promoMediumHidden.id,
      kind: promoMediumHidden.kind,
      value: promoMediumHidden.value,
      name: promoMediumHidden.name,
      createdAt: promoMediumHidden.createdAt,
    })
    .from(promoMediumHidden)
    .where(eq(promoMediumHidden.userId, userId))
    .orderBy(asc(promoMediumHidden.kind), asc(promoMediumHidden.value))
}

/**
 * Hides the writer or the publication of one find, across every keyword and
 * project, until it is shown again. Says how many stored stories went with it.
 */
export async function hideFromFind(
  userId: string,
  findId: string,
  kind: "writer" | "publication",
  db: CustomShellDb = defaultDb
): Promise<{ value: string; name: string; hiddenStories: number }> {
  const [find] = await db
    .select()
    .from(promoMediumFinds)
    .where(and(eq(promoMediumFinds.id, findId), eq(promoMediumFinds.userId, userId)))
    .limit(1)
  if (!find) throw new Error("That Medium story is no longer saved.")
  const value = kind === "writer" ? find.writerHandle : find.publicationSlug
  const name = kind === "writer" ? find.writerName || `@${find.writerHandle}` : find.publicationName || find.publicationSlug
  if (!value) {
    throw new Error(kind === "writer" ? "Medium did not say who wrote this story." : "This story is in no publication.")
  }
  await db
    .insert(promoMediumHidden)
    .values({ id: uuid(), userId, kind, value, name })
    .onConflictDoNothing()
  const column = kind === "writer" ? promoMediumFinds.writerHandle : promoMediumFinds.publicationSlug
  const [count] = await db
    .select({ n: sql<number>`count(DISTINCT ${promoMediumFinds.storyId})::int` })
    .from(promoMediumFinds)
    .where(and(eq(promoMediumFinds.userId, userId), sql`lower(${column}) = lower(${value})`))
  return { value, name, hiddenStories: count?.n ?? 0 }
}

/** Shows a hidden writer or publication again. */
export async function unhide(userId: string, hiddenId: string, db: CustomShellDb = defaultDb): Promise<void> {
  const removed = await db
    .delete(promoMediumHidden)
    .where(and(eq(promoMediumHidden.id, hiddenId), eq(promoMediumHidden.userId, userId)))
    .returning({ id: promoMediumHidden.id })
  if (!removed.length) throw new Error("That one is not hidden any more.")
}

/** Rows one tidy pass deletes at most, so a backlog never holds up the shared ticker. */
const TIDY_BATCH = 500

/**
 * Deletes Medium stories nobody answered that no search has seen for the
 * person's tidy-up days, the same number Reddit's tidy-up uses (Settings →
 * Reddit, 30 to begin with, 0 for never). A story with a response against
 * it, a draft, or the Replied tab's status is never touched (part 12).
 */
export async function tidyOldMediumFinds(
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<number> {
  const people = await db.selectDistinct({ userId: promoMediumFinds.userId }).from(promoMediumFinds)
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
      .select({ id: promoMediumFinds.id })
      .from(promoMediumFinds)
      .where(
        and(
          eq(promoMediumFinds.userId, userId),
          inArray(promoMediumFinds.status, ["new", "shortlisted", "skipped"]),
          lt(promoMediumFinds.lastSeenAt, before),
          notExists(
            db.select({ id: promoMediumResponses.id }).from(promoMediumResponses).where(eq(promoMediumResponses.findId, promoMediumFinds.id))
          ),
          notExists(
            db.select({ id: promoMediumDrafts.id }).from(promoMediumDrafts).where(eq(promoMediumDrafts.findId, promoMediumFinds.id))
          )
        )
      )
      .limit(TIDY_BATCH)
    if (!old.length) continue
    const gone = await db
      .delete(promoMediumFinds)
      .where(inArray(promoMediumFinds.id, old.map((row) => row.id)))
      .returning({ id: promoMediumFinds.id })
    deleted += gone.length
  }
  return deleted
}
