/**
 * When two events are the same event: the same title, ignoring capitals and
 * spacing, on the same start day. The AI step skips a draft that matches one
 * already on the site, and a suggested event that matches one is marked in
 * the queue (task events/37, Part 4). One rule, so the two never disagree.
 */
export function sameEventKey(title: string, startDate: string): string {
  return `${title.trim().toLowerCase().replace(/\s+/g, " ")}|${startDate}`
}
