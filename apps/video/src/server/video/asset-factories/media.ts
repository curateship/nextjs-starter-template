import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { validateMediaContent, validateMediaFile } from "@/server/media/library"
import {
  deleteFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { now, uuid } from "@/server/auth/security"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

type GeneratedFileType = "image" | "video"

function extensionFor(mimeType: string) {
  if (mimeType === "image/jpeg") return "jpg"
  if (mimeType === "image/webp") return "webp"
  if (mimeType === "video/mp4") return "mp4"
  return "png"
}

/** Store generated work in the normal media library, with upload rollback. */
export async function saveGeneratedAsset(options: {
  userId: string
  bytes: Uint8Array
  mimeType: string
  fileType: GeneratedFileType
  name: string
}) {
  validateMediaFile(options.mimeType, options.bytes.byteLength)
  validateMediaContent(options.mimeType, options.bytes)

  const id = uuid()
  const extension = extensionFor(options.mimeType)
  const filename = `${id}.${extension}`
  const storagePath = `${options.userId}/${filename}`
  await uploadToR2(storagePath, options.bytes, options.mimeType)

  const at = now()
  const row = {
    id,
    // The site the person generating it is working in owns it, same as an upload.
    workspaceId: await workspaceIdForRequest(options.userId),
    userId: options.userId,
    filename,
    originalName: `${options.name.replace(/[^a-zA-Z0-9 ._-]+/g, "").trim() || "Generated asset"}.${extension}`,
    altText: options.fileType === "image" ? options.name : null,
    fileSize: options.bytes.byteLength,
    mimeType: options.mimeType,
    fileType: options.fileType,
    storagePath,
    createdAt: at,
    updatedAt: at,
  }

  try {
    await db.insert(customShellMedia).values(row)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }

  return { ...row, url: getPublicMediaUrl(storagePath) }
}

/** Roll back a file whose owning asset row could not be written. */
export async function discardGeneratedAsset(asset: {
  id: string
  storagePath: string
}) {
  await db.delete(customShellMedia).where(eq(customShellMedia.id, asset.id))
  await deleteFromR2(asset.storagePath).catch(() => undefined)
}
