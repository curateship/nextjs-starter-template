import { clipSpeed, sourceMsAt } from "@/lib/video/clip-playback"

/**
 * Lighting up each word of a caption as it is said.
 *
 * One caption clip carries its whole line and, beside it, when each word of
 * that line is spoken. The word itself is not stored a second time: the
 * times are matched to the words of the clip's text by position, so the text
 * stays the one place the words live. A caption whose words no longer match
 * its times in number simply draws without a lit word.
 *
 * The preview and the export both read the lit word from here, so the two
 * cannot disagree about which word is lit at any moment.
 */

/** When one word is said. */
export type CaptionWordTime = { startMs: number; endMs: number }

/** The colour the spoken word turns when nobody has picked one. */
export const DEFAULT_CAPTION_WORD_COLOR = "#facc15"

/** The most words one caption can carry times for. */
export const MAX_CAPTION_WORDS = 1000

/** The words of a caption's text, in order, as the times are matched to them. */
function captionWords(text: string | undefined): string[] {
  return (text ?? "").split(/\s+/).filter(Boolean)
}

/** A word that is only punctuation belongs on the end of the one before it. */
const LEADING_PUNCTUATION = /^[,.!?;:]/

/**
 * One time for every word of a line, in the same time as the line.
 *
 * `heard` is what the transcriber said about each word. Punctuation it sent
 * as a word of its own is folded into the word before, the way the line's
 * text already folds it. When what is left still does not match the line
 * word for word, the line's time is shared out evenly instead: an even share
 * is a guess, but it is a guess on the right words.
 */
export function alignWordTimes(
  line: { startMs: number; endMs: number; text: string },
  heard: readonly { text: string; startMs: number; endMs: number }[] = []
): CaptionWordTime[] {
  const words = captionWords(line.text)
  if (!words.length || line.endMs <= line.startMs) return []

  const merged: { text: string; startMs: number; endMs: number }[] = []
  for (const word of heard) {
    const text = word.text.trim()
    if (!text) continue
    const previous = merged.at(-1)
    if (previous && LEADING_PUNCTUATION.test(text)) {
      previous.text += text
      previous.endMs = Math.max(previous.endMs, word.endMs)
      continue
    }
    merged.push({ text, startMs: word.startMs, endMs: word.endMs })
  }

  if (merged.length !== words.length) {
    const share = (line.endMs - line.startMs) / words.length
    return words.map((_, index) => ({
      startMs: Math.round(line.startMs + index * share),
      endMs: Math.round(line.startMs + (index + 1) * share),
    }))
  }

  // Inside the line, in order, and never ending before they start.
  let floor = line.startMs
  return merged.map((word) => {
    const startMs = Math.round(
      Math.min(line.endMs, Math.max(floor, word.startMs))
    )
    const endMs = Math.round(
      Math.min(line.endMs, Math.max(startMs, word.endMs))
    )
    floor = startMs
    return { startMs, endMs }
  })
}

/**
 * The word times a new caption clip stores: measured from the clip's own
 * start rather than along the timeline, so moving the clip takes its words
 * with it.
 */
export function captionClipWordTimes(line: {
  startMs: number
  words?: CaptionWordTime[]
}): CaptionWordTime[] | undefined {
  if (!line.words?.length) return undefined
  return line.words.map((word) => ({
    startMs: word.startMs - line.startMs,
    endMs: word.endMs - line.startMs,
  }))
}

type HighlightedClip = {
  text?: string
  wordTimes?: CaptionWordTime[]
  activeWordColor?: string
}

/**
 * The word times and colour to light a caption with, or null when it draws
 * as a plain line: no colour chosen, no times, or text edited to a different
 * number of words than there are times.
 */
export function captionWordHighlight(
  clip: HighlightedClip
): { times: CaptionWordTime[]; color: string } | null {
  if (!clip.activeWordColor || !clip.wordTimes?.length) return null
  if (captionWords(clip.text).length !== clip.wordTimes.length) return null
  return { times: clip.wordTimes, color: clip.activeWordColor }
}

/**
 * Whether the words of a caption still match its times. False means the text
 * was edited to more or fewer words, and nothing will light up.
 */
export function captionWordsMatchTimes(clip: HighlightedClip): boolean {
  return (
    !!clip.wordTimes?.length &&
    captionWords(clip.text).length === clip.wordTimes.length
  )
}

/**
 * Which word is lit, that far into the clip. A word stays lit from the moment
 * it starts until the next one does, so a pause between words does not blink
 * the colour off. Before the first word, nothing is lit.
 */
export function litWordIndex(
  times: readonly CaptionWordTime[],
  clipTimeMs: number
): number {
  let lit = -1
  for (const [index, word] of times.entries()) {
    if (word.startMs > clipTimeMs) break
    lit = index
  }
  return lit
}

/** The lit word at a moment on the timeline, for a clip placed on it. */
export function litWordAt(
  clip: {
    startMs: number
    durationMs: number
    trimStartMs: number
    speed?: number
  },
  times: readonly CaptionWordTime[],
  timelineMs: number
): number {
  return litWordIndex(times, sourceMsAt(clip, timelineMs - clip.startMs))
}

export type LitWordRun = {
  /** Measured from the start of the clip on the timeline. */
  fromMs: number
  toMs: number
  /** The lit word, or -1 for none. */
  index: number
}

/**
 * A clip's turn on screen cut wherever the lit word changes. The pieces butt
 * up against each other and cover the whole clip, so the export draws one
 * picture for each and nothing is left blank.
 */
export function litWordRuns(
  clip: { durationMs: number; trimStartMs: number; speed?: number },
  times: readonly CaptionWordTime[]
): LitWordRun[] {
  if (clip.durationMs <= 0) return []
  const runs: LitWordRun[] = []
  const push = (fromMs: number, toMs: number, index: number) => {
    if (toMs <= fromMs) return
    const previous = runs.at(-1)
    if (previous && previous.index === index) {
      previous.toMs = toMs
      return
    }
    runs.push({ fromMs, toMs, index })
  }

  const speed = clipSpeed(clip)
  let cursor = 0
  let index = litWordIndex(times, sourceMsAt(clip, 0))
  for (const word of times) {
    // Where on the clip this word starts: back from the file's time to the
    // clip's, which is what `sourceMsAt` does the other way round.
    const atMs = (word.startMs - clip.trimStartMs) / speed
    if (atMs <= cursor || atMs >= clip.durationMs) continue
    push(cursor, atMs, index)
    cursor = atMs
    index = litWordIndex(times, word.startMs)
  }
  push(cursor, clip.durationMs, index)
  return runs
}

/**
 * Cuts each of the export's pictures wherever the lit word changes inside it.
 * A piece keeps the entrance it was cut from; only the lit word differs.
 */
export function splitWindowsByLitWord<
  W extends { fromMs: number; toMs: number },
>(windows: readonly W[], runs: readonly LitWordRun[]): (W & { lit: number })[] {
  const pieces: (W & { lit: number })[] = []
  for (const window of windows) {
    for (const run of runs) {
      const fromMs = Math.max(window.fromMs, run.fromMs)
      const toMs = Math.min(window.toMs, run.toMs)
      if (toMs > fromMs)
        pieces.push({ ...window, fromMs, toMs, lit: run.index })
    }
  }
  return pieces
}
