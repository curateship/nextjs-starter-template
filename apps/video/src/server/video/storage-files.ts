import { createWriteStream } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"

import { getFromR2 } from "@/server/media/storage"

/**
 * Getting a stored file onto disk, which both the background builders and the
 * renderer need before they can hand it to ffmpeg.
 *
 * It streams rather than reading the whole thing into memory: a source video
 * can be hundreds of megabytes, and several of them are pulled down for one
 * export.
 */

export async function downloadToFile(storagePath: string, filePath: string) {
  const object = await getFromR2(storagePath)
  if (!object.Body) {
    throw new Error("Stored file has no content")
  }
  await pipeline(
    bodyToReadable(object.Body),
    // `wx` refuses to overwrite: every caller writes to a name it just made up,
    // so a clash would mean two jobs sharing a scratch directory.
    createWriteStream(filePath, { flags: "wx" })
  )
}

function bodyToReadable(body: unknown): Readable {
  if (body instanceof Readable) return body
  if (body instanceof Uint8Array) return Readable.from([body])
  const stream = (
    body as { transformToWebStream?: () => ReadableStream }
  ).transformToWebStream?.()
  if (stream) return Readable.fromWeb(stream as never)
  throw new Error("Failed to read stored file")
}
