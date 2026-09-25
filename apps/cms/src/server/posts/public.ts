import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"

import {
  searchSnippet,
  siteSearchPattern,
  type SiteSearchResult,
} from "@/lib/pages/site-search"
import {
  cleanPostBody,
  emptyPostBody,
  postBodyText,
  postListingIds,
  type PostBody,
} from "@/lib/posts/post-body"
import { POSTS_PAGE_SIZE } from "@/lib/posts/post-sort"
import type { SitemapEntry } from "@/server/app-options"
import { readPageVisibility } from "@/server/content/pages"
import { db, type CustomShellDb } from "@/server/db"
import {
  publicListingCardsByIds,
  type PublicCategoryLink,
  type PublicListingCard,
  type PublicSite,
  type VisitorSite,
} from "@/server/directory/public"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import { categories, categoryRelationships } from "@/server/directory/schema"
import {
  postsArePublic,
  newestPostsFirst,
  postCardColumns,
  publishedPostsOnSite,
  toPostCard,
  withCategories,
  type PublicPostCard,
} from "@/server/posts/cards"
import { sitePosts, POST_CONTENT_TYPE } from "@/server/posts/schema"

/**
 * What a visitor may read of a site's posts. Every read takes the site from
 * the visited address and selects published posts only, so a draft is
 * missing rather than hidden.
 *
 * The Posts page's own on/off switch is checked by the endpoint before these
 * run, because whether a members-only Posts page is readable depends on who is
 * asking, and these answers are cached for everyone.
 */

export type PublicPostsPage = {
  site: PublicSite
  posts: PublicPostCard[]
  total: number
  page: number
  pageSize: number
}

export type PublicPost = PublicPostCard & {
  body: PostBody
  updatedAt: Date
  /**
   * Every category the post is in, for the links under its title. The card's
   * own `category` is null here: a card names one category and a post's page
   * lists them all, so the page reads this and never that.
   */
  categories: PublicCategoryLink[]
}

export type PublicPostPage = {
  site: PublicSite
  post: PublicPost
  /**
   * The cards the body points at, published listings only. A card whose
   * listing is a draft, deleted, or on another site has no entry here, and the
   * page draws nothing in its place.
   */
  listingCards: PublicListingCard[]
}

async function readPublicPostsUncached(
  site: VisitorSite,
  page: number,
  database: CustomShellDb
): Promise<PublicPostsPage> {
  const [rows, [countRow]] = await Promise.all([
    database
      .select(postCardColumns)
      .from(sitePosts)
      .where(publishedPostsOnSite(site.id))
      .orderBy(...newestPostsFirst)
      .limit(POSTS_PAGE_SIZE)
      .offset((page - 1) * POSTS_PAGE_SIZE),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(sitePosts)
      .where(publishedPostsOnSite(site.id)),
  ])
  return {
    site: { name: site.name, url: site.url },
    posts: await withCategories(site.id, rows.map(toPostCard), database),
    total: countRow?.total ?? 0,
    page,
    pageSize: POSTS_PAGE_SIZE,
  }
}

/** One page of a site's published posts, newest first. */
export function readPublicPosts(
  site: VisitorSite,
  page: number,
  database: CustomShellDb = db
): Promise<PublicPostsPage> {
  return cachedPublicDirectoryRead(
    site.id,
    "posts",
    { site: { name: site.name, url: site.url }, page },
    () => readPublicPostsUncached(site, page, database)
  )
}

async function readPublicPostUncached(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb
): Promise<PublicPostPage | null> {
  const [row] = await database
    .select()
    .from(sitePosts)
    .where(and(publishedPostsOnSite(site.id), eq(sitePosts.slug, slug)))
    .limit(1)
  if (!row) return null

  const body = cleanPostBody(row.body)
  const [categoryRows, directoryVisibility] = await Promise.all([
    database
      .select({ name: categories.name, slug: categories.slug })
      .from(categoryRelationships)
      .innerJoin(
        categories,
        eq(categories.id, categoryRelationships.categoryId)
      )
      .where(
        and(
          eq(categoryRelationships.workspaceId, site.id),
          eq(categoryRelationships.contentType, POST_CONTENT_TYPE),
          eq(categoryRelationships.contentId, row.id)
        )
      )
      .orderBy(asc(categories.name)),
    readPageVisibility(site.id, "/directory", database),
  ])

  // A card links to the listing's page, so while the directory is not open to
  // everyone the cards are left out rather than pointing at a closed door.
  const listingCards =
    directoryVisibility === "everyone"
      ? await publicListingCardsByIds(site.id, postListingIds(body), database)
      : []

  return {
    site: { name: site.name, url: site.url },
    post: {
      ...toPostCard(row),
      body,
      updatedAt: row.updatedAt,
      categories: categoryRows,
    },
    listingCards,
  }
}

/** One published post by its address, or null. */
export function readPublicPost(
  site: VisitorSite,
  slug: string,
  database: CustomShellDb = db
): Promise<PublicPostPage | null> {
  return cachedPublicDirectoryRead(
    site.id,
    "post",
    { site: { name: site.name, url: site.url }, slug },
    () => readPublicPostUncached(site, slug, database)
  )
}

/** Published posts for the shell's whole-site search. */
export async function postSearchResults(
  siteId: string,
  rawQuery: string,
  limit: number,
  database: CustomShellDb = db
): Promise<SiteSearchResult[]> {
  const query = rawQuery.trim()
  if (!query || limit < 1) return []
  if (!(await postsArePublic(siteId, database))) return []

  const pattern = siteSearchPattern(query)
  // Only the text of written blocks: a listing card holds nothing but an id.
  const bodyText = sql<string>`jsonb_path_query_array(${sitePosts.body}, '$.**.text')::text`
  const rows = await database
    .select({
      title: sitePosts.title,
      slug: sitePosts.slug,
      summary: sitePosts.summary,
      body: sitePosts.body,
    })
    .from(sitePosts)
    .where(
      and(
        publishedPostsOnSite(siteId),
        or(
          ilike(sitePosts.title, pattern),
          ilike(sitePosts.summary, pattern),
          ilike(bodyText, pattern)
        )
      )
    )
    .orderBy(
      desc(ilike(sitePosts.title, pattern)),
      asc(sitePosts.title),
      asc(sitePosts.id)
    )
    .limit(limit)

  return rows.map((row) => ({
    type: "Post",
    title: row.title,
    snippet: searchSnippet(
      row.summary.trim() || postBodyText(cleanPostBody(row.body)),
      query
    ),
    path: `/posts/${row.slug}`,
  }))
}

/**
 * Every published post's address, for the flat sitemap file. A site's posts are
 * written by hand, so they stay far below the size that needs numbered files.
 */
export async function postSitemapEntries(
  siteId: string,
  database: CustomShellDb = db
): Promise<SitemapEntry[]> {
  if (!(await postsArePublic(siteId, database))) return []
  const rows = await database
    .select({ slug: sitePosts.slug, updatedAt: sitePosts.updatedAt })
    .from(sitePosts)
    .where(publishedPostsOnSite(siteId))
    .orderBy(asc(sitePosts.slug))
  return rows.map((row) => ({
    path: `/posts/${row.slug}`,
    updatedAt: row.updatedAt,
  }))
}

export type PostFeedRow = PublicPostCard & { body: PostBody }

/** The newest published posts with their first category, for the feed. */
export async function newestPostsForFeed(
  siteId: string,
  limit: number,
  database: CustomShellDb = db
): Promise<PostFeedRow[]> {
  if (!(await postsArePublic(siteId, database))) return []
  const rows = await database
    .select({ ...postCardColumns, body: sitePosts.body })
    .from(sitePosts)
    .where(publishedPostsOnSite(siteId))
    .orderBy(...newestPostsFirst)
    .limit(limit)
  if (rows.length === 0) return []

  // The bodies stay beside the cards, because a feed entry falls back to the
  // post's first sentence when it has no summary.
  const bodyFor = new Map(rows.map((row) => [row.id, cleanPostBody(row.body)]))
  const cards = await withCategories(
    siteId,
    rows.map(({ body: _body, ...row }) => toPostCard(row)),
    database
  )
  return cards.map((card): PostFeedRow => ({
    ...card,
    body: bodyFor.get(card.id) ?? emptyPostBody(),
  }))
}
