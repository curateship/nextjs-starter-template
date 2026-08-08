/**
 * The opening line.
 *
 * The first few seconds decide whether anybody watches the rest, so this finds
 * the words the video opens with and offers three other ways of saying them.
 * Finding them is plain maths on the timeline, so it can be checked without a
 * provider or a browser.
 */

type HookClip = {
  id: string
  kind: string
  text?: string
  mediaId?: string
  muted?: boolean
  startMs: number
  durationMs: number
}

type HookTrack = { muted?: boolean; clips: HookClip[] }

/** How far into a video a line can start and still be the opening line. */
export const HOOK_WINDOW_MS = 4_000

/** The most a rewrite may be — an opening line is short by definition. */
export const HOOK_TEXT_MAX = 200

export const HOOK_NO_TEXT_MESSAGE =
  "Nothing is said or written in the first few seconds to rewrite"

/**
 * How many words of speech count as the opening line.
 *
 * A hook is a sentence, not a paragraph. Taking the first breath's worth keeps
 * the rewrite about the opening rather than the whole introduction.
 */
const HOOK_SPOKEN_WORDS = 14

/**
 * The opening line as it was said, out of the words heard at the start.
 *
 * It stops at the first full stop when there is one — a hook is usually one
 * sentence — and otherwise after a breath's worth of words.
 */
export function spokenHookLine(
  words: { text: string; endMs: number }[]
): { text: string; endsMs: number } | null {
  if (!words.length) return null
  let taken = words.slice(0, HOOK_SPOKEN_WORDS)
  const sentenceEnd = taken.findIndex((word) => /[.!?]$/.test(word.text))
  if (sentenceEnd >= 0) taken = taken.slice(0, sentenceEnd + 1)
  const text = taken
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim()
  if (!text) return null
  return { text, endsMs: taken.at(-1)?.endMs ?? 0 }
}
export const SAFE_HOOK_ERRORS = new Set([HOOK_NO_TEXT_MESSAGE])

export type Hook = {
  /** Every clip the opening line is spread across, in the order it reads. */
  clipIds: string[]
  /** What it says now, as one line. */
  text: string
  /**
   * What is making the sound over the opening line, when anything is.
   *
   * Usually it is the footage itself talking — a piece to camera has its voice
   * inside the video, not on a lane of its own. Either way, changing the words
   * without changing what is said would leave the screen and the voice
   * disagreeing, so this is what makes a real rewrite possible.
   */
  spokenBy: {
    clipId: string
    /** Footage talking, or a voice clip of its own. */
    kind: "video" | "audio"
    startMs: number
    durationMs: number
  } | null
}

/**
 * The words the video opens with.
 *
 * Anything written on screen in the first few seconds counts, joined in the
 * order it appears — captions arrive as several short clips, and the opening
 * line is all of them together rather than whichever came first.
 */
export function findHook(tracks: HookTrack[]): Hook | null {
  const opening = tracks
    .flatMap((track) => track.clips ?? [])
    .filter(
      (clip) =>
        clip.kind === "text" &&
        !!clip.text?.trim() &&
        clip.startMs < HOOK_WINDOW_MS
    )
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))

  const spokenBy = findSpokenHook(tracks)
  if (!opening.length) {
    // Nothing on screen. If something is talking, the caller can still find
    // the opening line by listening to it.
    return spokenBy ? { clipIds: [], text: "", spokenBy } : null
  }
  return {
    clipIds: opening.map((clip) => clip.id),
    text: opening
      .map((clip) => clip.text!.trim())
      .join(" ")
      .replace(/\s+/g, " "),
    spokenBy,
  }
}

/**
 * What is talking over the opening.
 *
 * A voice clip of its own is the clearest case and wins. Otherwise it is the
 * footage: a video clip playing at the top with its sound on is a person
 * talking, and that is the usual way a hook exists.
 *
 * A voice clip longer than this is a bed of music or a whole narration rather
 * than a line, and swapping it would be no favour. Footage has no such limit —
 * only its opening seconds are ever touched.
 */
const SPOKEN_HOOK_MAX_MS = 12_000

function findSpokenHook(tracks: HookTrack[]) {
  const audible = tracks.flatMap((track) =>
    track.muted ? [] : (track.clips ?? []).filter((clip) => !clip.muted)
  )
  const opening = (kind: "video" | "audio") =>
    audible
      .filter(
        (clip) =>
          clip.kind === kind && !!clip.mediaId && clip.startMs < HOOK_WINDOW_MS
      )
      .sort((a, b) => a.startMs - b.startMs)[0]

  const voice = opening("audio")
  if (voice && voice.durationMs <= SPOKEN_HOOK_MAX_MS) {
    return {
      clipId: voice.id,
      kind: "audio" as const,
      startMs: voice.startMs,
      durationMs: voice.durationMs,
    }
  }

  const footage = opening("video")
  return footage
    ? {
        clipId: footage.id,
        kind: "video" as const,
        startMs: footage.startMs,
        durationMs: footage.durationMs,
      }
    : null
}

/**
 * A rewritten line, put back across the clips it came from.
 *
 * The line was read off several clips, so it goes back the same way: the words
 * are shared out in the proportions the clips already had, which keeps each
 * one on screen for about as long as it takes to read.
 */
export function spreadHookAcross(
  clipIds: string[],
  text: string
): { clipId: string; text: string }[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (!clipIds.length || !words.length) return []
  if (clipIds.length === 1) return [{ clipId: clipIds[0], text: words.join(" ") }]

  const perClip = Math.ceil(words.length / clipIds.length)
  return clipIds.map((clipId, index) => ({
    clipId,
    text: words.slice(index * perClip, (index + 1) * perClip).join(" "),
  }))
}
