import { createServerFn } from "@tanstack/react-start"
import { searchSiteDirectoriesActionImpl, getDirectoryCursorListActionImpl } from "./directory-list-actions.server"
import type { DirectoryAdminCursorListParams } from "./directory-list-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-list-actions.server"

export const searchSiteDirectoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: {
  search?: string
  limit?: number
} }) => data)
  .handler(async ({ data }) => searchSiteDirectoriesActionImpl(data.siteId, data.options))

export const getDirectoryCursorListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { params: DirectoryAdminCursorListParams }) => data)
  .handler(async ({ data }) => getDirectoryCursorListActionImpl(data.params))
