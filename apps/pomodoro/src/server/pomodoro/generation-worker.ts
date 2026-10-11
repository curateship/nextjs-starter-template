import sharp from "sharp"

import {
  claimNextGeneration,
  failGeneration,
  finishGeneration,
} from "@/server/pomodoro/generation"
import {
  generateBackgroundVideo,
  generateSoundscapeAudio,
  ProviderKeyMissingError,
  type GeneratedFile,
} from "@/server/pomodoro/generation-providers"
import {
  FfmpegMissingError,
  transcodeUpload,
} from "@/server/pomodoro/media-transcode"
import { getFromR2 } from "@/server/media/storage"
import { loadOwnPicture } from "@/server/pomodoro/generation-pictures"
import { storePomodoroUpload } from "@/server/pomodoro/media-uploads"
import type { PomodoroGeneration } from "@/server/pomodoro/schema"
import { checkStorageWarning } from "@/server/pomodoro/storage-warning"
import { nameFromPrompt } from "@/lib/pomodoro/upload-labels"
import {
  recordGenerationFailure,
  recordGenerationSpend,
} from "@/server/pomodoro/generation-spend"
import {
  GENERATION_PURPOSE,
  SOUNDSCAPE_LOOP_SECONDS,
  type GenerationKind,
} from "@/lib/pomodoro/generation"

/**
 * One AI generation per pass of the shell's fifteen-second loop.
 *
 * One, because this is the slowest thing the app does by a wide margin: a Veo
 * render can take minutes, and the room clock rides the same loop. Two people
 * asking at once means the second waits for the first, which is the honest
 * trade for not running a queue of our own.
 *
 * The finished file goes through exactly the path an upload takes — FFmpeg,
 * then the shell's media library and bucket, then a `pomodoro_media_uploads`
 * row — so from the picker's point of view there is no difference between
 * something a member made and something they uploaded.
 *
 * Every attempt that reaches a provider is also one row on the shell's AI
 * usage page (`generation-spend.ts`): priced once the file comes back, at $0
 * when the provider fails. A missing key never reached anybody, so it records
 * nothing.
 */
export async function processNextGeneration() {
  const job = await claimNextGeneration()
  if (!job) return

  const kind = job.kind as GenerationKind

  let generated: GeneratedFile
  try {
    generated =
      kind === "background"
        ? await generateBackgroundVideo(job.prompt, {
            style: job.style,
            picture: job.fromPicture ? await loadStartingPicture(job) : null,
          })
        : await generateSoundscapeAudio(job.prompt)
  } catch (error) {
    if (
      !(error instanceof ProviderKeyMissingError) &&
      !(error instanceof PictureGoneError)
    )
      await recordGenerationFailure(job, kind, error)
    const { retry, reason } = describeFailure(error)
    await failGeneration(job, reason, { retry })
    return
  }

  // The provider has been paid from here on, whatever happens to the file.
  await recordGenerationSpend(job, kind)

  try {
    if (!generated.bytes.byteLength) {
      throw new Error("The provider returned an empty file.")
    }

    // The same re-encode uploads get: video to 720p without sound, audio
    // loudness-normalised. Veo already returns 720p, but a file that has been
    // through the same mill behaves the same behind the timer.
    // A soundscape comes back 30 seconds long and leaves here two minutes
    // long, crossfaded into itself so the joins cannot be heard (task 06,
    // part 2).
    const output = await transcodeUpload(generated.bytes, generated.kind, null, {
      loop:
        generated.kind === "audio"
          ? { minSeconds: SOUNDSCAPE_LOOP_SECONDS }
          : null,
    })

    const stored = await storePomodoroUpload({
      userId: job.userId,
      purpose: GENERATION_PURPOSE[kind],
      // The prompt becomes the name, so the picker shows what was asked for
      // rather than a filename nobody chose.
      file: { name: `${job.prompt.slice(0, 60)}.${output.extension}` },
      bytes: output.bytes,
      detected: {
        kind: generated.kind,
        mimeType: output.mimeType,
      },
      // Already re-encoded here, so it must not be queued for it again.
      alreadyProcessed: true,
      // Named after the prompt, cut at a word break, and taggable and
      // shareable like any upload (task 02, part 2).
      labels: {
        name: nameFromPrompt(job.prompt),
        tags: [],
        shared: false,
        trim: null,
      },
    })

    await finishGeneration(job, stored.mediaId)
    await checkStorageWarning(job.userId)
  } catch (error) {
    const { retry, reason } = describeFailure(error)
    await failGeneration(job, reason, { retry })
  }
}

/**
 * What the member reads, and whether trying again could help.
 *
 * Never the provider's own words: those name models and quotas, which tells a
 * member nothing and an attacker something. A missing key and a missing FFmpeg
 * are setup problems that no amount of retrying fixes, so those give the credit
 * straight back rather than burning the second attempt first.
 */
function describeFailure(error: unknown): { retry: boolean; reason: string } {
  if (error instanceof PictureGoneError) {
    return {
      retry: false,
      reason: "The picture was deleted before it could be used.",
    }
  }
  if (error instanceof ProviderKeyMissingError) {
    return {
      retry: false,
      reason: "AI generation is not switched on yet.",
    }
  }
  if (error instanceof FfmpegMissingError) {
    return {
      retry: false,
      reason: "Sound and video cannot be prepared yet.",
    }
  }
  if (error instanceof Error && error.message === "PROVIDER_TIMEOUT") {
    return { retry: true, reason: "That took too long. Try again." }
  }
  return {
    retry: true,
    reason: "That did not work. Your credit has been kept for a retry.",
  }
}

/** The picture a film was to start from is gone, or in the bin. */
class PictureGoneError extends Error {}

/** The longest side of a starting picture sent to Veo, which makes 720p. */
const PICTURE_LONG_SIDE = 1280

/**
 * The member's own picture, as a JPEG no larger than the film it starts
 * (task 06, part 3). Checked again here, not only when asked: it must still
 * be theirs, still a ready picture and not in the bin, because a member could
 * have deleted it while the request waited.
 */
async function loadStartingPicture(job: PomodoroGeneration) {
  const picture = job.pictureMediaId
    ? await loadOwnPicture(job.userId, job.pictureMediaId)
    : null
  if (!picture) throw new PictureGoneError("PICTURE_GONE")
  const object = await getFromR2(picture.storagePath)
  const body = object.Body
  if (!body || typeof body.transformToByteArray !== "function")
    throw new Error("The picture could not be read back.")
  const bytes = await sharp(await body.transformToByteArray())
    .rotate()
    .resize(PICTURE_LONG_SIDE, PICTURE_LONG_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 88 })
    .toBuffer()
  return { bytes: new Uint8Array(bytes), mimeType: "image/jpeg" }
}
