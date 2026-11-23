/**
 * The Timer: a shape clip that counts down (or up) over its own length, with
 * a ring that empties as it runs and a line of words above and below the
 * time, such as FOCUS and Round 2/6 (timer.md). Added on 14 Nov 2026 for
 * study videos (`workspace/tasks/flow/02-pomodoro-flow.md`).
 *
 * It is placed like a circle: its box is the one `x`, `y` and `toX`, `toY`
 * are opposite corners of, so it is dragged and resized with the circle's
 * handles. The ring is the largest circle in that box, and the words sit
 * inside the ring.
 *
 * It steps once a second, in the preview and in the export alike, so the
 * two never disagree: the export draws one picture per second, at the box's
 * own size, and draws each distinct picture once (`render.ts`).
 */

import { requireTextFont, type TextFontId } from "@/lib/video/text-fonts"

export const TIMER_LABEL_MAX = 40
export const DEFAULT_TIMER_COLOR = "#ffffff"
export const DEFAULT_TIMER_FONT: TextFontId = "fredoka"
/** The ring's thickness in a 1080-tall frame, unless the clip says. */
export const DEFAULT_TIMER_LINE_WIDTH = 6
/** How see-through the faint whole ring behind the emptying one is. */
const TRACK_OPACITY = 0.25

export type TimerClip = {
  shape?: string
  x?: number
  y?: number
  toX?: number
  toY?: number
  lineWidth?: number
  color?: string
  fontId?: TextFontId
  durationMs: number
  timerAbove?: string
  timerBelow?: string
  timerRing?: boolean
  timerUp?: boolean
}

type Frame = { width: number; height: number }

export function isTimerClip(clip: { kind?: string; shape?: string }) {
  return clip.kind === "shape" && clip.shape === "timer"
}

/** A new timer: a square box in the middle of the frame, a third of its height. */
export function newTimerPlacement(frameRatio: number) {
  const half = 0.17
  const halfAcross = half / Math.max(frameRatio, 0.01)
  return { x: 0.5 - halfAcross, y: 0.5 - half, toX: 0.5 + halfAcross, toY: 0.5 + half }
}

/** The whole seconds the timer runs for: 25:00 for a 25-minute clip. */
export function timerTotalSeconds(clip: Pick<TimerClip, "durationMs">) {
  return Math.max(1, Math.round(clip.durationMs / 1000))
}

/** Which whole second of the timer this far into the clip is, from 0. */
export function timerSecondAt(clip: Pick<TimerClip, "durationMs">, msIntoClip: number) {
  const total = timerTotalSeconds(clip)
  return Math.min(total - 1, Math.max(0, Math.floor(msIntoClip / 1000)))
}

/** The time shown in second `second`: the time left, or the time gone when it counts up. */
export function timerText(clip: Pick<TimerClip, "durationMs" | "timerUp">, second: number) {
  const total = timerTotalSeconds(clip)
  const shown = clip.timerUp ? second : total - second
  const hours = Math.floor(shown / 3600)
  const minutes = Math.floor((shown % 3600) / 60)
  const seconds = shown % 60
  const two = (value: number) => String(value).padStart(2, "0")
  return total >= 3600 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${two(minutes)}:${two(seconds)}`
}

/** How much of the ring shows in second `second`: all of it at the start of a countdown. */
export function timerRingShare(clip: Pick<TimerClip, "durationMs" | "timerUp">, second: number) {
  const total = timerTotalSeconds(clip)
  return clip.timerUp ? second / total : (total - second) / total
}

/**
 * The export's moments: one picture per whole second of the clip. Seconds
 * fall on whole frames at 30 and 60 frames a second, so three hours never
 * drifts; the last one is cut short when the clip doesn't end on a second.
 */
export function timerExportWindows(clip: Pick<TimerClip, "durationMs">) {
  const total = timerTotalSeconds(clip)
  const windows: { fromMs: number; toMs: number; second: number }[] = []
  for (let second = 0; second < total; second += 1) {
    const fromMs = second * 1000
    if (fromMs >= clip.durationMs) break
    windows.push({ fromMs, toMs: Math.min(clip.durationMs, fromMs + 1000), second })
  }
  return windows
}

/** The timer's box in a frame's pixels. */
export function timerBox(clip: TimerClip, frame: Frame) {
  const left = Math.min(clip.x ?? 0.4, clip.toX ?? 0.6) * frame.width
  const right = Math.max(clip.x ?? 0.4, clip.toX ?? 0.6) * frame.width
  const top = Math.min(clip.y ?? 0.4, clip.toY ?? 0.6) * frame.height
  const bottom = Math.max(clip.y ?? 0.4, clip.toY ?? 0.6) * frame.height
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

function fmt(value: number) {
  return String(Math.round(value * 100) / 100)
}

/**
 * The timer's drawing in second `second`, in the box's own pixels with its
 * corner at 0, 0. `family` is what the words are set in: the browser's
 * family in the preview, the name inside the ttf in the export.
 */
export function timerMarkup(
  clip: TimerClip,
  box: { width: number; height: number },
  second: number,
  family: string,
  frameShortSide: number
) {
  const font = requireTextFont(clip.fontId ?? DEFAULT_TIMER_FONT)
  const color = clip.color && HEX_COLOR.test(clip.color) ? clip.color : DEFAULT_TIMER_COLOR
  const size = Math.min(box.width, box.height)
  const cx = box.width / 2
  const cy = box.height / 2
  const ringWidth = ((clip.lineWidth ?? DEFAULT_TIMER_LINE_WIDTH) * frameShortSide) / 1080
  const r = Math.max(1, size / 2 - ringWidth / 2)
  const parts: string[] = []
  if (clip.timerRing !== false) {
    const perimeter = 2 * Math.PI * r
    const share = timerRingShare(clip, second)
    // From the top, clockwise, as a circle draws itself on (shapes.ts).
    const d = `M${fmt(cx)} ${fmt(cy - r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx)} ${fmt(cy + r)}A${fmt(r)} ${fmt(r)} 0 1 1 ${fmt(cx)} ${fmt(cy - r)}`
    parts.push(
      `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${TRACK_OPACITY}" stroke-width="${fmt(ringWidth)}"/>`
    )
    if (share > 0) {
      parts.push(
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="${fmt(ringWidth)}" stroke-linecap="round" stroke-dasharray="${fmt(perimeter)}" stroke-dashoffset="${fmt(perimeter * (1 - share))}"/>`
      )
    }
  }
  const time = timerText(clip, second)
  const timeSize = size * (time.length > 5 ? 0.2 : 0.26)
  const labelSize = size * 0.085
  const words = (text: string, y: number, fontSize: number) =>
    `<text x="${fmt(cx)}" y="${fmt(y)}" text-anchor="middle" style="font-family:${family}" font-weight="${font.weight}" font-size="${fmt(fontSize)}" fill="${color}">${escapeXml(text)}</text>`
  // Each line's baseline is put so its letters sit centred on their row.
  const middle = (rowY: number, fontSize: number) => rowY + fontSize * ((font.ascent - font.descent) / 2) * 0.72
  parts.push(words(time, middle(cy, timeSize), timeSize))
  const above = clip.timerAbove?.trim().slice(0, TIMER_LABEL_MAX)
  const below = clip.timerBelow?.trim().slice(0, TIMER_LABEL_MAX)
  if (above) parts.push(words(above, middle(cy - size * 0.2, labelSize), labelSize))
  if (below) parts.push(words(below, middle(cy + size * 0.2, labelSize), labelSize))
  return parts.join("")
}

/** The export's picture for one second: the box alone, words in the ttf's family. */
export function timerSvg(clip: TimerClip, frame: Frame, second: number) {
  const box = timerBox(clip, frame)
  const width = Math.max(1, Math.round(box.width))
  const height = Math.max(1, Math.round(box.height))
  const family = requireTextFont(clip.fontId ?? DEFAULT_TIMER_FONT).svgFamily
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${timerMarkup(
    clip,
    { width, height },
    second,
    family,
    Math.min(frame.width, frame.height)
  )}</svg>`
}
