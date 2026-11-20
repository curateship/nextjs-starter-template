import { and, asc, eq, inArray, sql } from "drizzle-orm"

import {
  cleanCustomFields,
  customKeyFromLabel,
  freeCustomKey,
  isCustomSectionKind,
  isCustomSectionLayout,
  CUSTOM_SECTION_NAME_MAX,
  MAX_CUSTOM_SECTIONS,
  type CustomField,
  type CustomSection,
  type CustomSectionKind,
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
import { siteEvents } from "@/server/events/schema"

/**
 * The sections of extra fields a site invented for its listings and, as a
 * list of their own, for its events (task events/07).
 *
 * Everything here is scoped to one site, the same way the rest of the
 * directory is: a section id from another site is simply not found. What a
 * field may be and what a value may hold is decided in
 * `lib/directory/custom-fields.ts`, which both this and the browser use, so
 * the two can never disagree about what was saved.
 *
 * The functions that list or make sections take the kind, and default to
 * listings, so every listing page that was here before the events kind asks
 * for exactly what it always did. The ones that take a section's id read the
 * kind off that section's own row.
 */

function toSection(row: DirectoryCustomSectionRow): CustomSection {
  const kind = isCustomSectionKind(row.kind) ? row.kind : "listing"
  return {
    id: row.id,
    kind,
    name: row.name,
    slug: row.slug,
    layout: isCustomSectionLayout(row.layout) ? row.layout : "stack",
    displayOrder: row.displayOrder,
    // Cleaned on the way out as well as in: a row edited straight in the
    // database still only describes fields this app knows how to draw.
    fields: cleanCustomFields(row.fields, { filterable: kind === "listing" }),
  }
}

/** The answers column a kind's values are kept in, and the rows it is on. */
function answersOf(kind: CustomSectionKind) {
  return kind === "event"
    ? { table: siteEvents, values: siteEvents.customValues, site: siteEvents.workspaceId }
    : {
        table: directoryListings,
        values: directoryListings.customValues,
        site: directoryListings.workspaceId,
      }
}

function sameKind(workspaceId: string, kind: CustomSectionKind) {
  return and(
    eq(directoryCustomSections.workspaceId, workspaceId),
    eq(directoryCustomSections.kind, kind)
  )
}

function cleanName(raw: string): string {
  const name = raw.trim().slice(0, CUSTOM_SECTION_NAME_MAX)
  if (!name) throw new Error("A section needs a name.")
  return name
}

export async function listCustomSections(
  workspaceId: string,
  database: CustomShellDb = db,
  kind: CustomSectionKind = "listing"
): Promise<CustomSection[]> {
  const rows = await database
    .select()
    .from(directoryCustomSections)
    .where(sameKind(workspaceId, kind))
    // The id breaks ties so the order is the same on every read — two sections
    // added in the same second must not swap places between page loads.
    .orderBy(
      asc(directoryCustomSections.displayOrder),
      asc(directoryCustomSections.id)
    )
  return rows.map(toSection)
}

/**
 * A section plus how many listings, or events for an event section, have
 * filled anything in under it.
 */
export type CustomSectionSummary = CustomSection & { used: number }

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
  database: CustomShellDb = db,
  kind: CustomSectionKind = "listing"
): Promise<CustomSectionSummary[]> {
  const sections = await listCustomSections(workspaceId, database, kind)
  const counts = await Promise.all(
    sections.map((section) =>
      customSectionUsage(workspaceId, section.slug, database, kind)
    )
  )
  return sections.map((section, index) => ({
    ...section,
    used: counts[index] ?? 0,
  }))
}

/**
 * Every slug on the site, both kinds: the unique index is on the site and the
 * slug, so an event section can't take a listing section's slug either.
 */
async function takenSlugs(
  workspaceId: string,
  database: CustomShellDb
): Promise<{ slug: string; kind: string }[]> {
  return database
    .select({
      slug: directoryCustomSections.slug,
      kind: directoryCustomSections.kind,
    })
    .from(directoryCustomSections)
    .where(eq(directoryCustomSections.workspaceId, workspaceId))
}

export async function createCustomSection(
  workspaceId: string,
  input: {
    name: string
    layout?: CustomSectionLayout
    kind?: CustomSectionKind
  },
  database: CustomShellDb = db
): Promise<CustomSection> {
  const name = cleanName(input.name)
  const kind = input.kind ?? "listing"
  const taken = await takenSlugs(workspaceId, database)
  // The limit is per kind: a site's twelve listing sections leave its events
  // their own twelve.
  const existing = taken.filter((row) => row.kind === kind)
  if (existing.length >= MAX_CUSTOM_SECTIONS) {
    throw new Error(
      `A site can have ${MAX_CUSTOM_SECTIONS} sections of extra fields. Delete one before adding another.`
    )
  }

  const slug = freeCustomKey(
    customKeyFromLabel(name) || "section",
    taken.map((row) => row.slug)
  )
  const at = now()
  const [row] = await database
    .insert(directoryCustomSections)
    .values({
      id: uuid(),
      workspaceId,
      kind,
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
  if (input.fields !== undefined) {
    const current = await findCustomSection(workspaceId, id, database)
    if (!current) throw new Error("That section no longer exists.")
    values.fields = cleanCustomFields(input.fields, {
      filterable: current.kind === "listing",
    })
  }

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

/** How many listings, or events, have filled anything in under this section. */
export async function customSectionUsage(
  workspaceId: string,
  slug: string,
  database: CustomShellDb = db,
  kind: CustomSectionKind = "listing"
): Promise<number> {
  const answers = answersOf(kind)
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(answers.table)
    .where(
      and(
        eq(answers.site, workspaceId),
        // Blank answers are never stored, so the key being there *is* the
        // question — see `cleanCustomValues`.
        sql`jsonb_exists(${answers.values}, ${slug})`
      )
    )
  return row?.count ?? 0
}

/** How many listings, or events, have filled in one particular field. */
export async function customFieldUsage(
  workspaceId: string,
  slug: string,
  key: string,
  database: CustomShellDb = db,
  kind: CustomSectionKind = "listing"
): Promise<number> {
  const answers = answersOf(kind)
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(answers.table)
    .where(
      and(
        eq(answers.site, workspaceId),
        sql`jsonb_exists(${answers.values} -> ${slug}, ${key})`
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
): Promise<{ removed: { label: string; used: number }[] }> {
  const section = await findCustomSection(workspaceId, id, database)
  if (!section) return { removed: [] }

  const keeping = new Set(nextFields.map((field) => field.key))
  const going = section.fields.filter((field) => !keeping.has(field.key))
  if (!going.length) return { removed: [] }

  const counts = await Promise.all(
    going.map((field) =>
      customFieldUsage(
        workspaceId,
        section.slug,
        field.key,
        database,
        section.kind
      )
    )
  )
  return {
    removed: going
      .map((field, index) => ({
        label: field.label,
        used: counts[index] ?? 0,
      }))
      .filter((entry) => entry.used > 0),
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
 * The answers live in each listing's or event's own column, so nothing tidies up after a
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

  const answers = answersOf(section.kind)
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
      .update(answers.table)
      .set({ customValues: sql`${answers.values} - ${section.slug}` })
      .where(
        and(
          eq(answers.site, workspaceId),
          sql`jsonb_exists(${answers.values}, ${section.slug})`
        )
      )
  })

  clearPublicDirectoryCache(workspaceId)
  return { name: section.name }
}
