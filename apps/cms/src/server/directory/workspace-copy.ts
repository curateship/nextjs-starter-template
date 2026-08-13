import { eq } from "drizzle-orm"

import type { WorkspaceCopyInput } from "@/server/app-options"
import { now, uuid } from "@/server/auth/security"
import {
  categories,
  categoryRelationships,
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
        parentId: category.parentId
          ? (categoryIds.get(category.parentId) ?? null)
          : null,
        displayOrder: category.displayOrder,
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
        status: listing.status,
        displayOrder: listing.displayOrder,
        featuredImage: listing.featuredImage,
        contactLinks: listing.contactLinks,
        body: listing.body,
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
