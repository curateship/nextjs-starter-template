import { dateOfDay, formatDayDate } from "@/lib/travel/dates"
import type { Place } from "@/lib/travel/rules"

/**
 * Swap a rainy day (More Travel features part 9; Tyler: "From Google's place
 * type"). A card counts as outdoors when Google calls its place one of the
 * kinds below. Only places picked or pasted since 4 Nov 2026 carry Google's
 * kinds, so older cards never warn.
 */
export const OUTDOOR_KINDS = new Set([
  "park",
  "national_park",
  "state_park",
  "city_park",
  "garden",
  "botanical_garden",
  "beach",
  "hiking_area",
  "zoo",
  "wildlife_park",
  "wildlife_refuge",
  "amusement_park",
  "water_park",
  "campground",
  "picnic_ground",
  "playground",
  "dog_park",
  "marina",
  "ski_resort",
  "golf_course",
  "natural_feature",
  "scenic_spot",
  "vineyard",
  "farm",
])

/** A day this rainy or more warns its outdoor cards. */
export const RAINY_FROM = 70
/** A day is dry enough to move to when its chance of rain is under this. */
export const DRY_BELOW = 30

export function isOutdoors(place: Pick<Place, "kinds"> | null) {
  return Boolean(place?.kinds?.some((kind) => OUTDOOR_KINDS.has(kind)))
}

/**
 * For an outdoor card on a day with rain 70 out of 100 or more: "Rain on
 * Tue", and the trip day to move it to, the driest forecast day under 30, the
 * nearer one when two are as dry. `toDay` is null when no day is dry enough.
 * Null when the card isn't outdoors, or its day isn't that rainy or has no
 * forecast.
 */
export function rainyDayMove(
  card: { day: number | null; place: Pick<Place, "kinds"> | null },
  trip: { startDate: string | null },
  forecast: readonly { day: number; rain: number | null }[]
): { warning: string; toDay: number | null } | null {
  if (card.day === null || !isOutdoors(card.place)) return null
  const here = forecast.find((item) => item.day === card.day)
  if (!here || here.rain === null || here.rain < RAINY_FROM) return null
  const date = dateOfDay(trip.startDate, card.day)
  const warning = `Rain on ${date ? formatDayDate(date).split(" ")[0] : `Day ${card.day}`}`
  const from = card.day
  const dry = forecast
    .filter((item): item is { day: number; rain: number } => item.day !== from && item.rain !== null && item.rain < DRY_BELOW)
    .sort((a, b) => a.rain - b.rain || Math.abs(a.day - from) - Math.abs(b.day - from) || b.day - a.day)
  return { warning, toDay: dry[0]?.day ?? null }
}
