/**
 * What a published listing can be missing, for the Needs work row of the
 * Listings dashboard (Tyler's pick, 24 Nov 2026: "Needs work list"). The
 * server finds the listings with SQL that says the same four things, and a
 * test holds the two together.
 *
 * - **Photo:** no featured photo.
 * - **Hours:** no day with both an opening and a closing time.
 * - **Write-up:** the long text on the listing's page has no words in it.
 * - **Category:** filed under no category.
 */
export const NEEDS_WORK_GAPS = ["photo", "hours", "writeUp", "category"] as const

export type NeedsWorkGap = (typeof NEEDS_WORK_GAPS)[number]

/** The chip on a row: what is missing. */
export const NEEDS_WORK_GAP_LABELS: Record<NeedsWorkGap, string> = {
  photo: "No photo",
  hours: "No opening hours",
  writeUp: "No write-up",
  category: "No category",
}

/** The Filter's choices: what the row is narrowed to. */
export const NEEDS_WORK_FILTER_LABELS: Record<NeedsWorkGap, string> = {
  photo: "A photo",
  hours: "Opening hours",
  writeUp: "A write-up",
  category: "A category",
}

/**
 * The one gap a listing's owner can fill from My listings, which is the
 * photo: their change form has no hours, write-up or categories (Tyler,
 * 24 Nov 2026: "Only gaps they can fix").
 */
export function hasNoPhoto(listing: { featuredImage: string }): boolean {
  return !listing.featuredImage.trim()
}
