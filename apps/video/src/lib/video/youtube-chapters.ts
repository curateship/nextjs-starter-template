import type { TimelineMarker } from "./timeline-markers"

/**
 * The Chapters card in an export's window (`workspace/docs/youtube-chapters.md`):
 * the named markers in the file as "0:00 Intro" lines, for YouTube's
 * description box. No AI. Tyler, 4 Nov 2026: "Markers you place".
 *
 * YouTube turns those lines into chapters only when the first one is at 0:00,
 * there are at least three, and each lasts ten seconds or more. The card says
 * which rule a list breaks and still lets it be copied.
 */

export const YOUTUBE_MIN_CHAPTERS = 3
export const YOUTUBE_MIN_CHAPTER_MS = 10_000
export const FIRST_CHAPTER_NAME = "Start"

export type ChapterLine = { atMs: number; name: string }

/** "0:00", "1:35" or "1:02:03", in whole seconds rounded down, as YouTube reads them. */
export function chapterTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`
}

/**
 * The named markers in time order. When none sits in the first second, a
 * "Start" chapter opens the list, because YouTube needs one at 0:00.
 */
export function chapterLines(markers: TimelineMarker[]): ChapterLine[] {
  const named = markers
    .filter((marker) => marker.name.trim())
    .map((marker) => ({ atMs: marker.atMs, name: marker.name.trim() }))
    .sort((a, b) => a.atMs - b.atMs)
  if (!named.length) return []
  return named[0].atMs < 1000 ? named : [{ atMs: 0, name: FIRST_CHAPTER_NAME }, ...named]
}

export function chapterText(lines: ChapterLine[]) {
  return lines.map((line) => `${chapterTime(line.atMs)} ${line.name}`).join("\n")
}

/** Each YouTube rule the list breaks, as a sentence. Empty when it passes. */
export function chapterProblems(lines: ChapterLine[], lengthMs: number): string[] {
  const problems: string[] = []
  if (lines.length < YOUTUBE_MIN_CHAPTERS) {
    problems.push(
      `YouTube needs at least ${YOUTUBE_MIN_CHAPTERS} chapters. Name more markers to add some.`
    )
  }
  const short = lines.filter((line, index) => {
    const endMs = lines[index + 1]?.atMs ?? lengthMs
    return endMs - line.atMs < YOUTUBE_MIN_CHAPTER_MS
  })
  if (short.length) {
    problems.push(
      `YouTube needs every chapter to last 10 seconds or more. Too short: ${short
        .map((line) => `${chapterTime(line.atMs)} ${line.name}`)
        .join(", ")}.`
    )
  }
  return problems
}
