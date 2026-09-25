import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import { loadAccountStorage } from "@/server/media/library"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  assertCanUpload,
  deletePomodoroUpload,
  listPomodoroUploads,
  storePomodoroUpload,
  validatePomodoroUpload,
  validateUploadContentLength,
  type StoredUpload,
} from "@/server/pomodoro/media-uploads"
import {
  UPLOAD_LIMIT_BYTES,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"
import { formatBytes } from "@/lib/pomodoro/media-limits"

export type { StoredUpload }

/** What a member has uploaded for one picker, and how full their account is. */
export type UploadLibrary = {
  uploads: StoredUpload[]
  canUploadMedia: boolean
  usedBytes: number
  limitBytes: number
}

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
      "File storage is not set up yet, so uploads cannot be saved. Tell an operator.",
    RATE_LIMITED:
      "That is a lot of uploads at once. Please wait a few minutes and try again.",
  },
  "That upload did not work. Please try again."
)

const purposeSchema = z.enum(["background", "sound"])

const libraryFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ purpose: purposeSchema }))
  .handler(async ({ data, context }): Promise<UploadLibrary> => {
    const [uploads, entitlements, storage] = await Promise.all([
      listPomodoroUploads(context.user.id, data.purpose),
      loadPomodoroEntitlements(context.user.id),
      loadAccountStorage(context.user.id),
    ])
    return {
      uploads,
      canUploadMedia: entitlements.canUploadMedia,
      usedBytes: storage.bytes,
      limitBytes: entitlements.storageLimitBytes,
    }
  })

const uploadFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("INVALID_FILE_CONTENT")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error("INVALID_FILE_CONTENT")
    const purpose = purposeSchema.parse(data.get("purpose")?.toString())
    return { file, purpose }
  })
  .handler(async ({ data, context }): Promise<StoredUpload> => {
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

    try {
      return await storePomodoroUpload({
        userId: context.user.id,
        purpose: data.purpose,
        file: { name: data.file.name, size: bytes.byteLength },
        bytes,
        detected,
      })
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) {
        throw new Error("STORAGE_NOT_CONFIGURED")
      }
      throw error
    }
  })

const deleteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await deletePomodoroUpload(context.user.id, data.mediaId)
    return { deleted: data.mediaId }
  })

export const loadUploadLibrary = (purpose: PomodoroUploadPurpose) =>
  libraryFn({ data: { purpose } })

export const uploadPomodoroMedia = (
  file: File,
  purpose: PomodoroUploadPurpose
) => {
  const form = new FormData()
  form.append("file", file)
  form.append("purpose", purpose)
  return uploadFn({ data: form })
}

export const removePomodoroUpload = (mediaId: string) =>
  deleteFn({ data: { mediaId } })
