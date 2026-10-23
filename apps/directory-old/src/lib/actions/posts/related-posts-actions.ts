import { createServerFn } from "@tanstack/react-start"
import { getRelatedPostsDataImpl } from "./related-posts-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./related-posts-actions.server"

export const getRelatedPostsData = createServerFn({ method: "POST" })
  .inputValidator((data: {
    siteId: string
    excludePostId: string
    sortBy: 'date' | 'title'
    sortOrder: 'asc' | 'desc'
    limit?: number
  }) => data)
  .handler(async ({ data }) => getRelatedPostsDataImpl(data))
