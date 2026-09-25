export const MAX_LISTING_GALLERY_IMAGES = 12

export const LISTING_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const

export type ListingWeekday = (typeof LISTING_WEEKDAYS)[number]
/** One stretch of a day a place is open, as 24-hour `HH:MM` times. */
export type ListingShift = { open: string; close: string }
/**
 * A day's opening: one stretch, or nothing at all when the day is closed.
 *
 * A day used to be able to carry a second stretch, for a restaurant that serves
 * lunch and then dinner. Tyler removed it on 25 Sep 2026, so a day is one pair
 * of times and a second stretch saved before then is ignored everywhere it used
 * to be read.
 */
export type ListingDayHours = ListingShift
export type ListingHours = Record<ListingWeekday, ListingDayHours | null>
export type ListingCoordinates = { latitude: number; longitude: number }

export const LISTING_WEEKDAY_LABELS: Record<ListingWeekday, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

export function blankListingHours(): ListingHours {
  return Object.fromEntries(
    LISTING_WEEKDAYS.map((day) => [day, null])
  ) as ListingHours
}

export function cleanListingGallery(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const gallery: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const url = item.trim().slice(0, 600)
    if (!isSafeMediaUrl(url) || seen.has(url)) continue
    seen.add(url)
    gallery.push(url)
    if (gallery.length === MAX_LISTING_GALLERY_IMAGES) break
  }
  return gallery
}

export function cleanListingHours(value: unknown): ListingHours {
  const hours = blankListingHours()
  if (!value || typeof value !== "object" || Array.isArray(value)) return hours
  const source = value as Record<string, unknown>
  for (const day of LISTING_WEEKDAYS) {
    const shift = cleanShift(source[day])
    if (!shift) continue
    hours[day] = shift
  }
  return hours
}

/** A pair of times, or nothing. A half-filled pair is not a shift. */
function cleanShift(value: unknown): ListingShift | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const entry = value as Record<string, unknown>
  const open = cleanTime(entry.open)
  const close = cleanTime(entry.close)
  return open && close ? { open, close } : null
}

/**
 * A day's stretches: the one it has, or none when it is closed.
 *
 * Still a list rather than one value, because every caller walks a day's
 * stretches and a closed day has to come back as nothing to walk.
 */
export function listingDayShifts(
  value: ListingDayHours | null
): ListingShift[] {
  return value ? [{ open: value.open, close: value.close }] : []
}

/**
 * "11:30 AM–3 PM, 5–10 PM", which is how a day reads on the page.
 *
 * A day that opens and closes at the same minute never shuts, and "12 AM–12 AM"
 * is not how anybody says that.
 */
export function formatListingDayHours(value: ListingDayHours | null) {
  return listingDayShifts(value)
    .map((shift) =>
      shift.open === shift.close
        ? "Open 24 hours"
        : `${formatListingTime(shift.open)}–${formatListingTime(shift.close)}`
    )
    .join(", ")
}

/** A save accepts a complete valid pair or no pin at all. */
export function requireListingCoordinates(
  latitude: unknown,
  longitude: unknown
): ListingCoordinates | null {
  const bothBlank = isBlankCoordinate(latitude) && isBlankCoordinate(longitude)
  if (bothBlank) return null
  const coordinates = cleanListingCoordinates(latitude, longitude)
  if (!coordinates) {
    throw new Error(
      "Add both coordinates using numbers from -90 to 90 and -180 to 180."
    )
  }
  return coordinates
}

/** A public read treats hand-edited or incomplete database values as no pin. */
export function cleanListingCoordinates(
  latitude: unknown,
  longitude: unknown
): ListingCoordinates | null {
  const lat = numericCoordinate(latitude)
  const lng = numericCoordinate(longitude)
  if (lat === null || lng === null) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { latitude: lat, longitude: lng }
}

/** Pulls a point from a full Google Maps URL without following shortened links. */
export function coordinatesFromGoogleMapsUrl(
  input: string
): ListingCoordinates | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }
  const hostname = url.hostname.toLowerCase()
  if (
    !/^(?:(?:www|maps)\.)?google\.(?:com|ca|co\.uk|com\.au|de|fr|es|it|nl|co\.jp)$/.test(
      hostname
    )
  ) {
    return null
  }

  const pathPoint = url.pathname.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (pathPoint) return cleanListingCoordinates(pathPoint[1], pathPoint[2])

  for (const key of ["query", "q", "destination"]) {
    const value = url.searchParams.get(key)
    const match = value?.match(
      /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/
    )
    if (match) return cleanListingCoordinates(match[1], match[2])
  }
  return null
}

export function googleMapsDirectionsUrl(coordinates: ListingCoordinates) {
  const destination = `${coordinates.latitude},${coordinates.longitude}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

export function formatListingTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  const date = new Date(2000, 0, 1, hours, minutes)
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: minutes ? "2-digit" : undefined,
  }).format(date)
}

export function listingHoursStatus(hours: ListingHours, now = new Date()) {
  const dayIndex = (now.getDay() + 6) % 7
  const day = LISTING_WEEKDAYS[dayIndex]!
  const minutes = now.getHours() * 60 + now.getMinutes()
  // Yesterday's last stretch can still be running: a bar that opens at 8pm and
  // closes at 2am is open at one in the morning on the following day's page.
  const ranPastMidnight = listingDayShifts(
    hours[LISTING_WEEKDAYS[(dayIndex + 6) % 7]!]
  ).find(
    (shift) =>
      minutesFor(shift.open) >= minutesFor(shift.close) &&
      minutes < minutesFor(shift.close)
  )
  if (ranPastMidnight) {
    return ranPastMidnight.open === ranPastMidnight.close
      ? "Open now · all day"
      : `Open now · closes ${formatListingTime(ranPastMidnight.close)}`
  }

  const today = hours[day]
  if (!today) return "Closed today"
  const shifts = listingDayShifts(today)
  const openNow = shifts.find((shift) => {
    const open = minutesFor(shift.open)
    const close = minutesFor(shift.close)
    return open < close
      ? minutes >= open && minutes < close
      : minutes >= open || minutes < close
  })
  if (openNow) {
    return openNow.open === openNow.close
      ? "Open now · all day"
      : `Open now · closes ${formatListingTime(openNow.close)}`
  }

  // Before opening time the useful sentence is when they open. After closing
  // time there is nothing left today, so the day's own times are what is shown.
  const next = shifts.find((shift) => minutesFor(shift.open) > minutes)
  const shown = next ?? shifts[0]!
  return `Closed now · open ${formatListingTime(shown.open)}–${formatListingTime(shown.close)}`
}

/**
 * A picture address a page may point at: a same-site path or an http(s) URL.
 * Shared with the custom-field cleaner so a photo field and the gallery agree
 * on what counts as a picture rather than each deciding for itself.
 */
export function isSafeMediaUrl(value: string) {
  if (!value) return false
  if (value.startsWith("/") && !value.startsWith("//")) return true
  try {
    const url = new URL(value)
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function cleanTime(value: unknown) {
  if (typeof value !== "string") return null
  const time = value.trim()
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : null
}

function numericCoordinate(value: unknown) {
  if (isBlankCoordinate(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isBlankCoordinate(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  )
}

function minutesFor(value: string) {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}
