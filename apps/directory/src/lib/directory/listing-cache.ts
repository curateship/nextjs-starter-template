import {
  loadListingForEdit,
  type ListingForEdit,
} from "@/lib/api/directory/listings"

/**
 * Listings already fetched for the edit window.
 *
 * The window loads its own record, which is what makes a link to one listing
 * work — but waiting for that read after the click is what put a spinner in
 * front of every open. So the list asks for a row's record the moment the
 * pointer touches it: by the time the click lands the answer is usually
 * already here, and the window opens straight into the filled form.
 *
 * `readSettled` is the half that matters for how it feels. Reading the value
 * during render is what makes a warm open show no spinner at all — going
 * through the promise instead would always paint one frame of "loading"
 * first, however fast the answer was.
 */

type Entry = {
  promise: Promise<ListingForEdit | null>
  /** Set once the read lands, so a warm open can read it during render. */
  settled?: { value: ListingForEdit | null }
}

const entries = new Map<string, Entry>()

/**
 * How many records to keep. Each one is a whole listing, write-up included,
 * and the pointer touches a new row every time it crosses the table — without
 * a cap, paging through a few thousand listings would quietly hold every one
 * of them. Well above a page of rows, so nothing on screen is ever evicted.
 */
const MAX_ENTRIES = 60

/** The record, from here if we have it and from the server if we do not. */
export function getListing(id: string): Promise<ListingForEdit | null> {
  const existing = entries.get(id)
  if (existing) return existing.promise

  // Oldest out first. `Map` keeps insertion order, so the first key is the
  // one fetched longest ago.
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }

  const promise = loadListingForEdit(id)
  const entry: Entry = { promise }
  entries.set(id, entry)
  promise.then(
    (value) => {
      entry.settled = { value }
    },
    () => {
      // A failure is not remembered: the window asks again and reports it,
      // rather than this handing the same error back forever.
      entries.delete(id)
    }
  )
  return promise
}

/** Start the read now, for a row the pointer is on but has not opened. */
export function prefetchListing(id: string) {
  void getListing(id).catch(() => {
    // Nothing to do here — a failed prefetch just means the window will ask
    // again and show the reason itself.
  })
}

/** The record if it is already here, or null. Safe to call during render. */
export function readSettledListing(id: string) {
  return entries.get(id)?.settled ?? null
}

/**
 * Forget everything. Called after a save or a delete: what is held here is a
 * full record, and a stale one would put old words back on screen.
 */
export function forgetListings() {
  entries.clear()
}
