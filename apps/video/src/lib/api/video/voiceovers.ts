import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { isProjectSpendLimitMessage } from "@/lib/video/project-spend"
import {
  RECORDING_MAX_BYTES,
  RECORDING_MESSAGES,
  RECORDING_MISSING_MESSAGE,
  RECORDING_SAMPLE_RATE,
  RECORDING_TOO_LONG_MESSAGE,
} from "@/lib/video/recorded-voiceover"
import {
  VOICEOVER_SEARCH_MAX,
  type SavedVoiceover,
} from "@/lib/video/saved-voiceovers"
import type { VoiceoverResult } from "@/lib/video/voice"
import { userGet, userPost } from "@/server/guards"
import { requireVideoBudget, videoSpendMetadata } from "@/server/video/project-spend"
import { keepRecordedVoiceover } from "@/server/video/recorded-voiceovers"
import { listVoiceovers, removeVoiceover } from "@/server/video/voiceovers"

export type { SavedVoiceover }

/**
 * The studio's Voiceovers panel: every voiceover one person has had read
 * aloud, searchable by what it says. Per person, like the music shelf, so it
 * follows them into every project.
 */

export function getVoiceoverErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return describeAuthError(message) ?? "Your voiceovers could not be loaded."
}

const listVoiceoversFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ search: z.string().max(VOICEOVER_SEARCH_MAX) }))
  .handler(async ({ data, context }) =>
    listVoiceovers(context.user.id, data.search)
  )

export function loadVoiceovers(search: string) {
  return listVoiceoversFn({ data: { search } })
}

const removeVoiceoverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ mediaId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    await removeVoiceover(context.user.id, data.mediaId)
  })

/** Takes a voiceover off the Voiceovers list. The file stays in the library. */
export function removeFromVoiceovers(mediaId: string) {
  return removeVoiceoverFn({ data: { mediaId } })
}

/** What went wrong keeping a recording, in words worth reading. */
export function getRecordingErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : ""
  if (RECORDING_MESSAGES.has(message)) return message
  if (isProjectSpendLimitMessage(message)) return message
  return (
    describeAuthError(message) ??
    "The recording was not kept. It is still here, so try again in a moment."
  )
}

const recordFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator((data) => {
    if (!(data instanceof FormData)) throw new Error("Expected form data")
    const recording = data.get("recording")
    if (!(recording instanceof File)) throw new Error(RECORDING_MISSING_MESSAGE)
    // Refused before it is read or priced, not after.
    if (recording.size > RECORDING_MAX_BYTES) throw new Error(RECORDING_TOO_LONG_MESSAGE)
    const videoId = data.get("videoId")?.toString() || undefined
    return { recording, videoId: z.string().min(1).max(36).optional().parse(videoId) }
  })
  .handler(async ({ data, context }): Promise<VoiceoverResult> => {
    // The captions are the only cost: Whisper's minutes, read from the size
    // of the WAV, which holds 64,000 bytes a second.
    const minutes = data.recording.size / (RECORDING_SAMPLE_RATE * 2) / 60
    const spend = data.videoId
      ? videoSpendMetadata(
          await requireVideoBudget(
            context.user.id,
            data.videoId,
            aiUnitCostCents("whisper-1", minutes)
          )
        )
      : null
    return keepRecordedVoiceover({
      userId: context.user.id,
      bytes: new Uint8Array(await data.recording.arrayBuffer()),
      spend,
    })
  })

/**
 * Keeps a recording on the Voices shelf with its captions. `videoId` is the
 * video it was recorded for, which pays for the captions.
 */
export function keepRecording(recording: File, videoId?: string) {
  const form = new FormData()
  form.append("recording", recording)
  if (videoId) form.append("videoId", videoId)
  return recordFn({ data: form })
}
