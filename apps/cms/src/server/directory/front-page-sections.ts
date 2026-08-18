import { and, asc, eq, inArray } from "drizzle-orm"

import {
  cleanPickedCategoryIds,
  isDirectoryCategorySource,
  type DirectoryCategorySource,
} from "@/lib/directory/category-cards"
import { checkedPickedCategoryIds } from "@/server/directory/category-cards"
import {
  DIRECTORY_FRONT_PAGE_COUNT_DEFAULT,
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  DIRECTORY_FRONT_PAGE_COUNT_MESSAGE,
  DIRECTORY_FRONT_PAGE_COUNT_MIN,
  DIRECTORY_FRONT_PAGE_FULL_MESSAGE,
  DIRECTORY_FRONT_PAGE_HEADING_MAX,
  DIRECTORY_FRONT_PAGE_HEADING_MESSAGE,
  DIRECTORY_FRONT_PAGE_INTRO_MAX,
  isDirectoryFrontPageKind,
  isDirectoryFrontPageLayout,
  isDirectoryFrontPageSort,
  MAX_DIRECTORY_FRONT_PAGE_SECTIONS,
  type DirectoryFrontPageKind,
  type DirectoryFrontPageLayout,
  type DirectoryFrontPageSection,
  type DirectoryFrontPageSort,
} from "@/lib/directory/front-page"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  categories,
  directoryFrontPageSections,
  type DirectoryFrontPageSectionRow,
} from "@/server/directory/schema"

/**
 * The rows of listings a site puts on its home page.
 *
 * Everything here is scoped to one site, the same way the rest of the
 * directory is: a row id from another site is simply not found. What a row may
 * hold is decided in `lib/directory/front-page.ts`, which the admin form reads
 * too, so the two can never disagree about what is allowed.
 */

type SectionRowWithCategory = DirectoryFrontPageSectionRow & {
  categorySlug: string | null
  categoryName: string | null
}

function toSection(row: SectionRowWithCategory): DirectoryFrontPageSection {
  return {
    id: row.id,
    displayOrder: row.displayOrder,
    heading: row.heading,
    intro: row.intro,
    kind: isDirectoryFrontPageKind(row.kind) ? row.kind : "listings",
    categorySource: isDirectoryCategorySource(row.categorySource)
      ? row.categorySource
      : "top-level",
    pickedCategoryIds: cleanPickedCategoryIds(row.pickedCategoryIds),
    categoryId: row.categoryId ?? null,
    categorySlug: row.categorySlug,
    categoryName: row.categoryName,
    // Read through the same checks as a save. A row edited straight in the
    // database still only describes something this app knows how to draw.
    sort: isDirectoryFrontPageSort(row.sort) ? row.sort : "newest",
    listingCount: clampCount(row.listingCount),
    layout: isDirectoryFrontPageLayout(row.layout) ? row.layout : "grid",
  }
}

function clampCount(value: number): number {
  if (!Number.isInteger(value)) return DIRECTORY_FRONT_PAGE_COUNT_MIN
  return Math.min(
    DIRECTORY_FRONT_PAGE_COUNT_MAX,
    Math.max(DIRECTORY_FRONT_PAGE_COUNT_MIN, value)
  )
}

function cleanHeading(raw: string): string {
  const heading = raw.trim().slice(0, DIRECTORY_FRONT_PAGE_HEADING_MAX)
  if (!heading) throw new Error(DIRECTORY_FRONT_PAGE_HEADING_MESSAGE)
  return heading
}

function checkedCount(value: number): number {
  if (
    !Number.isInteger(value) ||
    value < DIRECTORY_FRONT_PAGE_COUNT_MIN ||
    value > DIRECTORY_FRONT_PAGE_COUNT_MAX
  ) {
    throw new Error(DIRECTORY_FRONT_PAGE_COUNT_MESSAGE)
  }
  return value
}

/**
 * The category a row filters to, checked against this site's own tree.
 *
 * A category id from another site is refused rather than silently ignored: an
 * admin who somehow sent one is asking for something that cannot be drawn, and
 * quietly turning it into "every category" would show them a row of the wrong
 * listings and no reason why.
 */
async function checkedCategoryId(
  workspaceId: string,
  categoryId: string | null | undefined,
  database: CustomShellDb
): Promise<string | null> {
  if (!categoryId) return null
  const [row] = await database
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.id, categoryId), eq(categories.workspaceId, workspaceId))
    )
    .limit(1)
  if (!row) throw new Error("That category is not on this site.")
  return row.id
}

/**
 * The chosen categories to store for this row.
 *
 * A row that is not a hand-picked row of categories stores an empty list, so
 * there is never a stale set of ids sitting behind a row that stopped using
 * them. The checking itself belongs to `category-cards.ts`, which the browse
 * page's own row reads through too.
 */
async function pickedCategoryIdsFor(
  workspaceId: string,
  kind: DirectoryFrontPageKind,
  source: DirectoryCategorySource,
  ids: string[] | undefined,
  database: CustomShellDb
): Promise<string[]> {
  if (kind !== "categories" || source !== "picked") return []
  return checkedPickedCategoryIds(workspaceId, ids, database)
}

export async function listFrontPageSections(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<DirectoryFrontPageSection[]> {
  const rows = await database
    .select({
      section: directoryFrontPageSections,
      categorySlug: categories.slug,
      categoryName: categories.name,
    })
    .from(directoryFrontPageSections)
    .leftJoin(categories, eq(categories.id, directoryFrontPageSections.categoryId))
    .where(eq(directoryFrontPageSections.workspaceId, workspaceId))
    // The id breaks ties so the order is the same on every read — two rows
    // added in the same second must not swap places between page loads.
    .orderBy(
      asc(directoryFrontPageSections.displayOrder),
      asc(directoryFrontPageSections.id)
    )
  return rows.map((row) =>
    toSection({
      ...row.section,
      categorySlug: row.categorySlug ?? null,
      categoryName: row.categoryName ?? null,
    })
  )
}

async function findSection(
  workspaceId: string,
  id: string,
  database: CustomShellDb
): Promise<DirectoryFrontPageSection | null> {
  const sections = await listFrontPageSections(workspaceId, database)
  return sections.find((section) => section.id === id) ?? null
}

type FrontPageSectionInput = {
  heading: string
  intro?: string
  kind?: DirectoryFrontPageKind
  categorySource?: DirectoryCategorySource
  pickedCategoryIds?: string[]
  categoryId?: string | null
  sort?: DirectoryFrontPageSort
  listingCount?: number
  layout?: DirectoryFrontPageLayout
}

export async function createFrontPageSection(
  workspaceId: string,
  input: FrontPageSectionInput,
  database: CustomShellDb = db
): Promise<DirectoryFrontPageSection> {
  const heading = cleanHeading(input.heading)
  const existing = await database
    .select({ id: directoryFrontPageSections.id })
    .from(directoryFrontPageSections)
    .where(eq(directoryFrontPageSections.workspaceId, workspaceId))

  // Refused before anything is written, so the seventh row never exists even
  // for the moment it would take to notice and delete it again.
  if (existing.length >= MAX_DIRECTORY_FRONT_PAGE_SECTIONS) {
    throw new Error(DIRECTORY_FRONT_PAGE_FULL_MESSAGE)
  }

  const categoryId = await checkedCategoryId(
    workspaceId,
    input.categoryId,
    database
  )
  const at = now()
  const [row] = await database
    .insert(directoryFrontPageSections)
    .values({
      id: uuid(),
      workspaceId,
      // New rows land at the bottom, which is where somebody adding one is
      // looking. Nothing renumbers, so the existing order does not move.
      displayOrder: existing.length,
      heading,
      intro: (input.intro ?? "").trim().slice(0, DIRECTORY_FRONT_PAGE_INTRO_MAX),
      kind: input.kind ?? "listings",
      categorySource: input.categorySource ?? "top-level",
      pickedCategoryIds: await pickedCategoryIdsFor(
        workspaceId,
        input.kind ?? "listings",
        input.categorySource ?? "top-level",
        input.pickedCategoryIds,
        database
      ),
      categoryId,
      sort: input.sort ?? "newest",
      listingCount: checkedCount(
        input.listingCount ?? DIRECTORY_FRONT_PAGE_COUNT_DEFAULT
      ),
      layout: input.layout ?? "grid",
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The row was not created.")
  clearPublicDirectoryCache(workspaceId)
  const saved = await findSection(workspaceId, row.id, database)
  if (!saved) throw new Error("The row was not created.")
  return saved
}

export async function updateFrontPageSection(
  workspaceId: string,
  id: string,
  input: Partial<FrontPageSectionInput>,
  database: CustomShellDb = db
): Promise<DirectoryFrontPageSection> {
  // Read first, because the kind, the source and the chosen categories only
  // mean anything together: what a save does not mention is taken from the row
  // rather than guessed at. Guessing let a save that named only one of the three
  // leave the row in a state the checks would have refused — a hand-picked row
  // of categories with nothing picked, which draws nothing and quietly
  // disappears off the home page.
  const current = await findSection(workspaceId, id, database)
  if (!current) throw new Error("That row no longer exists.")

  const values: Record<string, unknown> = { updatedAt: now() }
  if (input.heading !== undefined) values.heading = cleanHeading(input.heading)
  if (input.intro !== undefined) {
    values.intro = input.intro.trim().slice(0, DIRECTORY_FRONT_PAGE_INTRO_MAX)
  }
  if (input.categoryId !== undefined) {
    values.categoryId = await checkedCategoryId(
      workspaceId,
      input.categoryId,
      database
    )
  }

  const kind = input.kind ?? current.kind
  const categorySource = input.categorySource ?? current.categorySource
  if (input.kind !== undefined) values.kind = kind
  if (input.categorySource !== undefined) values.categorySource = categorySource
  // Re-checked whenever any one of the three moves, because changing the kind or
  // the source changes what the list is allowed to be — a row leaving the
  // hand-picked case has its list cleared rather than left behind it.
  if (
    input.kind !== undefined ||
    input.categorySource !== undefined ||
    input.pickedCategoryIds !== undefined
  ) {
    values.pickedCategoryIds = await pickedCategoryIdsFor(
      workspaceId,
      kind,
      categorySource,
      input.pickedCategoryIds ?? current.pickedCategoryIds,
      database
    )
  }
  if (input.sort !== undefined) values.sort = input.sort
  if (input.listingCount !== undefined) {
    values.listingCount = checkedCount(input.listingCount)
  }
  if (input.layout !== undefined) values.layout = input.layout

  const [row] = await database
    .update(directoryFrontPageSections)
    .set(values)
    .where(
      and(
        eq(directoryFrontPageSections.id, id),
        eq(directoryFrontPageSections.workspaceId, workspaceId)
      )
    )
    .returning()

  if (!row) throw new Error("That row no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  const saved = await findSection(workspaceId, row.id, database)
  if (!saved) throw new Error("That row no longer exists.")
  return saved
}

/**
 * The order the admin arranged them into. Ids from another site, and ids that
 * stopped existing, are ignored rather than failing the whole reorder — the
 * screen is asking for an arrangement, not making a claim about what exists.
 */
export async function reorderFrontPageSections(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<void> {
  const wanted = [...new Set(ids)].slice(0, MAX_DIRECTORY_FRONT_PAGE_SECTIONS)
  if (!wanted.length) return

  const existing = await database
    .select({ id: directoryFrontPageSections.id })
    .from(directoryFrontPageSections)
    .where(
      and(
        eq(directoryFrontPageSections.workspaceId, workspaceId),
        inArray(directoryFrontPageSections.id, wanted)
      )
    )
  const known = new Set(existing.map((row) => row.id))
  const order = wanted.filter((id) => known.has(id))
  if (!order.length) return

  const at = now()
  // All of them or none: half an order applied is an arrangement nobody asked
  // for, and the screen would show it as if it were the saved one.
  await database.transaction(async (tx) => {
    for (const [index, id] of order.entries()) {
      await tx
        .update(directoryFrontPageSections)
        .set({ displayOrder: index, updatedAt: at })
        .where(
          and(
            eq(directoryFrontPageSections.id, id),
            eq(directoryFrontPageSections.workspaceId, workspaceId)
          )
        )
    }
  })
  clearPublicDirectoryCache(workspaceId)
}

export async function deleteFrontPageSection(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ heading: string }> {
  const [row] = await database
    .delete(directoryFrontPageSections)
    .where(
      and(
        eq(directoryFrontPageSections.id, id),
        eq(directoryFrontPageSections.workspaceId, workspaceId)
      )
    )
    .returning({ heading: directoryFrontPageSections.heading })

  if (!row) throw new Error("That row no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  return { heading: row.heading }
}
