import { and, asc, eq, inArray, ne, notInArray } from "drizzle-orm"

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

/**
 * Files these posts, events or listings under one category: added to the ones
 * they already have, or in place of them.
 *
 * `contentIds` is the records that were found on this site, so everything here
 * exists; the caller counts the ones that are gone. A record already filed the
 * asked-for way comes back in `same` and nothing is written to it.
 *
 * `markPrimary` is for listings, whose category rows carry a primary marker. A
 * listing with one category row has no other candidate, so that row is its
 * primary; the same holds for a listing that had none before.
 */
export async function fileContentUnderCategory({
  workspaceId,
  contentType,
  contentIds,
  categoryId,
  mode,
  markPrimary = false,
  database = db,
}: {
  workspaceId: string
  contentType: string
  contentIds: string[]
  categoryId: string
  mode: "add" | "replace"
  markPrimary?: boolean
  database?: CustomShellDb
}): Promise<{ done: string[]; same: string[] }> {
  if (contentIds.length === 0) return { done: [], same: [] }

  const [category] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        eq(categories.workspaceId, workspaceId),
        eq(categories.id, categoryId)
      )
    )
    .limit(1)
  if (!category) {
    throw new Error("That category is not on this site any more.")
  }

  const links = await database
    .select({
      contentId: categoryRelationships.contentId,
      categoryId: categoryRelationships.categoryId,
    })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.contentType, contentType),
        inArray(categoryRelationships.contentId, contentIds)
      )
    )

  const filedUnder = new Map<string, Set<string>>()
  for (const link of links) {
    const set = filedUnder.get(link.contentId) ?? new Set<string>()
    set.add(link.categoryId)
    filedUnder.set(link.contentId, set)
  }

  const same: string[] = []
  const done: string[] = []
  for (const contentId of contentIds) {
    const current = filedUnder.get(contentId) ?? new Set<string>()
    const already =
      mode === "add"
        ? current.has(categoryId)
        : current.size === 1 && current.has(categoryId)
    if (already) same.push(contentId)
    else done.push(contentId)
  }
  if (done.length === 0) return { done, same }

  const needsRow = done.filter(
    (contentId) => !filedUnder.get(contentId)?.has(categoryId)
  )
  // A replace leaves one row, and an add to a record that had none makes its
  // first: either way that row is the only candidate for primary.
  const needsPrimary = markPrimary
    ? done.filter(
        (contentId) => mode === "replace" || !filedUnder.get(contentId)?.size
      )
    : []

  // All of it or none of it. A replace that dropped the old rows and then
  // failed to write the new one would leave records filed under nothing.
  await database.transaction(async (tx) => {
    if (mode === "replace") {
      await tx
        .delete(categoryRelationships)
        .where(
          and(
            eq(categoryRelationships.workspaceId, workspaceId),
            eq(categoryRelationships.contentType, contentType),
            inArray(categoryRelationships.contentId, done),
            ne(categoryRelationships.categoryId, categoryId)
          )
        )
    }
    if (needsRow.length) {
      const at = now()
      await tx.insert(categoryRelationships).values(
        needsRow.map((contentId) => ({
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
    if (needsPrimary.length) {
      await tx
        .update(categoryRelationships)
        .set({ isPrimary: true })
        .where(
          and(
            eq(categoryRelationships.workspaceId, workspaceId),
            eq(categoryRelationships.contentType, contentType),
            inArray(categoryRelationships.contentId, needsPrimary),
            eq(categoryRelationships.categoryId, categoryId)
          )
        )
    }
  })
  clearPublicDirectoryCache(workspaceId)
  return { done, same }
}
