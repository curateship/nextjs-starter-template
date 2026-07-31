import { createServerFn } from "@tanstack/react-start"
import { getListingViewsDataImpl } from "./page-listing-views-actions.server"
import type { ListingViewsContentType } from "./page-listing-views-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./page-listing-views-actions.server"

export const getListingViewsData = createServerFn({ method: "POST" })
  .inputValidator((data: {
    site_id: string
    contentType: ListingViewsContentType
    categoryIds?: string[]
    sortBy: 'date' | 'title' | 'display_order' | 'distance'
    sortOrder: 'asc' | 'desc'
    limit?: number
    offset?: number
    includeCategories?: boolean
    near?: { latitude: number; longitude: number; radiusKm: number }
  }) => data)
  .handler(async ({ data }) => getListingViewsDataImpl(data))
