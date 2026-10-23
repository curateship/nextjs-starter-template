/**
 * The listings this browser opened last, newest first, for the "Recently
 * viewed" row.
 *
 * Kept in localStorage and nowhere else: nothing about it reaches the server
 * until the row asks for fresh cards. localStorage belongs to one address, and
 * every site has an address of its own, so site A's list is never read on
 * site B. The server checks the ids against the visited site as well, so even
 * a hand-edited list can only bring back this site's published listings.
 *
 * Every read and write is wrapped. A private window, a blocked site or a full
 * store throws on access, and the answer then is an empty list, which draws no
 * row at all.
 */

const STORAGE_KEY = "directory-recently-viewed"

/** How many ids this browser keeps. */
export const RECENTLY_VIEWED_KEPT = 8

/** How many cards the row draws. */
export const RECENTLY_VIEWED_SHOWN = 4

/** Listing ids are 36-character UUIDs. Anything else in storage is ignored. */
const LISTING_ID = /^[\w-]{1,36}$/

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** The stored ids, newest first. Empty when there are none or storage is closed. */
export function readRecentlyViewed(): string[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const ids = parsed.filter(
      (id): id is string => typeof id === "string" && LISTING_ID.test(id)
    )
    return [...new Set(ids)].slice(0, RECENTLY_VIEWED_KEPT)
  } catch {
    return []
  }
}

/** Puts a listing at the front, dropping its older place and the oldest past eight. */
export function rememberViewed(listingId: string) {
  if (!LISTING_ID.test(listingId)) return
  const next = [
    listingId,
    ...readRecentlyViewed().filter((id) => id !== listingId),
  ].slice(0, RECENTLY_VIEWED_KEPT)
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Full or blocked. The row simply has nothing new to show.
  }
}

export function clearRecentlyViewed() {
  try {
    storage()?.removeItem(STORAGE_KEY)
  } catch {
    // Blocked storage held nothing to clear.
  }
}
