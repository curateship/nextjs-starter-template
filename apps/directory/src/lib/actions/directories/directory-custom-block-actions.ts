import { createServerFn } from "@tanstack/react-start"
import { getDirectoryCustomBlocksBySiteImpl, getDirectoryCustomBlockByIdImpl, createDirectoryCustomBlockImpl, updateDirectoryCustomBlockImpl, deleteDirectoryCustomBlockImpl } from "./directory-custom-block-actions.server"
import type { DirectoryCustomBlockLayout } from "./directory-custom-block-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-custom-block-actions.server"

export const getDirectoryCustomBlocksBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryCustomBlocksBySiteImpl(data.siteId))

export const getDirectoryCustomBlockById = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => getDirectoryCustomBlockByIdImpl(data.templateId))

export const createDirectoryCustomBlock = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  name: string
  layout?: DirectoryCustomBlockLayout
  fields?: any[]
} }) => data)
  .handler(async ({ data }) => createDirectoryCustomBlockImpl(data.input))

export const updateDirectoryCustomBlock = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string; updates: {
  name?: string
  layout?: DirectoryCustomBlockLayout
  fields?: any[]
} }) => data)
  .handler(async ({ data }) => updateDirectoryCustomBlockImpl(data.templateId, data.updates))

export const deleteDirectoryCustomBlock = createServerFn({ method: "POST" })
  .inputValidator((data: { templateId: string }) => data)
  .handler(async ({ data }) => deleteDirectoryCustomBlockImpl(data.templateId))
