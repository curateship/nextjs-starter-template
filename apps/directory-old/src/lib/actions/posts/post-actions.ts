import { createServerFn } from "@tanstack/react-start"
import { getSitePostsWithCategoriesActionImpl, getSitePostsWithMergedBlocksActionImpl, updatePostActionImpl, deletePostActionImpl, deletePostsActionImpl, duplicatePostActionImpl, updatePostBlocksActionImpl } from "./post-actions.server"
import type { UpdatePostData } from "./post-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./post-actions.server"

export const getSitePostsWithCategoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getSitePostsWithCategoriesActionImpl(data.siteId, data.options))

export const getSitePostsWithMergedBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number; selectedSlug?: string } }) => data)
  .handler(async ({ data }) => getSitePostsWithMergedBlocksActionImpl(data.siteId, data.options))

export const updatePostAction = createServerFn({ method: "POST" })
  .inputValidator((data: { postId: string; updates: UpdatePostData }) => data)
  .handler(async ({ data }) => updatePostActionImpl(data.postId, data.updates))

export const deletePostAction = createServerFn({ method: "POST" })
  .inputValidator((data: { postId: string }) => data)
  .handler(async ({ data }) => deletePostActionImpl(data.postId))

export const deletePostsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { postIds: string[] }) => data)
  .handler(async ({ data }) => deletePostsActionImpl(data.postIds))

export const duplicatePostAction = createServerFn({ method: "POST" })
  .inputValidator((data: { postId: string; newTitle: string }) => data)
  .handler(async ({ data }) => duplicatePostActionImpl(data.postId, data.newTitle))

export const updatePostBlocksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { postId: string; blocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updatePostBlocksActionImpl(data.postId, data.blocks))
