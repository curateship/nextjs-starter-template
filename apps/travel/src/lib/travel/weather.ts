/** Open-Meteo's weather codes, in the few kinds a day's heading shows (copied from Project's Daily card). */
export const WEATHER_KINDS = ["clear", "partly-cloudy", "cloudy", "fog", "drizzle", "rain", "snow", "storm"] as const
export type WeatherKind = (typeof WEATHER_KINDS)[number]

export const WEATHER_LABEL: Record<WeatherKind, string> = {
  clear: "Clear",
  "partly-cloudy": "Partly cloudy",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  storm: "Storms",
}

export function weatherKindOf(code: number): WeatherKind {
  if (code === 0) return "clear"
  if (code <= 2) return "partly-cloudy"
  if (code === 3) return "cloudy"
  if (code === 45 || code === 48) return "fog"
  if (code >= 51 && code <= 57) return "drizzle"
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain"
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow"
  return "storm"
}

/**
 * One day's forecast: Celsius, rounded, and the chance of rain out of 100, or
 * null when there is none. `hourlyRain` is the chance for each hour of the
 * day at the destination, midnight first, for a card's own hour (Travel
 * features 4, part 3); an hour with none is null.
 */
export type DayWeather = {
  day: number
  high: number
  low: number
  kind: WeatherKind
  rain: number | null
  hourlyRain: (number | null)[]
}

/** The chance of rain a day's forecast shows from (Tyler, 3 Nov 2026: "70% rain", only at 30% or more). */
export const RAIN_SHOWN_FROM = 30

/** "70% rain", or null under 30 out of 100 or with no chance given. */
export function rainLine(weather: Pick<DayWeather, "rain">) {
  return weather.rain !== null && weather.rain >= RAIN_SHOWN_FROM ? `${weather.rain}% rain` : null
}

/** How far ahead a forecast is shown (task part 33: "inside the next 14 days"). */
export const FORECAST_DAYS = 14

/**
 * What a day is usually like, for a trip day past the forecast (More Travel
 * features part 7; Tyler: "Usual high, low, rain"): the typical high and low
 * for that date over the last 10 years, in Celsius, and how many of the 30
 * days around it had rain.
 */
export type TypicalDay = { day: number; high: number; low: number; rainDays: number }

/** "Usually 24° / 15° · rain on 8 of 30 days". */
export function typicalLine(typical: Pick<TypicalDay, "high" | "low" | "rainDays">) {
  return `Usually ${typical.high}° / ${typical.low}° · rain on ${typical.rainDays} of 30 days`
}

/** A public holiday at the destination on one of the trip's days (More Travel features part 8). */
export type DayHoliday = { day: number; name: string }

/** The line on a sight or a meal on a public holiday (Tyler: "Heading + card warning"). */
export const HOLIDAY_WARNING = "Holiday, may be shut"

/** Everything a day's heading shows about the day: the forecast, or what it is usually like, and any holiday. */
export type TripWeather = { forecast: DayWeather[]; typical: TypicalDay[]; holidays: DayHoliday[] }

/**
 * The weather row's summary in an activity's ⋮ menu (Tyler, 4 Nov 2026: "put
 * it in the 3 dot dropdown right panel"): "18° / 9° · 70% rain", "Usually
 * 24° / 15°", or the holiday's name alone. Null when the day has none of them.
 */
export function outlookSummary(weather: TripWeather, day: number) {
  const forecast = weather.forecast.find((item) => item.day === day)
  if (forecast) {
    const rain = rainLine(forecast)
    return `${forecast.high}° / ${forecast.low}°${rain ? ` · ${rain}` : ""}`
  }
  const typical = weather.typical.find((item) => item.day === day)
  if (typical) return `Usually ${typical.high}° / ${typical.low}°`
  return weather.holidays.find((item) => item.day === day)?.name ?? null
}
