import {
  videoMaxBytes,
  videoUploadPartBytes,
  videoUploadPartCount,
  videoUploadPieceBytes,
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
  listUploadedParts,
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
  /** The size the browser said the file is, which every later step repeats. */
  fileSize: number
  partBytes: number
  partCount: number
}

/** What the browser hears when an upload it remembers can no longer go on. */
export const UPLOAD_GONE_MESSAGE =
  "That upload can no longer carry on. It starts again from the beginning."

function ticketFor(storagePath: string, uploadId: string, fileSize: number) {
  return {
    storagePath,
    uploadId,
    fileSize,
    partBytes: videoUploadPartBytes(fileSize),
    partCount: videoUploadPartCount(fileSize),
  }
}

/**
 * The file size every step after the start is told again. Nothing stores it
 * between steps, so each step checks it against the app's ceiling: a size
 * stated wrongly can only ever get pieces for a file up to the ceiling, which
 * stating the ceiling honestly at the start would get anyway.
 */
function assertStatedSize(fileSize: number) {
  if (!Number.isInteger(fileSize) || fileSize < 1 || fileSize > videoMaxBytes()) {
    throw new Error("Upload piece out of range")
  }
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

  return ticketFor(storagePath, uploadId, size)
}

/**
 * Picks an unfinished upload back up after a closed tab, a refresh or a
 * dropped connection. The browser remembers the key; the bucket says which
 * pieces it already holds, so the browser's own memory of them counts for
 * nothing. A piece of the wrong size is left out and sent again.
 */
export async function resumeVideoUpload({
  userId,
  storagePath,
  uploadId,
  fileSize,
}: {
  userId: string
  storagePath: string
  uploadId: string
  fileSize: number
}) {
  assertOwnUploadKey(userId, storagePath)
  assertStatedSize(fileSize)
  const ticket = ticketFor(storagePath, uploadId, fileSize)
  let held: Awaited<ReturnType<typeof listUploadedParts>>
  try {
    held = await listUploadedParts(storagePath, uploadId)
  } catch (error) {
    if (error instanceof R2StorageNotConfiguredError) throw error
    throw new Error(UPLOAD_GONE_MESSAGE)
  }
  const parts = held
    .filter(
      (part) =>
        part.partNumber <= ticket.partCount &&
        part.size === videoUploadPieceBytes(fileSize, part.partNumber)
    )
    .map(({ partNumber, etag }) => ({ partNumber, etag }))
  return { ticket, parts }
}

/**
 * The address for one piece, good only for a piece of exactly the size that
 * piece of the stated file holds. Signing only the pieces the stated size
 * needs, each at its exact size, caps what one upload can put in the bucket
 * at the app's ceiling, even for somebody who never finishes it.
 */
export async function signVideoUploadPart({
  userId,
  storagePath,
  uploadId,
  fileSize,
  partNumber,
  size,
}: {
  userId: string
  storagePath: string
  uploadId: string
  fileSize: number
  partNumber: number
  size: number
}) {
  assertOwnUploadKey(userId, storagePath)
  assertStatedSize(fileSize)
  if (
    !Number.isInteger(partNumber) ||
    partNumber < 1 ||
    partNumber > videoUploadPartCount(fileSize) ||
    size !== videoUploadPieceBytes(fileSize, partNumber)
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
    fileSize,
    parts,
    originalName,
    altText,
  }: {
    userId: string
    workspaceId: string
    storagePath: string
    uploadId: string
    fileSize: number
    parts: { partNumber: number; etag: string }[]
    originalName: string
    altText?: string
  },
  database: CustomShellDb = db
) {
  assertOwnUploadKey(userId, storagePath)
  assertStatedSize(fileSize)
  await completeMultipartUpload(storagePath, uploadId, parts)

  try {
    const { size, contentType } = await describeR2Object(storagePath)
    if (!VIDEO_TYPES.has(contentType)) {
      throw new Error("Only videos upload in pieces.")
    }
    validateMediaFile(contentType, size)
    if (size !== fileSize) {
      throw new Error("Upload failed. The file that arrived is not the size that was sent.")
    }

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
