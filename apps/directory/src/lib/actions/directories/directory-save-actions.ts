import { createServerFn } from "@tanstack/react-start"
import { getDirectorySaveStateActionImpl, toggleDirectorySaveCollectionActionImpl, createDirectorySaveCollectionActionImpl, getMySavedCollectionsActionImpl, getDirectorySaveFoldersDashboardActionImpl, getDirectorySaveFolderItemsDashboardActionImpl, updateDirectorySaveDefaultCollectionsActionImpl, renameDirectorySaveCollectionDashboardActionImpl, removeDirectorySaveCollectionsDashboardActionImpl, removeDirectorySaveItemsDashboardActionImpl } from "./directory-save-actions.server"
import type { DirectorySaveFolderTypeFilter } from "./directory-save-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-save-actions.server"

export const getDirectorySaveStateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof getDirectorySaveStateActionImpl>[0] }) => data)
  .handler(async ({ data }) => getDirectorySaveStateActionImpl(data.input))

export const toggleDirectorySaveCollectionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof toggleDirectorySaveCollectionActionImpl>[0] }) => data)
  .handler(async ({ data }) => toggleDirectorySaveCollectionActionImpl(data.input))

export const createDirectorySaveCollectionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof createDirectorySaveCollectionActionImpl>[0] }) => data)
  .handler(async ({ data }) => createDirectorySaveCollectionActionImpl(data.input))

export const getMySavedCollectionsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getMySavedCollectionsActionImpl(data.siteId))

export const getDirectorySaveFoldersDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof getDirectorySaveFoldersDashboardActionImpl>[0] }) => data)
  .handler(async ({ data }) => getDirectorySaveFoldersDashboardActionImpl(data.input))

export const getDirectorySaveFolderItemsDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof getDirectorySaveFolderItemsDashboardActionImpl>[0] }) => data)
  .handler(async ({ data }) => getDirectorySaveFolderItemsDashboardActionImpl(data.input))

export const updateDirectorySaveDefaultCollectionsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof updateDirectorySaveDefaultCollectionsActionImpl>[0] }) => data)
  .handler(async ({ data }) => updateDirectorySaveDefaultCollectionsActionImpl(data.input))

export const renameDirectorySaveCollectionDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof renameDirectorySaveCollectionDashboardActionImpl>[0] }) => data)
  .handler(async ({ data }) => renameDirectorySaveCollectionDashboardActionImpl(data.input))

export const removeDirectorySaveCollectionsDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof removeDirectorySaveCollectionsDashboardActionImpl>[0] }) => data)
  .handler(async ({ data }) => removeDirectorySaveCollectionsDashboardActionImpl(data.input))

export const removeDirectorySaveItemsDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof removeDirectorySaveItemsDashboardActionImpl>[0] }) => data)
  .handler(async ({ data }) => removeDirectorySaveItemsDashboardActionImpl(data.input))
