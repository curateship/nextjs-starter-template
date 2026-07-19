import { createServerFn } from "@tanstack/react-start"
import { getPaginatedMediaActionImpl, scanUnusedMediaActionImpl, updateMediaActionImpl, deleteMediaActionImpl, deleteMediaItemsActionImpl } from "./media-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./media-actions.server"

export const getPaginatedMediaAction = createServerFn({ method: "POST" })
  .inputValidator((data: { page?: number; pageSize?: number; fileType?: 'image' | 'video'; site_id?: string; mimeType?: 'image/svg+xml' }) => data)
  .handler(async ({ data }) => getPaginatedMediaActionImpl(data.page, data.pageSize, data.fileType, data.site_id, data.mimeType))

export const scanUnusedMediaAction = createServerFn({ method: "POST" })
  .inputValidator((data: { site_id?: string }) => data)
  .handler(async ({ data }) => scanUnusedMediaActionImpl(data.site_id))

export const updateMediaAction = createServerFn({ method: "POST" })
  .inputValidator((data: { mediaId: string; updates: { alt_text?: string }; site_id?: string }) => data)
  .handler(async ({ data }) => updateMediaActionImpl(data.mediaId, data.updates, data.site_id))

export const deleteMediaAction = createServerFn({ method: "POST" })
  .inputValidator((data: { mediaId: string; site_id?: string }) => data)
  .handler(async ({ data }) => deleteMediaActionImpl(data.mediaId, data.site_id))

export const deleteMediaItemsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { mediaIds: string[]; site_id?: string }) => data)
  .handler(async ({ data }) => deleteMediaItemsActionImpl(data.mediaIds, data.site_id))
