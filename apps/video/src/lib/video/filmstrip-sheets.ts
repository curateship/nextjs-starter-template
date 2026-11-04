/**
 * How the frames along a video clip are laid out in pictures.
 *
 * A video up to four minutes gets a frame every two seconds, as it always
 * has. A longer one gets a frame every five seconds however long it is, so
 * an hour-long clip has 720. One picture holds a grid of up to 10 across and
 * 12 down, 120 frames; a longer strip is spread over several pictures, its
 * "sheets", so no one picture grows too big for the browser to draw.
 *
 * The worker and the timeline both read this file, so the two always agree
 * on where frame 437 is.
 */

export const FILMSTRIP_COLUMNS = 10
export const FILMSTRIP_ROWS_PER_SHEET = 12
const SHORT_SECONDS_PER_FRAME = 2
const LONG_SECONDS_PER_FRAME = 5
/** Up to this many frames, a strip keeps a frame every two seconds. */
const SHORT_STRIP_FRAMES = 120

export type FilmstripPlan = {
  frameCount: number
  columns: number
  rowsPerSheet: number
  sheetCount: number
}

export function filmstripPlan(durationSeconds: number): FilmstripPlan {
  const twoSecondFrames = Math.max(
    1,
    Math.round(durationSeconds / SHORT_SECONDS_PER_FRAME)
  )
  const frameCount =
    twoSecondFrames <= SHORT_STRIP_FRAMES
      ? twoSecondFrames
      : Math.ceil(durationSeconds / LONG_SECONDS_PER_FRAME)
  const columns = Math.min(FILMSTRIP_COLUMNS, frameCount)
  const rowsPerSheet = Math.min(
    FILMSTRIP_ROWS_PER_SHEET,
    Math.ceil(frameCount / columns)
  )
  return {
    frameCount,
    columns,
    rowsPerSheet,
    sheetCount: Math.ceil(frameCount / (columns * rowsPerSheet)),
  }
}

/**
 * Where one sheet is stored. The first keeps the strip's own address, so a
 * strip of one sheet is stored exactly as strips always were.
 */
export function filmstripSheetPath(firstSheetPath: string, sheet: number) {
  return sheet === 0
    ? firstSheetPath
    : firstSheetPath.replace(/(\.[a-z0-9]+)?$/i, `-${sheet}$1`)
}

/** Which sheet a frame is on, and where in that sheet's grid. */
export function framePlace(
  index: number,
  layout: { columns: number; rowsPerSheet: number }
) {
  const perSheet = layout.columns * layout.rowsPerSheet
  const local = index % perSheet
  return {
    sheet: Math.floor(index / perSheet),
    column: local % layout.columns,
    row: Math.floor(local / layout.columns),
  }
}
