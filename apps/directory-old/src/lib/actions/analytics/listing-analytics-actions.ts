import { createServerFn } from "@tanstack/react-start"

import { getMyListingViewsAnalyticsActionImpl, type ListingAnalyticsRange } from "./listing-analytics-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./listing-analytics-actions.server"

export const getMyListingViewsAnalyticsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; directoryId: string; range: ListingAnalyticsRange }) => data)
  .handler(async ({ data }) => getMyListingViewsAnalyticsActionImpl(data))
