import {
  VIDEO_UPLOAD_MAX_PARTS,
  VIDEO_UPLOAD_PART_BYTES,
  videoUploadPartCount,
} from "@/lib/media/media-upload"
import { db, type CustomShellDb } from "@/server/db"
import {
  cleanAltText,
  cleanOriginalName,
  getMediaFileType,
  serializeMedia,
  storedFilename,
  validateMediaContent,
  validateMediaFile,
  VIDEO_TYPES,
} from "@/server/media/library"
import {
  abortMultipartUpload,
  completeMultipartUpload,
  deleteFromR2,
  describeR2Object,
  getFromR2,
  getPublicMediaUrl,
  R2StorageNotConfiguredError,
  signUploadPart,
  startMultipartUpload,
} from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

// A video goes from the browser straight to the bucket in pieces, so this
// server never holds the file. It only opens the upload, signs an address for
// each piece, and at the end checks what arrived before a library row points
// at it. docs/shell/big-uploads.md explains the whole journey.

export type VideoUploadTicket = {
  storagePath: string
  uploadId: string
  partBytes: number
  partCount: number
}

/**
 * Every later step names its upload by key, so the key is checked against the
 * person asking. A key is the owner's id and one file name, exactly the shape
 * `startVideoUpload` makes, which keeps anyone from finishing or cancelling
 * somebody else's upload or writing into a folder such as `favicons/`.
 */
function assertOwnUploadKey(userId: string, storagePath: string) {
  const [owner, filename, ...rest] = storagePath.split("/")
  if (owner !== userId || !filename || rest.length) {
    throw new Error("Upload not found")
  }
}

export async function startVideoUpload({
  userId,
  name,
  mimeType,
  size,
}: {
  userId: string
  name: string
  mimeType: string
  size: number
}): Promise<VideoUploadTicket> {
  if (!VIDEO_TYPES.has(mimeType)) {
    throw new Error("Only videos upload in pieces.")
  }
  if (size <= 0) {
    throw new Error("File is empty")
  }
  validateMediaFile(mimeType, size)

  const filename = storedFilename(cleanOriginalName(name), mimeType)
  const storagePath = `${userId}/${filename}`
  // Library records hand this address to browsers, so refuse before any byte
  // moves if direct public delivery is not configured.
  await getPublicMediaUrl(storagePath)
  let uploadId: string
  try {
    uploadId = await startMultipartUpload(storagePath, mimeType)
  } catch (error) {
    // The bucket's own wording can name the account or the key, and a member
    // has no use for either. The one-request upload says the same.
    if (error instanceof R2StorageNotConfiguredError) throw error
    throw new Error("Upload failed")
  }

  return {
    storagePath,
    uploadId,
    partBytes: VIDEO_UPLOAD_PART_BYTES,
    partCount: videoUploadPartCount(size),
  }
}

/**
 * The address for one piece, good only for a piece of exactly `size` bytes.
 * Capping each piece at the piece size, and the count at the most pieces a
 * 5GB file needs, caps what one upload can put in the bucket at the ceiling,
 * even for somebody who never finishes it.
 */
export async function signVideoUploadPart({
  userId,
  storagePath,
  uploadId,
  partNumber,
  size,
}: {
  userId: string
  storagePath: string
  uploadId: string
  partNumber: number
  size: number
}) {
  assertOwnUploadKey(userId, storagePath)
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > VIDEO_UPLOAD_MAX_PARTS ||
    !Number.isInteger(size) ||
    size < 1 ||
    size > VIDEO_UPLOAD_PART_BYTES
  ) {
    throw new Error("Upload piece out of range")
  }
  return signUploadPart(storagePath, uploadId, partNumber, size)
}

/**
 * Joins the pieces, then checks the joined file the same way a one-request
 * upload is checked: its type, its size and its first bytes. The browser's
 * word counts for nothing here, because every piece went past this server.
 * A file that fails, or a row that will not save, takes the file with it, so
 * the bucket never keeps a file no row points at.
 */
export async function finishVideoUpload(
  {
    userId,
    workspaceId,
    storagePath,
    uploadId,
    parts,
    originalName,
    altText,
  }: {
    userId: string
    workspaceId: string
    storagePath: string
    uploadId: string
    parts: { partNumber: number; etag: string }[]
    originalName: string
    altText?: string
  },
  database: CustomShellDb = db
) {
  assertOwnUploadKey(userId, storagePath)
  await completeMultipartUpload(storagePath, uploadId, parts)

  try {
    const { size, contentType } = await describeR2Object(storagePath)
    if (!VIDEO_TYPES.has(contentType)) {
      throw new Error("Only videos upload in pieces.")
    }
    validateMediaFile(contentType, size)

    const head = await getFromR2(storagePath, "bytes=0-15")
    const firstBytes = await head.Body?.transformToByteArray()
    validateMediaContent(contentType, firstBytes ?? new Uint8Array())

    const createdAt = now()
    const row = {
      id: uuid(),
      workspaceId,
      userId,
      filename: storagePath.slice(userId.length + 1),
      originalName: cleanOriginalName(originalName),
      altText: cleanAltText(altText),
      fileSize: size,
      mimeType: contentType,
      fileType: getMediaFileType(contentType),
      storagePath,
      emailProtectedAt: null,
      createdAt,
      updatedAt: createdAt,
    }
    await database.insert(customShellMedia).values(row)
    return serializeMedia(row)
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
}

export async function cancelVideoUpload({
  userId,
  storagePath,
  uploadId,
}: {
  userId: string
  storagePath: string
  uploadId: string
}) {
  assertOwnUploadKey(userId, storagePath)
  await abortMultipartUpload(storagePath, uploadId)
}
