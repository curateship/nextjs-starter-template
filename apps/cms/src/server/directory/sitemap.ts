import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm"
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core"

import { LISTING_PAGE_STATUSES } from "@/lib/directory/listing-status"

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
 * How many addresses go in one numbered file, for listings, events and posts
 * alike.
 *
 * A sitemap file may hold 50,000 addresses or 50MB, whichever comes first, and
 * a site that quietly sails past either stops being indexed with no error
 * anywhere. Five thousand is far enough under both that neither limit can be
 * reached by a record with a long address.
 */
export const SITEMAP_CHUNK_SIZE = 5000

/**
 * The highest file number this app will look for — fifty million records.
 *
 * No site will ever reach it, and that is the point: without a ceiling, a
 * request for file 9999999999999999999 asks the database to skip five thousand
 * times that many rows, which is more than it can count to. It answers with an
 * error rather than a 404, and a crawler asking for nonsense should never be
 * able to make the server fall over.
 */
const HIGHEST_SITEMAP_CHUNK = 10_000

/**
 * One kind of record split into numbered files: which rows, in what order, and
 * where their files and pages live.
 *
 * `order` must end in a column that is unique on the site, so every row has
 * exactly one place in it and can never fall between two files or turn up in
 * both.
 */
export type NumberedSitemapSource = {
  table: PgTable
  /** Exactly the rows the public may be shown, or a false condition for none. */
  where: SQL | undefined
  order: readonly AnyPgColumn[]
  slug: AnyPgColumn
  updatedAt: AnyPgColumn
  /** Where file N lives is `${folder}/N`. */
  folder: string
  /** A record's page, from its address part. */
  pagePath: (slug: string) => string
}

/**
 * The numbered files a kind of record comes in, with the newest change among
 * the records inside each one.
 *
 * One grouped query, and it never carries a record back: the database numbers
 * the rows in order, divides those numbers by the file size and hands back one
 * row per file. A site of 3,300 rows answers with one row, a site of 60,000
 * with twelve, and neither loads a record.
 *
 * Nothing to list answers with nothing at all, so a site with none of this
 * kind adds no file to its index.
 */
export async function numberedSitemapFiles(
  source: NumberedSitemapSource,
  database: CustomShellDb
): Promise<SitemapChunkFile[]> {
  const result = await database.execute<{
    chunk: number
    updatedAt: Date | string | null
  }>(sql`
    SELECT (numbered.row_index / ${SITEMAP_CHUNK_SIZE})::int AS "chunk",
           max(numbered.updated_at) AS "updatedAt"
    FROM (
      SELECT (row_number() OVER (ORDER BY ${sql.join([...source.order], sql`, `)}) - 1) AS row_index,
             ${source.updatedAt} AS updated_at
      FROM ${source.table}
      WHERE ${source.where ?? sql`true`}
    ) numbered
    GROUP BY 1
    ORDER BY 1
  `)

  return result.rows.map((row) => ({
    path: `${source.folder}/${row.chunk}`,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : undefined,
  }))
}

/**
 * One numbered file's addresses, or `null` when that file does not exist.
 *
 * Empty says one of two things, and which one is just the file number. File
 * zero is a site with nothing to list, and an empty list of addresses is a
 * valid sitemap where a missing file is not. Any other empty file is one past
 * the end, which is a plain 404. A file in the middle can never come back
 * empty, so this needs no count to tell the two apart.
 */
export async function numberedSitemapChunk(
  source: NumberedSitemapSource,
  chunk: number,
  database: CustomShellDb
): Promise<SitemapEntry[] | null> {
  if (!Number.isInteger(chunk) || chunk < 0 || chunk > HIGHEST_SITEMAP_CHUNK) {
    return null
  }

  const rows = await database
    .select({ slug: source.slug, updatedAt: source.updatedAt })
    .from(source.table)
    .where(source.where)
    .orderBy(...source.order.map((column) => asc(column)))
    .limit(SITEMAP_CHUNK_SIZE)
    .offset(chunk * SITEMAP_CHUNK_SIZE)

  if (rows.length === 0 && chunk > 0) return null

  return rows.map((row) => ({
    path: source.pagePath(String(row.slug)),
    updatedAt: row.updatedAt as Date,
  }))
}

/** Listings, in address order, which is unique within a site. */
function listingSitemapSource(workspaceId: string): NumberedSitemapSource {
  // Closed listings stay in, because their pages stay up. Google's own advice
  // is to let it find the "closed" for a while, and Tyler chose that on 17 Oct
  // 2026.
  return {
    table: directoryListings,
    where: and(
      eq(directoryListings.workspaceId, workspaceId),
      inArray(directoryListings.status, [...LISTING_PAGE_STATUSES])
    ),
    order: [directoryListings.slug],
    slug: directoryListings.slug,
    updatedAt: directoryListings.updatedAt,
    folder: "/directory-sitemaps",
    pagePath: (slug) => `/directory/${slug}`,
  }
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
 * The numbered files this site's published listings come in, held by the
 * public-page cache. A site with no published listings answers with nothing,
 * which is how an ordinary small site keeps the single flat `/sitemap.xml` it
 * has always had.
 */
export function directorySitemapChunkFiles(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<readonly SitemapChunkFile[]> {
  return cachedPublicDirectoryRead(workspaceId, "sitemap-chunks", {}, () =>
    numberedSitemapFiles(listingSitemapSource(workspaceId), database)
  )
}

/**
 * One numbered file's listing addresses, or nothing when that file does not
 * exist.
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
    () =>
      numberedSitemapChunk(listingSitemapSource(workspaceId), chunk, database)
  )
}
