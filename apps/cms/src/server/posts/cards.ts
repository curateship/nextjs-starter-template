import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { readPageVisibility } from "@/server/content/pages"
import { categories, categoryRelationships } from "@/server/directory/schema"
import { sitePosts, POST_CONTENT_TYPE } from "@/server/posts/schema"

/**
 * A post as a card in a list, and the one rule for which posts a visitor may
 * see: published, on this site.
 *
 * Its own file so the directory's category page can show posts without the
 * directory's public reads and the posts reads importing each other.
 */

export type PublicPostCard = {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  publishedAt: Date
  /** Whole minutes, never below one. Counted when the post was last saved. */
  readMinutes: number
  /**
   * The category the card names, the post's primary one if it has one and
   * otherwise the first by name. Null when the post is in none.
   */
  category: { name: string; slug: string } | null
}

export const postCardColumns = {
  id: sitePosts.id,
  title: sitePosts.title,
  slug: sitePosts.slug,
  summary: sitePosts.summary,
  coverImage: sitePosts.coverImage,
  publishedAt: sitePosts.publishedAt,
  readMinutes: sitePosts.readMinutes,
}

/** Published, on this site. The whole of what a visitor may read. */
export function publishedPostsOnSite(siteId: string) {
  return and(
    eq(sitePosts.workspaceId, siteId),
    eq(sitePosts.status, "published")
  )
}

/** Newest first, with the id breaking ties so pages never overlap. */
export const newestPostsFirst = [desc(sitePosts.publishedAt), asc(sitePosts.id)]

export function toPostCard(row: {
  id: string
  title: string
  slug: string
  summary: string
  coverImage: string
  publishedAt: Date | null
  readMinutes: number
}): PublicPostCard {
  // The database refuses a published post with no date, so the fallback is
  // never reached; it only satisfies the column's nullable type.
  return {
    ...row,
    publishedAt: row.publishedAt ?? new Date(0),
    // Filled in by `withCategories`, which every list of cards runs before
    // handing them out.
    category: null,
  }
}

/**
 * The category name, added to a whole page of cards in one query rather than
 * one per card.
 */
export async function withCategories(
  siteId: string,
  cards: PublicPostCard[],
  database: CustomShellDb
): Promise<PublicPostCard[]> {
  if (cards.length === 0) return cards
  const rows = await database
    .select({
      contentId: categoryRelationships.contentId,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, POST_CONTENT_TYPE),
        inArray(
          categoryRelationships.contentId,
          cards.map((card) => card.id)
        )
      )
    )
    // Primary first, so the first row for a post is the one it is shown under
    // and the rest are its other categories.
    .orderBy(desc(categoryRelationships.isPrimary), asc(categories.name))

  const category = new Map<string, { name: string; slug: string }>()
  for (const row of rows) {
    if (!category.has(row.contentId)) {
      category.set(row.contentId, { name: row.name, slug: row.slug })
    }
  }
  return cards.map((card) => ({
    ...card,
    category: category.get(card.id) ?? null,
  }))
}

/**
 * Whether this visitor may open the Posts page: "everyone" when it is open to
 * all, "members" when it is kept for members and they are signed in, and null
 * otherwise. `isSignedIn` is only asked in the members case. The same shape as
 * `eventsAccessFor`, for the same reason: a home page row of posts leads to
 * that page, so it is left off when the page is shut.
 */
export async function postsAccessFor(
  siteId: string,
  isSignedIn: () => Promise<boolean>,
  database: CustomShellDb = db
): Promise<"everyone" | "members" | null> {
  const visibility = await readPageVisibility(siteId, "/posts", database)
  if (visibility === "everyone") return "everyone"
  if (visibility === "members" && (await isSignedIn())) return "members"
  return null
}

/**
 * Whether posts may appear in places anyone can read without signing in: the
 * sitemap, search, the feed and category pages. Only when the Posts page is
 * open to everyone. A Posts page switched off or kept for members is not
 * advertised.
 */
export async function postsArePublic(
  siteId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  return (await readPageVisibility(siteId, "/posts", database)) === "everyone"
}

/**
 * The newest published posts for a home page row: every one of them, or only
 * those filed under one category.
 */
export async function newestPosts(
  siteId: string,
  limit: number,
  categoryId: string | null,
  database: CustomShellDb = db
): Promise<PublicPostCard[]> {
  if (categoryId) {
    return publicPostsInCategory(siteId, categoryId, limit, database)
  }
  const rows = await database
    .select(postCardColumns)
    .from(sitePosts)
    .where(publishedPostsOnSite(siteId))
    .orderBy(...newestPostsFirst)
    .limit(limit)
  return withCategories(siteId, rows.map(toPostCard), database)
}

/** The newest published posts filed under one category. */
export async function publicPostsInCategory(
  siteId: string,
  categoryId: string,
  limit: number,
  database: CustomShellDb = db
): Promise<PublicPostCard[]> {
  const inCategory = database
    .select({ id: categoryRelationships.contentId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, POST_CONTENT_TYPE),
        eq(categoryRelationships.categoryId, categoryId)
      )
    )
  const rows = await database
    .select(postCardColumns)
    .from(sitePosts)
    .where(and(publishedPostsOnSite(siteId), inArray(sitePosts.id, inCategory)))
    .orderBy(...newestPostsFirst)
    .limit(limit)
  return withCategories(siteId, rows.map(toPostCard), database)
}
