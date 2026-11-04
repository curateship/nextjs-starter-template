import {
  abortMultipartUpload,
  completeMultipartUpload,
  deleteFromR2,
  signUploadPart,
  startMultipartUpload,
  uploadToR2,
} from "@/server/media/storage"

/**
 * Where the Archive keeps its files: Promo's own bucket, the same one the
 * media library uses, under `promo/archive/<person>/<item>/`. Written as a
 * small interface so the copying can be tested without a bucket.
 */
export type ArchiveStore = {
  put(path: string, bytes: Uint8Array<ArrayBuffer>, mimeType: string): Promise<void>
  startPieces(path: string, mimeType: string): Promise<string>
  /** Sends one piece and answers its ETag. */
  putPiece(path: string, uploadId: string, partNumber: number, bytes: Uint8Array<ArrayBuffer>): Promise<string>
  finishPieces(path: string, uploadId: string, parts: { partNumber: number; etag: string }[]): Promise<void>
  dropPieces(path: string, uploadId: string): Promise<void>
  remove(path: string): Promise<void>
}

export const bucketStore: ArchiveStore = {
  put: (path, bytes, mimeType) => uploadToR2(path, bytes, mimeType),
  startPieces: (path, mimeType) => startMultipartUpload(path, mimeType),
  async putPiece(path, uploadId, partNumber, bytes) {
    const address = await signUploadPart(path, uploadId, partNumber, bytes.byteLength)
    const response = await fetch(address, {
      method: "PUT",
      headers: { "content-length": String(bytes.byteLength) },
      body: bytes,
    })
    const etag = response.headers.get("etag")
    if (!response.ok || !etag) throw new Error(`The storage bucket refused a piece (${response.status}).`)
    return etag
  },
  finishPieces: (path, uploadId, parts) => completeMultipartUpload(path, uploadId, parts),
  dropPieces: (path, uploadId) => abortMultipartUpload(path, uploadId),
  remove: (path) => deleteFromR2(path),
}

/**
 * The size of every piece but the last. R2 wants all the pieces before the
 * last to be one size, and at least 5MB.
 */
export const PIECE_BYTES = 16 * 1024 * 1024

/**
 * Copies one file from an address into the bucket as it downloads, holding
 * at most one piece in memory. A file under one piece goes up whole. Answers
 * how many bytes were stored. Throws, with nothing left behind, when the
 * download breaks, runs past `maxBytes`, or comes out a different size than
 * `expectedBytes` said.
 */
export async function copyIntoStore(
  source: { url: string; mimeType: string; expectedBytes: number },
  path: string,
  {
    store,
    fetchImpl,
    maxBytes,
    timeoutMs,
  }: { store: ArchiveStore; fetchImpl: typeof fetch; maxBytes: number; timeoutMs: number }
): Promise<number> {
  const response = await fetchImpl(source.url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) }).catch(() => {
    throw new Error("Video could not be reached for the file.")
  })
  if (!response.ok || !response.body) throw new Error(`Video answered ${response.status} for the file.`)
  const reader = response.body.getReader()

  // What has downloaded but not gone up yet, kept as the chunks it came in,
  // so a big file never copies its whole tail on every chunk.
  const chunks: Uint8Array[] = []
  let heldBytes = 0
  let total = 0

  /** The first `n` held bytes as one piece, taken off the front. */
  function take(n: number): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(n)
    let at = 0
    while (at < n) {
      const chunk = chunks[0]
      const need = n - at
      if (chunk.byteLength <= need) {
        out.set(chunk, at)
        at += chunk.byteLength
        chunks.shift()
      } else {
        out.set(chunk.subarray(0, need), at)
        chunks[0] = chunk.subarray(need)
        at += need
      }
    }
    heldBytes -= n
    return out
  }

  // Kept in one object because the pieces are opened inside `sendPiece`.
  const pieces: { uploadId: string | null; parts: { partNumber: number; etag: string }[] } = { uploadId: null, parts: [] }

  async function sendPiece(bytes: Uint8Array<ArrayBuffer>) {
    pieces.uploadId ??= await store.startPieces(path, source.mimeType)
    const partNumber = pieces.parts.length + 1
    pieces.parts.push({ partNumber, etag: await store.putPiece(path, pieces.uploadId, partNumber, bytes) })
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (value?.byteLength) {
        total += value.byteLength
        if (total > maxBytes) throw new Error("The file is bigger than Promo keeps.")
        chunks.push(value)
        heldBytes += value.byteLength
        // One whole piece goes up, and at least one more stays behind, so
        // the last piece is never empty and never the only one too small.
        while (heldBytes >= PIECE_BYTES * 2) await sendPiece(take(PIECE_BYTES))
      }
      if (done) break
    }
    if (source.expectedBytes > 0 && total !== source.expectedBytes) {
      throw new Error("The file arrived incomplete.")
    }
    if (!pieces.uploadId && heldBytes <= PIECE_BYTES) {
      await store.put(path, take(heldBytes), source.mimeType)
      return total
    }
    if (heldBytes > PIECE_BYTES) await sendPiece(take(PIECE_BYTES))
    await sendPiece(take(heldBytes))
    if (!pieces.uploadId) throw new Error("The storage bucket did not open the upload.")
    await store.finishPieces(path, pieces.uploadId, pieces.parts)
    return total
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    if (pieces.uploadId) await store.dropPieces(path, pieces.uploadId).catch(() => undefined)
    throw error
  }
}
