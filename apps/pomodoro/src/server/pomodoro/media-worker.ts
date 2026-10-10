import { deleteFromR2, getFromR2, uploadToR2 } from "@/server/media/storage"
import {
  claimNextUploadJob,
  failUploadJob,
  findVideoWithoutStill,
  finishUploadJob,
  loadJobFile,
  markUploadReady,
  saveUploadStill,
  stillStoragePath,
} from "@/server/pomodoro/media-uploads"
import {
  FfmpegMissingError,
  TrimOutsideFileError,
  extractMiddleFrame,
  transcodeUpload,
} from "@/server/pomodoro/media-transcode"
import { purgeExpiredBin } from "@/server/pomodoro/upload-bin"
import { drainBucketDeletions } from "@/server/pomodoro/bucket-cleanup"
import { checkStorageWarning } from "@/server/pomodoro/storage-warning"
import { storedFilename } from "@/server/media/library"

/**
 * One re-encode per pass of the shell's fifteen-second loop.
 *
 * One, not all of them: FFmpeg is the most expensive thing this app ever does,
 * and a queue of ten videos must not hold the loop for ten times as long as the
 * room clock can wait. Ten uploads therefore take ten passes, which is two and
 * a half minutes, and nobody is watching a background upload that closely.
 *
 * Every failure is caught. A thrown tick is logged by the shell and never stops
 * the loop, but a job left in `processing` would sit there until its claim went
 * stale, so the job is put right here instead.
 *
 * Each pass also removes files that have sat in the bin for 30 days and the
 * stills of uploads that have gone, and a pass with no job takes the still of
 * one older video that has none (task 02).
 */
export async function processNextMediaUpload() {
  await purgeExpiredBin().catch((error: unknown) =>
    console.error("the bin could not be cleared", error)
  )
  // Stills of uploads that are gone, by any route including an account
  // being deleted, leave the bucket here (migration 0137).
  await drainBucketDeletions().catch((error: unknown) =>
    console.error("noted bucket files could not be removed", error)
  )
  const job = await claimNextUploadJob()
  if (!job) {
    await takeMissingStill()
    return
  }

  if (job.kind === "image") {
    // Images are stored ready and never queued. One here means a row was made
    // by hand or by an older version, so it is marked done and left alone —
    // nothing about the file changes, so nothing about the library row should.
    await markUploadReady(job.mediaId)
    return
  }

  try {
    const file = await loadJobFile(job.mediaId)
    if (!file) {
      // The library row went while the job was queued — the member deleted the
      // upload. Retrying cannot bring it back, so this one does not go round
      // again whatever attempt it is on.
      await failUploadJob(
        job,
        "The file was removed before it could be prepared.",
        // They deleted it, so they already know; the bell says nothing.
        { retry: false, tell: false }
      )
      return
    }

    // A re-trim cuts from the kept original, never from the last cut.
    const object = await getFromR2(file.sourcePath ?? file.storagePath)
    const body = object.Body
    if (!body || typeof body.transformToByteArray !== "function") {
      throw new Error("The stored file could not be read back.")
    }
    const input = await body.transformToByteArray()

    // `kind` is a plain column, so it is narrowed here rather than trusted.
    // The check constraint allows only these three, and images left above.
    const output = await transcodeUpload(
      input,
      job.kind === "video" ? "video" : "audio",
      job.trimStartMs !== null && job.trimEndMs !== null
        ? { startMs: job.trimStartMs, endMs: job.trimEndMs }
        : null
    )
    const filename = storedFilename(
      `${file.originalName.replace(/\.[^.]+$/, "")}.${output.extension}`,
      output.mimeType
    )
    const storagePath = `${job.userId}/${filename}`
    await uploadToR2(storagePath, output.bytes, output.mimeType)
    // A clip's card shows its middle frame and plays the film only on hover.
    // A frame that cannot be taken costs the card its picture, not the job.
    const stillPath =
      job.kind === "video"
        ? await storeStill(job.userId, job.mediaId, output.bytes)
        : null

    const finished = await finishUploadJob({
      mediaId: job.mediaId,
      claimedAt: job.claimedAt,
      storagePath,
      mimeType: output.mimeType,
      fileSize: output.bytes.byteLength,
      previousStoragePath: file.storagePath,
      stillPath,
    })
    if (finished.settled) await checkStorageWarning(job.userId)
  } catch (error) {
    // A trim outside the file fails the same way every time.
    await failUploadJob(job, describeFailure(error), {
      retry: !(error instanceof TrimOutsideFileError),
    })
  }
}

/** The middle frame into the bucket, or null when it could not be taken. */
async function storeStill(userId: string, mediaId: string, film: Uint8Array) {
  try {
    const frame = await extractMiddleFrame(film)
    const path = stillStoragePath(userId, mediaId)
    await uploadToR2(path, frame, "image/jpeg")
    return path
  } catch (error) {
    console.error("a clip's still could not be taken", error)
    return null
  }
}

/**
 * One older video that has no still yet gets one, on a pass with nothing
 * else to do. A film whose frame cannot be taken is marked with an empty
 * path, so the worker does not try the same broken film on every quiet pass.
 * A machine with no FFmpeg, or a bucket that did not answer, marks nothing:
 * those pass, and the clip is tried again later.
 */
async function takeMissingStill() {
  const video = await findVideoWithoutStill().catch(() => null)
  if (!video) return
  let film: Uint8Array
  try {
    const object = await getFromR2(video.storagePath)
    const body = object.Body
    if (!body || typeof body.transformToByteArray !== "function") return
    film = await body.transformToByteArray()
  } catch (error) {
    console.error("an older clip could not be read for its still", error)
    return
  }
  let frame: Uint8Array
  try {
    frame = await extractMiddleFrame(film)
  } catch (error) {
    if (error instanceof FfmpegMissingError) return
    console.error("an older clip's still could not be taken", error)
    await saveUploadStill(video.mediaId, "").catch(() => undefined)
    return
  }
  try {
    const path = stillStoragePath(video.userId, video.mediaId)
    await uploadToR2(path, frame, "image/jpeg")
    if (!(await saveUploadStill(video.mediaId, path))) {
      await deleteFromR2(path).catch(() => undefined)
    }
  } catch (error) {
    console.error("an older clip's still could not be stored", error)
  }
}

/**
 * What the member reads on a failed upload.
 *
 * Never the raw error: FFmpeg's output names temporary paths and codec
 * internals, which tells a member nothing and an attacker something.
 */
function describeFailure(error: unknown) {
  if (error instanceof FfmpegMissingError) {
    return "Sound and video cannot be prepared yet."
  }
  if (error instanceof TrimOutsideFileError) {
    return "The trim starts after the end of the file. Pick a start inside it."
  }
  if (error instanceof Error && error.message.includes("could not be read")) {
    return "The stored file could not be read back. Please upload it again."
  }
  return "This file could not be prepared. It may be damaged or in an unusual format."
}
