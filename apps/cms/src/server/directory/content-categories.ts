import { and, asc, eq, inArray, notInArray } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import { categories, categoryRelationships } from "@/server/directory/schema"

/**
 * Filing a post or an event under the site's categories. Both go through the
 * shared `categoryRelationships` table, told apart by `contentType` ('post' or
 * 'event'), so the rules for reading and changing the filing live here once.
 *
 * Listings keep their own writer in `listings.ts`, because a listing also has
 * a primary category and these do not.
 */

/** Which categories one post or event is filed under. */
export async function categoryIdsFor(
  workspaceId: string,
  contentType: string,
  contentId: string,
  database: CustomShellDb = db
): Promise<string[]> {
  const rows = await database
    .select({ categoryId: categoryRelationships.categoryId })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, contentType),
        eq(categoryRelationships.contentId, contentId)
      )
    )
  return rows.map((row) => row.categoryId)
}

/** Category names for each of these posts or events, for the admin rows. */
export async function categoryNamesFor(
  workspaceId: string,
  contentType: string,
  contentIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, string[]>> {
  if (contentIds.length === 0) return new Map()

  const rows = await database
    .select({
      contentId: categoryRelationships.contentId,
      name: categories.name,
    })
    .from(categoryRelationships)
    .innerJoin(categories, eq(categories.id, categoryRelationships.categoryId))
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, contentType),
        inArray(categoryRelationships.contentId, contentIds)
      )
    )
    .orderBy(asc(categories.name))

  const names = new Map<string, string[]>()
  for (const row of rows) {
    names.set(row.contentId, [...(names.get(row.contentId) ?? []), row.name])
  }
  return names
}

/**
 * Makes the category rows match the form. A category from another site, or
 * one deleted since the form opened, is dropped rather than refused.
 */
export async function setContentCategories(
  workspaceId: string,
  contentType: string,
  contentId: string,
  categoryIds: string[],
  database: CustomShellDb = db
): Promise<void> {
  const wanted = [...new Set(categoryIds)].slice(0, 50)
  const keep = wanted.length
    ? (
        await database
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.workspaceId, workspaceId),
              inArray(categories.id, wanted)
            )
          )
      ).map((row) => row.id)
    : []

  // Both statements or neither, so nothing is left half re-filed.
  await database.transaction(async (tx) => {
    await tx
      .delete(categoryRelationships)
      .where(
        and(
          eq(categoryRelationships.workspaceId, workspaceId),
          eq(categoryRelationships.contentType, contentType),
          eq(categoryRelationships.contentId, contentId),
          ...(keep.length
            ? [notInArray(categoryRelationships.categoryId, keep)]
            : [])
        )
      )
    const current = new Set(
      await categoryIdsFor(workspaceId, contentType, contentId, tx)
    )
    const missing = keep.filter((categoryId) => !current.has(categoryId))
    if (missing.length) {
      const at = now()
      await tx.insert(categoryRelationships).values(
        missing.map((categoryId) => ({
          id: uuid(),
          workspaceId,
          categoryId,
          contentType,
          contentId,
          isPrimary: false,
          createdAt: at,
        }))
      )
    }
  })
  clearPublicDirectoryCache(workspaceId)
}

/**
 * Removes the category rows of deleted posts or events. The relationship table
 * has no foreign key to them, so the database would not do it on its own; call
 * this inside the delete's own transaction.
 */
export async function deleteCategoryRowsFor(
  workspaceId: string,
  contentType: string,
  contentIds: string[],
  database: CustomShellDb
): Promise<void> {
  if (contentIds.length === 0) return
  await database
    .delete(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, contentType),
        inArray(categoryRelationships.contentId, contentIds)
      )
    )
}
