import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  LISTING_SORT_COLUMNS,
  LISTING_STATUS_FILTERS,
  type ListingSortColumn,
  type ListingStatusFilter,
} from "@/lib/directory/listing-sort"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"
import { claimImpactForListings } from "@/server/directory/claims"
import {
  categoriesForListing,
  createListing,
  deleteListings,
  duplicateListing,
  findListing,
  listingDeleteImpact,
  listListings,
  MAX_LISTING_TITLE,
  setListingCategories,
  updateListing,
  type DirectoryListing,
  type ListingSummary,
} from "@/server/directory/listings"

import { describeAuthError } from "../error-message"

export type { DirectoryListing, ListingSummary }

/**
 * The listings dashboard's and edit form's doors. All admin-only: the public
 * read that the visitor-facing directory pages will use arrives with those
 * pages (task 03), so today every door here is guarded.
 *
 * The server's refusals are already sentences an admin can act on — "Another
 * listing already uses the address joes-diner" — so they pass through rather
 * than being flattened into one generic line.
 */
export function getListingErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return (
    describeAuthError(message) ??
    (message || "That could not be done. Please try again.")
  )
}

export type ListingsPage = {
  listings: ListingSummary[]
  total: number
  page: number
  pageSize: number
}

const loadListingsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(120).optional(),
      status: z.enum(LISTING_STATUS_FILTERS).optional(),
      sort: z.enum(LISTING_SORT_COLUMNS).optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(200).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<ListingsPage> => {
    const pageSize = data.limit ?? 50
    const page = data.page ?? 1
    const { listings, total } = await listListings(
      await workspaceIdForRequest(context.user.id),
      {
        search: data.search,
        status: data.status,
        sort: data.sort,
        direction: data.direction,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }
    )
    return { listings, total, page, pageSize }
  })

export function loadListingsPage(input: {
  search?: string
  status?: ListingStatusFilter
  sort?: ListingSortColumn
  direction?: "asc" | "desc"
  page?: number
  limit?: number
}) {
  return loadListingsPageFn({ data: input })
}

/** The edit form's whole load: the listing plus which categories it is in. */
export type ListingForEdit = {
  listing: DirectoryListing
  categoryIds: string[]
  primaryCategoryId: string | null
}

const loadListingForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<ListingForEdit | null> => {
    const site = await workspaceIdForRequest(context.user.id)
    // Both reads at once. One after the other made opening the edit window
    // cost two round trips to the database for no reason — neither answer
    // depends on the other.
    const [listing, links] = await Promise.all([
      findListing(site, data.id),
      categoriesForListing(site, data.id),
    ])
    if (!listing) return null
    return {
      listing,
      categoryIds: links.map((link) => link.categoryId),
      primaryCategoryId:
        links.find((link) => link.isPrimary)?.categoryId ?? null,
    }
  })

export function loadListingForEdit(id: string) {
  return loadListingForEditFn({ data: { id } })
}

const createListingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      title: z.string().min(1).max(MAX_LISTING_TITLE),
      slug: z.string().max(160).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<DirectoryListing> => {
    return createListing(await workspaceIdForRequest(context.user.id), data)
  })

export function saveNewListing(input: { title: string; slug?: string }) {
  return createListingFn({ data: input })
}

const updateListingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(36),
      title: z.string().min(1).max(MAX_LISTING_TITLE).optional(),
      slug: z.string().max(160).optional(),
      metaDescription: z.string().max(300).optional(),
      status: z.enum(["draft", "published"]).optional(),
      displayOrder: z.number().int().min(-1_000_000).max(1_000_000).optional(),
      featuredImage: z.string().max(600).optional(),
      // Checked by their own cleaners on the server — these are trees whose
      // rule is "keep only what is allowed", which a cleaner says better than
      // a schema. Anything may arrive; only the allowed shapes survive.
      contactLinks: z.unknown().optional(),
      body: z.unknown().optional(),
      categoryIds: z.array(z.string().min(1).max(36)).max(50).optional(),
      primaryCategoryId: z.string().min(1).max(36).nullable().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<DirectoryListing> => {
    const { id, categoryIds, primaryCategoryId, ...rest } = data
    const site = await workspaceIdForRequest(context.user.id)
    const listing = await updateListing(site, id, rest)
    if (categoryIds !== undefined) {
      await setListingCategories(site, id, categoryIds, primaryCategoryId ?? null)
    }
    return listing
  })

export function saveListing(input: {
  id: string
  title?: string
  slug?: string
  metaDescription?: string
  status?: "draft" | "published"
  displayOrder?: number
  featuredImage?: string
  contactLinks?: unknown
  body?: unknown
  categoryIds?: string[]
  primaryCategoryId?: string | null
}) {
  return updateListingFn({ data: input })
}

const duplicateListingFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<DirectoryListing> => {
    return duplicateListing(
      await workspaceIdForRequest(context.user.id),
      data.id
    )
  })

export function copyListing(id: string) {
  return duplicateListingFn({ data: { id } })
}

const listingDeleteImpactFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({ ids: z.array(z.string().min(1).max(36)).min(1).max(500) })
  )
  .handler(async ({ data, context }) => {
    const site = await workspaceIdForRequest(context.user.id)
    // Composed here rather than inside `listingDeleteImpact`, on purpose: that
    // function lives beside `updateListing`, which the claims module already
    // calls, and having it call back into claims would make the two modules
    // import each other.
    const [listings, claims] = await Promise.all([
      listingDeleteImpact(site, data.ids),
      claimImpactForListings(site, data.ids),
    ])
    return { ...listings, ...claims }
  })

/** What deleting these would take with it, for the confirmation to say. */
export function loadListingDeleteImpact(ids: string[]) {
  return listingDeleteImpactFn({ data: { ids } })
}

const deleteListingsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ ids: z.array(z.string().min(1).max(36)).min(1).max(500) })
  )
  .handler(async ({ data, context }): Promise<{ done: string[]; kept: string[] }> => {
    return deleteListings(
      await workspaceIdForRequest(context.user.id),
      data.ids
    )
  })

/** One request for the whole selection; the result counts honestly. */
export function removeListings(ids: string[]) {
  return deleteListingsFn({ data: { ids } })
}
