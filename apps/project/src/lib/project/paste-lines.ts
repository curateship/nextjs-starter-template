import { LIMITS } from "@/lib/project/rules"

/** A bullet, a number or a checkbox at the start of a pasted line. */
const LINE_MARK = /^\s*(?:[-*•–—·]|\d+[.)]|\[[ xX]?\])\s+/

/**
 * Pasted meeting notes as task titles: one per line, with blank lines and
 * bullet marks left out, each cut to the longest title a task can have.
 */
export function linesToTitles(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(LINE_MARK, "").trim())
    .filter(Boolean)
    .map((line) => line.slice(0, LIMITS.taskTitle))
}
