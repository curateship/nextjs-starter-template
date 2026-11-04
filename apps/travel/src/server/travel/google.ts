import { and, eq } from "drizzle-orm"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import {
  openingHoursSchema,
  type OpeningHours,
  type Place,
  type TravelMode,
} from "@/lib/travel/rules"
import { db } from "@/server/db"
import { travelRouteTimes } from "@/server/travel/schema"

/**
 * Travel's calls to Google Maps Platform. Server only: the key never reaches
 * the browser. The key needs two Google Cloud APIs switched on, Places API (New)
 * for suggestions and place details, and Routes API for travel times.
 *
 * The key is read on every call rather than once at load, so a key added to
 * the settings works without a restart and tests can switch it per test.
 */

const TIMEOUT_MS = 10_000
const PLACES = "https://places.googleapis.com/v1"
const ROUTES = "https://routes.googleapis.com/directions/v2:computeRoutes"

const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "regularOpeningHours",
  "websiteUri",
  "internationalPhoneNumber",
  // More Travel features: Google's rating and price (part 1), its kinds of place for outdoors (part 9),
  // and its photos, for the picture of a picked place (part 2).
  "rating",
  "userRatingCount",
  "priceLevel",
  "primaryType",
  "types",
  "photos",
].join(",")

const ROUTE_MODE: Record<TravelMode, string> = {
  walk: "WALK",
  transit: "TRANSIT",
  drive: "DRIVE",
}

export type PlaceSuggestion = {
  placeId: string
  /** The place's own name, such as "Kinkaku-ji". */
  name: string
  /** The rest of the line, such as "Kyoto, Japan". */
  detail: string
}

export type PlaceDetails = {
  place: Place
  openingHours: OpeningHours | null
  website: string | null
  phone: string | null
  /** Google's name for the place's first photo, such as "places/ChIJ…/photos/Aa…", or null. */
  photoName: string | null
}

/** Google's price words as 0 (free) to 4. */
const PRICE_LEVEL: Record<string, number> = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
}

/**
 * What Google says of a place beyond its address (More Travel features parts
 * 1 and 9): its stars, how many reviews, its price and its kinds of place.
 * Anything Google left out, or sent in a shape Travel doesn't expect, is left
 * off rather than guessed.
 */
export function placeExtras(body: GoogleExtras): Pick<Place, "rating" | "ratingCount" | "priceLevel" | "kinds"> {
  const rating = typeof body.rating === "number" && body.rating >= 0 && body.rating <= 5 ? Math.round(body.rating * 10) / 10 : null
  const ratingCount =
    typeof body.userRatingCount === "number" && Number.isInteger(body.userRatingCount) && body.userRatingCount >= 0
      ? body.userRatingCount
      : null
  const priceLevel = typeof body.priceLevel === "string" ? (PRICE_LEVEL[body.priceLevel] ?? null) : null
  const kinds = [...new Set([body.primaryType, ...(body.types ?? [])])]
    .filter((kind): kind is string => typeof kind === "string" && /^[a-z_]{1,60}$/.test(kind))
    .slice(0, 30)
  return { rating, ratingCount, priceLevel, kinds }
}

/** A Google photo's name, such as "places/ChIJ…/photos/Aa…". Nothing else is ever asked for. */
export const PHOTO_NAME = /^places\/[\w-]+\/photos\/[\w-]+$/

/** The first photo's name, when it is shaped like one of Google's. */
export function firstPhotoName(photos: { name?: string }[] | undefined) {
  const name = photos?.[0]?.name
  return name && PHOTO_NAME.test(name) ? name : null
}

export type LatLng = { lat: number; lng: number }

export function googleEnabled(): boolean {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim())
}

function googleKey(): string {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim()
  if (!key) throw new Error(TRAVEL_ERRORS.googleOff)
  return key
}

/** One request to Google. Anything but a 2xx answer, or no answer in 10 seconds, is googleFailed. */
async function askGoogle(url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    throw new Error(TRAVEL_ERRORS.googleFailed)
  }
  if (!response.ok) throw new Error(TRAVEL_ERRORS.googleFailed)
  try {
    return await response.json()
  } catch {
    throw new Error(TRAVEL_ERRORS.googleFailed)
  }
}

/** Places that match what's typed so far. Google bills the typing and the pick as one session. */
export async function autocompletePlaces(
  query: string,
  sessionToken: string
): Promise<PlaceSuggestion[]> {
  const key = googleKey()
  const input = query.trim()
  if (!input) return []
  const body = (await askGoogle(`${PLACES}/places:autocomplete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key },
    body: JSON.stringify({ input, sessionToken }),
  })) as GoogleAutocomplete
  const rows: PlaceSuggestion[] = []
  // Google also suggests plain search phrases ("queryPrediction"). Only real places can be picked.
  for (const suggestion of body.suggestions ?? []) {
    const prediction = suggestion.placePrediction
    if (!prediction?.placeId) continue
    const name = prediction.structuredFormat?.mainText?.text ?? prediction.text?.text ?? ""
    if (!name) continue
    rows.push({
      placeId: prediction.placeId,
      name,
      detail: prediction.structuredFormat?.secondaryText?.text ?? "",
    })
  }
  return rows
}

/** A picked place's name, address, position, hours, website and phone. */
export async function placeDetails(placeId: string, sessionToken: string): Promise<PlaceDetails> {
  const key = googleKey()
  const url = new URL(`${PLACES}/places/${encodeURIComponent(placeId)}`)
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken)
  const body = (await askGoogle(url.toString(), {
    method: "GET",
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": DETAIL_FIELDS },
  })) as GooglePlace
  const lat = body.location?.latitude
  const lng = body.location?.longitude
  const hasPosition =
    typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  return {
    place: {
      name: (body.displayName?.text ?? "").trim().slice(0, 200),
      address: (body.formattedAddress ?? "").trim().slice(0, 400),
      lat: hasPosition ? lat : null,
      lng: hasPosition ? lng : null,
      placeId: (body.id ?? placeId).slice(0, 300),
      ...placeExtras(body),
    },
    openingHours: toOpeningHours(body.regularOpeningHours?.periods),
    website: body.websiteUri?.startsWith("http") ? body.websiteUri.slice(0, 2000) : null,
    phone: body.internationalPhoneNumber ? body.internationalPhoneNumber.slice(0, 40) : null,
    photoName: firstPhotoName(body.photos),
  }
}

const DAY_MINUTES = 24 * 60
const WEEK_MINUTES = 7 * DAY_MINUTES

const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`

/**
 * Google's weekly opening periods as Travel's seven days of spans, 0 = Sunday.
 *
 * - A place open around the clock comes as one period with no close. Every day
 *   becomes 00:00 to 23:59.
 * - A span that runs past midnight stays on the day it opens, so Friday 22:00
 *   to Saturday 02:00 is Friday's "22:00" to "02:00".
 * - A span that lasts a whole day or more is split into one span per day.
 * - A day open from midnight to midnight is written 00:00 to 23:59, since
 *   "00:00" to "00:00" would read as closed.
 *
 * Null when Google sent no hours or the result doesn't fit the schema.
 */
export function toOpeningHours(periods: GooglePeriod[] | undefined): OpeningHours | null {
  if (!periods || periods.length === 0) return null
  const days: { open: number; close: number }[][] = [[], [], [], [], [], [], []]
  const at = (point: GooglePoint) =>
    ((point.day ?? 0) % 7) * DAY_MINUTES + (point.hour ?? 0) * 60 + (point.minute ?? 0)

  for (const period of periods) {
    if (!period.open) continue
    if (!period.close) {
      for (const day of days) day.push({ open: 0, close: DAY_MINUTES - 1 })
      continue
    }
    const start = at(period.open)
    let end = at(period.close)
    if (end <= start) end += WEEK_MINUTES
    let cursor = start
    while (cursor < end) {
      const day = Math.floor(cursor / DAY_MINUTES)
      const dayStart = day * DAY_MINUTES
      const open = cursor - dayStart
      if (end - cursor < DAY_MINUTES) {
        // Fits in one span from this day's opening, maybe past midnight.
        days[day % 7].push({ open, close: (end - dayStart) % DAY_MINUTES })
        break
      }
      // A whole day, or the rest of it: open until 23:59 and carry on tomorrow.
      days[day % 7].push({ open, close: DAY_MINUTES - 1 })
      cursor = dayStart + DAY_MINUTES
    }
  }

  const hours = days.map((spans) =>
    spans
      .sort((a, b) => a.open - b.open)
      .slice(0, 4)
      .map((span) => ({ open: clock(span.open), close: clock(span.close) }))
  )
  const checked = openingHoursSchema.safeParse(hours)
  return checked.success ? checked.data : null
}

/** "35.01234,135.67890". Rounded so a pin moved by a hair still hits the saved time. */
export function routeKey(point: LatLng): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
}

/**
 * Whole minutes from one place to another, walking, by transit or by car.
 *
 * Saved in `travel_route_times` by both positions and the mode, so the same
 * pair is only asked again when an address changes and moves its position.
 * Null when Google finds no route, which happens most with transit; a missing
 * route isn't saved, so it is asked again next time.
 */
export async function routeMinutes(
  from: LatLng,
  to: LatLng,
  mode: TravelMode
): Promise<number | null> {
  const key = googleKey()
  const fromKey = routeKey(from)
  const toKey = routeKey(to)
  if (fromKey === toKey) return 0

  const [saved] = await db
    .select({ minutes: travelRouteTimes.minutes })
    .from(travelRouteTimes)
    .where(
      and(
        eq(travelRouteTimes.fromKey, fromKey),
        eq(travelRouteTimes.toKey, toKey),
        eq(travelRouteTimes.mode, mode)
      )
    )
    .limit(1)
  if (saved) return saved.minutes

  const point = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } })
  const body = (await askGoogle(ROUTES, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.duration",
    },
    body: JSON.stringify({ origin: point(from), destination: point(to), travelMode: ROUTE_MODE[mode] }),
  })) as GoogleRoutes

  const seconds = Number.parseFloat(body.routes?.[0]?.duration ?? "")
  if (!Number.isFinite(seconds) || seconds < 0) return null
  const minutes = Math.max(1, Math.round(seconds / 60))

  await db
    .insert(travelRouteTimes)
    .values({ fromKey, toKey, mode, minutes, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: [travelRouteTimes.fromKey, travelRouteTimes.toKey, travelRouteTimes.mode],
      set: { minutes, fetchedAt: new Date() },
    })
  return minutes
}

// The parts of Google's answers Travel reads. Everything is optional because
// Google leaves out empty fields, zeros included.

type GoogleText = { text?: string }

type GoogleAutocomplete = {
  suggestions?: {
    placePrediction?: {
      placeId?: string
      text?: GoogleText
      structuredFormat?: { mainText?: GoogleText; secondaryText?: GoogleText }
    }
  }[]
}

export type GooglePoint = { day?: number; hour?: number; minute?: number }
export type GooglePeriod = { open?: GooglePoint; close?: GooglePoint }

/** The fields `placeExtras` reads, in both the details and the Maps link answers. */
export type GoogleExtras = {
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  primaryType?: string
  types?: string[]
}

type GooglePlace = GoogleExtras & {
  photos?: { name?: string }[]
  id?: string
  displayName?: GoogleText
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  regularOpeningHours?: { periods?: GooglePeriod[] }
  websiteUri?: string
  internationalPhoneNumber?: string
}

type GoogleRoutes = { routes?: { duration?: string }[] }
