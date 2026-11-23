import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm"

import {
  cleanPickedCategoryIds,
  DIRECTORY_CATEGORY_PICK_MESSAGE,
  isDirectoryCategorySource,
  MAX_DIRECTORY_CATEGORY_CARDS,
  type DirectoryCategoryCard,
  type DirectoryCategoryChoice,
  type DirectoryCategorySource,
} from "@/lib/directory/category-cards"
import { db, type CustomShellDb } from "@/server/db"
import {
  categories,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"

/**
 * The categories a row of cards shows, with a real count on each.
 *
 * **Two queries, however many rows ask.** One for the categories every asking
 * row could possibly want, and one recursive one for all their counts — never
 * one per card, and never one per row. A home page with three rows of twelve
 * would otherwise be thirty-nine round trips on the site's busiest page.
 *
 * **A category with nothing published under it is left out**, rather than drawn
 * with a zero on it. A card is an invitation, and an invitation to an empty
 * shelf is worse than one card fewer. It is also why a row whose categories are
 * all empty comes back empty, and its caller drops the row rather than drawing a
 * heading over nothing.
 */
export async function readCategoryCardsForChoices(
  siteId: string,
  choices: DirectoryCategoryChoice[],
  database: CustomShellDb = db
): Promise<DirectoryCategoryCard[][]> {
  if (choices.length === 0) return []

  const cleaned = choices.map((choice) => ({
    source: choice.source,
    picked: cleanPickedCategoryIds(choice.pickedCategoryIds),
    limit: Math.max(
      1,
      Math.min(MAX_DIRECTORY_CATEGORY_CARDS, Math.trunc(choice.limit))
    ),
  }))

  const wantsTopLevel = cleaned.some((choice) => choice.source === "top-level")
  const pickedUnion = [
    ...new Set(
      cleaned.flatMap((choice) =>
        choice.source === "picked" ? choice.picked : []
      )
    ),
  ]

  // Nothing any row could draw: a hand-picked row with an empty list, and no
  // row asking for the top level.
  if (!wantsTopLevel && pickedUnion.length === 0) {
    return cleaned.map(() => [])
  }

  const wanted = wantsTopLevel
    ? pickedUnion.length
      ? or(isNull(categories.parentId), inArray(categories.id, pickedUnion))
      : isNull(categories.parentId)
    : inArray(categories.id, pickedUnion)

  const rows = await database
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      featuredImage: categories.featuredImage,
      parentId: categories.parentId,
    })
    .from(categories)
    // Always scoped to the site, the hand-picked case included: an id from
    // another site's tree is not found rather than read.
    .where(and(eq(categories.workspaceId, siteId), wanted))
    .orderBy(asc(categories.displayOrder), asc(categories.name))

  const counts = await publishedSubtreeCounts(
    siteId,
    rows.map((row) => row.id),
    database
  )

  const cards = rows.map((row) => ({
    card: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      featuredImage: row.featuredImage,
      listingCount: counts.get(row.id) ?? 0,
    },
    topLevel: row.parentId === null,
  }))
  const byId = new Map(cards.map((entry) => [entry.card.id, entry.card]))

  return cleaned.map((choice) => {
    const chosen =
      choice.source === "picked"
        ? // The order the admin put them in, which the query knows nothing
          // about. An id whose category has since been deleted, or belongs to
          // another site, simply is not there.
          choice.picked.flatMap((id) => {
            const card = byId.get(id)
            return card ? [card] : []
          })
        : cards.filter((entry) => entry.topLevel).map((entry) => entry.card)

    // Emptied first, then capped, so the limit counts cards a visitor can use
    // rather than places that happen to exist.
    return chosen.filter((card) => card.listingCount > 0).slice(0, choice.limit)
  })
}

/** One row's cards. The batch above is the implementation; this is one caller. */
export async function readDirectoryCategoryCards(
  siteId: string,
  choice: DirectoryCategoryChoice,
  database: CustomShellDb = db
): Promise<DirectoryCategoryCard[]> {
  const [cards] = await readCategoryCardsForChoices(siteId, [choice], database)
  return cards ?? []
}

/**
 * The hand-picked categories a row shows, checked against this site's own tree.
 *
 * One rule, in one place, because two rows ask it: a home page row of cards and
 * the browse page's. Every id has to name a category on this site — a row
 * pointing at somebody else's tree cannot be drawn, and quietly dropping the
 * ones that do not belong would leave an admin with a shorter row and no reason
 * why. An empty list is refused for the same reason: a hand-picked row with
 * nothing picked draws nothing and vanishes without a word.
 *
 * *Whether* a row uses a hand-picked list at all is the caller's question, and
 * it is a different question in each place — so that stays with them.
 */
export async function checkedPickedCategoryIds(
  workspaceId: string,
  wanted: unknown,
  database: CustomShellDb = db
): Promise<string[]> {
  const ids = cleanPickedCategoryIds(wanted)
  if (!ids.length) throw new Error(DIRECTORY_CATEGORY_PICK_MESSAGE)

  const found = await database
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(eq(categories.workspaceId, workspaceId), inArray(categories.id, ids))
    )
  // The list is already deduped, so a short answer means at least one id names
  // nothing on this site.
  if (found.length !== ids.length) {
    throw new Error("That category is not on this site.")
  }
  return ids
}

/** A saved choice, read through the same checks a save applies. */
export function resolvedCategoryChoice(
  row: { source: string | null; pickedCategoryIds: unknown },
  limit: number
): DirectoryCategoryChoice {
  const source: DirectoryCategorySource = isDirectoryCategorySource(row.source)
    ? row.source
    : "top-level"
  return {
    source,
    pickedCategoryIds: cleanPickedCategoryIds(row.pickedCategoryIds),
    limit,
  }
}

/**
 * Published listings under each of these categories, including everything
 * nested beneath them.
 *
 * One recursive query covers the whole set, however many categories are asked
 * about, and DISTINCT keeps a listing assigned at two levels from being counted
 * twice. Asked about a list of categories rather than "the children of X"
 * because three places want it now: a category page's child cards, a home page
 * row of category cards, and the top of the browse page.
 *
 * A category with nothing published under it is missing from the answer rather
 * than present with a zero — every caller treats a missing count as none.
 */
export async function publishedSubtreeCounts(
  siteId: string,
  categoryIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, number>> {
  if (categoryIds.length === 0) return new Map()

  const result = await database.execute(sql`
    WITH RECURSIVE category_tree AS (
      SELECT child.id AS ancestor_id, child.id AS descendant_id
      FROM categories child
      WHERE child.workspace_id = ${siteId}
        AND child.id IN (${sql.join(
          categoryIds.map((id) => sql`${id}`),
          sql`, `
        )})

      UNION

      SELECT tree.ancestor_id, child.id
      FROM category_tree tree
      INNER JOIN categories child
        ON child.parent_id = tree.descendant_id
       AND child.workspace_id = ${siteId}
    )
    SELECT
      tree.ancestor_id AS "categoryId",
      count(DISTINCT relationship.content_id)::int AS "count"
    FROM category_tree tree
    INNER JOIN category_relationships relationship
      ON relationship.category_id = tree.descendant_id
     AND relationship.workspace_id = ${siteId}
     AND relationship.content_type = ${LISTING_CONTENT_TYPE}
    INNER JOIN directory_listings listing
      ON listing.id = relationship.content_id
     AND listing.workspace_id = ${siteId}
     AND listing.status = 'published'
    GROUP BY tree.ancestor_id
  `)

  return new Map(
    (result.rows as Array<{ categoryId: string; count: number }>).map((row) => [
      row.categoryId,
      row.count,
    ])
  )
}
