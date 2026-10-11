import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import {
  deleteAdminGenerationFiles,
  listAdminGenerations,
  type AdminGenerationRow,
} from "@/server/pomodoro/admin-generations"
import { deleteAdminTags, listAdminTags, type AdminTagRow } from "@/server/pomodoro/admin-tags"
import { deleteAdminUploads, listAdminUploads, type AdminUploadRow } from "@/server/pomodoro/admin-uploads"
import { nudgeRoomsPlaying } from "@/server/pomodoro/rooms"
import {
  approveSharedFiles,
  clearShareWaitingNotices,
  copySharedFileToCatalogue,
  setFeaturedSharedFile,
  unshareSharedFiles,
} from "@/server/pomodoro/admin-shared-media"
import {
  UNSHARE_NOTE_MAX,
  UNSHARE_REASON_IDS,
  UPLOAD_SHARING_FILTERS,
} from "@/lib/pomodoro/shared-media-reports"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  ADMIN_PAGE_SIZE_MAX,
  GENERATION_KIND_FILTERS,
  GENERATION_SORT_COLUMNS,
  GENERATION_STATUS_FILTERS,
  TAG_SORT_COLUMNS,
  UPLOAD_PURPOSE_FILTERS,
  UPLOAD_SORT_COLUMNS,
} from "@/lib/pomodoro/admin-lists"

/**
 * The doors for Member uploads, AI generations and Tags (admin task 06, parts
 * 3, 12 and 4), every one behind `adminGet` or `adminPost`.
 */
export type { AdminGenerationRow, AdminTagRow, AdminUploadRow }

export const getMemberFilesErrorMessage = createErrorMessage(
  {
    R2_NOT_CONFIGURED: "File storage is not set up, so the files cannot be deleted. Set it up in Settings → Storage.",
    SHARED_MEDIA_NOT_FOUND: "That file is no longer shared.",
    UPLOAD_NOT_READY: "That file could not be read from storage. Try again.",
    INVALID_FILE_CONTENT: "That file could not be copied into the catalogue.",
    FILE_TOO_LARGE: "That file is too big for the catalogue.",
  },
  "That did not work. Please try again."
)

/** The shell's own wording for a bucket that is not set up, as its media page does. */
function asStorageError(error: unknown): never {
  if (error instanceof R2StorageNotConfiguredError) throw new Error("R2_NOT_CONFIGURED")
  throw error
}

const page = z.number().int().min(1).max(10_000).default(1)
const pageSize = z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25)
const search = z.string().trim().max(120).default("")
const direction = z.enum(["asc", "desc"]).default("desc")
const user = z.string().trim().min(1).max(36).optional()
const uuids = z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX)
const mediaIds = z.array(z.string().trim().min(1).max(36)).min(1).max(ADMIN_PAGE_SIZE_MAX)

// ---------------------------------------------------------------------------
// Member uploads
// ---------------------------------------------------------------------------

const uploadQuerySchema = z.object({
  search,
  purpose: z.enum(UPLOAD_PURPOSE_FILTERS).default("all"),
  user,
  sharing: z.enum(UPLOAD_SHARING_FILTERS).default("all"),
  sort: z.enum(UPLOAD_SORT_COLUMNS).default("created"),
  direction,
  page,
  pageSize,
})
export type UploadQuery = z.input<typeof uploadQuerySchema>

const listUploadsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(uploadQuerySchema)
  .handler(({ data }) => listAdminUploads(data))

const loadUploadsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(uploadQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const rows = await readDashboardRowsPerPage()
    return { list: await listAdminUploads({ ...data, pageSize: rows }), pageSize: rows }
  })

const deleteUploadsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: mediaIds }))
  .handler(({ data, context }) =>
    deleteAdminUploads({ mediaIds: data.ids, actorUserId: context.user.id }).catch(asStorageError)
  )

// Shared files (uploads-and-sharing task 05)

const unshareFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      ids: mediaIds,
      reason: z.enum(UNSHARE_REASON_IDS),
      note: z.string().max(UNSHARE_NOTE_MAX),
    })
  )
  .handler(async ({ data, context }) => {
    const result = await unshareSharedFiles({
      mediaIds: data.ids,
      reason: data.reason,
      note: data.note,
      actorUserId: context.user.id,
    })
    await clearShareWaitingNotices()
    await nudgeRoomsPlaying(result.done)
    return result
  })

const approveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: mediaIds }))
  .handler(async ({ data, context }) => {
    const result = await approveSharedFiles({ mediaIds: data.ids, actorUserId: context.user.id })
    await clearShareWaitingNotices()
    return result
  })

const featureFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().uuid().nullable() }))
  .handler(({ data, context }) =>
    setFeaturedSharedFile({ mediaId: data.id, actorUserId: context.user.id })
  )

const toCatalogueFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(({ data, context }) =>
    copySharedFileToCatalogue({ mediaId: data.id, actorUserId: context.user.id }).catch(
      asStorageError
    )
  )

export const unsharePomodoroUploads = (data: {
  ids: string[]
  reason: (typeof UNSHARE_REASON_IDS)[number]
  note: string
}) => unshareFn({ data })
export const approvePomodoroShares = (ids: string[]) => approveFn({ data: { ids } })
export const featurePomodoroUpload = (id: string | null) => featureFn({ data: { id } })
export const copyPomodoroUploadToCatalogue = (id: string) => toCatalogueFn({ data: { id } })

// ---------------------------------------------------------------------------
// AI generations
// ---------------------------------------------------------------------------

const generationQuerySchema = z.object({
  search,
  kind: z.enum(GENERATION_KIND_FILTERS).default("all"),
  status: z.enum(GENERATION_STATUS_FILTERS).default("all"),
  user,
  sort: z.enum(GENERATION_SORT_COLUMNS).default("created"),
  direction,
  page,
  pageSize,
})
export type GenerationQuery = z.input<typeof generationQuerySchema>

const listGenerationsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(generationQuerySchema)
  .handler(({ data }) => listAdminGenerations(data))

const loadGenerationsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(generationQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const rows = await readDashboardRowsPerPage()
    return { list: await listAdminGenerations({ ...data, pageSize: rows }), pageSize: rows }
  })

const deleteGenerationFilesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: uuids }))
  .handler(({ data, context }) =>
    deleteAdminGenerationFiles({ generationIds: data.ids, actorUserId: context.user.id }).catch(asStorageError)
  )

// ---------------------------------------------------------------------------
// Member task tags
// ---------------------------------------------------------------------------

const tagQuerySchema = z.object({
  search,
  user,
  sort: z.enum(TAG_SORT_COLUMNS).default("tasks"),
  direction,
  page,
  pageSize,
})
export type TagQuery = z.input<typeof tagQuerySchema>

const listTagsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(tagQuerySchema)
  .handler(({ data }) => listAdminTags(data))

const loadTagsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(tagQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const rows = await readDashboardRowsPerPage()
    return { list: await listAdminTags({ ...data, pageSize: rows }), pageSize: rows }
  })

const deleteTagsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: uuids }))
  .handler(({ data, context }) => deleteAdminTags({ tagIds: data.ids, actorUserId: context.user.id }))

export const listPomodoroUploads = (data: UploadQuery) => listUploadsFn({ data })
export const loadPomodoroUploadsPage = (data: Omit<UploadQuery, "pageSize">) => loadUploadsPageFn({ data })
export const deletePomodoroUploads = (ids: string[]) => deleteUploadsFn({ data: { ids } })
export const listPomodoroGenerations = (data: GenerationQuery) => listGenerationsFn({ data })
export const loadPomodoroGenerationsPage = (data: Omit<GenerationQuery, "pageSize">) =>
  loadGenerationsPageFn({ data })
export const deletePomodoroGenerationFiles = (ids: string[]) => deleteGenerationFilesFn({ data: { ids } })
export const listPomodoroTags = (data: TagQuery) => listTagsFn({ data })
export const loadPomodoroTagsPage = (data: Omit<TagQuery, "pageSize">) => loadTagsPageFn({ data })
export const deletePomodoroTags = (ids: string[]) => deleteTagsFn({ data: { ids } })
