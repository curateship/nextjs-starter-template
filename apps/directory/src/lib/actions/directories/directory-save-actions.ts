import { createServerFn } from "@tanstack/react-start"
import { getDirectorySaveStateActionImpl, toggleDirectorySaveCollectionActionImpl, createDirectorySaveCollectionActionImpl, getMySavedCollectionsActionImpl, getDirectorySaveFoldersDashboardActionImpl, getDirectorySaveFolderItemsDashboardActionImpl, updateDirectorySaveDefaultCollectionsActionImpl, renameDirectorySaveCollectionDashboardActionImpl, removeDirectorySaveCollectionsDashboardActionImpl, removeDirectorySaveItemsDashboardActionImpl } from "./directory-save-actions.server"
import type { DirectorySaveFolderTypeFilter } from "./directory-save-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-save-actions.server"

export const getDirectorySaveStateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  directoryId: string
} }) => data)
  .handler(async ({ data }) => getDirectorySaveStateActionImpl(data.input))

export const toggleDirectorySaveCollectionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  directoryId: string
  collectionId?: string | null
  defaultKey?: string | null
  saved: boolean
} }) => data)
  .handler(async ({ data }) => toggleDirectorySaveCollectionActionImpl(data.input))

export const createDirectorySaveCollectionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  directoryId: string
  name: string
} }) => data)
  .handler(async ({ data }) => createDirectorySaveCollectionActionImpl(data.input))

export const getMySavedCollectionsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getMySavedCollectionsActionImpl(data.siteId))

export const getDirectorySaveFoldersDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  page?: number
  pageSize?: number
  query?: string
  type?: DirectorySaveFolderTypeFilter
} }) => data)
  .handler(async ({ data }) => getDirectorySaveFoldersDashboardActionImpl(data.input))

export const getDirectorySaveFolderItemsDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  collectionId: string
  page?: number
  pageSize?: number
  query?: string
} }) => data)
  .handler(async ({ data }) => getDirectorySaveFolderItemsDashboardActionImpl(data.input))

export const updateDirectorySaveDefaultCollectionsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  savedLabel: string
  wantToGoLabel: string
} }) => data)
  .handler(async ({ data }) => updateDirectorySaveDefaultCollectionsActionImpl(data.input))

export const renameDirectorySaveCollectionDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  collectionId: string
  name: string
} }) => data)
  .handler(async ({ data }) => renameDirectorySaveCollectionDashboardActionImpl(data.input))

export const removeDirectorySaveCollectionsDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  collectionIds: string[]
} }) => data)
  .handler(async ({ data }) => removeDirectorySaveCollectionsDashboardActionImpl(data.input))

export const removeDirectorySaveItemsDashboardAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  itemIds: string[]
} }) => data)
  .handler(async ({ data }) => removeDirectorySaveItemsDashboardActionImpl(data.input))
