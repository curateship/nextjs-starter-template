/**
 * Making a person's lips match a new voice, by Sync Labs
 * (workspace/docs/lip-sync.md).
 *
 * A video clip of a person and a sound clip laid over it go to Sync Labs: the
 * stretch of footage under the clip, and the voice over exactly that stretch,
 * with silence where the voice has not started yet or has already ended. What
 * comes back is the same footage with the mouth moving to the new words. It
 * takes the clip's place as one Undo step, keeping the clip's size, place,
 * colour and timing, and plays silent, because the voice is still on its own
 * lane and would otherwise be heard twice.
 */

export const LIP_SYNC_MODEL = "lipsync-2"

/**
 * Sync Labs' billing page, read on 4 Nov 2026: $0.002 a frame at 25 frames a
 * second, which is $0.05 a second of finished video.
 */
export const LIP_SYNC_CENTS_PER_SECOND = 5

/** The longest stretch sent at once. Longer clips are split first. */
export const LIP_SYNC_MAX_MS = 5 * 60_000
/** Shorter than this has no mouth movement worth matching. */
export const LIP_SYNC_MIN_MS = 1_000

export type LipSyncStatus = "working" | "ready" | "failed"

export const LIP_SYNC_KEY_MESSAGE =
  "Add a Sync Labs key in Settings → Lip sync first"
export const LIP_SYNC_NOT_VIDEO_MESSAGE = "Only a video clip can have its lips matched"
export const LIP_SYNC_SPEED_MESSAGE =
  "Set this clip back to normal speed first. Lips are matched at 1x."
export const LIP_SYNC_NO_VOICE_MESSAGE =
  "Lay a voice over this clip first. The lips are matched to a sound clip on another lane."
export const LIP_SYNC_TOO_LONG_MESSAGE =
  "This clip is longer than 5 minutes. Split it, then match each part."
export const LIP_SYNC_TOO_SHORT_MESSAGE = "This clip is too short to match lips on"
export const LIP_SYNC_FAILED_MESSAGE = "The lips couldn't be matched this time. Try again."
export const LIP_SYNC_NOT_FOUND_MESSAGE = "That clip isn't saved yet. Wait a moment and try again."

/** What matching a stretch this long costs, in cents, rounded up. */
export function lipSyncCostCents(durationMs: number) {
  return Math.ceil((durationMs / 1000) * LIP_SYNC_CENTS_PER_SECOND)
}

type TimedClip = {
  id: string
  kind: string
  startMs: number
  durationMs: number
  mediaId?: string
  origin?: { tool?: string }
}

/** How long two clips share on the timeline. */
function overlapMs(a: TimedClip, b: TimedClip) {
  return Math.max(
    0,
    Math.min(a.startMs + a.durationMs, b.startMs + b.durationMs) - Math.max(a.startMs, b.startMs)
  )
}

const VOICE_TOOLS = new Set(["voice", "hook", "translate", "brief-voice"])

/**
 * The sound clips laid over a video clip that the lips could be matched to,
 * best first: a voice the AI read before anything else, then whichever
 * shares the most time with the clip. A sound with no file of the owner's,
 * such as a starter sound effect, is left out.
 */
export function lipSyncVoices<T extends TimedClip>(tracks: { clips: T[] }[], clip: T): T[] {
  return tracks
    .flatMap((track) => track.clips)
    .filter((other) => other.kind === "audio" && !!other.mediaId && overlapMs(other, clip) > 0)
    .sort((a, b) => {
      const voiceA = VOICE_TOOLS.has(a.origin?.tool ?? "") ? 1 : 0
      const voiceB = VOICE_TOOLS.has(b.origin?.tool ?? "") ? 1 : 0
      return voiceB - voiceA || overlapMs(b, clip) - overlapMs(a, clip)
    })
}

/**
 * Where the voice falls inside the clip: how much silence comes first, how far
 * into the sound's own file to start, and how much of it to play. All of it
 * is in milliseconds of the clip.
 */
export function voiceWindow(
  clip: { startMs: number; durationMs: number },
  voice: { startMs: number; durationMs: number; trimStartMs: number }
) {
  const from = Math.max(clip.startMs, voice.startMs)
  const to = Math.min(clip.startMs + clip.durationMs, voice.startMs + voice.durationMs)
  return {
    silenceBeforeMs: from - clip.startMs,
    soundFromMs: voice.trimStartMs + (from - voice.startMs),
    soundMs: Math.max(0, to - from),
  }
}
