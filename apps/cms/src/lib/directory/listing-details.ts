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
export type ListingDayHours = { open: string; close: string }
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
    const entry = source[day]
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
    const open = cleanTime((entry as Record<string, unknown>).open)
    const close = cleanTime((entry as Record<string, unknown>).close)
    if (open && close) hours[day] = { open, close }
  }
  return hours
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
  const previous = hours[LISTING_WEEKDAYS[(dayIndex + 6) % 7]!]
  if (
    previous &&
    minutesFor(previous.open) >= minutesFor(previous.close) &&
    minutes < minutesFor(previous.close)
  ) {
    return `Open now · closes ${formatListingTime(previous.close)}`
  }
  const today = hours[day]
  if (!today) return "Closed today"
  const open = minutesFor(today.open)
  const close = minutesFor(today.close)
  const openNow =
    open < close
      ? minutes >= open && minutes < close
      : minutes >= open || minutes < close
  return openNow
    ? `Open now · closes ${formatListingTime(today.close)}`
    : `Closed now · open ${formatListingTime(today.open)}–${formatListingTime(today.close)}`
}

function isSafeMediaUrl(value: string) {
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
