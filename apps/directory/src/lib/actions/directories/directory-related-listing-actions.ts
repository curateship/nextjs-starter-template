import { createServerFn } from "@tanstack/react-start"
import { getDirectoryRelatedListingsActionImpl } from "./directory-related-listing-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-related-listing-actions.server"

export const getDirectoryRelatedListingsAction = createServerFn({ method: "POST" })
  .inputValidator((data: {
    siteId: string
    directoryId: string
    parentCategoryId: string
    limit?: number
  }) => data)
  .handler(async ({ data }) => getDirectoryRelatedListingsActionImpl(data))
