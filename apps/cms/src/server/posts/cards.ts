import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { readPageVisibility } from "@/server/content/pages"
import { categoryRelationships } from "@/server/directory/schema"
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
}

export const postCardColumns = {
  id: sitePosts.id,
  title: sitePosts.title,
  slug: sitePosts.slug,
  summary: sitePosts.summary,
  coverImage: sitePosts.coverImage,
  publishedAt: sitePosts.publishedAt,
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
}): PublicPostCard {
  // The database refuses a published post with no date, so the fallback is
  // never reached; it only satisfies the column's nullable type.
  return { ...row, publishedAt: row.publishedAt ?? new Date(0) }
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
  return rows.map(toPostCard)
}
