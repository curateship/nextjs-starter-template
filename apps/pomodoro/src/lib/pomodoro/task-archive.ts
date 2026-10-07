/**
 * The Tasks archive's page size and heading, browser-safe so the server's cut
 * and the words on the page read the same number.
 */

/** Roughly how many past tasks one page of the archive holds. */
export const ARCHIVE_PAGE_ROWS = 50

/**
 * The Past tasks panel's label: "Past tasks · 52+" while older days exist, so
 * the count never reads as everything somebody ever did, and the plain count
 * once it is all there.
 */
export function describeArchiveCount(count: number, hasOlder: boolean) {
  // Nothing listed yet says no number at all: "0+" counts nothing.
  if (!count) return "Past tasks"
  return `Past tasks · ${count}${hasOlder ? "+" : ""}`
}
