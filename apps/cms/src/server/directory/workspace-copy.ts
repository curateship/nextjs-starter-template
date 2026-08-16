import { eq } from "drizzle-orm"

import type { WorkspaceCopyInput } from "@/server/app-options"
import { now, uuid } from "@/server/auth/security"
import {
  categories,
  categoryRelationships,
  directoryCustomSections,
  directoryListings,
  LISTING_CONTENT_TYPE,
} from "@/server/directory/schema"

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
