type TouchedVenue = "kucoin" | "phemex"

const scope = globalThis as {
  __tradeTouchedAt?: Map<TouchedVenue, number>
}

function marks(): Map<TouchedVenue, number> {
  return (scope.__tradeTouchedAt ??= new Map())
}

/** Records that this app just changed an account at one exchange. */
export function venueTouched(venue: TouchedVenue): void {
  marks().set(venue, Date.now())
}

/** Returns the last local account change for one exchange, or zero. */
export function venueTouchedAt(venue: TouchedVenue): number {
  return marks().get(venue) ?? 0
}

/** Forgets one exchange's last local change. Only tests need this. */
export function clearVenueTouched(venue: TouchedVenue): void {
  marks().delete(venue)
}
