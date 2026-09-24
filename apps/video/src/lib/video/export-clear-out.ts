/**
 * Clearing out old exports: the age choices both the browser and the server
 * need. The counting and the deleting live in
 * `src/server/video/export-clear-out.ts`.
 */

/** How old a finished export has to be to be cleared out. The value is months. */
export const CLEAR_OUT_AGE_CHOICES = [
  { value: "1", label: "A month ago" },
  { value: "3", label: "3 months ago" },
  { value: "6", label: "6 months ago" },
  { value: "12", label: "A year ago" },
] as const

export type ClearOutAgeChoice = (typeof CLEAR_OUT_AGE_CHOICES)[number]["value"]

export const CLEAR_OUT_AGE_VALUES = CLEAR_OUT_AGE_CHOICES.map(
  (choice) => choice.value
) as [ClearOutAgeChoice, ...ClearOutAgeChoice[]]

export const DEFAULT_CLEAR_OUT_AGE: ClearOutAgeChoice = "6"

/** The moment an export must have finished before to be cleared out. */
export function clearOutCutoff(choice: ClearOutAgeChoice, at: Date) {
  const cutoff = new Date(at)
  cutoff.setMonth(cutoff.getMonth() - Number(choice))
  return cutoff
}

/**
 * What a clear-out would take, counted on the server. The shared ones are
 * counted apart because they are left alone unless asked for by name.
 */
export type ClearOutPreview = {
  /** The cutoff the counts were made against, sent back with the delete. */
  before: string
  exports: number
  bytes: number
  shared_exports: number
  shared_bytes: number
}

export type ClearOutResult = {
  deleted: number
  bytes_freed: number
  /** Exports kept because their file would not come out of storage. */
  failed: number
}
