/**
 * Sends a file to the bucket one piece at a time, straight from the browser.
 *
 * The file is cut with `File.slice`, which reads nothing until a piece is
 * sent, so a 5GB video never sits in memory on either side. Four pieces travel
 * at once. A piece that fails is sent again, up to three tries, before the
 * whole upload gives up.
 */

export type SentPart = { partNumber: number; etag: string }
export type PutPart = (
  url: string,
  body: Blob,
  onBytes: (sent: number) => void,
  signal: AbortSignal
) => Promise<string>

const PARALLEL_PARTS = 4
const TRIES_PER_PART = 3

/** What an upload throws when somebody cancelled it, so callers can stay quiet. */
export function uploadCancelledError() {
  return new DOMException("Upload cancelled", "AbortError")
}

export function isUploadCancelled(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError"
}

export async function sendFileInParts({
  file,
  partBytes,
  partCount,
  signPart,
  putPart = putPartWithXhr,
  onProgress,
  signal,
}: {
  file: Blob
  partBytes: number
  partCount: number
  signPart: (partNumber: number, size: number) => Promise<string>
  putPart?: PutPart
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}): Promise<SentPart[]> {
  // One controller for the whole file: cancelling, or one piece running out of
  // tries, stops every piece still in the air.
  const stop = new AbortController()
  const abortFromCaller = () => stop.abort()
  signal?.addEventListener("abort", abortFromCaller)

  const sentBytes = new Array<number>(partCount).fill(0)
  const sent: SentPart[] = []
  let nextIndex = 0
  // The piece that ran out of tries. The others then stop as cancelled, and
  // their errors would otherwise hide the real one.
  let failure: unknown

  function reportBytes(index: number, bytes: number) {
    sentBytes[index] = bytes
    const total = sentBytes.reduce((sum, value) => sum + value, 0)
    onProgress?.(Math.min(1, total / file.size))
  }

  async function sendPiece(index: number) {
    const partNumber = index + 1
    const body = file.slice(index * partBytes, (index + 1) * partBytes)

    for (let attempt = 1; ; attempt += 1) {
      if (stop.signal.aborted) throw uploadCancelledError()
      try {
        // Signed per try, so a piece retried after a long stall never goes
        // to an address that has run out. The address is good for exactly
        // this piece's size.
        const url = await signPart(partNumber, body.size)
        if (stop.signal.aborted) throw uploadCancelledError()
        const etag = await putPart(
          url,
          body,
          (bytes) => reportBytes(index, bytes),
          stop.signal
        )
        reportBytes(index, body.size)
        sent.push({ partNumber, etag })
        return
      } catch (error) {
        reportBytes(index, 0)
        if (stop.signal.aborted || isUploadCancelled(error)) {
          throw uploadCancelledError()
        }
        if (attempt >= TRIES_PER_PART) {
          failure ??= error
          stop.abort()
          throw error
        }
      }
    }
  }

  async function worker() {
    while (nextIndex < partCount) {
      const index = nextIndex
      nextIndex += 1
      await sendPiece(index)
    }
  }

  try {
    if (signal?.aborted) throw uploadCancelledError()
    onProgress?.(0)
    const workers = Array.from(
      { length: Math.min(PARALLEL_PARTS, partCount) },
      worker
    )
    await Promise.allSettled(workers)
    if (signal?.aborted) throw uploadCancelledError()
    if (failure) throw failure
    return sent.sort((a, b) => a.partNumber - b.partNumber)
  } catch (error) {
    stop.abort()
    throw error
  } finally {
    signal?.removeEventListener("abort", abortFromCaller)
  }
}

/**
 * One piece over XMLHttpRequest rather than `fetch`, because only XHR reports
 * how many bytes of a request body have gone, which is what moves the number.
 * The bucket hands back the piece's ETag, which the server needs to join the
 * pieces; the bucket's CORS rule has to expose that header for this to read it.
 */
const putPartWithXhr: PutPart = (url, body, onBytes, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(uploadCancelledError())
      return
    }
    const request = new XMLHttpRequest()
    request.open("PUT", url)
    request.upload.onprogress = (event) => onBytes(event.loaded)
    request.onload = () => {
      const etag = request.getResponseHeader("ETag")
      if (request.status >= 200 && request.status < 300 && etag) {
        resolve(etag)
        return
      }
      reject(new Error(bucketRefusalMessage(request.status, Boolean(etag))))
    }
    request.onerror = () => reject(new Error(bucketRefusalMessage(0, false)))
    request.onabort = () => reject(uploadCancelledError())
    const abort = () => request.abort()
    signal.addEventListener("abort", abort)
    request.onloadend = () => signal.removeEventListener("abort", abort)
    request.send(body)
  })

function bucketRefusalMessage(status: number, hadEtag: boolean) {
  // A browser blocked by a missing CORS rule sees status 0, the same as a
  // dropped connection, and a rule without ExposeHeaders lets the piece land
  // but hides its ETag. Both are a bucket setting, so both say where to look.
  if (status === 0 || (status < 300 && !hadEtag)) {
    return "Upload failed. The connection dropped, or the storage bucket does not accept uploads from this site yet. An admin can check the bucket's CORS rule in Cloudflare."
  }
  return `Upload failed. The storage bucket answered ${status}.`
}
