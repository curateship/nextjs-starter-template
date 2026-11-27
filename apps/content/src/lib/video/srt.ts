/**
 * A video's captions as an .srt subtitles file, for Send to Promo (part 13
 * of the Promo task, `workspace/docs/send-to-promo.md`). LinkedIn takes the
 * file with a video so viewers can switch captions on.
 *
 * Captions are the text clips written from speech: the ones that carry word
 * times or name the voice line that says them. Words typed in by hand, such
 * as a title, are not subtitles and are left out.
 */

export type SubtitleLine = { startMs: number; endMs: number; text: string }

type TextClip = {
  kind: string
  startMs: number
  durationMs: number
  text?: string
  wordTimes?: unknown[]
  spokenBy?: string
}

/**
 * The caption lines of a timeline, in time order. With an export range, only
 * what falls inside it, cut to it and counted from its start.
 */
export function subtitleLines(
  timeline: { tracks: { clips: TextClip[] }[] },
  range: { startMs: number; endMs: number } | null = null
): SubtitleLine[] {
  const lines: SubtitleLine[] = []
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      if (clip.kind !== "text" || !(clip.wordTimes?.length || clip.spokenBy)) continue
      const text = (clip.text ?? "").replace(/\s*\n\s*/g, "\n").trim()
      if (!text) continue
      let startMs = clip.startMs
      let endMs = clip.startMs + clip.durationMs
      if (range) {
        if (endMs <= range.startMs || startMs >= range.endMs) continue
        startMs = Math.max(startMs, range.startMs) - range.startMs
        endMs = Math.min(endMs, range.endMs) - range.startMs
      }
      if (endMs > startMs) lines.push({ startMs, endMs, text })
    }
  }
  return lines.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)
}

/** 1250 as "00:00:01,250", the time an .srt file writes. */
export function srtTime(ms: number): string {
  const whole = Math.max(0, Math.round(ms))
  const pad = (value: number, size = 2) => String(value).padStart(size, "0")
  const hours = Math.floor(whole / 3_600_000)
  const minutes = Math.floor((whole % 3_600_000) / 60_000)
  const seconds = Math.floor((whole % 60_000) / 1000)
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(whole % 1000, 3)}`
}

/** The lines as an .srt file's words, or "" when there are none. */
export function toSrt(lines: SubtitleLine[]): string {
  return lines.map((line, index) => `${index + 1}\n${srtTime(line.startMs)} --> ${srtTime(line.endMs)}\n${line.text}\n`).join("\n")
}
