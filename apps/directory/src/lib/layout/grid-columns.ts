/**
 * How many cards a public grid puts on one line.
 *
 * A home page row can name its own number in Settings → Public pages → Front
 * page. The number is a ceiling rather than a promise: a phone always draws one
 * card per line whatever the row asked for, because four cards across a 390px
 * screen is four slivers. The number is reached on a desktop.
 *
 * The classes are written out rather than built from the number. Tailwind reads
 * the source for class names, so `grid-cols-${n}` would compile to nothing.
 */

/** 0 is the row's own arrangement, which is what every saved row had before. */
export const PUBLIC_GRID_COLUMNS_AUTO = 0
export const PUBLIC_GRID_COLUMNS_MAX = 4

const CLASS_NAMES: Record<number, string> = {
  1: "grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
}

/** A whole number from 1 to 4, or 0 for "leave the grid as it was". */
export function cleanPublicGridColumns(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    return PUBLIC_GRID_COLUMNS_AUTO
  }
  return value >= 1 && value <= PUBLIC_GRID_COLUMNS_MAX
    ? value
    : PUBLIC_GRID_COLUMNS_AUTO
}

/**
 * The column classes for a chosen number, or `fallback` when the row never
 * chose one. Every grid passes its own fallback, because the arrangement a
 * grid has always had is not the same in all of them.
 */
export function publicGridColumnsClassName(
  columns: number | undefined,
  fallback: string
): string {
  return CLASS_NAMES[cleanPublicGridColumns(columns)] ?? fallback
}
