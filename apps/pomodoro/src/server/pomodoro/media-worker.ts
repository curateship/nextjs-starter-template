import { getFromR2, uploadToR2 } from "@/server/media/storage"
import {
  claimNextUploadJob,
  failUploadJob,
  finishUploadJob,
  loadJobFile,
  markUploadReady,
} from "@/server/pomodoro/media-uploads"
import {
  FfmpegMissingError,
  transcodeUpload,
} from "@/server/pomodoro/media-transcode"
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
 */
export async function processNextMediaUpload() {
  const job = await claimNextUploadJob()
  if (!job) return

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
        { retry: false }
      )
      return
    }

    const object = await getFromR2(file.storagePath)
    const body = object.Body
    if (!body || typeof body.transformToByteArray !== "function") {
      throw new Error("The stored file could not be read back.")
    }
    const input = await body.transformToByteArray()

    // `kind` is a plain column, so it is narrowed here rather than trusted.
    // The check constraint allows only these three, and images left above.
    const output = await transcodeUpload(
      input,
      job.kind === "video" ? "video" : "audio"
    )
    const filename = storedFilename(
      `${file.originalName.replace(/\.[^.]+$/, "")}.${output.extension}`,
      output.mimeType
    )
    const storagePath = `${job.userId}/${filename}`
    await uploadToR2(storagePath, output.bytes, output.mimeType)

    await finishUploadJob({
      mediaId: job.mediaId,
      storagePath,
      mimeType: output.mimeType,
      fileSize: output.bytes.byteLength,
      previousStoragePath: file.storagePath,
    })
  } catch (error) {
    await failUploadJob(job, describeFailure(error))
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
    return "This server cannot prepare sound or video yet. Tell an operator."
  }
  if (error instanceof Error && error.message.includes("could not be read")) {
    return "The stored file could not be read back. Please upload it again."
  }
  return "This file could not be prepared. It may be damaged or in an unusual format."
}
