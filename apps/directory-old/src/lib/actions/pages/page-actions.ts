import { createServerFn } from "@tanstack/react-start"
import { getSitePagesActionImpl, deletePageActionImpl, deletePagesActionImpl, duplicatePageActionImpl, updatePageBlocksActionImpl } from "./page-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./page-actions.server"

export const getSitePagesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getSitePagesActionImpl(data.siteId, data.options))

export const deletePageAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageId: string }) => data)
  .handler(async ({ data }) => deletePageActionImpl(data.pageId))

export const deletePagesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageIds: string[] }) => data)
  .handler(async ({ data }) => deletePagesActionImpl(data.pageIds))

export const duplicatePageAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageId: string; newTitle: string }) => data)
  .handler(async ({ data }) => duplicatePageActionImpl(data.pageId, data.newTitle))

export const updatePageBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageId: string; contentBlocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updatePageBlocksActionImpl(data.pageId, data.contentBlocks))
