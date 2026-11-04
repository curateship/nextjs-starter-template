import { minutesOf } from "@/lib/travel/board"

/**
 * The free time on a day, and fitting AI's ideas into it, for Fill this day
 * (More Travel features part 6; Tyler: "Timed, in the gaps"). Pure, so the
 * fitting can be tested without an AI.
 */

/** The day the AI may fill: 8:00 AM to 10:00 PM. */
export const FILL_FROM = 8 * 60
export const FILL_TO = 22 * 60
/** A gap shorter than this isn't worth filling. */
export const SMALLEST_FILL_GAP = 45
/** A card cut to fit its gap must still last this long, or it is dropped. */
const SHORTEST_FILL = 30
/** A timed card with no length is taken to last an hour. */
const ASSUMED_LENGTH = 60

export type Window = { start: number; end: number }

/** The gaps of 45 minutes or more between a day's timed cards, from 8:00 AM to 10:00 PM. */
export function freeWindows(cards: readonly { startTime: string | null; durationMinutes: number | null }[]): Window[] {
  const busy = cards
    .filter((card): card is { startTime: string; durationMinutes: number | null } => card.startTime !== null)
    .map((card) => {
      const start = minutesOf(card.startTime)
      return { start, end: start + (card.durationMinutes ?? ASSUMED_LENGTH) }
    })
    .sort((a, b) => a.start - b.start)
  const windows: Window[] = []
  let cursor = FILL_FROM
  for (const span of busy) {
    if (span.start - cursor >= SMALLEST_FILL_GAP) windows.push({ start: cursor, end: Math.min(span.start, FILL_TO) })
    cursor = Math.max(cursor, span.end)
  }
  if (FILL_TO - cursor >= SMALLEST_FILL_GAP) windows.push({ start: cursor, end: FILL_TO })
  return windows.filter((window) => window.end - window.start >= SMALLEST_FILL_GAP)
}

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/** "9:00 to 11:30", for telling the AI where the gaps are. */
export function windowText(window: Window) {
  return `${clock(window.start)} to ${clock(window.end)}`
}

/**
 * The AI's ideas that fit the gaps, earliest first. An idea must start inside
 * a gap; one that runs past the gap's end is cut to fit, and dropped when
 * less than 30 minutes would be left. Ideas never overlap each other: each
 * one placed takes its time out of the gap. An idea with no start time or no
 * length is dropped.
 */
export function fitIntoWindows<T extends { startTime: string | null; durationMinutes: number | null }>(
  ideas: readonly T[],
  windows: readonly Window[]
): T[] {
  const open = windows.map((window) => ({ ...window }))
  const fitted: T[] = []
  const timed = ideas
    .filter((idea): idea is T & { startTime: string; durationMinutes: number } => idea.startTime !== null && idea.durationMinutes !== null)
    .sort((a, b) => minutesOf(a.startTime) - minutesOf(b.startTime))
  for (const idea of timed) {
    const start = minutesOf(idea.startTime)
    const window = open.find((gap) => start >= gap.start && start < gap.end)
    if (!window) continue
    const length = Math.min(idea.durationMinutes, window.end - start)
    if (length < idea.durationMinutes && length < SHORTEST_FILL) continue
    fitted.push({ ...idea, durationMinutes: length })
    window.start = start + length
  }
  return fitted
}
