import { and, asc, eq, inArray, sql } from "drizzle-orm"

import {
  cleanCustomFields,
  customKeyFromLabel,
  freeCustomKey,
  isCustomSectionLayout,
  CUSTOM_SECTION_NAME_MAX,
  MAX_CUSTOM_SECTIONS,
  type CustomField,
  type CustomSection,
  type CustomSectionLayout,
} from "@/lib/directory/custom-fields"
import { db, type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import { clearPublicDirectoryCache } from "@/server/directory/public-cache"
import {
  directoryCustomSections,
  directoryListings,
  type DirectoryCustomSectionRow,
} from "@/server/directory/schema"

/**
 * The sections of extra fields a site invented for its listings.
 *
 * Everything here is scoped to one site, the same way the rest of the
 * directory is: a section id from another site is simply not found. What a
 * field may be and what a value may hold is decided in
 * `lib/directory/custom-fields.ts`, which both this and the browser use, so
 * the two can never disagree about what was saved.
 */

function toSection(row: DirectoryCustomSectionRow): CustomSection {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    layout: isCustomSectionLayout(row.layout) ? row.layout : "stack",
    displayOrder: row.displayOrder,
    // Cleaned on the way out as well as in: a row edited straight in the
    // database still only describes fields this app knows how to draw.
    fields: cleanCustomFields(row.fields),
  }
}

function cleanName(raw: string): string {
  const name = raw.trim().slice(0, CUSTOM_SECTION_NAME_MAX)
  if (!name) throw new Error("A section needs a name.")
  return name
}

export async function listCustomSections(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CustomSection[]> {
  const rows = await database
    .select()
    .from(directoryCustomSections)
    .where(eq(directoryCustomSections.workspaceId, workspaceId))
    // The id breaks ties so the order is the same on every read — two sections
    // added in the same second must not swap places between page loads.
    .orderBy(
      asc(directoryCustomSections.displayOrder),
      asc(directoryCustomSections.id)
    )
  return rows.map(toSection)
}

/** A section plus how many listings have filled anything in under it. */
export type CustomSectionSummary = CustomSection & { listings: number }

/**
 * The admin screen's rows.
 *
 * One count per section rather than one clever query: a site is capped at
 * twelve sections, so this is at most twelve small counts, and the honest
 * shape is worth more here than saving eleven round trips on a screen nobody
 * opens in a loop.
 */
export async function listCustomSectionSummaries(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<CustomSectionSummary[]> {
  const sections = await listCustomSections(workspaceId, database)
  const counts = await Promise.all(
    sections.map((section) =>
      customSectionUsage(workspaceId, section.slug, database)
    )
  )
  return sections.map((section, index) => ({
    ...section,
    listings: counts[index] ?? 0,
  }))
}

async function takenSlugs(
  workspaceId: string,
  database: CustomShellDb
): Promise<string[]> {
  const rows = await database
    .select({ slug: directoryCustomSections.slug })
    .from(directoryCustomSections)
    .where(eq(directoryCustomSections.workspaceId, workspaceId))
  return rows.map((row) => row.slug)
}

export async function createCustomSection(
  workspaceId: string,
  input: { name: string; layout?: CustomSectionLayout },
  database: CustomShellDb = db
): Promise<CustomSection> {
  const name = cleanName(input.name)
  const existing = await takenSlugs(workspaceId, database)
  if (existing.length >= MAX_CUSTOM_SECTIONS) {
    throw new Error(
      `A site can have ${MAX_CUSTOM_SECTIONS} sections of extra fields. Delete one before adding another.`
    )
  }

  const slug = freeCustomKey(customKeyFromLabel(name) || "section", existing)
  const at = now()
  const [row] = await database
    .insert(directoryCustomSections)
    .values({
      id: uuid(),
      workspaceId,
      name,
      slug,
      layout: input.layout ?? "stack",
      fields: [],
      // New ones land at the bottom, which is where somebody adding one is
      // looking. Nothing renumbers, so the existing order does not move.
      displayOrder: existing.length,
      createdAt: at,
      updatedAt: at,
    })
    .returning()

  if (!row) throw new Error("The section was not created.")
  clearPublicDirectoryCache(workspaceId)
  return toSection(row)
}

export async function updateCustomSection(
  workspaceId: string,
  id: string,
  input: { name?: string; layout?: CustomSectionLayout; fields?: unknown },
  database: CustomShellDb = db
): Promise<CustomSection> {
  const values: Record<string, unknown> = { updatedAt: now() }
  if (input.name !== undefined) values.name = cleanName(input.name)
  if (input.layout !== undefined) values.layout = input.layout
  // The slug is deliberately never in here. It is the key every listing's
  // answers are stored under, so moving it would lose every one of them.
  if (input.fields !== undefined) values.fields = cleanCustomFields(input.fields)

  const [row] = await database
    .update(directoryCustomSections)
    .set(values)
    .where(
      and(
        eq(directoryCustomSections.id, id),
        eq(directoryCustomSections.workspaceId, workspaceId)
      )
    )
    .returning()

  if (!row) throw new Error("That section no longer exists.")
  clearPublicDirectoryCache(workspaceId)
  return toSection(row)
}

/**
 * The order the admin dragged them into. Ids from another site, and ids that
 * stopped existing, are ignored rather than failing the whole reorder — the
 * screen is asking for an arrangement, not making a claim about what exists.
 */
export async function reorderCustomSections(
  workspaceId: string,
  ids: string[],
  database: CustomShellDb = db
): Promise<void> {
  const wanted = [...new Set(ids)].slice(0, MAX_CUSTOM_SECTIONS)
  if (!wanted.length) return

  const existing = await database
    .select({ id: directoryCustomSections.id })
    .from(directoryCustomSections)
    .where(
      and(
        eq(directoryCustomSections.workspaceId, workspaceId),
        inArray(directoryCustomSections.id, wanted)
      )
    )
  const known = new Set(existing.map((row) => row.id))
  const order = wanted.filter((id) => known.has(id))
  if (!order.length) return

  const at = now()
  // All of them or none: half an order applied is an arrangement nobody
  // asked for, and the screen would show it as if it were the saved one.
  await database.transaction(async (tx) => {
    for (const [index, id] of order.entries()) {
      await tx
        .update(directoryCustomSections)
        .set({ displayOrder: index, updatedAt: at })
        .where(
          and(
            eq(directoryCustomSections.id, id),
            eq(directoryCustomSections.workspaceId, workspaceId)
          )
        )
    }
  })
  clearPublicDirectoryCache(workspaceId)
}

/** How many listings have filled anything in under this section. */
export async function customSectionUsage(
  workspaceId: string,
  slug: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        // Blank answers are never stored, so the key being there *is* the
        // question — see `cleanCustomValues`.
        sql`jsonb_exists(${directoryListings.customValues}, ${slug})`
      )
    )
  return row?.count ?? 0
}

/** How many listings have filled in one particular field. */
export async function customFieldUsage(
  workspaceId: string,
  slug: string,
  key: string,
  database: CustomShellDb = db
): Promise<number> {
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, workspaceId),
        sql`jsonb_exists(${directoryListings.customValues} -> ${slug}, ${key})`
      )
    )
  return row?.count ?? 0
}

/**
 * What removing these fields from a section would throw away, counted before
 * anything happens so the confirmation can say a real number.
 */
export async function customFieldsRemovalImpact(
  workspaceId: string,
  id: string,
  nextFields: CustomField[],
  database: CustomShellDb = db
): Promise<{ removed: { label: string; listings: number }[] }> {
  const section = await findCustomSection(workspaceId, id, database)
  if (!section) return { removed: [] }

  const keeping = new Set(nextFields.map((field) => field.key))
  const going = section.fields.filter((field) => !keeping.has(field.key))
  if (!going.length) return { removed: [] }

  const counts = await Promise.all(
    going.map((field) =>
      customFieldUsage(workspaceId, section.slug, field.key, database)
    )
  )
  return {
    removed: going
      .map((field, index) => ({
        label: field.label,
        listings: counts[index] ?? 0,
      }))
      .filter((entry) => entry.listings > 0),
  }
}

export async function findCustomSection(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<CustomSection | null> {
  const [row] = await database
    .select()
    .from(directoryCustomSections)
    .where(
      and(
        eq(directoryCustomSections.id, id),
        eq(directoryCustomSections.workspaceId, workspaceId)
      )
    )
    .limit(1)
  return row ? toSection(row) : null
}

/**
 * Deletes the section and the answers underneath it, together.
 *
 * The answers live in each listing's own column, so nothing tidies up after a
 * deleted section on its own. Leaving them would be worse than untidy: a new
 * section that happened to be given the same slug would inherit a stranger's
 * answers.
 */
export async function deleteCustomSection(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<{ name: string }> {
  const section = await findCustomSection(workspaceId, id, database)
  if (!section) throw new Error("That section no longer exists.")

  await database.transaction(async (tx) => {
    await tx
      .delete(directoryCustomSections)
      .where(
        and(
          eq(directoryCustomSections.id, id),
          eq(directoryCustomSections.workspaceId, workspaceId)
        )
      )
    await tx
      .update(directoryListings)
      .set({
        customValues: sql`${directoryListings.customValues} - ${section.slug}`,
      })
      .where(
        and(
          eq(directoryListings.workspaceId, workspaceId),
          sql`jsonb_exists(${directoryListings.customValues}, ${section.slug})`
        )
      )
  })

  clearPublicDirectoryCache(workspaceId)
  return { name: section.name }
}
