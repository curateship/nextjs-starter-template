import { createServerFn } from "@tanstack/react-start"
import { getMemberDirectoryDataImpl } from "./page-member-directory-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./page-member-directory-actions.server"

export const getMemberDirectoryData = createServerFn({ method: "POST" })
  .inputValidator((data: { params: {
  siteId: string
  includedRoles?: string[]
  itemsPerPage?: number
  sortBy?: string
  sortOrder?: string
} }) => data)
  .handler(async ({ data }) => getMemberDirectoryDataImpl(data.params))
