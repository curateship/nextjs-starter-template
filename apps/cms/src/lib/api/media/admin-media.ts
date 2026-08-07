import { createServerFn } from "@tanstack/react-start"
import { createErrorMessage } from "../error-message"
import { z } from "zod"

import {
  cleanMediaOrphans,
  deleteMediaAsAdmin,
  getAdminMedia,
  listAllMedia,
  listMediaOwners,
  loadOrphanDashboard,
  type AdminMediaItem,
  type AdminMediaListResponse,
  type AdminMediaSort,
  type AdminMediaTypeFilter,
  type MediaOrphan,
  type MediaOwner,
  type OrphanDashboard,
} from "@/server/media/library"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { adminGet, adminPost } from "@/server/guards"
import { readDashboardRowsPerPage } from "@/server/shell-settings"

export type {
  AdminMediaItem,
  AdminMediaListResponse,
  AdminMediaSort,
  AdminMediaTypeFilter,
  MediaOrphan,
  MediaOwner,
  OrphanDashboard,
}

const listQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  ownerId: z.string().trim().max(36).default("all"),
  fileType: z.enum(["all", "image", "video", "svg"]).default("all"),
  page: z.number().int().min(1).default(1),
  // Left out by the route loader, which cannot know the configured
  // rows-per-page; the handler reads it in that case.
  pageSize: z.number().int().min(5).max(100).optional(),
  sort: z.enum(["file", "owner", "type", "size", "created"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export type AdminMediaListQueryInput = z.input<typeof listQuerySchema>

const deleteSchema = z.object({
  mediaIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

const mediaIdSchema = z.object({ id: z.string().min(1).max(36) })

const cleanOrphansSchema = z.object({
  mediaIds: z.array(z.string().min(1).max(36)).max(500).default([]),
  storagePaths: z.array(z.string().min(1).max(512)).max(500).default([]),
})

export const getAdminMediaErrorMessage = createErrorMessage(
  {
    R2_NOT_CONFIGURED:
      "File storage is not set up. Add the CUSTOM_SHELL_R2_* environment variables first.",
    SCAN_FAILED: "Storage could not be read, so orphans are unknown right now.",
  },
  "We could not update the media library. Please try again."
)

/** Storage is unusable without R2, so say that instead of "try again". */
function asStorageError(error: unknown): never {
  if (error instanceof R2StorageNotConfiguredError) {
    throw new Error("R2_NOT_CONFIGURED")
  }
  throw error
}

/**
 * The media page in one request: a page of files plus the owner filter list.
 *
 * `pageSize` is optional so the route loader can leave it out. The route cannot
 * know the configured rows-per-page without another round trip, so when it is
 * missing the size is read here and sent back — that is what keeps the tiles on
 * screen and the footer's "1-10 of N" agreeing on first paint.
 */
const loadAdminMediaPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listQuerySchema)
  .handler(async ({ data }) => {
    const pageSize = data.pageSize ?? (await readDashboardRowsPerPage())
    const [media, owners] = await Promise.all([
      listAllMedia({ ...data, pageSize }).catch(asStorageError),
      listMediaOwners(),
    ])
    return { media, owners, pageSize }
  })

const loadOrphanDashboardFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async () => {
    return loadOrphanDashboard()
  })

const loadAdminMediaItemFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(mediaIdSchema)
  .handler(({ data }) => getAdminMedia(data.id))

const deleteAdminMediaFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(deleteSchema)
  .handler(async ({ data }) => {
    return deleteMediaAsAdmin(data.mediaIds).catch(asStorageError)
  })

const cleanOrphansFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(cleanOrphansSchema)
  .handler(async ({ data }) => {
    return cleanMediaOrphans(data).catch(asStorageError)
  })

export function loadAdminMediaPage(query: AdminMediaListQueryInput) {
  return loadAdminMediaPageFn({ data: query })
}

export function loadOrphans() {
  return loadOrphanDashboardFn()
}

export function loadAdminMediaItem(id: string) {
  return loadAdminMediaItemFn({ data: { id } })
}

export function deleteMediaAsAdminAction(mediaIds: string[]) {
  return deleteAdminMediaFn({ data: { mediaIds } })
}

export function cleanOrphanedMedia(input: {
  mediaIds: string[]
  storagePaths: string[]
}) {
  return cleanOrphansFn({ data: input })
}
