import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import { loadAccountStorage } from "@/server/media/library"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  assertCanUpload,
  countUploadsAhead,
  listPomodoroUploads,
  loadUploadTagSuggestions,
  editPomodoroUpload as saveUploadEdit,
  storePomodoroUpload,
  validatePomodoroUpload,
  validateUploadContentLength,
  validateUploadLabels,
  type StoredUpload,
  type UploadView,
} from "@/server/pomodoro/media-uploads"
import {
  emptyBin,
  moveUploadsToBin,
  restoreUploads,
  type BinResult,
} from "@/server/pomodoro/upload-bin"
import { checkStorageWarning } from "@/server/pomodoro/storage-warning"
import {
  suggestUploadLabels,
  type SuggestedLabels,
} from "@/server/pomodoro/upload-labels"
import {
  UPLOAD_LIMIT_BYTES,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import { formatBytes } from "@/lib/pomodoro/media-limits"
import {
  UPLOAD_LABEL_MESSAGES,
  type UploadTrim,
} from "@/lib/pomodoro/upload-labels"

export type { BinResult, StoredUpload, SuggestedLabels, UploadView }

/** What a member has uploaded for one picker, and how full their account is. */
export type UploadLibrary = {
  uploads: StoredUpload[]
  canUploadMedia: boolean
  usedBytes: number
  limitBytes: number
  /** The tags the upload window offers: the catalogue's, then the member's own. */
  knownTags: string[]
  /** Whether the window asks AI for a name and tags (Settings → App settings). */
  suggestLabels: boolean
}

/** A finished upload, and how many sounds and clips the worker takes first. */
export type UploadResult = StoredUpload & { ahead: number }

export const getPomodoroUploadErrorMessage = createErrorMessage(
  {
    PRO_REQUIRED:
      "Uploading your own backgrounds and sounds is a Pro perk. Upgrade to add yours.",
    CONTENT_LENGTH_REQUIRED:
      "That upload did not say how big it was, so it was refused. Try again, or use a different browser.",
    FILE_TOO_LARGE: `That file is too big. Images go up to ${formatBytes(UPLOAD_LIMIT_BYTES.image)}, sound up to ${formatBytes(UPLOAD_LIMIT_BYTES.audio)} and video up to ${formatBytes(UPLOAD_LIMIT_BYTES.video)}.`,
    INVALID_FILE_CONTENT:
      "That file is not the kind it says it is. Pick a PNG, JPG, WebP, MP3, WAV, OGG, MP4 or WebM.",
    WRONG_KIND_FOR_PURPOSE:
      "That file is the wrong kind for this picker. Backgrounds take pictures and video; sounds take audio.",
    STORAGE_QUOTA_EXCEEDED:
      "That would take you over your storage. Delete something you no longer use and try again.",
    UPLOAD_NOT_FOUND: "That upload is no longer there.",
    UPLOAD_NOT_READY: "That upload is still being prepared.",
    STORAGE_NOT_CONFIGURED:
      "Uploads are not switched on yet, so this file cannot be saved.",
    RATE_LIMITED:
      "That is a lot of uploads at once. Please wait a few minutes and try again.",
    ...UPLOAD_LABEL_MESSAGES,
    UPLOAD_LABELS_MISSING:
      "This page is out of date. Reload it and upload the file again.",
    INVALID_TRIM:
      "That trim cannot be used. Keep at least one second, inside the file.",
  },
  "That upload did not work. Please try again."
)

const purposeSchema = z.enum(["background", "sound"])

const libraryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.object({ view: z.enum(["background", "sound", "bin"]) })
  )
  .handler(async ({ data, context }): Promise<UploadLibrary> => {
    const [uploads, entitlements, storage, knownTags, settings] =
      await Promise.all([
        listPomodoroUploads(context.user.id, data.view),
        loadPomodoroEntitlements(context.user.id),
        loadAccountStorage(context.user.id),
        // The bin offers nothing to tag.
        data.view === "bin"
          ? Promise.resolve([])
          : loadUploadTagSuggestions(context.user.id, data.view),
        loadAppSettings(),
      ])
    return {
      uploads,
      canUploadMedia: entitlements.canUploadMedia,
      usedBytes: storage.bytes,
      limitBytes: entitlements.storageLimitBytes,
      knownTags,
      suggestLabels: settings["uploads.aiLabels"],
    }
  })

/** The window's fields, sent as text beside the file. */
const labelsSchema = z.object({
  name: z.string().max(400),
  tags: z.array(z.string().max(100)).max(50),
  shared: z.boolean(),
  trim: z
    .object({ startMs: z.number().int(), endMs: z.number().int() })
    .nullable(),
})

const uploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("INVALID_FILE_CONTENT")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error("INVALID_FILE_CONTENT")
    const purpose = purposeSchema.parse(data.get("purpose")?.toString())
    // A tab opened before the upload window existed sends the file alone.
    let labels: unknown = null
    try {
      labels = JSON.parse(data.get("labels")?.toString() ?? "null")
    } catch {
      // Left null, and refused just below.
    }
    const parsed = labelsSchema.safeParse(labels)
    if (!parsed.success) throw new Error("UPLOAD_LABELS_MISSING")
    return { file, purpose, labels: parsed.data }
  })
  .handler(async ({ data, context }): Promise<UploadResult> => {
    // Refused before a byte is read: a request with no declared length cannot
    // have its size checked until the whole body is already in memory, which
    // is the hole an attacker would push a two-gigabyte body through.
    validateUploadContentLength(getRequest().headers.get("content-length"))

    // The Pro check and the cap come before the bytes are read, so a free
    // account cannot make the server hold 100 MB to be told no.
    await assertCanUpload(context.user.id, data.file.size)
    await enforceRateLimit(`pomodoro-upload:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 10 * 60,
    })

    const bytes = new Uint8Array(await data.file.arrayBuffer())
    if (!bytes.byteLength) throw new Error("INVALID_FILE_CONTENT")
    const detected = validatePomodoroUpload({
      // Only the header is sniffed; the whole file is what gets stored.
      bytes: bytes.subarray(0, 16),
      mimeType: data.file.type,
      fileSize: bytes.byteLength,
      purpose: data.purpose,
    })
    const labels = validateUploadLabels(data.labels, detected.kind)

    try {
      const stored = await storePomodoroUpload({
        userId: context.user.id,
        purpose: data.purpose,
        file: { name: data.file.name },
        bytes,
        detected,
        labels,
      })
      await checkStorageWarning(context.user.id)
      return {
        ...stored,
        ahead:
          stored.status === "ready" ? 0 : await countUploadsAhead(stored.mediaId),
      }
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error("STORAGE_NOT_CONFIGURED")
      }
      throw error
    }
  })

/** One file or several, in one request, as the card's bin and the selection bar send them. */
const idsSchema = z.object({
  mediaIds: z.array(z.string().uuid()).min(1).max(200),
})

const binFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idsSchema)
  .handler(async ({ data, context }) =>
    moveUploadsToBin(context.user.id, data.mediaIds)
  )

const restoreFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(idsSchema)
  .handler(async ({ data, context }) =>
    restoreUploads(context.user.id, data.mediaIds)
  )

const emptyBinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => emptyBin(context.user.id))

const editFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      mediaId: z.string().uuid(),
      name: z.string().max(400),
      tags: z.array(z.string().max(100)).max(50),
      shared: z.boolean(),
      // Left out keeps the trim; null keeps the whole original.
      trim: z
        .object({ startMs: z.number().int(), endMs: z.number().int() })
        .nullable()
        .optional(),
    })
  )
  .handler(async ({ data, context }) => {
    // Each new cut is a worker's FFmpeg run, the most expensive thing the
    // app does, so they are rationed like uploads. A rename is not.
    if (data.trim !== undefined)
      await enforceRateLimit(`pomodoro-retrim:${context.user.id}`, {
        maxAttempts: 10,
        windowSeconds: 10 * 60,
      })
    return saveUploadEdit(context.user.id, data.mediaId, data)
  })

/** The cog's Save changes. Passing `trim` asks the worker for a new cut. */
export const editPomodoroUpload = (data: {
  mediaId: string
  name: string
  tags: string[]
  shared: boolean
  trim?: UploadTrim | null
}) => editFn({ data })

/**
 * A name and tags for a file the member just picked, or null. Never an error:
 * the window keeps the file name when nothing comes back.
 */
const suggestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ fileName: z.string().min(1).max(255), purpose: purposeSchema })
  )
  .handler(async ({ data, context }): Promise<SuggestedLabels | null> => {
    const [settings, entitlements] = await Promise.all([
      loadAppSettings(),
      loadPomodoroEntitlements(context.user.id),
    ])
    if (!settings["uploads.aiLabels"] || !entitlements.canUploadMedia)
      return null
    // Ten files at a time, so this is well above the window's own use and
    // well below anything that would run up a bill.
    await enforceRateLimit(`pomodoro-upload-labels:${context.user.id}`, {
      maxAttempts: 40,
      windowSeconds: 10 * 60,
    })
    return suggestUploadLabels({
      userId: context.user.id,
      fileName: data.fileName,
      purpose: data.purpose,
      knownTags: await loadUploadTagSuggestions(context.user.id, data.purpose),
    })
  })

export const loadUploadLibrary = (view: UploadView) =>
  libraryFn({ data: { view } })

export const suggestPomodoroUploadLabels = (
  fileName: string,
  purpose: PomodoroUploadPurpose
) => suggestFn({ data: { fileName, purpose } }).catch(() => null)

/** How far an upload has got: the bytes going out, then the server's check. */
export type UploadProgress =
  | { phase: "sending"; percent: number }
  | { phase: "checking" }

/**
 * A `fetch` that reports how much of the body has gone out.
 *
 * `fetch` cannot say how far an upload has got, and a 100 MB clip on slow wifi
 * needs a figure to tell slow from stuck. The server function still builds the
 * request and still reads the answer, so the address, the origin check, the
 * cookies and the error codes are exactly those of every other call; only the
 * wire under it changes.
 */
function fetchWithUploadProgress(
  onProgress: (progress: UploadProgress) => void,
  signal: AbortSignal
): typeof fetch {
  return (input, init) =>
    new Promise<Response>((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      // Cancel: the browser drops the connection, the server never gets the
      // whole body, and nothing is stored.
      if (signal.aborted) {
        reject(new DOMException("The upload was cancelled.", "AbortError"))
        return
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true })
      xhr.onabort = () =>
        reject(new DOMException("The upload was cancelled.", "AbortError"))
      xhr.open(init?.method ?? "POST", String(input))
      xhr.responseType = "blob"
      new Headers(init?.headers).forEach((value, name) =>
        xhr.setRequestHeader(name, value)
      )
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return
        onProgress({
          phase: "sending",
          percent: Math.min(100, Math.floor((event.loaded / event.total) * 100)),
        })
      }
      // Every byte is out, and the server is now reading and sniffing the file.
      xhr.upload.onload = () => onProgress({ phase: "checking" })
      xhr.onload = () => {
        const headers = new Headers()
        for (const line of xhr.getAllResponseHeaders().trim().split(/\r?\n/)) {
          const at = line.indexOf(":")
          if (at > 0) headers.append(line.slice(0, at), line.slice(at + 1).trim())
        }
        resolve(
          new Response(xhr.response as Blob, {
            status: xhr.status,
            statusText: xhr.statusText,
            headers,
          })
        )
      }
      // The same failure `fetch` gives when the network drops.
      xhr.onerror = () => reject(new TypeError("Failed to fetch"))
      xhr.send((init?.body ?? null) as XMLHttpRequestBodyInit | null)
    })
}

export const uploadPomodoroMedia = ({
  file,
  purpose,
  labels,
  onProgress,
  signal,
}: {
  file: File
  purpose: PomodoroUploadPurpose
  labels: {
    name: string
    tags: string[]
    shared: boolean
    trim: UploadTrim | null
  }
  onProgress: (progress: UploadProgress) => void
  /** Aborting it cancels the upload while the bytes are still going out. */
  signal: AbortSignal
}) => {
  const form = new FormData()
  form.append("file", file)
  form.append("purpose", purpose)
  form.append("labels", JSON.stringify(labels))
  return uploadFn({
    data: form,
    fetch: fetchWithUploadProgress(onProgress, signal),
  })
}

/** True for the error a cancelled upload rejects with. */
export function isUploadCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

/** Moves files to the 30-day bin. */
export const binPomodoroUploads = (mediaIds: string[]) =>
  binFn({ data: { mediaIds } })

/** Brings files back from the bin. */
export const restorePomodoroUploads = (mediaIds: string[]) =>
  restoreFn({ data: { mediaIds } })

/** Removes every file in the bin for good. */
export const emptyPomodoroBin = () => emptyBinFn()
