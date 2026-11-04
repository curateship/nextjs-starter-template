import { addDays, daysBetween, todayIn } from "@/lib/travel/dates"
import { FORECAST_DAYS, weatherKindOf, type DayWeather } from "@/lib/travel/weather"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"

/**
 * The forecast on each day's heading (task part 33). It comes from
 * Open-Meteo, which is free and needs no key, the same service Project's
 * Daily card uses, at the trip's destination. Only days in the next 14 days get one,
 * because that is as far as a forecast reaches; further out, nothing shows.
 * A failed answer shows nothing too: weather is a nice extra, never an error.
 */
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
const TIMEOUT_MS = 5000
const PLACE_KEEP_MS = 24 * 60 * 60_000
const FORECAST_KEEP_MS = 60 * 60_000

type Point = { latitude: number; longitude: number }
const placesKept = new Map<string, { at: number; point: Point | null }>()
const forecastsKept = new Map<string, { at: number; days: Map<string, Omit<DayWeather, "day">> }>()

/** For tests: forget every kept place and forecast. */
export function forgetWeather() {
  placesKept.clear()
  forecastsKept.clear()
}

/** Where a named place is, from Open-Meteo's free place search, kept for a day. */
export async function findPlace(name: string, nowMs: number = Date.now()): Promise<Point | null> {
  const key = name.trim().toLowerCase()
  const kept = placesKept.get(key)
  if (kept && nowMs - kept.at < PLACE_KEEP_MS) return kept.point
  // "Tokyo, Japan" is searched as "Tokyo": the service matches one place name.
  const search = name.split(",")[0].trim()
  const url = `${GEOCODING_URL}?${new URLSearchParams({ name: search, count: "1", language: "en", format: "json" })}`
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
  if (!response?.ok) return null
  const body = (await response.json().catch(() => null)) as { results?: { latitude: number; longitude: number }[] } | null
  const first = body?.results?.[0]
  const point = first ? { latitude: first.latitude, longitude: first.longitude } : null
  placesKept.set(key, { at: nowMs, point })
  return point
}

async function forecastAt(point: Point, nowMs: number) {
  const key = `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`
  const kept = forecastsKept.get(key)
  if (kept && nowMs - kept.at < FORECAST_KEEP_MS) return kept.days
  const url = `${FORECAST_URL}?${new URLSearchParams({
    latitude: String(point.latitude),
    longitude: String(point.longitude),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    forecast_days: "16",
    // The forecast's days are the place's own; a day back covers a place already a day ahead of the trip's clock.
    past_days: "1",
  })}`
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
  if (!response?.ok) return null
  const body = (await response.json().catch(() => null)) as {
    daily?: {
      time?: string[]
      weather_code?: number[]
      temperature_2m_max?: number[]
      temperature_2m_min?: number[]
      precipitation_probability_max?: (number | null)[]
    }
  } | null
  const daily = body?.daily
  if (!daily?.time) return null
  const days = new Map<string, Omit<DayWeather, "day">>()
  daily.time.forEach((date, index) => {
    const code = daily.weather_code?.[index]
    const high = daily.temperature_2m_max?.[index]
    const low = daily.temperature_2m_min?.[index]
    const rain = daily.precipitation_probability_max?.[index]
    if (typeof code === "number" && typeof high === "number" && typeof low === "number") {
      days.set(date, {
        high: Math.round(high),
        low: Math.round(low),
        kind: weatherKindOf(code),
        // Open-Meteo sends null for a day it has no chance for; that shows no rain line.
        rain: typeof rain === "number" && rain >= 0 && rain <= 100 ? Math.round(rain) : null,
      })
    }
  })
  forecastsKept.set(key, { at: nowMs, days })
  return days
}

export async function loadTripWeather(
  userId: string,
  tripId: string,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<DayWeather[]> {
  const trip = await requireTrip(userId, tripId, database)
  if (!trip.startDate || !trip.destination) return []
  const today = todayIn(trip.timeZone, at)
  // One place for every day, so it is looked up and forecast once.
  const point = await findPlace(trip.destination, at.getTime())
  const forecast = point ? await forecastAt(point, at.getTime()) : null
  if (!forecast) return []
  const result: DayWeather[] = []
  for (let index = 0; index < trip.days; index += 1) {
    const date = addDays(trip.startDate, index)
    const ahead = daysBetween(today, date)
    const weather = ahead >= 0 && ahead < FORECAST_DAYS ? forecast.get(date) : undefined
    if (weather) result.push({ day: index + 1, ...weather })
  }
  return result
}
