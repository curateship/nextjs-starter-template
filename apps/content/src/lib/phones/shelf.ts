/**
 * The rack map's slots (part 60 of the phone farm). The shelf is `rows` by
 * `columns`, typed in Settings → Phones (Tyler, 18 Oct 2026), and slots are
 * numbered left to right, top to bottom: with two rows of five, slot 7 is the
 * second from the left on the lower row.
 */

/** The slot a phone's typed shelf slot names, when it is a whole number on the shelf; null otherwise. */
export function slotOnShelf(shelfSlot: string, rows: number, columns: number): number | null {
  const typed = shelfSlot.trim()
  if (!/^\d+$/.test(typed)) return null
  const slot = Number(typed)
  return slot >= 1 && slot <= rows * columns ? slot : null
}

/** Where a slot sits: its row and column, both counted from 1. */
export function slotPlace(slot: number, columns: number): { row: number; column: number } {
  const row = Math.ceil(slot / columns)
  return { row, column: slot - (row - 1) * columns }
}
