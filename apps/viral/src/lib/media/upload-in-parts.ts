/**
 * Sends a file to the bucket one piece at a time, straight from the browser.
 *
 * The file is cut with `File.slice`, which reads nothing until a piece is
 * sent, so a 100GB video never sits in memory on either side. Four pieces
 * travel at once. A piece that fails is sent again, up to three tries, before
 * the whole upload gives up. Pieces the bucket already holds, from an upload
 * picked back up, are skipped, and a pause lets the pieces in the air land
 * before stopping.
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

/**
 * What pauses an upload. While paused, no new piece starts; the ones already
 * in the air finish. `wait` settles once the upload may go on.
 */
export type PauseGate = {
  readonly paused: boolean
  pause: () => void
  resume: () => void
  wait: () => Promise<void>
}

export function createPauseGate(): PauseGate {
  let waiting: Promise<void> | null = null
  let release: (() => void) | null = null
  return {
    get paused() {
      return waiting !== null
    },
    pause() {
      if (waiting) return
      waiting = new Promise((resolve) => {
        release = resolve
      })
    },
    resume() {
      release?.()
      waiting = null
      release = null
    },
    wait: () => waiting ?? Promise.resolve(),
  }
}

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
  alreadySent = [],
  gate,
  retryDelayMs = 3000,
  onProgress,
  signal,
}: {
  file: Blob
  partBytes: number
  partCount: number
  signPart: (partNumber: number, size: number) => Promise<string>
  putPart?: PutPart
  /** Pieces the bucket already holds, which are not sent again. */
  alreadySent?: SentPart[]
  gate?: PauseGate
  /**
   * How long to wait before the second try of a piece, doubled before the
   * third, so a few seconds of dropped wifi do not end the whole upload.
   */
  retryDelayMs?: number
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}): Promise<SentPart[]> {
  // One controller for the whole file: cancelling, or one piece running out of
  // tries, stops every piece still in the air.
  const stop = new AbortController()
  const abortFromCaller = () => stop.abort()
  signal?.addEventListener("abort", abortFromCaller)

  const sentBytes = new Array<number>(partCount).fill(0)
  // Kept as a running sum: a 100GB file has 10,000 pieces, and adding them
  // all up on every progress event would be the slowest thing on the page.
  let totalSent = 0
  const held = new Set<number>()
  const sent: SentPart[] = []
  for (const part of alreadySent) {
    if (part.partNumber < 1 || part.partNumber > partCount) continue
    if (held.has(part.partNumber)) continue
    held.add(part.partNumber)
    sent.push(part)
    const index = part.partNumber - 1
    sentBytes[index] = Math.min(partBytes, file.size - index * partBytes)
    totalSent += sentBytes[index]
  }
  const waiting = Array.from({ length: partCount }, (_, index) => index).filter(
    (index) => !held.has(index + 1)
  )
  let nextIndex = 0
  // The piece that ran out of tries. The others then stop as cancelled, and
  // their errors would otherwise hide the real one.
  let failure: unknown

  function reportBytes(index: number, bytes: number) {
    totalSent += bytes - sentBytes[index]
    sentBytes[index] = bytes
    onProgress?.(Math.min(1, totalSent / file.size))
  }

  // A cancel while paused, or while waiting to try a piece again, has to end
  // the wait too, or the upload would sit there instead of stopping.
  const stopped = new Promise<void>((resolve) => {
    stop.signal.addEventListener("abort", () => resolve(), { once: true })
  })

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
        await Promise.race([
          new Promise((resolve) =>
            setTimeout(resolve, retryDelayMs * 2 ** (attempt - 1))
          ),
          stopped,
        ])
      }
    }
  }

  async function worker() {
    while (nextIndex < waiting.length) {
      if (gate?.paused) await Promise.race([gate.wait(), stopped])
      if (stop.signal.aborted) throw uploadCancelledError()
      if (nextIndex >= waiting.length) return
      const index = waiting[nextIndex]
      nextIndex += 1
      await sendPiece(index)
    }
  }

  try {
    if (signal?.aborted) throw uploadCancelledError()
    onProgress?.(Math.min(1, totalSent / file.size))
    const workers = Array.from(
      { length: Math.min(PARALLEL_PARTS, waiting.length) },
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
