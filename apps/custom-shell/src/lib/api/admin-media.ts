import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  cleanMediaOrphans,
  deleteMediaAsAdmin,
  listAllMedia,
  listMediaOwners,
  loadOrphanDashboard,
  loadStorageDashboard,
  type AdminMediaItem,
  type AdminMediaListResponse,
  type AdminMediaSort,
  type AdminMediaTypeFilter,
  type MediaOrphan,
  type MediaOwner,
  type OrphanDashboard,
  type StorageDashboard,
  type StorageUserRow,
} from "@/server/media"
import { R2StorageNotConfiguredError } from "@/server/media-storage"
import { requireAppOrigin } from "@/server/origin"
import { requireAdmin } from "@/server/security"

export type {
  AdminMediaItem,
  AdminMediaListResponse,
  AdminMediaSort,
  AdminMediaTypeFilter,
  MediaOrphan,
  MediaOwner,
  OrphanDashboard,
  StorageDashboard,
  StorageUserRow,
}

const listQuerySchema = z.object({
  search: z.string().trim().max(120).default(""),
  ownerId: z.string().trim().max(36).default("all"),
  fileType: z.enum(["all", "image", "video", "svg"]).default("all"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(5).max(100).default(25),
  sort: z.enum(["file", "owner", "type", "size", "created"]).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
})

export type AdminMediaListQueryInput = z.input<typeof listQuerySchema>

const deleteSchema = z.object({
  mediaIds: z.array(z.string().min(1).max(36)).min(1).max(100),
})

const cleanOrphansSchema = z.object({
  mediaIds: z.array(z.string().min(1).max(36)).max(500).default([]),
  storagePaths: z.array(z.string().min(1).max(512)).max(500).default([]),
})

const adminMediaErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
  R2_NOT_CONFIGURED:
    "File storage is not set up. Add the CUSTOM_SHELL_R2_* environment variables first.",
  SCAN_FAILED: "Storage could not be read, so orphans are unknown right now.",
}

export function getAdminMediaErrorMessage(error: unknown) {
  const message =
    typeof error === "string" ? error : error instanceof Error ? error.message : ""
  const matched = Object.keys(adminMediaErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? adminMediaErrorMessages[matched]
    : "We could not complete that request. Please try again."
}

/** Storage is unusable without R2, so say that instead of "try again". */
function asStorageError(error: unknown): never {
  if (error instanceof R2StorageNotConfiguredError) {
    throw new Error("R2_NOT_CONFIGURED")
  }
  throw error
}

/** The media page in one request: a page of files plus the owner filter list. */
const loadAdminMediaPageFn = createServerFn({ method: "GET" })
  .inputValidator(listQuerySchema)
  .handler(async ({ data }) => {
    await requireAdmin()
    const [media, owners] = await Promise.all([
      listAllMedia(data).catch(asStorageError),
      listMediaOwners(),
    ])
    return { media, owners }
  })

const loadStorageDashboardFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin()
    return loadStorageDashboard()
  }
)

const loadOrphanDashboardFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireAdmin()
    return loadOrphanDashboard()
  }
)

const deleteAdminMediaFn = createServerFn({ method: "POST" })
  .inputValidator(deleteSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return deleteMediaAsAdmin(data.mediaIds).catch(asStorageError)
  })

const cleanOrphansFn = createServerFn({ method: "POST" })
  .inputValidator(cleanOrphansSchema)
  .handler(async ({ data }) => {
    requireAppOrigin()
    await requireAdmin()
    return cleanMediaOrphans(data).catch(asStorageError)
  })

export function loadAdminMediaPage(query: AdminMediaListQueryInput) {
  return loadAdminMediaPageFn({ data: query })
}

export function loadStorage() {
  return loadStorageDashboardFn()
}

export function loadOrphans() {
  return loadOrphanDashboardFn()
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
