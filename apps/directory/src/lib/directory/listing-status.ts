/**
 * A listing's three states, named once for the database check, the API, the
 * Listings screen's filter and the window's Status picker.
 *
 * Events, posts and deals have only the first two, which is why this is not
 * `LISTING_STATUS_FILTERS` in `listing-sort.ts`: that list is shared by all
 * four screens.
 *
 * **Closed** is a business that has shut for good. Its page stays up, saying
 * so, because deleting it would break every link Google and other websites
 * hold. It is in no list: not browse, search, a category, the front page, the
 * map or "Also nearby". Hiding a listing is what draft is for.
 */
export const DIRECTORY_LISTING_STATUSES = [
  "draft",
  "published",
  "closed",
] as const

export type ListingStatus = (typeof DIRECTORY_LISTING_STATUSES)[number]

export const DIRECTORY_LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
}

/**
 * The states whose page a visitor can open. Every list asks for `published`
 * alone; only a read of one listing by its address uses this.
 */
export const LISTING_PAGE_STATUSES: readonly ListingStatus[] = [
  "published",
  "closed",
]

/**
 * A stored value read back. The database's check allows only these three, so
 * anything else is a broken row and says so rather than passing as a draft.
 */
export function readListingStatus(value: string): ListingStatus {
  if ((DIRECTORY_LISTING_STATUSES as readonly string[]).includes(value)) {
    return value as ListingStatus
  }
  throw new Error(`A listing has a status this app does not know: ${value}.`)
}
