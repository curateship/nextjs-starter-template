import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { getPublicMediaUrl, R2StorageNotConfiguredError } from "@/server/media/storage"
import {
  createCatalogDrafts,
  deleteAdminCatalogItems,
  listAdminCatalog,
  listCatalogTags,
  loadAdminCatalogItem,
  reorderAdminCatalog,
  saveAdminCatalogItem,
  setAdminCatalogLocked,
  setAdminCatalogStatus,
  storeCatalogSource,
  type AdminCatalogItem,
  type AdminCatalogRow,
  type CatalogBulkResult,
} from "@/server/pomodoro/admin-catalog"
import { validateUploadContentLength } from "@/server/pomodoro/media-uploads"
import {
  importFromPixabay,
  type PixabayImportResult,
} from "@/server/pomodoro/pixabay-import"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  CATALOG_ACCESS_FILTERS,
  CATALOG_BULK_MAX,
  CATALOG_LICENCES,
  CATALOG_SORT_COLUMNS,
  CATALOG_SOURCE_PATTERN,
  CATALOG_STATUS_FILTERS,
  type CatalogKind,
} from "@/lib/pomodoro/admin-catalog"
import { ADMIN_PAGE_SIZE_MAX } from "@/lib/pomodoro/admin-lists"
import { MAX_ITEM_TAGS, TAG_PATTERN } from "@/lib/pomodoro/media-pool"

/**
 * The Themes and Sounds dashboards' doors, every one behind `adminGet` or
 * `adminPost`. See `workspace/docs/catalog-admin.md`. Types only are
 * re-exported, so nothing from `@/server/*` reaches the browser bundle.
 */
export type {
  AdminCatalogItem,
  AdminCatalogRow,
  CatalogBulkResult,
  PixabayImportResult,
}

export const getCatalogAdminErrorMessage = createErrorMessage(
  {
    CATALOG_ITEM_NOT_FOUND:
      "That item is no longer there. The list has been refreshed.",
    CATALOG_NEEDS_PICTURE: "Add a picture before making it Live.",
    CATALOG_NEEDS_FILE: "Add the sound's file before making it Live.",
    CATALOG_BAD_DESCRIPTOR: "Pick what kind it is from the list.",
    CATALOG_BAD_FILE: "That upload could not be found. Choose the file again.",
    CATALOG_WRONG_FILE_KIND:
      "That file is the wrong kind: a sound needs an audio file, and a theme a film.",
    INVALID_FILE_CONTENT:
      "That file is not what its name says. Use an MP3, WAV, OGG, MP4, WebM, PNG, JPEG or WebP.",
    FILE_TOO_LARGE:
      "That file is too large: 30 MB for a sound, 100 MB for a film, 10 MB for a picture.",
    CONTENT_LENGTH_REQUIRED: "That upload could not be read. Try again.",
    STORAGE_NOT_CONFIGURED:
      "File storage is not set up yet. Add the Cloudflare R2 details in Settings first.",
    PIXABAY_KEY_MISSING: "Add the Pixabay API key in Settings → Pixabay first.",
    RATE_LIMITED: "That is a lot of imports in a short time. Wait a few minutes and try again.",
    SECRET_UNREADABLE:
      "The saved Pixabay key can no longer be read. Paste it again in Settings → Pixabay.",
    ENCRYPTION_NOT_CONFIGURED:
      "Secret storage is not set up, so the Pixabay key cannot be read.",
  },
  "That did not work. Please try again."
)

const kindSchema = z.enum(["theme", "sound"])

const listSchema = z.object({
  kind: kindSchema,
  search: z.string().trim().max(120).default(""),
  status: z.enum(CATALOG_STATUS_FILTERS).default("all"),
  access: z.enum(CATALOG_ACCESS_FILTERS).default("all"),
  tag: z.string().trim().regex(TAG_PATTERN).nullable().default(null),
  sort: z.enum(CATALOG_SORT_COLUMNS).default("position"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type CatalogListQuery = z.input<typeof listSchema>

/** An address the page can show: one of this app's own, or the bucket's. */
const urlSchema = z
  .string()
  .trim()
  .max(500)
  .refine((value) => value.startsWith("/") || /^https:\/\//.test(value), {
    message: "Not an address",
  })

const itemSchema = z.object({
  id: z.string().uuid().nullable(),
  kind: kindSchema,
  label: z.string().trim().min(1).max(60),
  hint: z.string().trim().max(120).default(""),
  descriptor: z.string().trim().max(20),
  locked: z.boolean(),
  status: z.enum(["draft", "live"]),
  pictureUrl: urlSchema.nullable(),
  tags: z.array(z.string().max(40)).max(MAX_ITEM_TAGS).default([]),
  volume: z.number().int().min(10).max(100).default(100),
  artist: z.string().trim().max(120).nullable(),
  sourceUrl: urlSchema.nullable(),
  licence: z
    .enum(CATALOG_LICENCES.map((licence) => licence.value) as [string, ...string[]])
    .nullable(),
  licenceNote: z.string().trim().max(300).nullable(),
  source: z
    .object({
      path: z.string().regex(CATALOG_SOURCE_PATTERN),
      kind: z.enum(["audio", "video", "image"]),
    })
    .nullable(),
  clearFile: z.boolean().default(false),
})
export type CatalogItemPayload = z.input<typeof itemSchema>

const idsSchema = z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX)

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(({ data }) => listAdminCatalog(data))

/** The first page, with the configured rows-per-page, for the route loader. */
const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    const [list, tags] = await Promise.all([
      listAdminCatalog({ ...data, pageSize }),
      listCatalogTags(data.kind),
    ])
    return { list, pageSize, tags }
  })

const listTagsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ kind: kindSchema }))
  .handler(({ data }) => listCatalogTags(data.kind))

const loadItemFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().uuid() }))
  .handler(({ data }) => loadAdminCatalogItem(data.id))

const saveItemFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(itemSchema)
  .handler(({ data, context }) => {
    const { id, kind, ...input } = data
    return saveAdminCatalogItem({
      id,
      kind,
      input: {
        ...input,
        artist: input.artist || null,
        sourceUrl: input.sourceUrl || null,
        licenceNote: input.licenceNote || null,
      },
      actorUserId: context.user.id,
    })
  })

/**
 * One file into the bucket, as it arrived, for an item to be saved with. A
 * picture comes back with its address, because "Upload several" makes a still
 * of it at once.
 */
const uploadSourceFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("INVALID_FILE_CONTENT")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error("INVALID_FILE_CONTENT")
    return { file }
  })
  .handler(async ({ data, context }) => {
    // Refused before a byte is read, the same as a member's upload.
    validateUploadContentLength(getRequest().headers.get("content-length"))
    await enforceRateLimit(`pomodoro-catalog-upload:${context.user.id}`, {
      maxAttempts: 120,
      windowSeconds: 10 * 60,
    })
    const bytes = new Uint8Array(await data.file.arrayBuffer())
    if (!bytes.byteLength) throw new Error("INVALID_FILE_CONTENT")
    try {
      const stored = await storeCatalogSource({ bytes, mimeType: data.file.type })
      return {
        ...stored,
        url: stored.kind === "image" ? await getPublicMediaUrl(stored.path) : null,
      }
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError)
        throw new Error("STORAGE_NOT_CONFIGURED")
      throw error
    }
  })

const createDraftsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      kind: kindSchema,
      files: z
        .array(
          z.object({
            name: z.string().max(200),
            path: z.string().regex(CATALOG_SOURCE_PATTERN),
            kind: z.enum(["audio", "video", "image"]),
            url: urlSchema.nullable(),
          })
        )
        .min(1)
        .max(CATALOG_BULK_MAX),
    })
  )
  .handler(({ data, context }) =>
    createCatalogDrafts({ ...data, actorUserId: context.user.id })
  )

/**
 * "Import from Pixabay": the lines the window found good, each with the line
 * number the admin sees, so a refusal names the right line.
 */
const importPixabayFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      kind: kindSchema,
      links: z
        .array(
          z.object({
            line: z.number().int().min(1).max(1000),
            url: z.string().trim().min(1).max(500),
          })
        )
        .min(1)
        .max(CATALOG_BULK_MAX),
    })
  )
  .handler(async ({ data, context }): Promise<PixabayImportResult> => {
    // Pixabay asks for no mass downloading; 20 lists of 25 in ten minutes is
    // far past an evening's browsing.
    await enforceRateLimit(`pomodoro-pixabay-import:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 10 * 60,
    })
    return importFromPixabay({ ...data, actorUserId: context.user.id })
  })

const setStatusFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema, status: z.enum(["draft", "live"]) }))
  .handler(({ data, context }) =>
    setAdminCatalogStatus({ ...data, actorUserId: context.user.id })
  )

const setLockedFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema, locked: z.boolean() }))
  .handler(({ data, context }) =>
    setAdminCatalogLocked({ ...data, actorUserId: context.user.id })
  )

/** The whole order of one kind, as dragged. A catalogue is never anywhere near 500. */
const reorderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ kind: kindSchema, ids: z.array(z.string().uuid()).min(1).max(500) })
  )
  .handler(({ data, context }) =>
    reorderAdminCatalog({ ...data, actorUserId: context.user.id })
  )

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(({ data, context }) =>
    deleteAdminCatalogItems({ ids: data.ids, actorUserId: context.user.id })
  )

export const listCatalogItems = (data: CatalogListQuery) => listFn({ data })
export const loadCatalogPage = (data: Omit<CatalogListQuery, "pageSize">) =>
  loadPageFn({ data })
export const loadCatalogItem = (id: string) => loadItemFn({ data: { id } })
export const loadCatalogTags = (kind: CatalogKind) => listTagsFn({ data: { kind } })
export const saveCatalogItem = (data: CatalogItemPayload) => saveItemFn({ data })
export const uploadCatalogSource = (file: File) => {
  const form = new FormData()
  form.set("file", file)
  return uploadSourceFn({ data: form })
}
export const createCatalogDraftsFromFiles = (
  kind: CatalogKind,
  files: { name: string; path: string; kind: "audio" | "video" | "image"; url: string | null }[]
) => createDraftsFn({ data: { kind, files } })
export const importCatalogFromPixabay = (
  kind: CatalogKind,
  links: { line: number; url: string }[]
) => importPixabayFn({ data: { kind, links } })
export const setCatalogStatus = (ids: string[], status: "draft" | "live") =>
  setStatusFn({ data: { ids, status } })
export const setCatalogLocked = (ids: string[], locked: boolean) =>
  setLockedFn({ data: { ids, locked } })
export const reorderCatalog = (kind: CatalogKind, ids: string[]) =>
  reorderFn({ data: { kind, ids } })
export const deleteCatalogItems = (ids: string[]) => deleteFn({ data: { ids } })
