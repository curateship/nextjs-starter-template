import { and, eq } from "drizzle-orm"

import type { WorkspaceCopyInput } from "@/server/app-options"
import { now, uuid } from "@/server/auth/security"
import { cleanPickedCategoryIds } from "@/lib/directory/category-cards"
import {
  categories,
  categoryRelationships,
  directoryCustomSections,
  directoryListings,
  directorySettings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"
import type { CustomShellDb } from "@/server/db"
import { customShellPageBlocks } from "@/server/schema"
import {
  cleanCategoriesRowSettings,
  cleanListingsRowSettings,
  cleanPickedRowSettings,
  isCmsFrontPageRowKey,
} from "@/lib/directory/front-page-kinds"

/** Copies this app's directory content inside the shell's workspace transaction. */
export async function copyDirectoryWorkspace({
  sourceWorkspaceId,
  newWorkspaceId,
  choices,
  database,
}: WorkspaceCopyInput): Promise<void> {
  const at = now()
  const sourceCategories = await database
    .select()
    .from(categories)
    .where(eq(categories.workspaceId, sourceWorkspaceId))
  const categoryIds = new Map(
    sourceCategories.map((category) => [category.id, uuid()])
  )

  if (sourceCategories.length) {
    await database.insert(categories).values(
      sourceCategories.map((category) => ({
        id: categoryIds.get(category.id)!,
        workspaceId: newWorkspaceId,
        name: category.name,
        slug: category.slug,
        description: category.description,
        metaDescription: category.metaDescription,
        featuredImage: category.featuredImage,
        parentId: category.parentId
          ? (categoryIds.get(category.parentId) ?? null)
          : null,
        displayOrder: category.displayOrder,
        createdAt: at,
        updatedAt: at,
      }))
    )
  }

  // The invented fields come across whether or not the listings do: they are
  // part of what the site *is*, and a copy made to start a second site from
  // wants the same shape of listing waiting for it.
  const sourceSections = await database
    .select()
    .from(directoryCustomSections)
    .where(eq(directoryCustomSections.workspaceId, sourceWorkspaceId))
  if (sourceSections.length) {
    await database.insert(directoryCustomSections).values(
      sourceSections.map((section) => ({
        id: uuid(),
        workspaceId: newWorkspaceId,
        name: section.name,
        // The slug is copied rather than made afresh: it is the key each
        // listing's answers are filed under, so a new one would arrive at a
        // copy whose listings all point at a section that no longer exists.
        slug: section.slug,
        layout: section.layout,
        fields: section.fields,
        displayOrder: section.displayOrder,
        createdAt: at,
        updatedAt: at,
      }))
    )
  }

  // The home page's rows came across in this table until 27 Sep 2026, when
  // they moved onto the shell's front page, which the shell's own copy carries
  // with the rest of the site's settings. What is left for this app is the
  // category inside one of its own rows: an id left pointing at the original
  // would filter to a category the copy cannot see, so the row would come back
  // empty and vanish off the page.
  await repointFrontPageRows(newWorkspaceId, categoryIds, database)

  // The browse page's own row of category cards, and which category names a
  // neighbourhood. Only this app's category-shaped columns are carried: the
  // rest of `directory_settings` has never been copied, and its two encrypted
  // Google keys deliberately must not be — a key belongs to the site whose
  // admin pasted it.
  const [sourceSettings] = await database
    .select({
      browseCategoriesEnabled: directorySettings.browseCategoriesEnabled,
      browseCategorySource: directorySettings.browseCategorySource,
      browsePickedCategoryIds: directorySettings.browsePickedCategoryIds,
      neighbourhoodCategoryId: directorySettings.neighbourhoodCategoryId,
    })
    .from(directorySettings)
    .where(eq(directorySettings.workspaceId, sourceWorkspaceId))
    .limit(1)

  // Re-pointed at the copy's own category, the same as every other id here. An
  // id left pointing at the original would label nothing on the copy.
  const copiedNeighbourhood = sourceSettings?.neighbourhoodCategoryId
    ? (categoryIds.get(sourceSettings.neighbourhoodCategoryId) ?? null)
    : null

  if (sourceSettings?.browseCategoriesEnabled || copiedNeighbourhood) {
    await database
      .insert(directorySettings)
      .values({
        workspaceId: newWorkspaceId,
        browseCategoriesEnabled: Boolean(
          sourceSettings?.browseCategoriesEnabled
        ),
        browseCategorySource:
          sourceSettings?.browseCategorySource ?? "top-level",
        browsePickedCategoryIds: sourceSettings?.browseCategoriesEnabled
          ? cleanPickedCategoryIds(
              sourceSettings.browsePickedCategoryIds
            ).flatMap((id) => {
              const copied = categoryIds.get(id)
              return copied ? [copied] : []
            })
          : [],
        neighbourhoodCategoryId: copiedNeighbourhood,
        createdAt: at,
        updatedAt: at,
      })
      .onConflictDoNothing({ target: directorySettings.workspaceId })
  }

  if (!choices.includes("listings")) return

  const sourceListings = await database
    .select()
    .from(directoryListings)
    .where(eq(directoryListings.workspaceId, sourceWorkspaceId))
  const listingIds = new Map(
    sourceListings.map((listing) => [listing.id, uuid()])
  )
  if (sourceListings.length) {
    await database.insert(directoryListings).values(
      sourceListings.map((listing) => ({
        id: listingIds.get(listing.id)!,
        workspaceId: newWorkspaceId,
        title: listing.title,
        slug: listing.slug,
        metaDescription: listing.metaDescription,
        rating: listing.rating,
        status: listing.status,
        displayOrder: listing.displayOrder,
        featuredImage: listing.featuredImage,
        // The rich fields were added after this copier was written and were
        // quietly being left behind: a copied site's listings lost their
        // photos, their opening hours and their map pin.
        gallery: listing.gallery,
        hours: listing.hours,
        latitude: listing.latitude,
        longitude: listing.longitude,
        contactLinks: listing.contactLinks,
        body: listing.body,
        customValues: listing.customValues,
        createdAt: at,
        updatedAt: at,
      }))
    )
  }

  const sourceLinks = await database
    .select()
    .from(categoryRelationships)
    .where(eq(categoryRelationships.workspaceId, sourceWorkspaceId))
  const copiedLinks = sourceLinks.flatMap((link) => {
    if (link.contentType !== LISTING_CONTENT_TYPE) return []
    const categoryId = categoryIds.get(link.categoryId)
    const contentId = listingIds.get(link.contentId)
    if (!categoryId || !contentId) return []
    return [
      {
        id: uuid(),
        workspaceId: newWorkspaceId,
        categoryId,
        contentType: LISTING_CONTENT_TYPE,
        contentId,
        isPrimary: link.isPrimary,
        createdAt: at,
      },
    ]
  })
  if (copiedLinks.length) {
    await database.insert(categoryRelationships).values(copiedLinks)
  }
}

/**
 * Points every one of this app's front page blocks at the copy's own categories.
 *
 * The shell copies a site's blocks wholesale, and it has no idea that the bag
 * of fields inside one of this app's blocks holds a category id. So the ids are
 * swapped here, in the same transaction, and a block whose category did not
 * come across is widened to every category rather than left pointing at a
 * stranger's.
 *
 * The blocks used to live in the workspace's settings, as `frontPageRows`. They
 * moved to the `page_blocks` table on the shell's 5 Oct 2026 merge, keyed by
 * site and address, so this reads and writes rows there instead. What it does
 * to each block is unchanged.
 */
async function repointFrontPageRows(
  newWorkspaceId: string,
  categoryIds: Map<string, string>,
  database: CustomShellDb
): Promise<void> {
  const blocks = await database
    .select({
      id: customShellPageBlocks.id,
      kind: customShellPageBlocks.kind,
      appKind: customShellPageBlocks.appKind,
      settings: customShellPageBlocks.settings,
    })
    .from(customShellPageBlocks)
    .where(eq(customShellPageBlocks.workspaceId, newWorkspaceId))

  const copiedId = (id: string | null) =>
    id ? (categoryIds.get(id) ?? null) : null

  for (const block of blocks) {
    if (block.kind !== "app" || !isCmsFrontPageRowKey(block.appKind)) continue

    // The jsonb column is the whole block bar its id, kind and appKind, so the
    // heading, the layout and the Visibility switches are in here too. This
    // app's own fields are the nested `settings` key, and only that key is
    // rewritten: replacing the column with the cleaner's output would drop the
    // block's heading.
    const saved = (block.settings ?? {}) as Record<string, unknown>
    const ownSaved = (saved.settings ?? null) as Record<string, unknown> | null

    let own: Record<string, unknown>
    if (block.appKind === "listings") {
      const cleaned = cleanListingsRowSettings(ownSaved)
      own = { ...cleaned, categoryId: copiedId(cleaned.categoryId) }
    } else if (block.appKind === "categories") {
      const cleaned = cleanCategoriesRowSettings(ownSaved)
      own = {
        ...cleaned,
        pickedCategoryIds: cleaned.pickedCategoryIds.flatMap((id) => {
          const copied = categoryIds.get(id)
          return copied ? [copied] : []
        }),
      }
    } else {
      const cleaned = cleanPickedRowSettings(ownSaved)
      own = { ...cleaned, categoryId: copiedId(cleaned.categoryId) }
    }

    await database
      .update(customShellPageBlocks)
      .set({ settings: { ...saved, settings: own }, updatedAt: now() })
      .where(
        and(
          eq(customShellPageBlocks.workspaceId, newWorkspaceId),
          eq(customShellPageBlocks.id, block.id)
        )
      )
  }
}
