import { and, asc, eq, sql } from "drizzle-orm"

import type { SitemapChunkFile, SitemapEntry } from "@/server/app-options"
import { db, type CustomShellDb } from "@/server/db"
import { cachedPublicDirectoryRead } from "@/server/directory/public-cache"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"

/**
 * How many listing addresses go in one numbered file.
 *
 * A sitemap file may hold 50,000 addresses or 50MB, whichever comes first, and
 * a site that quietly sails past either stops being indexed with no error
 * anywhere. Five thousand is far enough under both that neither limit can be
 * reached by a listing with a long address.
 */
export const DIRECTORY_SITEMAP_CHUNK_SIZE = 5000

/**
 * The highest file number this app will look for — fifty million listings.
 *
 * No site will ever reach it, and that is the point: without a ceiling, a
 * request for file 9999999999999999999 asks the database to skip five thousand
 * times that many rows, which is more than it can count to. It answers with an
 * error rather than a 404, and a crawler asking for nonsense should never be
 * able to make the server fall over.
 */
const HIGHEST_DIRECTORY_SITEMAP_CHUNK = 10_000

/** Where one numbered file lives. `src/routes/directory-sitemaps.$chunk.ts` serves it. */
function directorySitemapChunkPath(chunk: number): string {
  return `/directory-sitemaps/${chunk}`
}

/**
 * The category addresses on one site.
 *
 * Listings are not here: there can be thousands of them, so they go in the
 * numbered files instead. Categories number in the tens on the biggest site
 * this app has, so they stay in the flat file with the shell's own pages.
 */
export async function directorySitemapEntries(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<readonly SitemapEntry[]> {
  const rows = await database
    .select({ slug: categories.slug, updatedAt: categories.updatedAt })
    .from(categories)
    .innerJoin(
      categoryRelationships,
      and(
        eq(categoryRelationships.categoryId, categories.id),
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE)
      )
    )
    .innerJoin(
      directoryListings,
      and(
        eq(directoryListings.id, categoryRelationships.contentId),
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .where(eq(categories.workspaceId, workspaceId))
    .groupBy(categories.id, categories.slug, categories.updatedAt)

  return rows.map((row) => ({
    path: `/directory/category/${row.slug}`,
    updatedAt: row.updatedAt,
  }))
}

/**
 * The numbered files this site's published listings come in, newest change
 * first noted against each one.
 *
 * One grouped query, and it never carries a listing back: the database numbers
 * the rows in address order, divides those numbers by the file size and hands
 * back one row per file. A site of 3,300 listings answers with one row, a site
 * of 60,000 with twelve, and neither loads a listing.
 *
 * A site with no published listings answers with nothing at all, which is how
 * an ordinary small site keeps the single flat `/sitemap.xml` it has always
 * had.
 */
async function directorySitemapChunkFilesUncached(
  workspaceId: string,
  database: CustomShellDb
): Promise<readonly SitemapChunkFile[]> {
  const result = await database.execute<{
    chunk: number
    updatedAt: Date | string | null
  }>(sql`
    SELECT (numbered.row_index / ${DIRECTORY_SITEMAP_CHUNK_SIZE})::int AS "chunk",
           max(numbered.updated_at) AS "updatedAt"
    FROM (
      SELECT (row_number() OVER (ORDER BY listing.slug ASC) - 1) AS row_index,
             listing.updated_at AS updated_at
      FROM directory_listings listing
      WHERE listing.workspace_id = ${workspaceId}
        AND listing.status = 'published'
    ) numbered
    GROUP BY 1
    ORDER BY 1
  `)

  return result.rows.map((row) => ({
    path: directorySitemapChunkPath(row.chunk),
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
  }))
}

/** The numbered files for one site, held by the public-page cache. */
export function directorySitemapChunkFiles(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<readonly SitemapChunkFile[]> {
  return cachedPublicDirectoryRead(workspaceId, "sitemap-chunks", {}, () =>
    directorySitemapChunkFilesUncached(workspaceId, database)
  )
}

async function directoryListingChunkEntriesUncached(
  workspaceId: string,
  chunk: number,
  database: CustomShellDb
): Promise<readonly SitemapEntry[] | null> {
  if (
    !Number.isInteger(chunk) ||
    chunk < 0 ||
    chunk > HIGHEST_DIRECTORY_SITEMAP_CHUNK
  ) {
    return null
  }

  // Ordered by address, which is unique within a site, so a listing cannot fall
  // between two files or turn up in both.
  const rows = await database
    .select({
      slug: directoryListings.slug,
      updatedAt: directoryListings.updatedAt,
    })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        eq(directoryListings.status, "published")
      )
    )
    .orderBy(asc(directoryListings.slug))
    .limit(DIRECTORY_SITEMAP_CHUNK_SIZE)
    .offset(chunk * DIRECTORY_SITEMAP_CHUNK_SIZE)

  // Empty says one of two things, and which one is just the file number. File
  // zero is a site with nothing published, and an empty list of addresses is a
  // valid sitemap where a missing file is not. Any other empty file is one past
  // the end, which is a plain 404. A file in the middle can never come back
  // empty, so this needs no count to tell the two apart.
  if (rows.length === 0 && chunk > 0) return null

  return rows.map((row) => ({
    path: `/directory/${row.slug}`,
    updatedAt: row.updatedAt,
  }))
}

/**
 * One numbered file's addresses, or nothing when that file does not exist.
 *
 * Held by the public-page cache, which saving or deleting a listing already
 * clears — so a listing published a moment ago is in its file on the next
 * visit. A file that does not exist answers `null` and is never cached.
 */
export function directoryListingChunkEntries(
  workspaceId: string,
  chunk: number,
  database: CustomShellDb = db
): Promise<readonly SitemapEntry[] | null> {
  return cachedPublicDirectoryRead(
    workspaceId,
    "sitemap-chunk",
    { chunk },
    () => directoryListingChunkEntriesUncached(workspaceId, chunk, database)
  )
}
