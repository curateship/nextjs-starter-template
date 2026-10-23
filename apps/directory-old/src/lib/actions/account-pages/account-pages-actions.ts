import { createServerFn } from "@tanstack/react-start"
import { getAccountPagesActionImpl, deleteAccountPageActionImpl, deleteAccountPagesActionImpl, updateAccountPageBlocksActionImpl, duplicateAccountPageActionImpl } from "./account-pages-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./account-pages-actions.server"

export const getAccountPagesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getAccountPagesActionImpl(data.siteId, data.options))

export const deleteAccountPageAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageId: string }) => data)
  .handler(async ({ data }) => deleteAccountPageActionImpl(data.pageId))

export const deleteAccountPagesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageIds: string[] }) => data)
  .handler(async ({ data }) => deleteAccountPagesActionImpl(data.pageIds))

export const updateAccountPageBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageId: string; contentBlocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updateAccountPageBlocksActionImpl(data.pageId, data.contentBlocks))

export const duplicateAccountPageAction = createServerFn({ method: "POST" })
  .inputValidator((data: { pageId: string; newTitle: string }) => data)
  .handler(async ({ data }) => duplicateAccountPageActionImpl(data.pageId, data.newTitle))
