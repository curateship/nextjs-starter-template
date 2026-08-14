import { and, asc, eq, inArray, ne, sql } from "drizzle-orm"

import { slugFromTitle, slugProblem } from "@/lib/directory/slugs"
import {
  firstFreeSlug as firstFreeSlugRule,
  requireFreeSlug as requireFreeSlugRule,
} from "@/server/directory/slug-rules"
import { db, type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import {
  categories,
  categoryRelationships,
  LISTING_CONTENT_TYPE,
  type CategoryRow,
} from "@/server/directory/schema"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"

/**
 * The category tree listings are browsed by. One flat table with a parent
 * pointer; the admin screen draws it as a tree. The refusals are sentences on
 * purpose — they are about things an admin typed, and the form shows them
 * straight back.
 */

export const MAX_CATEGORY_NAME = 120

export type Category = {
  id: string
  name: string
  slug: string
  description: string
  metaDescription: string
  featuredImage: string
  parentId: string | null
  displayOrder: number
  /** How many listings sit in this category (its own, not its children's). */
  listingCount: number
  createdAt: Date
  updatedAt: Date
}

function toCategory(row: CategoryRow, listingCount: number): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    metaDescription: row.metaDescription,
    featuredImage: row.featuredImage,
    parentId: row.parentId ?? null,
    displayOrder: row.displayOrder,
    listingCount,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function slugIsTaken(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
): Promise<boolean> {
  const [row] = await database
    .select({ id: categories.id })
    .from(categories)
    // Taken **on this site**. Another site using the address is not a clash.
    .where(
      and(
        eq(categories.workspaceId, workspaceId),
        eq(categories.slug, slug),
        exceptId ? ne(categories.id, exceptId) : undefined
      )
    )
    .limit(1)
  return Boolean(row)
}

const CATEGORY_NOUN = { one: "category", many: "categories" }

/** The address a new category gets, numbered past any clash. */
function firstFreeSlug(
  workspaceId: string,
  wanted: string,
  database: CustomShellDb
) {
  return firstFreeSlugRule(
    wanted,
    (candidate) => slugIsTaken(workspaceId, candidate, null, database),
    CATEGORY_NOUN
  )
}

/** Refuses a hand-picked address that is taken, rather than renaming it. */
function requireFreeSlug(
  workspaceId: string,
  slug: string,
  exceptId: string | null,
  database: CustomShellDb
) {
  return requireFreeSlugRule(
    slug,
    (candidate) => slugIsTaken(workspaceId, candidate, exceptId, database),
    CATEGORY_NOUN
  )
}

function cleanName(raw: string): string {
  const name = raw.trim().slice(0, MAX_CATEGORY_NAME)
  if (!name) throw new Error("A category needs a name.")
  return name
}

/** Every category, parents before children within a name sort, with counts. */
export async function listCategories(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<Category[]> {
  const [rows, counts] = await Promise.all([
    database
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, workspaceId))
      .orderBy(asc(categories.displayOrder), asc(categories.name)),
    database
      .select({
        categoryId: categoryRelationships.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(categoryRelationships)
      .where(
        and(
          eq(categoryRelationships.workspaceId, workspaceId),
          eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE)
        )
      )
      .groupBy(categoryRelationships.categoryId),
  ])

  const countFor = new Map(counts.map((row) => [row.categoryId, row.count]))
  return rows.map((row) => toCategory(row, countFor.get(row.id) ?? 0))
}

async function requireCategory(
  workspaceId: string,
  id: string,
  database: CustomShellDb
): Promise<CategoryRow> {
  const [row] = await database
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new Error("That category no longer exists.")
  return row
}

/**
 * Whether `candidateId` sits anywhere under `id` in the tree — the check that
 * keeps "move this category" from hanging a branch on its own tail, after
 * which neither would ever be drawn again.
 */
async function isDescendant(
  workspaceId: string,
  id: string,
  candidateId: string,
  database: CustomShellDb
): Promise<boolean> {
  let frontier = [id]
  // The tree is small; walking it a level at a time beats a recursive CTE the
  // rest of this file has no other use for.
  for (let depth = 0; depth < 20 && frontier.length; depth += 1) {
    const children = await database
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, workspaceId),
          inArray(categories.parentId, frontier)
        )
      )
    const ids = children.map((row) => row.id)
    if (ids.includes(candidateId)) return true
    frontier = ids
  }
  return false
}

async function requireUsableParent(
  workspaceId: string,
  parentId: string | null,
  childId: string | null,
  database: CustomShellDb
): Promise<string | null> {
  if (!parentId) return null
  if (childId && parentId === childId) {
    throw new Error("A category cannot sit under itself.")
  }
  await requireCategory(workspaceId, parentId, database)
  if (
    childId &&
    (await isDescendant(workspaceId, childId, parentId, database))
  ) {
    throw new Error("A category cannot sit under one of its own subcategories.")
  }
  return parentId
}

export async function createCategory(
  workspaceId: string,
  input: {
    name: string
    slug?: string
    description?: string
    metaDescription?: string
    featuredImage?: string
    parentId?: string | null
  },
  database: CustomShellDb = db
): Promise<Category> {
  const name = cleanName(input.name)
  const parentId = await requireUsableParent(
    workspaceId,
    input.parentId ?? null,
    null,
    database
  )

  const chosen = input.slug?.trim()
  const wanted = chosen || slugFromTitle(name)
  const problem = slugProblem(wanted)
  if (problem) throw new Error(problem)

  let slug: string
  if (chosen) {
    // Hand-picked, so a clash is refused out loud rather than quietly renamed.
    await requireFreeSlug(workspaceId, wanted, null, database)
    slug = wanted
  } else {
    slug = await firstFreeSlug(workspaceId, wanted, database)
  }

  const at = now()
  const [row] = await database
    .insert(categories)
    .values({
      id: uuid(),
      workspaceId,
      name,
      slug,
      description: input.description?.trim().slice(0, 500) ?? "",
      metaDescription: input.metaDescription?.trim().slice(0, 300) ?? "",
      featuredImage: input.featuredImage?.trim().slice(0, 600) ?? "",
      parentId,
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The category was not created.")
  clearPublicDirectoryCache(workspaceId)
  return toCategory(row, 0)
}

export async function updateCategory(
  workspaceId: string,
  id: string,
  input: {
    name?: string
    slug?: string
    description?: string
    metaDescription?: string
    featuredImage?: string
    parentId?: string | null
  },
  database: CustomShellDb = db
): Promise<Category> {
  const values: Record<string, unknown> = { updatedAt: now() }

  if (input.name !== undefined) values.name = cleanName(input.name)
  if (input.slug !== undefined) {
    const slug = input.slug.trim()
    await requireFreeSlug(workspaceId, slug, id, database)
    values.slug = slug
  }
  if (input.description !== undefined) {
    values.description = input.description.trim().slice(0, 500)
  }
  if (input.metaDescription !== undefined) {
    values.metaDescription = input.metaDescription.trim().slice(0, 300)
  }
  if (input.featuredImage !== undefined) {
    values.featuredImage = input.featuredImage.trim().slice(0, 600)
  }
  if (input.parentId !== undefined) {
    values.parentId = await requireUsableParent(
      workspaceId,
      input.parentId,
      id,
      database
    )
  }

  const [row] = await database
    .update(categories)
    .set(values)
    .where(and(eq(categories.id, id), eq(categories.workspaceId, workspaceId)))
    .returning()

  if (!row) throw new Error("That category no longer exists.")

  const [countRow] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(categoryRelationships)
    .where(
      and(
        eq(categoryRelationships.workspaceId, workspaceId),
        eq(categoryRelationships.categoryId, id),
        eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE)
      )
    )
  clearPublicDirectoryCache(workspaceId)
  return toCategory(row, countRow?.count ?? 0)
}

/**
 * What deleting this category takes with it, for the confirmation to say:
 * how many subcategories move up a level, and how many listings lose the tag.
 */
export async function categoryDeleteImpact(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ children: number; listings: number }> {
  const [[childRow], [listingRow]] = await Promise.all([
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, workspaceId),
          eq(categories.parentId, id)
        )
      ),
    database
      .select({ count: sql<number>`count(*)::int` })
      .from(categoryRelationships)
      .where(
        and(
          eq(categoryRelationships.workspaceId, workspaceId),
          eq(categoryRelationships.categoryId, id),
          eq(categoryRelationships.contentType, LISTING_CONTENT_TYPE)
        )
      ),
  ])
  return { children: childRow?.count ?? 0, listings: listingRow?.count ?? 0 }
}

/**
 * Deletes the category. Its subcategories are re-hung on its own parent — a
 * branch is never orphaned — and its listing links go with it (the database
 * cascades them). The listings themselves are untouched.
 */
export async function deleteCategory(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ name: string }> {
  const row = await requireCategory(workspaceId, id, database)

  await database.transaction(async (tx) => {
    await tx
      .update(categories)
      .set({ parentId: row.parentId ?? null, updatedAt: now() })
      .where(
        and(
          eq(categories.workspaceId, workspaceId),
          eq(categories.parentId, id)
        )
      )
    await tx
      .delete(categories)
      .where(
        and(eq(categories.id, id), eq(categories.workspaceId, workspaceId))
      )
  })

  clearPublicDirectoryCache(workspaceId)
  return { name: row.name }
}
