import { randomUUID } from "node:crypto"

import { getFromR2, getPublicMediaUrl, uploadToR2 } from "@/server/media/storage"
import {
  CATALOG_MAX_ATTEMPTS,
  claimNextCatalogFile,
  failCatalogFile,
  finishCatalogFile,
} from "@/server/pomodoro/admin-catalog"
import {
  FfmpegMissingError,
  extractFirstFrame,
  probeDurationSeconds,
  transcodeUpload,
} from "@/server/pomodoro/media-transcode"
import { soundLengthProblem } from "@/lib/pomodoro/admin-catalog"

/**
 * One catalogue file per pass of the shell's fifteen-second loop: a sound an
 * admin uploaded, or a theme's film. See `workspace/docs/catalog-admin.md`.
 *
 * A sound is measured first and refused outside 2 to 5 minutes (Tyler, 8 Oct
 * 2026), then loudness-evened like a member's upload. A film is shrunk to 720p
 * with no sound, and its first frame becomes the theme's still when the admin
 * gave none. The item keeps whatever file it had until the new one is ready.
 *
 * Every failure is caught and put on the item, so the dashboard can say why.
 */
export async function processNextCatalogFile() {
  const job = await claimNextCatalogFile()
  if (!job?.sourcePath) return
  const sourcePath = job.sourcePath

  try {
    const object = await getFromR2(sourcePath)
    const body = object.Body
    if (!body || typeof body.transformToByteArray !== "function")
      throw new Error("The uploaded file could not be read back.")
    const input = await body.transformToByteArray()

    if (job.sourceKind === "audio") {
      const seconds = await probeDurationSeconds(input)
      const problem = soundLengthProblem(seconds)
      if (problem) {
        await failCatalogFile({ id: job.id, sourcePath, reason: problem, retry: false })
        return
      }
      const output = await transcodeUpload(input, "audio")
      const filePath = `pomodoro-catalog/sounds/${randomUUID()}.${output.extension}`
      await uploadToR2(filePath, output.bytes, output.mimeType)
      await finishCatalogFile({
        id: job.id,
        sourcePath,
        fileUrl: await getPublicMediaUrl(filePath),
        filePath,
        poster: null,
        durationSeconds: Math.round(seconds),
      })
      return
    }

    if (job.sourceKind === "video") {
      const output = await transcodeUpload(input, "video")
      const filePath = `pomodoro-catalog/themes/${randomUUID()}.${output.extension}`
      await uploadToR2(filePath, output.bytes, output.mimeType)
      let poster: { url: string; path: string } | null = null
      if (!job.pictureUrl) {
        const frame = await extractFirstFrame(output.bytes)
        const posterPath = `pomodoro-catalog/themes/${randomUUID()}.jpg`
        await uploadToR2(posterPath, frame, "image/jpeg")
        poster = { url: await getPublicMediaUrl(posterPath), path: posterPath }
      }
      await finishCatalogFile({
        id: job.id,
        sourcePath,
        fileUrl: await getPublicMediaUrl(filePath),
        filePath,
        poster,
        durationSeconds: null,
      })
      return
    }

    await failCatalogFile({
      id: job.id,
      sourcePath,
      reason: "That file is not a sound or a film.",
      retry: false,
    })
  } catch (error) {
    // A machine without FFmpeg will not grow one by trying again.
    const missing = error instanceof FfmpegMissingError
    await failCatalogFile({
      id: job.id,
      sourcePath,
      reason: missing
        ? "The worker has no FFmpeg, so the file could not be prepared. Ask for the worker to be set up, then upload it again."
        : "The file could not be prepared. Try uploading it again.",
      retry: !missing && job.attempts < CATALOG_MAX_ATTEMPTS,
    })
    console.error("catalogue file could not be prepared", job.id, error)
  }
}
