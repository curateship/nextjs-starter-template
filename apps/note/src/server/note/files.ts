import { createWriteStream } from "node:fs"
import { open, readFile, stat } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import type { ReadableStream as WebReadableStream } from "node:stream/web"

import { eq } from "drizzle-orm"

import { VIDEO_UPLOAD_PART_BYTES } from "@/lib/media/media-upload"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { AUDIO_TYPES, validateMediaContent, VIDEO_TYPES } from "@/server/media/library"
import {
  abortMultipartUpload,
  completeMultipartUpload,
  deleteFromR2,
  getFromR2,
  signUploadPart,
  startMultipartUpload,
  uploadToR2,
} from "@/server/media/storage"
import { customShellMedia } from "@/server/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"
import { readDurationSeconds, runFfmpeg } from "@/server/note/ffmpeg"
import { SayableError } from "@/server/note/sayable"
import type { MediaKind } from "@/lib/note/library/notes"

/**
 * Moving a saved video's file between this machine and the bucket.
 *
 * A video can be 500MB, so it is never read into memory whole: it goes up to
 * the bucket ten megabytes at a time, through the same signed piece addresses
 * the browser's own uploads use, and comes back down as a stream into a file.
 */

const EXTENSION_FOR: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/x-matroska": "mkv",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
}

/** How often one piece is tried before the whole file is given up on. */
const TRIES_PER_PIECE = 3

export type StoredFile = { id: string; storagePath: string }

/**
 * Puts a file the worker made into the person's media library: the bucket
 * first, in pieces, then the library row the shell's own uploads write. A row
 * that will not save takes the file with it, so the bucket never keeps a file
 * nothing points at.
 */
export async function storeFile(options: {
  ownerId: string
  filePath: string
  mimeType: string
  kind: MediaKind
  name: string
}): Promise<StoredFile> {
  const { ownerId, filePath, mimeType, kind } = options
  const allowed = kind === "audio" ? AUDIO_TYPES : VIDEO_TYPES
  if (!allowed.has(mimeType)) {
    throw new SayableError("The video came back in a format the library cannot hold.")
  }
  if (kind === "video") {
    // The same first-bytes check the shell runs on an upload. The shell has
    // no such check for sound, so a sound file is taken on yt-dlp's word.
    const handle = await open(filePath, "r")
    try {
      const head = Buffer.alloc(16)
      await handle.read(head, 0, 16, 0)
      validateMediaContent(mimeType, head)
    } catch {
      throw new SayableError("The video came back in a format the library cannot hold.")
    } finally {
      await handle.close()
    }
  }

  const id = uuid()
  const filename = `${id}.${EXTENSION_FOR[mimeType] ?? "bin"}`
  // `<owner>/<file>` is the shape the shell's library and its orphan check
  // recognise as somebody's own upload.
  const storagePath = `${ownerId}/${filename}`
  const { size } = await stat(filePath)
  await uploadFileInParts(storagePath, filePath, mimeType)

  const at = now()
  try {
    await db.insert(customShellMedia).values({
      id,
      workspaceId: await workspaceIdForRequest(ownerId),
      userId: ownerId,
      filename,
      originalName: `${cleanName(options.name)}.${EXTENSION_FOR[mimeType] ?? "bin"}`,
      altText: null,
      fileSize: size,
      mimeType,
      fileType: kind,
      storagePath,
      // The shell sets this only once a newsletter has carried the file.
      emailProtectedAt: null,
      createdAt: at,
      updatedAt: at,
    })
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }
  return { id, storagePath }
}

function cleanName(name: string) {
  return name.replace(/[^a-zA-Z0-9 ._-]+/g, "").trim().slice(0, 200) || "Saved video"
}

/** Removes a stored file and its library row. Never throws. */
export async function discardFile(file: StoredFile): Promise<void> {
  try {
    await deleteFromR2(file.storagePath)
    await db.delete(customShellMedia).where(eq(customShellMedia.id, file.id))
  } catch (error) {
    console.error("A saved video's file was not cleared away", file.id, error)
  }
}

/**
 * Sends a file on this machine to the bucket ten megabytes at a time. Each
 * piece is signed and sent the way the browser sends an upload's pieces, and
 * a failure throws away whatever pieces had arrived.
 */
export async function uploadFileInParts(
  storagePath: string,
  filePath: string,
  mimeType: string
): Promise<void> {
  const { size } = await stat(filePath)
  if (!size) throw new SayableError("The video came back empty.")

  const uploadId = await startMultipartUpload(storagePath, mimeType)
  const handle = await open(filePath, "r")
  try {
    const parts: { partNumber: number; etag: string }[] = []
    for (let offset = 0, partNumber = 1; offset < size; offset += VIDEO_UPLOAD_PART_BYTES, partNumber += 1) {
      const length = Math.min(VIDEO_UPLOAD_PART_BYTES, size - offset)
      const piece = new Uint8Array(length)
      await handle.read(piece, 0, length, offset)
      parts.push({
        partNumber,
        etag: await sendPiece(storagePath, uploadId, partNumber, piece),
      })
    }
    await completeMultipartUpload(storagePath, uploadId, parts)
  } catch (error) {
    await abortMultipartUpload(storagePath, uploadId).catch(() => undefined)
    throw error
  } finally {
    await handle.close()
  }
}

async function sendPiece(
  storagePath: string,
  uploadId: string,
  partNumber: number,
  piece: Uint8Array<ArrayBuffer>
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      // Signed per try, so a piece sent again after a stall never goes to an
      // address that has run out.
      const url = await signUploadPart(storagePath, uploadId, partNumber, piece.byteLength)
      const response = await fetch(url, { method: "PUT", body: piece })
      const etag = response.headers.get("etag")
      await response.arrayBuffer().catch(() => undefined)
      if (response.ok && etag) return etag
      throw new Error(`The storage bucket answered ${response.status}.`)
    } catch (error) {
      if (attempt >= TRIES_PER_PIECE) {
        console.error("A saved video's piece was not stored", storagePath, partNumber, error)
        throw new SayableError("The video could not be stored. Try again in a moment.")
      }
    }
  }
}

/** Streams a stored file down to a file on this machine. */
export async function downloadToFile(storagePath: string, filePath: string) {
  const object = await getFromR2(storagePath)
  const body = object.Body
  if (!body) throw new SayableError("The stored video could not be read.")
  // On Node the SDK hands back a Node stream; anything else is read as a web one.
  const stream =
    body instanceof Readable
      ? body
      : Readable.fromWeb(body.transformToWebStream() as WebReadableStream<Uint8Array>)
  await pipeline(stream, createWriteStream(filePath))
}

export type FileLook = {
  /** Where the cover picture went, or null for sound or a frame that would not come. */
  coverStoragePath: string | null
  durationSeconds: number | null
}

/**
 * One frame from a second in as the cover, at `note-covers/<owner>/<id>.jpg`,
 * and the length ffmpeg reads off the file on the way. Sound has no frame, so
 * only its length is read. A cover that will not come is not worth failing a
 * video over, so that half never throws.
 */
export async function lookAtFile(options: {
  ownerId: string
  noteId: string
  filePath: string
  kind: MediaKind
}): Promise<FileLook> {
  const { ownerId, noteId, filePath, kind } = options
  if (kind === "audio") {
    const said = await runFfmpeg(
      ["-i", filePath, "-t", "0", "-f", "null", "-"],
      "This file could not be read."
    )
    return { coverStoragePath: null, durationSeconds: readDurationSeconds(said) }
  }

  const coverPath = path.join(path.dirname(filePath), `cover-${noteId}.jpg`)
  let said = ""
  for (const at of ["1", "0"]) {
    try {
      said = await runFfmpeg(
        [
          "-ss",
          at,
          "-i",
          filePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=640:640:force_original_aspect_ratio=decrease:force_divisible_by=2",
          coverPath,
        ],
        "The cover frame could not be made."
      )
      const cover = await readFile(coverPath)
      if (!cover.byteLength) continue
      const storagePath = `note-covers/${ownerId}/${noteId}.jpg`
      await uploadToR2(storagePath, new Uint8Array(cover), "image/jpeg")
      return { coverStoragePath: storagePath, durationSeconds: readDurationSeconds(said) }
    } catch (error) {
      // A video shorter than a second has no frame at 1, so 0 is tried next.
      console.error("A saved video's cover was not made", noteId, at, error)
    }
  }
  return { coverStoragePath: null, durationSeconds: readDurationSeconds(said) }
}

/**
 * The sound of a file as a small mono mp3: 48kbps at 16kHz, which is about
 * 11MB for thirty minutes and fits inside one Gemini request. Hands back the
 * length ffmpeg read off the file too.
 */
export async function extractSound(
  sourcePath: string,
  soundPath: string
): Promise<number | null> {
  const said = await runFfmpeg(
    ["-i", sourcePath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", soundPath],
    "The sound could not be taken out of the video."
  )
  return readDurationSeconds(said)
}
