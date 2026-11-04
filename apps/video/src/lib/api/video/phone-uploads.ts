import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { sendFileInParts } from "@/lib/media/upload-in-parts"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { R2StorageNotConfiguredError } from "@/server/media/storage"
import {
  finishVideoUpload,
  signVideoUploadPart,
  startVideoUpload,
} from "@/server/media/video-upload"
import { VIDEO_TYPES } from "@/server/media/library"
import { attachMediaToScope } from "@/server/video/media-list"
import { editorGet, editorPost } from "@/server/video/editor-guards"
import { PHONE_ENDED, phoneGet, phoneOpen, phonePost } from "@/server/video/phone-guards"
import {
  countPhoneFile,
  createPhoneLink,
  endPhoneLink,
  openPhoneLink,
  phoneLinkStatus,
  setPhoneCookie,
  type PhoneLinkRefusal,
} from "@/server/video/phone-uploads"
import { signedInActor } from "@/server/video/project-guests"
import { storeProjectFile } from "@/server/video/project-uploads"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Sending files to a video project from a phone (workspace/docs/phone-uploads.md).
 * The editor makes the link and watches it; the phone's page opens it and
 * sends files. A guest sent from Project has no media library of the owner's
 * to offer, so making a link is the owner's alone.
 */

const STORAGE_NOT_SET_UP = "File storage is not set up, so files can't be added yet."
const UPLOAD_RATE_LIMIT = { maxAttempts: 60, windowSeconds: 10 * 60 }

export function getPhoneUploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (message.includes(PHONE_ENDED)) {
    return "This phone's time to send files has ended. Scan a new code from the editor."
  }
  if (message.includes("RATE_LIMITED")) return "That's a lot of files at once. Wait a few minutes and try again."
  if (message === STORAGE_NOT_SET_UP || message.startsWith("File") || message.startsWith("Only")) {
    return message
  }
  return "That file didn't arrive. Try it again."
}

// --- The editor's side ---------------------------------------------------------

const makeLinkFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    const link = await createPhoneLink(signedInActor(context.caller).userId, data.projectId)
    return { id: link.id, token: link.token, expires_at: link.expiresAt.toISOString() }
  })

const linkStatusFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ linkId: z.string().min(1).max(36) }))
  .handler(({ data, context }) => phoneLinkStatus(signedInActor(context.caller).userId, data.linkId))

const endLinkFn = createServerFn({ method: "POST" })
  .middleware([editorPost])
  .inputValidator(z.object({ linkId: z.string().min(1).max(36) }))
  .handler(({ data, context }) => endPhoneLink(signedInActor(context.caller).userId, data.linkId))

/** Stops a link: the code stops opening and its phone stops sending. */
export function stopPhoneLink(linkId: string) {
  return endLinkFn({ data: { linkId } })
}

/** A new phone link for this project, as its id and its secret for the QR code. */
export function makePhoneLink(projectId: string) {
  return makeLinkFn({ data: { projectId } })
}

/** Whether the link has been scanned yet, and how many files have come through it. */
export function readPhoneLinkStatus(linkId: string) {
  return linkStatusFn({ data: { linkId } })
}

// --- The phone's side ----------------------------------------------------------

export type PhoneView = { project_name: string } | { refused: PhoneLinkRefusal }

const openFn = createServerFn({ method: "POST" })
  .middleware([phoneOpen])
  .inputValidator(z.object({ token: z.string().max(200) }))
  .handler(async ({ data }): Promise<PhoneView> => {
    const opened = await openPhoneLink(data.token)
    if ("refused" in opened) return opened
    setPhoneCookie(opened.session)
    return { project_name: opened.projectName }
  })

const sessionFn = createServerFn({ method: "GET" })
  .middleware([phoneGet])
  .handler(async ({ context }) => (context.phone ? { signed_in: true } : { signed_in: false }))

const pictureFn = createServerFn({ method: "POST" })
  .middleware([phonePost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const file = data.get("file")
    if (!(file instanceof File)) throw new Error("File is required")
    return { file }
  })
  .handler(async ({ data, context }) => {
    // Only pictures go in one request; a video is sent in pieces below.
    if (!data.file.type.startsWith("image/")) throw new Error("Only pictures and videos can be sent")
    const media = await storeProjectFile(context.phone.userId, context.phone.projectId, data.file)
    await countPhoneFile(context.phone.id)
    return { id: media.id }
  })

const videoStartFn = createServerFn({ method: "POST" })
  .middleware([phonePost])
  .inputValidator(
    z.object({
      name: z.string().max(1000),
      mimeType: z.string().max(200),
      size: z.number().int().nonnegative(),
    })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`media-upload:${context.phone.userId}`, UPLOAD_RATE_LIMIT)
    if (!VIDEO_TYPES.has(data.mimeType)) throw new Error("Only pictures and videos can be sent")
    try {
      return await startVideoUpload({ userId: context.phone.userId, ...data })
    } catch (error) {
      if (error instanceof R2StorageNotConfiguredError) throw new Error(STORAGE_NOT_SET_UP)
      throw error
    }
  })

const uploadKey = z.object({
  storagePath: z.string().min(1).max(600),
  uploadId: z.string().min(1).max(1024),
  fileSize: z.number().int().positive(),
})

const videoSignFn = createServerFn({ method: "POST" })
  .middleware([phonePost])
  .inputValidator(uploadKey.extend({ partNumber: z.number().int(), size: z.number().int() }))
  .handler(({ data, context }) => signVideoUploadPart({ userId: context.phone.userId, ...data }))

const videoFinishFn = createServerFn({ method: "POST" })
  .middleware([phonePost])
  .inputValidator(
    uploadKey.extend({
      parts: z
        .array(z.object({ partNumber: z.number().int().min(1), etag: z.string().min(1).max(200) }))
        .min(1)
        .max(10000),
      originalName: z.string().max(1000),
    })
  )
  .handler(async ({ data, context }) => {
    const { userId, projectId } = context.phone
    const media = await finishVideoUpload({
      userId,
      workspaceId: await workspaceIdForRequest(userId),
      ...data,
    })
    await attachMediaToScope(userId, { type: "project", id: projectId }, media.id)
    await countPhoneFile(context.phone.id)
    return { id: media.id }
  })

/** Opens the link's secret on the phone, signing the phone in for two hours. */
export function openPhoneUpload(token: string) {
  return openFn({ data: { token } })
}

/** Whether this phone is still signed in to send files. */
export function readPhoneSession() {
  return sessionFn()
}

/**
 * Sends one file from the phone into the project: a picture in one request,
 * a video in pieces straight to storage, as any big upload goes.
 */
export async function sendPhoneFile(
  file: File,
  { onProgress, signal }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
) {
  if (!file.type.startsWith("video/")) {
    const form = new FormData()
    form.set("file", file)
    const sent = await pictureFn({ data: form })
    onProgress?.(1)
    return sent
  }
  const ticket = await videoStartFn({
    data: { name: file.name, mimeType: file.type, size: file.size },
  })
  const key = { storagePath: ticket.storagePath, uploadId: ticket.uploadId, fileSize: ticket.fileSize }
  const parts = await sendFileInParts({
    file,
    partBytes: ticket.partBytes,
    partCount: ticket.partCount,
    signPart: (partNumber, size) => videoSignFn({ data: { ...key, partNumber, size } }),
    onProgress,
    signal,
  })
  return videoFinishFn({ data: { ...key, parts, originalName: file.name } })
}
