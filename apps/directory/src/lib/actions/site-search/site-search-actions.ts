import { createServerFn } from "@tanstack/react-start"
import { searchSiteActionImpl } from "./site-search-actions.server"
import type { SiteSearchFilterType, SiteSearchSourceType } from "./site-search-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./site-search-actions.server"

export const searchSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  query: string
  type?: SiteSearchFilterType
  page?: number
  pageSize?: number
  enabledTypes?: SiteSearchSourceType[]
} }) => data)
  .handler(async ({ data }) => searchSiteActionImpl(data.input))
