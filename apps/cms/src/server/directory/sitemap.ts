import { and, eq } from "drizzle-orm"

import type { SitemapEntry } from "@/server/app-options"
import { db, type CustomShellDb } from "@/server/db"
import {
  categories,
  categoryRelationships,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"

/** Published directory addresses belonging to one site. */
export async function directorySitemapEntries(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<readonly SitemapEntry[]> {
  const [listings, categoryRows] = await Promise.all([
    database
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
      ),
    database
      .select({
        slug: categories.slug,
        updatedAt: categories.updatedAt,
      })
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
      .groupBy(categories.id, categories.slug, categories.updatedAt),
  ])

  return [
    ...listings.map((row) => ({
      path: `/directory/${row.slug}`,
      updatedAt: row.updatedAt,
    })),
    ...categoryRows.map((row) => ({
      path: `/directory/category/${row.slug}`,
      updatedAt: row.updatedAt,
    })),
  ]
}
