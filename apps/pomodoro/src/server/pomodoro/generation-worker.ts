import {
  claimNextGeneration,
  failGeneration,
  finishGeneration,
} from "@/server/pomodoro/generation"
import {
  generateBackgroundVideo,
  generateSoundscapeAudio,
  ProviderKeyMissingError,
} from "@/server/pomodoro/generation-providers"
import {
  FfmpegMissingError,
  transcodeUpload,
} from "@/server/pomodoro/media-transcode"
import { storePomodoroUpload } from "@/server/pomodoro/media-uploads"
import {
  GENERATION_PURPOSE,
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
 */
export async function processNextGeneration() {
  const job = await claimNextGeneration()
  if (!job) return

  const kind = job.kind as GenerationKind

  try {
    const generated =
      kind === "background"
        ? await generateBackgroundVideo(job.prompt)
        : await generateSoundscapeAudio(job.prompt)

    if (!generated.bytes.byteLength) {
      throw new Error("The provider returned an empty file.")
    }

    // The same re-encode uploads get: video to 720p without sound, audio
    // loudness-normalised. Veo already returns 720p, but a file that has been
    // through the same mill behaves the same behind the timer.
    const output = await transcodeUpload(generated.bytes, generated.kind)

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
    })

    await finishGeneration(job, stored.mediaId)
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
  if (error instanceof ProviderKeyMissingError) {
    return {
      retry: false,
      reason: "AI generation is not set up on this server yet.",
    }
  }
  if (error instanceof FfmpegMissingError) {
    return {
      retry: false,
      reason: "This server cannot prepare sound or video yet.",
    }
  }
  if (error instanceof Error && error.message === "PROVIDER_TIMEOUT") {
    return { retry: true, reason: "The provider took too long. Try again." }
  }
  return {
    retry: true,
    reason: "That did not work. Your credit has been kept for a retry.",
  }
}
