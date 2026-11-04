import { addDays, daysBetween, todayIn } from "@/lib/travel/dates"
import { FORECAST_DAYS, type DayHoliday, type TypicalDay } from "@/lib/travel/weather"
import { db, type CustomShellDb } from "@/server/db"
import { requireTrip } from "@/server/travel/access"
import { findPlace, type Point } from "@/server/travel/weather"

/**
 * What a trip's days are usually like, and their public holidays, from two
 * free services that need no key. A failed answer shows nothing: both are
 * nice extras, never errors.
 *
 * Typical weather (More Travel features part 7; Tyler: "Usual high, low,
 * rain") is for the days past the 14-day forecast. It comes from Open-Meteo's
 * historical archive at the trip's destination, in one request for the same
 * dates in each of the last 10 years. The high and low are the averages of
 * the 15 days around each date; the rain is how many of the 31 days around it
 * had 1mm or more, scaled to 30.
 *
 * Holidays (More Travel features part 8; Tyler: "Heading + card warning")
 * come from Nager.Date, for the country the destination is in. Only holidays
 * kept by the whole country count; regional ones would warn where nothing is
 * shut.
 */

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
const HOLIDAYS_URL = "https://date.nager.at/api/v3/PublicHolidays"
const TIMEOUT_MS = 8000
const KEEP_MS = 24 * 60 * 60_000
/** How many past years the typical weather is taken from. */
const YEARS = 10
/** Days either side of a date for its typical high and low, and for its rain. */
const TEMPERATURE_SPREAD = 7
const RAIN_SPREAD = 15
/** The archive is a few days behind today; dates newer than this are left out. */
const ARCHIVE_LAG_DAYS = 7
/** A day with this much rain, in millimetres, counts as a rainy day. */
const RAINY_MM = 1

type ArchiveDay = { high: number | null; low: number | null; rain: number | null }
const archivesKept = new Map<string, { at: number; days: Map<string, ArchiveDay> | null }>()
const holidaysKept = new Map<string, { at: number; holidays: Map<string, string> | null }>()

/** The most answers kept in memory; past it the oldest goes, so a server with many trips doesn't keep growing. */
const KEPT_MAX = 300

function keep<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key)
  map.set(key, value)
  if (map.size > KEPT_MAX) map.delete(map.keys().next().value!)
}

/** For tests: forget every kept archive and holiday list. */
export function forgetOutlook() {
  archivesKept.clear()
  holidaysKept.clear()
}

/** The same calendar date some years back. 29 February falls on 1 March in a year without one. */
function yearsBefore(iso: string, years: number) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(Date.UTC(year - years, month - 1, day)).toISOString().slice(0, 10)
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => null)
  if (!response?.ok) return null
  return response.json().catch(() => null)
}

async function archive(point: Point, start: string, end: string, nowMs: number) {
  const key = `${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}|${start}|${end}`
  const kept = archivesKept.get(key)
  if (kept && nowMs - kept.at < KEEP_MS) return kept.days
  const body = (await fetchJson(
    `${ARCHIVE_URL}?${new URLSearchParams({
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      start_date: start,
      end_date: end,
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
      timezone: "auto",
    })}`
  )) as {
    daily?: {
      time?: string[]
      temperature_2m_max?: (number | null)[]
      temperature_2m_min?: (number | null)[]
      precipitation_sum?: (number | null)[]
    }
  } | null
  const daily = body?.daily
  const number = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? value : null)
  const days = daily?.time
    ? new Map(
        daily.time.map((date, index) => [
          date,
          {
            high: number(daily.temperature_2m_max?.[index]),
            low: number(daily.temperature_2m_min?.[index]),
            rain: number(daily.precipitation_sum?.[index]),
          },
        ])
      )
    : null
  // A failed answer is kept too, for a day, so a page that reloads doesn't ask again and again.
  keep(archivesKept, key, { at: nowMs, days })
  return days
}

const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length

/**
 * The typical high, low and rain for each date, from past years' days. A date
 * with too little history (under half the days) is left out.
 */
export function typicalFor(dates: readonly string[], firstYearBack: number, days: ReadonlyMap<string, ArchiveDay>) {
  const result = new Map<string, Omit<TypicalDay, "day">>()
  for (const date of dates) {
    const highs: number[] = []
    const lows: number[] = []
    let rainy = 0
    let measured = 0
    for (let back = firstYearBack; back < firstYearBack + YEARS; back += 1) {
      const centre = yearsBefore(date, back)
      for (let offset = -RAIN_SPREAD; offset <= RAIN_SPREAD; offset += 1) {
        const day = days.get(addDays(centre, offset))
        if (!day) continue
        if (day.rain !== null) {
          measured += 1
          if (day.rain >= RAINY_MM) rainy += 1
        }
        if (Math.abs(offset) <= TEMPERATURE_SPREAD) {
          if (day.high !== null) highs.push(day.high)
          if (day.low !== null) lows.push(day.low)
        }
      }
    }
    const wanted = YEARS * (2 * TEMPERATURE_SPREAD + 1)
    if (highs.length < wanted / 2 || lows.length < wanted / 2 || measured < (YEARS * (2 * RAIN_SPREAD + 1)) / 2) continue
    result.set(date, {
      high: Math.round(average(highs)),
      low: Math.round(average(lows)),
      rainDays: Math.round((rainy / measured) * 30),
    })
  }
  return result
}

async function typicalWeather(point: Point, dates: string[], today: string, nowMs: number) {
  if (dates.length === 0) return new Map<string, Omit<TypicalDay, "day">>()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const newest = addDays(today, -ARCHIVE_LAG_DAYS)
  // The most recent past year whose dates, and the days around them, have all happened.
  let back = 1
  while (yearsBefore(addDays(last, RAIN_SPREAD), back) > newest) back += 1
  const start = addDays(yearsBefore(first, back + YEARS - 1), -RAIN_SPREAD)
  const end = addDays(yearsBefore(last, back), RAIN_SPREAD)
  const days = await archive(point, start, end, nowMs)
  return days ? typicalFor(dates, back, days) : new Map<string, Omit<TypicalDay, "day">>()
}

async function holidaysIn(countryCode: string, year: number, nowMs: number) {
  const key = `${countryCode}|${year}`
  const kept = holidaysKept.get(key)
  if (kept && nowMs - kept.at < KEEP_MS) return kept.holidays
  const body = await fetchJson(`${HOLIDAYS_URL}/${year}/${countryCode}`)
  let holidays: Map<string, string> | null = null
  if (Array.isArray(body)) {
    holidays = new Map()
    for (const item of body as { date?: unknown; name?: unknown; global?: unknown }[]) {
      if (typeof item.date !== "string" || typeof item.name !== "string" || item.global !== true) continue
      const name = item.name.trim().slice(0, 80)
      if (!name) continue
      const was = holidays.get(item.date)
      holidays.set(item.date, was && was !== name ? `${was} and ${name}` : name)
    }
  }
  keep(holidaysKept, key, { at: nowMs, holidays })
  return holidays
}

/** Each trip day's typical weather past the forecast, and each public holiday on it. Empty for a trip with no dates or destination. */
export async function loadTripOutlook(
  userId: string,
  tripId: string,
  database: CustomShellDb = db,
  at: Date = new Date()
): Promise<{ typical: TypicalDay[]; holidays: DayHoliday[] }> {
  const trip = await requireTrip(userId, tripId, database)
  if (!trip.startDate || !trip.destination) return { typical: [], holidays: [] }
  const point = await findPlace(trip.destination, at.getTime())
  if (!point) return { typical: [], holidays: [] }
  const today = todayIn(trip.timeZone, at)
  const dates = Array.from({ length: trip.days }, (_, index) => addDays(trip.startDate!, index))
  const pastForecast = dates.filter((date) => daysBetween(today, date) >= FORECAST_DAYS)
  const years = [...new Set(dates.map((date) => Number(date.slice(0, 4))))]
  const [typical, holidayLists] = await Promise.all([
    typicalWeather(point, pastForecast, today, at.getTime()),
    point.countryCode
      ? Promise.all(years.map((year) => holidaysIn(point.countryCode!, year, at.getTime())))
      : Promise.resolve([]),
  ])
  const holidayOn = (date: string) => {
    for (const list of holidayLists) {
      const name = list?.get(date)
      if (name) return name
    }
    return null
  }
  const typicalDays: TypicalDay[] = []
  const holidays: DayHoliday[] = []
  dates.forEach((date, index) => {
    const usual = typical.get(date)
    if (usual) typicalDays.push({ day: index + 1, ...usual })
    const name = holidayOn(date)
    if (name) holidays.push({ day: index + 1, name })
  })
  return { typical: typicalDays, holidays }
}
