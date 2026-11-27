import type { CSSProperties } from "react"

import { lineWidthRatio, type TextFont } from "@/lib/video/text-fonts"

/**
 * Where a text clip's lines break.
 *
 * A drawing has no idea how to wrap text on its own, so the export breaks
 * each line where the next word would pass the width, measured in the real
 * face the way the browser measures it, and always breaks where a newline was
 * typed. The safe box has no face to measure with in the browser, so it
 * guesses each line's width from an average letter width instead, to work
 * out how tall a caption will stand.
 */

/** How much of the frame's width a line may take before it wraps. */
export const TEXT_WRAP_WIDTH = 0.9

/** The narrowest a caption may be told to wrap, as a share of the frame. */
export const TEXT_WRAP_WIDTH_MIN = 0.3

/** Line height as a multiple of the font size, in the preview and export. */
export const TEXT_LINE_HEIGHT = 1.15

/** How wide a run of words is, in pixels. */
export type LineMeasure = (words: string) => number

/** A line's width guessed from the face's average letter width. */
export function guessLineWidth(font: TextFont, fontSize: number): LineMeasure {
  return (words) => words.length * fontSize * lineWidthRatio(font, words)
}

export function wrapTextLines(
  text: string,
  maxWidth: number,
  measure: LineMeasure
) {
  const lines: string[] = []
  for (const rawLine of text.split("\n")) {
    if (measure(rawLine) <= maxWidth) {
      lines.push(rawLine)
      continue
    }
    let current = ""
    for (const word of rawLine.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word
      if (current && measure(candidate) > maxWidth) {
        lines.push(current)
        current = word
      } else {
        current = candidate
      }
    }
    lines.push(current)
  }
  return lines
}

/** The thickest outline a text clip may have, in the 1080-tall design space. */
export const TEXT_STROKE_WIDTH_MAX = 12

/** What an outline starts as when it is switched on in the inspector. */
export const DEFAULT_TEXT_STROKE_COLOR = "#000000"
export const DEFAULT_TEXT_STROKE_WIDTH = 4

/**
 * The outline as the browser draws it. A browser's text outline sits on the
 * edge of each letter, half inside and half out, so it is drawn twice as wide
 * and underneath the letters: the width asked for shows outside them and
 * none of the letter is lost. The export draws it the same way.
 */
export function textOutlineCss(
  strokeColor: string | undefined,
  strokeWidth: number | undefined,
  scale: number
): CSSProperties {
  if (!strokeColor || !strokeWidth) return {}
  return {
    WebkitTextStroke: `${strokeWidth * 2 * scale}px ${strokeColor}`,
    paintOrder: "stroke fill",
  }
}
