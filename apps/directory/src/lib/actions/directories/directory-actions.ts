import { createServerFn } from "@tanstack/react-start"
import { updateDirectoryActionImpl, deleteDirectoryActionImpl, deleteDirectoriesActionImpl, duplicateDirectoryActionImpl, getDirectoryBuilderDataActionImpl, getDirectoryByIdActionImpl, updateDirectoryBlockValuesActionImpl } from "./directory-actions.server"
import type { UpdateDirectoryInput } from "./directory-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-actions.server"

export const updateDirectoryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryId: string; data: UpdateDirectoryInput }) => data)
  .handler(async ({ data }) => updateDirectoryActionImpl(data.directoryId, data.data))

export const deleteDirectoryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryId: string }) => data)
  .handler(async ({ data }) => deleteDirectoryActionImpl(data.directoryId))

export const deleteDirectoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryIds: string[] }) => data)
  .handler(async ({ data }) => deleteDirectoriesActionImpl(data.directoryIds))

export const duplicateDirectoryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryId: string; newTitle: string }) => data)
  .handler(async ({ data }) => duplicateDirectoryActionImpl(data.directoryId, data.newTitle))

export const getDirectoryBuilderDataAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; selectedDirectory: string }) => data)
  .handler(async ({ data }) => getDirectoryBuilderDataActionImpl(data.siteId, data.selectedDirectory))

export const getDirectoryByIdAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryId: string }) => data)
  .handler(async ({ data }) => getDirectoryByIdActionImpl(data.directoryId))

export const updateDirectoryBlockValuesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryId: string; contentBlocks: Record<string, any> }) => data)
  .handler(async ({ data }) => updateDirectoryBlockValuesActionImpl(data.directoryId, data.contentBlocks))
