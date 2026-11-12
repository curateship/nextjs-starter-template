import type { SavedPlace } from "@/lib/api/travel/saved-places"
import type { TripPlace } from "@/lib/api/travel/trips-dashboard"
import type { TripListRow } from "@/lib/api/travel/trips"
import { countdown, daysBetween, todayIn, tripHasEnded } from "@/lib/travel/dates"
import type { TripTab } from "@/lib/travel/trips-search"

/**
 * The Trips dashboard's sums, kept apart from the screens so each can be
 * tested on its own (Tyler, 12 Nov 2026).
 */

/**
 * Which Trips tab a trip is under. Upcoming holds every trip that hasn't
 * ended, trips with no dates included; Past the ones that have. A deleted
 * trip is in the Bin, whatever else it is.
 */
export function tabOf(row: Pick<TripListRow, "deletedAt" | "archived" | "startDate" | "days" | "timeZone">): TripTab {
  if (row.deletedAt) return "bin"
  if (row.archived) return "archived"
  return tripHasEnded(row) ? "past" : "upcoming"
}

/** Upcoming's folds (Tyler, 12 Nov 2026: "Upcoming by month"), in their order. */
export const MONTH_GROUPS = ["This month", "Next month", "Later", "No dates"] as const
export type MonthGroup = (typeof MONTH_GROUPS)[number]

/**
 * The fold an upcoming trip sits in: one on now or starting this calendar
 * month is This month, next calendar month is Next month, and the rest
 * Later. A trip with no dates has its own fold, last.
 */
export function monthGroupOf(row: Pick<TripListRow, "startDate" | "timeZone">, at: Date = new Date()): MonthGroup {
  if (!row.startDate) return "No dates"
  const [year, month] = todayIn(row.timeZone, at).split("-").map(Number)
  const [startYear, startMonth] = row.startDate.split("-").map(Number)
  const ahead = (startYear - year) * 12 + (startMonth - month)
  if (ahead <= 0) return "This month"
  if (ahead === 1) return "Next month"
  return "Later"
}

/**
 * The trip Overview leads with: the one on today when there is one, else
 * the soonest dated trip still to come. Archived trips and the Bin are left
 * out.
 */
export function nextTripOf(trips: readonly TripListRow[], at: Date = new Date()): TripListRow | null {
  const live = trips.filter((trip) => tabOf(trip) === "upcoming" && trip.startDate)
  const onNow = live.find((trip) => countdown(trip, at) === "on now")
  if (onNow) return onNow
  return (
    [...live]
      .filter((trip) => daysBetween(todayIn(trip.timeZone, at), trip.startDate!) > 0)
      .sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0] ?? null
  )
}

/** Which day of a trip that's on today, as "Day 3 of 7"; null when it isn't on. */
export function dayOfTripLine(trip: Pick<TripListRow, "startDate" | "days" | "timeZone">, at: Date = new Date()) {
  if (!trip.startDate || countdown(trip, at) !== "on now") return null
  const day = daysBetween(trip.startDate, todayIn(trip.timeZone, at)) + 1
  return `Day ${day} of ${trip.days}`
}

/**
 * Where an address is, read from its end: "1-1 Asakusa, Taito City, Tokyo,
 * Japan" is Japan, in Tokyo. Google writes the country last. A place typed
 * with no commas, or none at all, says nothing, and the Countries widget
 * says how many those are rather than guessing.
 */
export function whereFromAddress(address: string | null | undefined): { country: string; city: string | null } | null {
  const parts = (address ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  // A postcode written into the city's part ("Tokyo 111-0032") keeps its words only.
  const city = parts[parts.length - 2].replace(/\s*[\d-]{3,}.*$/, "").replace(/^[\d-]+\s*/, "").trim()
  return { country: parts[parts.length - 1], city: city || null }
}

/** One row of the Places section: a saved place, or a card from a trip (Go again and Been). */
export type PlaceRow =
  | { kind: "saved"; id: string; saved: SavedPlace }
  | { kind: "trip"; id: string; card: TripPlace }

/** What every place has, whichever kind it is. */
export function placeFacts(row: PlaceRow) {
  const source = row.kind === "saved" ? row.saved : row.card
  return {
    title: source.title,
    typeId: source.typeId,
    place: source.place,
    photoUrl: source.photoUrl,
    website: source.website,
    phone: source.phone,
    menuUrl: source.menuUrl,
  }
}
