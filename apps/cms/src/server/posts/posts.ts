import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"
import type { PgUpdateSetSource } from "drizzle-orm/pg-core"

import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import {
  cleanPostBody,
  emptyPostBody,
  postListingIds,
  type PostBody,
} from "@/lib/posts/post-body"
import type { PostSortColumn } from "@/lib/posts/post-sort"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  categoryNamesFor,
  deleteCategoryRowsFor,
} from "@/server/directory/content-categories"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { directoryListings } from "@/server/directory/schema"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"
import {
  sitePosts,
  POST_CONTENT_TYPE,
  type PostRow,
} from "@/server/posts/schema"

/**
 * The admin's side of posts. Every read and write takes the site first and
 * filters on it, so one site's posts never reach another site's screen.
 *
 * Saving or deleting a post clears the public page cache, because /posts,
 * the category pages and the feed all show posts.
 */

export const MAX_POST_TITLE = 200
export const MAX_POST_SUMMARY = 300

export type PostStatus = "draft" | "published"

export type SitePost = {
  id: string
  title: string
  slug: string
  coverImage: string
  summary: string
  body: PostBody
  status: PostStatus
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

/** A Posts screen row: the post without its body, plus its category names. */
export type PostSummary = Omit<SitePost, "body"> & { categories: string[] }

/** A listing as the editor's card picker and card preview show it. */
export type ListingChoice = {
  id: string
  title: string
  status: "draft" | "published"
  featuredImage: string
}

function toPost(row: PostRow): SitePost {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    coverImage: row.coverImage,
    summary: row.summary,
    body: cleanPostBody(row.body),
    status: row.status === "published" ? "published" : "draft",
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

const POST_NOUN = { one: "post", many: "posts" }

async function slugIsTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: sitePosts.id })
    .from(sitePosts)
    .where(
      and(
        eq(sitePosts.workspaceId, workspaceId),
        eq(sitePosts.slug, slug),
        exceptId ? ne(sitePosts.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

function cleanTitle(raw: string): string {
  const title = raw.trim().slice(0, MAX_POST_TITLE)
  if (!title) throw new Error("A post needs a title.")
  return title
}

export async function listPosts(
  workspaceId: string,
  options: {
    search?: string
    status?: PostStatus
    sort?: PostSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
): Promise<{ posts: PostSummary[]; total: number }> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  const filters = [eq(sitePosts.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(sitePosts.title, pattern),
      ilike(sitePosts.slug, pattern)
    )
    if (match) filters.push(match)
  }
  if (options.status) filters.push(eq(sitePosts.status, options.status))
  const where = and(...filters)

  const order = options.direction === "asc" ? asc : desc
  const sort = options.sort ?? "updated"
  const ordering =
    sort === "published"
      ? // A draft has no date, so drafts go last whichever way the list runs.
        [
          sql`${sitePosts.publishedAt} ${sql.raw(options.direction === "asc" ? "ASC" : "DESC")} NULLS LAST`,
        ]
      : [
          order(
            {
              title: sitePosts.title,
              status: sitePosts.status,
              updated: sitePosts.updatedAt,
            }[sort]
          ),
        ]

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(sitePosts)
      .where(where)
      // The id breaks ties, so a page boundary never shows a post twice.
      .orderBy(...ordering, asc(sitePosts.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(sitePosts)
      .where(where),
  ])

  const names = await categoryNamesFor(
    workspaceId,
    POST_CONTENT_TYPE,
    rows.map((row) => row.id),
    database
  )
  return {
    posts: rows.map((row) => {
      const { body: _body, ...rest } = toPost(row)
      return { ...rest, categories: names.get(row.id) ?? [] }
    }),
    total: countRow?.total ?? 0,
  }
}

export async function findPost(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<SitePost | null> {
  const [row] = await database
    .select()
    .from(sitePosts)
    .where(and(eq(sitePosts.id, id), eq(sitePosts.workspaceId, workspaceId)))
    .limit(1)
  return row ? toPost(row) : null
}

/** A new post: a title, a free address from it, born a draft. */
export async function createPost(
  workspaceId: string,
  input: { title: string; slug?: string },
  database: CustomShellDb = db
): Promise<SitePost> {
  const title = cleanTitle(input.title)
  const chosen = input.slug?.trim()
  const wanted = chosen || slugFromTitle(title)
  const problem = slugProblem(wanted)
  if (problem) throw new Error(problem)

  const isTaken = (candidate: string) =>
    slugIsTaken(workspaceId, candidate, null, database)
  let slug = wanted
  if (chosen) await requireFreeSlugRule(wanted, isTaken, POST_NOUN)
  else slug = await firstFreeSlugRule(wanted, isTaken, POST_NOUN)

  const at = now()
  const [row] = await database
    .insert(sitePosts)
    .values({
      id: uuid(),
      workspaceId,
      title,
      slug,
      body: emptyPostBody(),
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The post was not created.")
  return toPost(row)
}

export async function updatePost(
  workspaceId: string,
  id: string,
  input: {
    title?: string
    slug?: string
    coverImage?: string
    summary?: string
    body?: unknown
    status?: PostStatus
  },
  database: CustomShellDb = db
): Promise<SitePost> {
  const at = now()
  const values: PgUpdateSetSource<typeof sitePosts> = { updatedAt: at }

  if (input.title !== undefined) values.title = cleanTitle(input.title)
  if (input.slug !== undefined) {
    const slug = input.slug.trim()
    await requireFreeSlugRule(
      slug,
      (candidate) => slugIsTaken(workspaceId, candidate, id, database),
      POST_NOUN
    )
    values.slug = slug
  }
  if (input.coverImage !== undefined) {
    values.coverImage = input.coverImage.trim().slice(0, 600)
  }
  if (input.summary !== undefined) {
    values.summary = input.summary.trim().slice(0, MAX_POST_SUMMARY)
  }
  if (input.body !== undefined) values.body = cleanPostBody(input.body)
  if (input.status !== undefined) {
    values.status = input.status
    // The first publish dates the post; later ones keep that date.
    if (input.status === "published") {
      values.publishedAt = sql`coalesce(${sitePosts.publishedAt}, ${at.toISOString()}::timestamptz)`
    }
  }

  const [row] = await database
    .update(sitePosts)
    .set(values)
    .where(and(eq(sitePosts.id, id), eq(sitePosts.workspaceId, workspaceId)))
    .returning()

  if (!row) throw new Error("That post no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  return toPost(row)
}

/**
 * One request for the whole selection. The category rows go in the same
 * transaction: the relationship table has no foreign key to a post, so the
 * database would not remove them on its own.
 */
export async function deletePosts(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<{ done: string[]; kept: string[] }> {
  if (ids.length === 0) return { done: [], kept: [] }

  const done = await database.transaction(async (tx) => {
    const deleted = await tx
      .delete(sitePosts)
      .where(
        and(eq(sitePosts.workspaceId, workspaceId), inArray(sitePosts.id, ids))
      )
      .returning({ id: sitePosts.id })
    const removed = deleted.map((row) => row.id)
    await deleteCategoryRowsFor(workspaceId, POST_CONTENT_TYPE, removed, tx)
    return removed
  })

  if (done.length) clearPublicDirectoryCache(workspaceId)
  const doneSet = new Set(done)
  return { done, kept: ids.filter((id) => !doneSet.has(id)) }
}

const listingChoiceColumns = {
  id: directoryListings.id,
  title: directoryListings.title,
  status: directoryListings.status,
  featuredImage: directoryListings.featuredImage,
}

function toChoice(row: {
  id: string
  title: string
  status: string
  featuredImage: string
}): ListingChoice {
  return { ...row, status: row.status === "published" ? "published" : "draft" }
}

/** This site's listings whose title matches, for the card picker. */
export async function searchListingChoices(
  workspaceId: string,
  search: string,
  database: CustomShellDb = db
): Promise<ListingChoice[]> {
  const text = search.trim()
  const rows = await database
    .select(listingChoiceColumns)
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        text ? ilike(directoryListings.title, `%${text}%`) : undefined
      )
    )
    .orderBy(asc(directoryListings.title), asc(directoryListings.id))
    .limit(20)
  return rows.map(toChoice)
}

/** The listings a post's cards point at, so the editor can name each card. */
export async function listingChoicesForBody(
  workspaceId: string,
  body: PostBody,
  database: CustomShellDb = db
): Promise<ListingChoice[]> {
  const ids = postListingIds(body)
  if (ids.length === 0) return []
  const rows = await database
    .select(listingChoiceColumns)
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        inArray(directoryListings.id, ids)
      )
    )
  return rows.map(toChoice)
}
