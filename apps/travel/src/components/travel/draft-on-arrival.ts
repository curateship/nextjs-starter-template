// A trip made from New trip with "Fill it with a first plan" opens with the
// Draft a plan window (Tyler, 3 Nov 2026: "Both"), so the plan is still
// checked before anything is saved.
let draftOnArrival: string | null = null

/** Opens the Draft a plan window once the trip's page is up. */
export function draftWhenOpened(tripId: string) {
  draftOnArrival = tripId
}

/** Whether the trip was just made with a first plan asked for. Only reads, so a render may ask twice. */
export function wantsDraftOnArrival(tripId: string) {
  return draftOnArrival === tripId
}

/** The window has closed, so coming back to the trip later doesn't open it again. */
export function forgetDraftOnArrival() {
  draftOnArrival = null
}
