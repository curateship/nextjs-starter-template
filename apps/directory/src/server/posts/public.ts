import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm"

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
import { MORE_TO_READ_COUNT, POSTS_PAGE_SIZE } from "@/lib/posts/post-sort"
import type { SitemapChunkFile, SitemapEntry } from "@/server/app-options"
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
import { sitePostCoverImage } from "@/server/directory/settings"
import { categories, categoryRelationships } from "@/server/directory/schema"
import {
  numberedSitemapChunk,
  numberedSitemapFiles,
  type NumberedSitemapSource,
} from "@/server/directory/sitemap"
import {
  featuredPostsFirst,
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
  /**
   * Whether this page draws the post's cover image, from Settings → Directory
   * → Post pages. The cards that lead here draw it whatever this says, so a
   * site can keep the photo on its lists and leave it off the post itself.
   *
   * Named apart from the post's own `coverImage`, which is the picture's
   * address. This one is only whether the page shows it.
   */
  showCoverImage: boolean
  /**
   * "More to read" at the foot of the page: exactly `MORE_TO_READ_COUNT`
   * other published posts, or none, so the block is never half empty.
   */
  moreToRead: PublicPostCard[]
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
      .orderBy(...featuredPostsFirst)
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

/** One page of a site's published posts, featured first, then newest first. */
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
  const [categoryRows, directoryVisibility, showCover, moreToRead] =
    await Promise.all([
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
      sitePostCoverImage(site.id, database),
      morePostsToRead(site.id, row.id, database),
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
    showCoverImage: showCover,
    moreToRead,
  }
}

/**
 * The posts under a post: other published posts that share a category with
 * it, newest first, topped up with the site's newest posts when its categories
 * hold too few. A post in no category is all top-up.
 *
 * Exactly `MORE_TO_READ_COUNT` or nothing. A site with only a post or two
 * more would otherwise put one lonely card under every article.
 *
 * Read inside the post page's cached answer, so it costs nothing extra on a
 * repeat visit. Saving any post clears that cache for the site, so a newly
 * published post can appear here on the next read.
 */
async function morePostsToRead(
  siteId: string,
  postId: string,
  database: CustomShellDb
): Promise<PublicPostCard[]> {
  const thisPostsCategories = database
    .select({ id: categoryRelationships.categoryId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, POST_CONTENT_TYPE),
        eq(categoryRelationships.contentId, postId)
      )
    )
  const sharingACategory = database
    .select({ id: categoryRelationships.contentId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, siteId),
        eq(categoryRelationships.contentType, POST_CONTENT_TYPE),
        inArray(categoryRelationships.categoryId, thisPostsCategories)
      )
    )
  const otherPosts = and(publishedPostsOnSite(siteId), ne(sitePosts.id, postId))

  const matched = await database
    .select(postCardColumns)
    .from(sitePosts)
    .where(and(otherPosts, inArray(sitePosts.id, sharingACategory)))
    .orderBy(...newestPostsFirst)
    .limit(MORE_TO_READ_COUNT)
  const topUp =
    matched.length < MORE_TO_READ_COUNT
      ? await database
          .select(postCardColumns)
          .from(sitePosts)
          .where(
            and(
              otherPosts,
              matched.length
                ? notInArray(
                    sitePosts.id,
                    matched.map((each) => each.id)
                  )
                : undefined
            )
          )
          .orderBy(...newestPostsFirst)
          .limit(MORE_TO_READ_COUNT - matched.length)
      : []

  const rows = [...matched, ...topUp]
  if (rows.length < MORE_TO_READ_COUNT) return []
  return withCategories(siteId, rows.map(toPostCard), database)
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
 * The posts in the sitemap: every published post, and none while the Posts
 * page is not open to everyone. Numbered oldest first, so a new post lands in
 * the last file and moves nothing.
 */
async function postSitemapSource(
  siteId: string,
  database: CustomShellDb
): Promise<{ source: NumberedSitemapSource; open: boolean }> {
  const open = await postsArePublic(siteId, database)
  const source: NumberedSitemapSource = {
    table: sitePosts,
    where: open ? publishedPostsOnSite(siteId) : sql`false`,
    order: [sitePosts.createdAt, sitePosts.id],
    slug: sitePosts.slug,
    updatedAt: sitePosts.updatedAt,
    folder: "/post-sitemaps",
    pagePath: (slug) => `/posts/${slug}`,
  }
  return { source, open }
}

/**
 * The numbered files this site's posts come in, for the sitemap index. None
 * when there are no posts to list. Held by the public-page cache, which saving
 * a post clears.
 */
export async function postSitemapFiles(
  siteId: string,
  database: CustomShellDb = db
): Promise<readonly SitemapChunkFile[]> {
  const { source, open } = await postSitemapSource(siteId, database)
  return cachedPublicDirectoryRead(siteId, "post-sitemap-files", { open }, () =>
    numberedSitemapFiles(source, database)
  )
}

/**
 * One numbered file's post addresses, or `null` when that file does not exist.
 * File zero always exists, and is empty on a site with none to list.
 */
export async function postSitemapFile(
  siteId: string,
  chunk: number,
  database: CustomShellDb = db
): Promise<readonly SitemapEntry[] | null> {
  const { source, open } = await postSitemapSource(siteId, database)
  return cachedPublicDirectoryRead(
    siteId,
    "post-sitemap-file",
    { chunk, open },
    () => numberedSitemapChunk(source, chunk, database)
  )
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
